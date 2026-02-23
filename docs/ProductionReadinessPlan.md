# Production Readiness Plan

- **Configuration & Secrets**
  - Enforce required env vars: `JWT_SECRET`, `MONGODB_URL`, `OPENAI_API_KEY`, SMTP creds, CORS origins.
  - Separate `.env` templates for dev/stage/prod; store secrets in managed vault (Railway/Render/Vercel/1Password).
  - Lock CORS to trusted origins only.

- **Security & Auth**
  - Force HTTPS end-to-end; add HSTS.
  - Rate-limit auth endpoints; add brute-force protection on `/auth/login`.
  - Shorten JWT lifetime + refresh strategy; rotate `JWT_SECRET` procedure.
  - Review logs to ensure no PII/credentials; sanitize errors.

- **Database & Data**
  - Confirm Mongo indexes are present in prod; run migrations (`migrate_legacy_*`, default spaces/categories) on startup or via migration job.
  - Backups + restore drills; monitoring/alerts on replica set health and slow queries.
  - Data retention and “delete account” flow (App Store policy).

- **Email & Scheduler**
  - Configure SPF/DKIM/DMARC for sending domain; handle bounces.
  - Ensure APScheduler runs once (leader-only or distributed lock) to avoid duplicate summaries.
  - Make summary time zone/user settings honored in prod.

- **Observability**
  - Structured JSON logs; request IDs.
  - Error reporting (e.g., Sentry) for frontend/backend.
  - Metrics/health: `/health` for liveness; add `/ready` including DB connectivity.

- **Testing & Quality**
  - Fix pytest header `[pytest]`; keep unit tests deterministic (mock external APIs); add optional integration job with network.
  - Frontend: `npm run lint`, `npm test`, `npm run build` in CI.
  - Add basic load tests for hot endpoints (auth, todos).

- **Performance & Reliability**
  - HTTP timeouts/retries around OpenAI/SMTP/Brave; circuit breakers for external calls.
  - Cache static assets via CDN; enable compression.
  - Validate service worker/IndexedDB for offline; version caches to avoid stale assets.

- **Deployment**
  - Containerize backend (Dockerfile) or Railway Procfile with health checks; set replicas >=2 if needed.
  - Frontend deploy on Vercel/Netlify/Railway; set API URL per env; ensure CORS alignment.
  - CI/CD pipelines for both apps; tag/rollback procedure documented.

- **Mobile/App Store (iOS via Capacitor)**
  - PWA audit (Lighthouse): manifest icons (512/192), `start_url`, `display=standalone`, `theme/background` colors, offline readiness.
  - Add Capacitor wrapper: `npx cap init`, configure `server.url` to production, generate iOS project, set status bar/splash/icons (1024x1024 source).
  - App Store assets: screenshots (phone/tablet), privacy policy & terms URLs, data collection disclosure, support URL.
  - Device QA: auth flow, offline/online transitions, notifications if enabled, external link handling.
  - Signing & submission: Apple Developer account, provisioning profiles, archive in Xcode, upload via Transporter, resolve App Review guidelines (account deletion, data usage).

- **Housekeeping**
  - Clean unused MCP/demo files in prod images; keep only needed MCP server if used.
  - Document runbooks: deploy, rotate secrets, recover from DB outage, email failure handling.
  - Ensure `robots.txt`/`sitemap` as desired; set proper cache headers for API vs static.
