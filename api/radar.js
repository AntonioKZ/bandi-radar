const { Pool } = require('pg');
const allowedMethods = new Set(['GET']);
let pool;
function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, statement_timeout: 10000 });
  return pool;
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!allowedMethods.has(req.method)) return res.status(405).json({ error: 'method_not_allowed' });
  const rawOffset=String(req.query?.offset ?? '0');
  if(!/^\d{1,6}$/.test(rawOffset))return res.status(400).json({error:'invalid_offset'});
  const offset=Number(rawOffset);
  const client = db();
  if (!client) return res.status(503).json({ error: 'database_not_configured' });
  try {
    if(req.query?.scanStatus==='1'){
      const result=await client.query(`SELECT id,started_at,finished_at,status,inserted,
        (status='running' AND started_at>now()-interval '4 minutes') AS active
        FROM scan_runs WHERE source_id IS NULL ORDER BY started_at DESC,id DESC LIMIT 1`);
      return res.status(200).json({scan:result.rows[0]||null});
    }
    const [opportunities, sources, scans, history] = await Promise.all([
      client.query('SELECT id, source_id, title, official_url, territory, deadline, status, budget_eur, grant_rate, program, summary, sectors, keywords, first_seen_at, last_seen_at FROM opportunities ORDER BY id LIMIT 501 OFFSET $1', [offset]),
      client.query('SELECT id, name, scope, official_url, category, scan_status, priority, updated_at FROM sources ORDER BY priority NULLS LAST, name'),
      client.query(`SELECT DISTINCT ON (source_id) source_id, COALESCE(finished_at,started_at) AS last_scan,
        status, discovered, inserted, updated,
        max(CASE WHEN status IN ('success','completed','ok') OR (status='partial' AND discovered>0) THEN finished_at END) OVER (PARTITION BY source_id) AS last_readable,
        CASE WHEN left(error_message,5)='R7.4 ' THEN substring(error_message from 6)::jsonb->'pages' END AS pages,
        CASE WHEN left(error_message,5)='R7.4 ' THEN substring(error_message from 6)::jsonb->'errors' END AS issues
        FROM scan_runs WHERE source_id IS NOT NULL ORDER BY source_id, started_at DESC, id DESC`),
      offset === 0 ? client.query(`SELECT source_id, finished_at, substring(error_message from 6)::jsonb->'changes' AS changes
        FROM scan_runs WHERE source_id IS NOT NULL AND updated>0 AND left(error_message,5)='R7.4 '
        ORDER BY finished_at DESC NULLS LAST,id DESC LIMIT 30`) : { rows: [] }
    ]);
    return res.status(200).json({ version: '7.4.0', nextOffset: opportunities.rows.length>500?offset+500:null, truncated: opportunities.rows.length > 500, opportunities: opportunities.rows.slice(0,500), sources: sources.rows, lastScans: scans.rows, sourceChanges: history.rows, servedAt: new Date().toISOString() });
  } catch (err) {
    console.error('read_api_failed', err.code || 'unknown');
    return res.status(503).json({ error: 'database_unavailable' });
  }
};
