# R5 acceptance checks

- GET /api/radar returns HTTP 200 and JSON with opportunities, sources, lastScans, servedAt when Preview DATABASE_URL is configured.
- GET /api/radar returns HTTP 503 if the database is not configured or unavailable.
- POST /api/radar returns HTTP 405.
- Compare opportunity IDs and counts with Neon; do not infer official eligibility from status alone.
- Confirm lastScans includes successful statuses: success, completed, ok, scanned.
- Verify a closed or suspended opportunity cannot be presented as open for applications.
- Verify URLs and identifiers from the database are validated before HTML rendering.
- Check mobile layout, filtering, favorites, and external links.
- Keep production main unchanged until all checks pass.
