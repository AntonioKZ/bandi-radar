// Short transaction lock works with PgBouncer transaction pooling. Never keep a session lock.
async function acquireLease(client){
 await client.query('BEGIN');
 try{
  const lock=(await client.query('SELECT pg_try_advisory_xact_lock(7092026) AS locked')).rows[0].locked;
  if(!lock){await client.query('ROLLBACK');return null;}
  const result=await client.query("INSERT INTO scan_runs (source_id,status,error_message) SELECT NULL,'running','collector:v7' WHERE NOT EXISTS (SELECT 1 FROM scan_runs WHERE source_id IS NULL AND status='running' AND error_message='collector:v7' AND started_at>now()-interval '4 minutes') RETURNING id");
  await client.query('COMMIT');return result.rows[0]?.id||null;
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}
}
module.exports={acquireLease};
