# Bandi Radar MI — R5 migration plan

Branch: `feature/r5-live-data`. Production `main` remains unchanged.

## Audit findings (2026-10-09)
- Current frontend is static (`index.html`, `app.js`, `data.js`, `styles.css`).
- `data.js` stores opportunity and source snapshots; scan dates are stale.
- Browser-side heuristic classification is not a reliable official eligibility/status determination.
- Neon project `noisy-hall-15078335` exposes `opportunities`, `sources`, `scan_runs`.
- Existing schema lacks explicit decision/priority, evidence provenance, status-change history and idempotent scan key.

## Delivery stages
1. Read-only Vercel API to Neon with parameterized queries; credentials in Vercel server-side environment only.
2. Dashboard fetches live data; explicit error/last-updated state and fallback, no invented deadlines.
3. Add migrations for `opportunity_reviews`, `opportunity_events`, and stable `scan_key`; review migration on Neon development branch before production.
4. Protected ingestion API with authentication, schema validation, deterministic upsert IDs, rate limiting and audit trail.
5. Scheduled collectors for eight sources, robust PDF/HTML extraction and evidence capture. Separate extraction from AI interpretation.
6. Notification deduplication keyed to material changes; human approval for uncertain eligibility or grants.
7. Automated tests, preview deployment, production approval and rollback.

## Safety
Do not place database URLs, service tokens or connector credentials in browser code or Git history.
Do not deploy to production or alter production schema before preview tests.
A generic public API endpoint is not automatically callable from ChatGPT: integration needs an authorized connector or scheduled backend workflow.
