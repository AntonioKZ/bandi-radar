const {Pool}=require('pg');
const {timingSafeEqual}=require('node:crypto');
const {scanSource}=require('../../lib/collector');
const {SICILY_SOURCE}=require('../../lib/monitored-pages');
const {acquireLease}=require('../../lib/scan-lease');
let pool;
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'method_not_allowed'});
 const auth=req.headers.authorization||'';
 const manual=req.method==='POST'&&auth.startsWith('RadarAdmin ');
 const secret=manual?process.env.RADAR_ADMIN_KEY:process.env.CRON_SECRET;
 if(!secret)return res.status(503).json({error:'scan_secret_not_configured'});
 const expected=Buffer.from((manual?'RadarAdmin ':'Bearer ')+secret),actual=Buffer.from(auth);
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return res.status(401).json({error:'unauthorized'});
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
  const {rows}=await client.query('SELECT id,name,official_url FROM sources ORDER BY priority DESC,id');
  const results=[],deadline=Date.now()+70000;
  for(let i=0;i<rows.length;i+=3){
   const batch=await Promise.allSettled(rows.slice(i,i+3).map(s=>scanSource(client,s,fetch,{deadline,monitorDetails:true})));
   batch.forEach((result,index)=>{
    const source=rows[i+index];
    const outcome=result.status==='fulfilled'?result.value:{source_id:source.id,status:'failed',error:'persistence_failed'};
    results.push({...outcome,source_name:source.name});
   });
  }
  const failed=results.filter(r=>r.status==='failed').length;
  await client.query('UPDATE scan_runs SET finished_at=now(),status=$2,discovered=$3,inserted=$4,error_message=$5 WHERE id=$1',[lease,failed===results.length?'failed':'partial',results.reduce((n,r)=>n+(r.discovered||0),0),results.reduce((n,r)=>n+(r.inserted||0),0),JSON.stringify({version:'7.4.0',trigger:manual?'manual':'cron',sources:results.length,failed})]);
  lease=null;
  return res.status(failed===results.length?503:200).json({version:'7.4.0',complete:false,results,notice:'Scoperta da elenchi ufficiali: copertura parziale, dettagli da verificare.'});
 }catch(e){console.error('scan_failed',e.code||'unknown');return res.status(503).json({error:'scan_failed'});}
 finally{if(lease&&client)await client.query("UPDATE scan_runs SET finished_at=now(),status='failed',error_message='collector:v7 failed' WHERE id=$1",[lease]).catch(()=>{});if(client)client.release();}
};
