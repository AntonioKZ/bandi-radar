const { Pool } = require('pg');
let pool;
function db() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 });
  return pool;
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const client = db();
  if (!client) return res.status(503).json({ error: 'database_not_configured' });
  try {
    const [opportunities, sources, scans] = await Promise.all([
      client.query('SELECT id, source_id, title, official_url, territory, deadline, status, budget_eur, grant_rate, program, summary, sectors, keywords, first_seen_at, last_seen_at FROM opportunities ORDER BY last_seen_at DESC NULLS LAST LIMIT 500'),
      client.query('SELECT id, name, scope, official_url, category, scan_status, priority, updated_at FROM sources ORDER BY priority NULLS LAST, name'),
      client.query('SELECT source_id, MAX(finished_at) AS last_scan FROM scan_runs WHERE status = $1 GROUP BY source_id', ['scanned'])
    ]);
    return res.status(200).json({ opportunities: opportunities.rows, sources: sources.rows, lastScans: scans.rows, servedAt: new Date().toISOString() });
  } catch (err) {
    console.error('read_api_failed', err.code || 'unknown');
    return res.status(503).json({ error: 'database_unavailable' });
  }
};
