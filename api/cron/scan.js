const {Pool}=require('pg');
const {timingSafeEqual}=require('node:crypto');
const {scanSource}=require('../../lib/collector');
const {acquireLease}=require('../../lib/scan-lease');
let pool;
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'method_not_allowed'});
 const secret=process.env.CRON_SECRET,auth=req.headers.authorization||'';
 if(!secret)return res.status(503).json({error:'scan_secret_not_configured'});
 const expected=Buffer.from('Bearer '+secret),actual=Buffer.from(auth);
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return res.status(401).json({error:'unauthorized'});
 if(!process.env.DATABASE_URL)return res.status(503).json({error:'database_not_configured'});
 pool ||= new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,statement_timeout:10000});
 let client,lease;
 try{
  client=await pool.connect();lease=await acquireLease(client);
  if(!lease)return res.status(409).json({error:'scan_already_running'});
  const {rows}=await client.query('SELECT id,official_url FROM sources ORDER BY priority DESC,id');
  const results=[],deadline=Date.now()+70000;
  for(let i=0;i<rows.length;i+=3){
   const batch=await Promise.allSettled(rows.slice(i,i+3).map(s=>scanSource(client,s,fetch,{deadline})));
   batch.forEach((r,j)=>results.push(r.status==='fulfilled'?r.value:{source_id:rows[i+j].id,status:'failed',error:'persistence_failed'}));
  }
  const failed=results.filter(r=>r.status==='failed').length;
  await client.query('UPDATE scan_runs SET finished_at=now(),status=$2,discovered=$3,inserted=$4,error_message=$5 WHERE id=$1',[lease,failed===results.length?'failed':'partial',results.reduce((n,r)=>n+(r.discovered||0),0),results.reduce((n,r)=>n+(r.inserted||0),0),JSON.stringify({version:'7.2.0',sources:results.length,failed})]);
  lease=null;
  return res.status(failed===results.length?503:200).json({version:'7.2.0',complete:false,results,notice:'Scoperta da elenchi ufficiali: copertura parziale, dettagli da verificare.'});
 }catch(e){console.error('scan_failed',e.code||'unknown');return res.status(503).json({error:'scan_failed'});}
 finally{if(lease&&client)await client.query("UPDATE scan_runs SET finished_at=now(),status='failed',error_message='collector:v7 failed' WHERE id=$1",[lease]).catch(()=>{});if(client)client.release();}
};
