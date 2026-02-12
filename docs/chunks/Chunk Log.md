# Chunk Log

This file stores detailed troubleshooting notes, command transcripts, and deep error threads that are archived from the main setup guide.

## Chunk 12: Error Tracking & Logging (Detailed Notes)

### Sentry (Web) setup notes

- Installed Sentry for the Next.js App Router app and validated with a dedicated `/sentry-test` page.
- Kept DSN in env (`NEXT_PUBLIC_SENTRY_DSN`) and out of committed source files.
- Core local verification commands:
  - `cd web`
  - `npm run dev`
  - Open `http://localhost:3000/sentry-test` and trigger an error.
- Deployment path:
  - `git add ...`
  - `git commit -m "Add Sentry to web"`
  - `git push` (Cloudflare Pages auto-deploy)

### Sentry (API) setup notes

- Added Sentry capture in the Hono Worker and a test endpoint:
  - `GET /__sentry-test` throws an error intentionally.
- Env/secrets placement:
  - Local: `SENTRY_DSN` in `api/.dev.vars`
  - Production: `SENTRY_DSN` as a Worker secret (`wrangler secret put SENTRY_DSN`)
- Verification commands:
  - Local: `wrangler dev --local` then `curl -i http://127.0.0.1:8787/__sentry-test`
  - Prod: `npx wrangler deploy` then `curl -i https://<your-worker>.workers.dev/__sentry-test`

### Axiom setup notes

- Created Axiom dataset `newchums-api` and an ingest token.
- Added API ingest helper and request logging with fields for method/path/status/duration/request_id plus `cf_ray` when present.
- Added test endpoint:
  - `GET /__log-test` sends `{ message: "axiom test log", level: "info" }`.
- Env/secrets placement:
  - Local: `AXIOM_TOKEN`, `AXIOM_DATASET=newchums-api` in `api/.dev.vars`
  - Production: `AXIOM_TOKEN` as Worker secret and `AXIOM_DATASET` as Worker var
- Verification commands:
  - Local: `wrangler dev --local` and `curl -i http://127.0.0.1:8787/__log-test`
  - Prod: `npx wrangler deploy` and `curl -i https://<your-worker>.workers.dev/__log-test`
  - Axiom UI: Datasets -> `newchums-api` -> Stream

### Plausible setup notes

- Added Plausible script in App Router layout using `next/script` and `data-domain` from `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`.
- Loaded script only in production (`process.env.NODE_ENV === "production"`).
- Hosted script URL:
  - `https://plausible.io/js/script.js`
- Cloudflare Pages env vars used during rollout:
  - `NEXT_PUBLIC_PLAUSIBLE_DOMAIN=newchums.com`
  - `NEXT_PUBLIC_API_BASE_URL=https://newchums-api.robsmith775.workers.dev`
- Troubleshooting observed:
  - Plausible "test event is not for this site" when site domain did not match deployed domain.
  - DevTools filtering hid requests until switching Network view to "All" and searching for `plausible`.

### Cloudflare Pages build failures and fixes (DATABASE_URL at build, Edge runtime requirements)

- Failure class 1: Build-time database env missing
  - Symptom: Pages build failed during Next.js "collect page data".
  - Fix: add `DATABASE_URL` in Cloudflare Pages env vars for Preview and Production.

- Failure class 2: Edge runtime requirements on dynamic/auth routes
  - Symptom: Pages build/runtime required explicit edge route config.
  - Fix: add `export const runtime = "edge";` in:
    - `/api/auth/[...nextauth]`
    - `/api/auth/password-reset/confirm`
    - `/api/auth/password-reset/request`
    - `/api/auth/signup`
    - `/me`
    - `/protected`

- Related warning captured during verification:
  - "A Node.js module is loaded ('crypto' at line 1) which is not supported in the Edge Runtime"
  - Import trace included `src/lib/resetTokens.ts` from edge API route usage.
  - This warning is retained as a known follow-up item for edge compatibility hardening.
