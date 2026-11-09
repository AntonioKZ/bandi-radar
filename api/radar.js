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
    const [opportunities, sources, scans] = await Promise.all([
      client.query('SELECT id, source_id, title, official_url, territory, deadline, status, budget_eur, grant_rate, program, summary, sectors, keywords, first_seen_at, last_seen_at FROM opportunities ORDER BY id LIMIT 501 OFFSET $1', [offset]),
      client.query('SELECT id, name, scope, official_url, category, scan_status, priority, updated_at FROM sources ORDER BY priority NULLS LAST, name'),
      client.query('SELECT DISTINCT ON (source_id) source_id, COALESCE(finished_at,started_at) AS last_scan, status, discovered, inserted, updated FROM scan_runs WHERE source_id IS NOT NULL ORDER BY source_id, started_at DESC, id DESC')
    ]);
    return res.status(200).json({ version: '7.2.0', nextOffset: opportunities.rows.length>500?offset+500:null, truncated: opportunities.rows.length > 500, opportunities: opportunities.rows.slice(0,500), sources: sources.rows, lastScans: scans.rows, servedAt: new Date().toISOString() });
  } catch (err) {
    console.error('read_api_failed', err.code || 'unknown');
    return res.status(503).json({ error: 'database_unavailable' });
  }
};
