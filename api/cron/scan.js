const {Pool}=require('pg');
const {createHmac,timingSafeEqual}=require('node:crypto');
const {scanSource}=require('../../lib/collector');
const {SICILY_SOURCE}=require('../../lib/monitored-pages');
const {acquireLease}=require('../../lib/scan-lease');
let pool;
const sessionSeconds=1800;
function equal(a,b){
 const left=Buffer.from(a),right=Buffer.from(b);
 return left.length===right.length&&timingSafeEqual(left,right);
}
function signature(secret,expires){
 return createHmac('sha256',secret).update('radar-admin:'+expires).digest('hex');
}
function hasSession(req,secret){
 const token=req.headers.cookie?.match(/(?:^|; *)radar_admin=([0-9]+)\.([a-f0-9]{64})(?:;|$)/);
 return Boolean(token&&Number(token[1])>Math.floor(Date.now()/1000)&&equal(token[2],signature(secret,token[1])));
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'method_not_allowed'});
 const auth=req.headers.authorization||'';
 const keyLogin=req.method==='POST'&&auth.startsWith('RadarAdmin ');
 const sessionRequest=req.method==='POST'&&req.headers['x-radar-admin']==='1';
 const manual=keyLogin||sessionRequest;
 const secret=manual?process.env.RADAR_ADMIN_KEY:process.env.CRON_SECRET;
 if(!secret)return res.status(503).json({error:'scan_secret_not_configured'});
 const authorized=keyLogin?equal(auth,'RadarAdmin '+secret):
  sessionRequest?hasSession(req,secret):equal(auth,'Bearer '+secret);
 if(!authorized)return res.status(401).json({error:'unauthorized'});
 if(keyLogin){
  const expires=Math.floor(Date.now()/1000)+sessionSeconds;
  res.setHeader('Set-Cookie',`radar_admin=${expires}.${signature(secret,expires)}; Max-Age=${sessionSeconds}; Path=/api/cron/scan; HttpOnly; Secure; SameSite=Strict`);
 }
 const retry=manual&&req.query?.scope==='failed';
 const connectionString=process.env.SCAN_DATABASE_URL||process.env.DATABASE_URL;
 if(!connectionString)return res.status(503).json({error:'database_not_configured'});
 pool ||= new Pool({connectionString,max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,statement_timeout:10000});
 let client,lease;
 try{
  client=await pool.connect();lease=await acquireLease(client);
  if(!lease)return res.status(409).json({error:'scan_already_running'});
  await client.query(`INSERT INTO sources (id,name,scope,official_url,category,scan_status,priority)
    VALUES ($1,$2,'Sicilia',$3,'Archivio avvisi dipartimentali','planned',50)
    ON CONFLICT (id) DO NOTHING`,[SICILY_SOURCE.id,SICILY_SOURCE.name,SICILY_SOURCE.url]);
  const {rows}=await client.query(retry?`SELECT s.id,s.name,s.official_url FROM sources s
    WHERE (SELECT r.status FROM scan_runs r WHERE r.source_id=s.id AND r.status<>'running'
      ORDER BY r.started_at DESC,r.id DESC LIMIT 1)='failed'
    ORDER BY s.priority DESC,s.id`:'SELECT id,name,official_url FROM sources ORDER BY priority DESC,id');
  const results=[],deadline=Date.now()+70000;
  for(let i=0;i<rows.length;i+=3){
   const batch=await Promise.allSettled(rows.slice(i,i+3).map(s=>scanSource(client,s,fetch,{deadline,monitorDetails:true,sourceBudget:s.id==='mimit-incentivi'?32000:18000,requestBudget:s.id==='mimit-incentivi'?10000:6000})));
   batch.forEach((result,index)=>{
    const source=rows[i+index];
    const outcome=result.status==='fulfilled'?result.value:{source_id:source.id,status:'failed',error:'persistence_failed'};
    results.push({...outcome,source_name:source.name});
   });
  }
  const failed=results.filter(r=>r.status==='failed').length;
  await client.query('UPDATE scan_runs SET finished_at=now(),status=$2,discovered=$3,inserted=$4,error_message=$5 WHERE id=$1',[lease,results.length>0&&failed===results.length?'failed':'partial',results.reduce((n,r)=>n+(r.discovered||0),0),results.reduce((n,r)=>n+(r.inserted||0),0),JSON.stringify({version:'7.4.0',trigger:manual?'manual':'cron',sources:results.length,failed})]);
  lease=null;
  return res.status(results.length>0&&failed===results.length?503:200).json({version:'7.4.0',complete:false,results,notice:'Scoperta da elenchi ufficiali: copertura parziale, dettagli da verificare.'});
 }catch(e){console.error('scan_failed',e.code||'unknown');return res.status(503).json({error:'scan_failed'});}
 finally{if(lease&&client)await client.query("UPDATE scan_runs SET finished_at=now(),status='failed',error_message='collector:v7 failed' WHERE id=$1",[lease]).catch(()=>{});if(client)client.release();}
};
