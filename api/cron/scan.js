const {Pool}=require('pg');
const {timingSafeEqual}=require('node:crypto');
const {scanSource}=require('../../lib/collector');
let pool;
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'method_not_allowed'});
 const secret=process.env.CRON_SECRET,auth=req.headers.authorization||'';
 if(!secret)return res.status(503).json({error:'scan_secret_not_configured'});
 const expected=Buffer.from('Bearer '+secret),actual=Buffer.from(auth);
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return res.status(401).json({error:'unauthorized'});
 if(!process.env.DATABASE_URL)return res.status(503).json({error:'database_not_configured'});
 pool ||= new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,statement_timeout:15000});
 let client,locked=false;
 try{
  client=await pool.connect();
  locked=(await client.query('SELECT pg_try_advisory_lock(7092026) AS locked')).rows[0].locked;
  if(!locked)return res.status(409).json({error:'scan_already_running'});
  const {rows}=await client.query('SELECT id,official_url FROM sources ORDER BY priority DESC,id');
  const results=[];
  // Bounded parallel network work; one client serializes SQL safely.
  for(let i=0;i<rows.length;i+=3)results.push(...await Promise.all(rows.slice(i,i+3).map(s=>scanSource(client,s))));
  return res.status(200).json({version:'7.0.1',complete:false,results,notice:'Scoperta da elenchi ufficiali: copertura parziale, dettagli da verificare.'});
 }catch(e){console.error('scan_failed',e.code||'unknown');return res.status(503).json({error:'scan_failed'});}
 finally{if(locked)await client.query('SELECT pg_advisory_unlock(7092026)').catch(()=>{});if(client)client.release();}
};
