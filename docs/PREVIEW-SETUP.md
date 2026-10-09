# Preview setup — R5

1. In Neon project `bandi-radar-mi`, create a dedicated database role for read-only API access.
2. Grant only SELECT on `public.opportunities`, `public.sources`, `public.scan_runs`. Review `docs/neon-readonly.sql` and adapt the database/role names.
3. In Vercel project `bandi-radar-mi` → Settings → Environment Variables, set `DATABASE_URL` to the dedicated role connection string, **Preview only**. Do not paste it into GitHub or chat.
4. Redeploy the preview for branch `feature/r5-live-data`. Check `/api/radar` responds with JSON, `opportunities` and `sources` arrays, and the UI banner says "Dati live Neon".
5. Verify suspended/closed opportunities do not show as candidabile; compare count and titles with Neon; test when DB is unavailable.
6. Keep PR #1 as draft until tests and review pass.

Important: current Neon rows include 21 records with status `open` and 1 `closed` as of 2026-10-09; **this does not establish real-time official status**. Historical official closures may not yet be synchronized into Neon. A later phase must add evidence-based reconciliation before any operational reliance.

Current API is read-only; no ingestion, automated collector or notification engine has been deployed. A prior unimplemented cron was disabled on this branch.
