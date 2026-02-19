# Chunk Log

This file stores detailed troubleshooting notes, command transcripts, and deep error threads that are archived from the main setup guide.

## Theme Refactor: Template Alignment (February 2026)

### What caused the mismatch

1. **Monolithic theme:** All tokens and overrides lived in a single `theme.ts`, making it hard to align with template structure and leading to drift.
2. **Competing style layers:** `globals.css` applied `* { padding: 0; margin: 0 }`, overriding MUI’s baseline and component padding.
3. **Breakpoint choice:** Login used `sm` (600px) for the split layout, so the left panel hid on small desktop windows or DevTools device emulation.
4. **Right panel background:** The form area did not use a white background; it inherited the grey page background.
5. **Missing palette tokens:** No `action.hover`, affecting outlined button hovers.

### What was refactored or removed

- **Removed:** `web/src/theme/theme.ts` (monolithic file).
- **Added:** `web/src/theme/palette.ts`, `typography.ts`, `shadows.ts`, `components.ts`, `index.ts` (composed theme).
- **Simplified:** `globals.css` — removed `*` reset; `MuiCssBaseline` handles resets.
- **Login layout:** Breakpoint changed from `sm` (600px) to `md` (900px); right panel uses `bgcolor: "background.paper"`; form `maxWidth` set to 450px.
- **Components:** `getComponents(theme)` follows template pattern (function receiving theme for palette-aware overrides).

### Where the style source of truth lives

`web/src/theme/` — see Technical Specs > Design System > Theme Architecture.

### Why this scales

- Each concern (palette, typography, shadows, components) lives in its own file.
- New views inherit the same layout and theme without page-specific hacks.
- Auth layout (split left/right) can be reused for signup, forgot-password, etc.
- Components override at theme level instead of in page styles.

---

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
    - `/(app)` route group pages as needed (e.g. `/home`, `/profile`, `/ui`)

- Related warning captured during verification:
  - "A Node.js module is loaded ('crypto' at line 1) which is not supported in the Edge Runtime"
  - Import trace included `src/lib/resetTokens.ts` from edge API route usage.
  - This warning is retained as a known follow-up item for edge compatibility hardening.

## Chunk 13: Setup Cleanup Checklist (Detailed Notes)

### Internal test-route hardening (web + api)

- Web `/sentry-test` was converted to a server-gated page:
  - In production (`process.env.NODE_ENV === "production"`), it returns `404` via `notFound()`.
  - In local/non-prod, it still renders the client test button that throws an error for Sentry validation.
- API internal test endpoints now share a centralized guard in `api/src/internalAccess.ts`:
  - `GET /__sentry-test`
  - `GET /__log-test`
  - `GET /health/db`
- Guard behavior:
  - Local requests (`localhost` / `127.0.0.1`) are allowed.
  - Explicit non-prod envs (`APP_ENV=development|preview|staging`) are allowed.
  - Production (`APP_ENV=production`) requires `x-internal-token` matching secret `INTERNAL_TEST_TOKEN`.
  - If unauthorized, endpoints return `404` (not `401`) to reduce discoverability.

### Health endpoint updates

- `GET /health` now returns:
  - `{ ok: true, service: "api", ts: "<iso timestamp>" }`
  - This route does not touch Neon.
- Added `GET /health/db`:
  - Performs `SELECT 1` using Neon.
  - Returns `ok + latency_ms + ts` on success.
  - Uses the same internal-route guard in production.

### Worker env model updates

- Added Worker var in `api/wrangler.toml`:
  - `APP_ENV = "production"`
- Added Worker secret requirement (name only):
  - `INTERNAL_TEST_TOKEN`

### Env consistency validation utility

- Added `scripts/check-env.mjs` to validate local env key presence without printing values.
- It checks:
  - `web/.env.local` required keys:
    - `DATABASE_URL`
    - `NEXT_PUBLIC_API_BASE_URL`
    - `NEXT_PUBLIC_SENTRY_DSN`
    - `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`
  - `api/.dev.vars` required keys:
    - `APP_ENV`, `DATABASE_URL`, `SENTRY_DSN`, `AXIOM_TOKEN`, `AXIOM_DATASET`
    - `POSTMARK_SERVER_TOKEN`, `EMAIL_FROM`, `WEB_BASE_URL`
    - `POSTMARK_TEMPLATE_VERIFY`, `POSTMARK_TEMPLATE_RESET`, `POSTMARK_TEMPLATE_RSVP`
  - Optional key warning:
    - `INTERNAL_TEST_TOKEN`
- Local command:
  - `node scripts/check-env.mjs`

### Sentry release/source-map behavior on Pages

- `web/next.config.ts` now reads:
  - `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- Sourcemap upload/release is set to graceful skip when release credentials are incomplete (`dryRun` true).
- This keeps builds green when auth token is absent while still enabling release artifact upload when secrets are configured.

### Line endings / diff stability

- Verified repo-root `.gitattributes` includes:
  - `* text=auto eol=lf`
  - `*.md text eol=lf`
  - `*.sh text eol=lf`
  - Windows scripts remain CRLF (`*.bat`, `*.cmd`, `*.ps1`)
- Result: markdown/shell/docs diffs remain stable across Windows/macOS/Linux.


### PowerShell gotchas observed

- PowerShell aliases `curl` to `Invoke-WebRequest`.
  - Use `curl.exe` for predictable curl behavior:
    - `curl.exe -i http://127.0.0.1:8787/health`

- If PowerShell refuses to run `npm` due to execution policy (e.g., “running scripts is disabled”), run Node/npm commands from **cmd** (Command Prompt), or adjust execution policy intentionally (only if you understand the security impact).

- If local requests hang, check for port/process conflicts:
  - `netstat -ano | findstr :8787`
  - Ensure only one `LISTENING` process owns the port, then restart `wrangler dev --local`.

---

## Chunk 14: App UI Shell + Design System Lock-In (Detailed Notes)

### Symptom: `/theme-test` returned 404 (route no longer exists)

- Root cause: `src/app/theme-test` existed as an empty directory (no `page.tsx`).
- Resolution: Theme verification now lives at `/ui` under the app route group:
  - `src/app/(app)/ui/page.tsx` (with client demo at `UIDemoClient.tsx`)
- Verification:
  - Start dev server: `cd web && npm run dev`
  - Visit `http://localhost:3000/ui` (should redirect to login if logged out).

### Symptom: Logging in from a protected route always landed on `/home`

Example:
- Go to `http://localhost:3000/settings`
- Redirects to `/login?next=%2Fsettings`
- After Google sign-in, returned to `/home` instead of `/settings`

What we learned:
- The auth guard correctly sets `/login?next=<path>`.
- The client sign-in call must forward that “next” path to Auth.js in the right field (`redirectTo` in Auth.js v5-style `next-auth/react`).

Resolution:
- Ensure LoginClient reads `next` from query string and passes it into `signIn(...)`:
  - `signIn("google", { redirectTo: safeNext })`
  - `signIn("credentials", { redirectTo: safeNext, ... })`
- Ensure server-side `callbacks.redirect` enforces **same-origin** redirects and honors internal paths:
  - relative `/path` → `${baseUrl}/path`
  - absolute same-origin → allowed
  - everything else → `${baseUrl}/home` fallback

Verification:
- While logged out, visit each protected route (ex: `/settings`, `/events`, `/profile`) and confirm:
  - Redirects to `/login?next=%2F<route>`
  - After sign-in, returns to the original route (not forced to `/home`).

### Symptom: No logout button during testing

- Root cause: App shell didn’t include a sign-out control.
- Resolution: Add a Logout button/menu in the AppShell using `signOut({ redirectTo: "/login" })`.
- Verification:
  - Login, click Logout, confirm you return to `/login` and protected routes redirect again.

### Symptom: Floating “N” overlay in bottom-left

- Root cause: Next.js dev indicators (framework UI), not app code.
- Resolution: disable in `next.config.ts` via `devIndicators: false`.
- Notes:
  - This is a dev-only overlay; disabling it is safe if it overlaps navigation/content.
  - `npm run lint` + `npm run build` should remain green.

### Cloudflare Pages build failure: `/_middleware` not configured for Edge runtime

- Error excerpt (Pages build):
  - “Failed to produce a Cloudflare Pages build… routes were not configured to run with the Edge Runtime: /_middleware”
- Key point:
  - Pages executes Next server routes on Edge; adapter/tooling expects edge-friendly routing.
- Resolution:
  - Align the project with the Pages adapter’s expectations (and ensure server routes export `export const runtime = "edge";` where required).
  - Re-run the Pages build after fixes.

### Cloudflare deploy failure: Worker exceeded 3 MiB (Free plan)

- Error excerpt:
  - “Your Worker exceeded the size limit of 3 MiB… upgrade to deploy Workers up to 10 MiB.”
- Resolution:
  - Upgrade Workers plan to Paid, then retry deploy.
- Verification:
  - Cloudflare deploy should succeed without the size-limit error.

### Helpful commands (quick checks)

From `web/`:
- `npm run lint`
- `npm run build`
- `npm run dev`

From Cloudflare Pages build logs:
- Watch for Edge runtime and middleware/proxy warnings.
- Confirm deploy completes and site loads on the production domain.


---

## Chunk 15: Profile Core (Interests + Location/Radius + Email Prefs Shell) — Detailed Notes

### DB scripts

- Created schema objects:
  - `newchums.interests`
  - `newchums.user_interests`
  - `newchums.user_profile` (includes `home_location GEOGRAPHY(Point,4326)` + updated_at trigger)
- Neon SQL editor may briefly show:
  - `Trigger "trg_user_profile_updated_at" ... does not exist, skipping`
  - This is expected due to `DROP TRIGGER IF EXISTS`.

### Common verification queries (Neon)

- Confirm user exists:
  - `SELECT id, email FROM newchums.users ORDER BY created_at DESC LIMIT 10;`
- Confirm profile row:
  - `SELECT * FROM newchums.user_profile ORDER BY updated_at DESC LIMIT 10;`
- Confirm interests:
  - `SELECT ui.user_id, COUNT(*) AS interest_count FROM newchums.user_interests ui GROUP BY ui.user_id;`

### Bug thread A — `parse error - invalid geometry`

**Symptom**
- Saving profile produced:
  - `NeonDbError: parse error - invalid geometry`
  - PostGIS hint pointing at malformed geometry input.

**Cause**
- A nested SQL fragment or JSON string was being passed as a single bound parameter, so PostGIS tried to parse it as a geometry literal.

**Fix**
- Coerce `home_lat/home_lng` to numbers.
- Build geography point directly in SQL with numeric parameters:
  - `ST_SetSRID(ST_MakePoint(${home_lng}, ${home_lat}), 4326)::geography`
- Use an alternate upsert path when coords are blank:
  - `home_location = NULL`

### Bug thread B — `user_profile_user_id_fkey` violation

**Symptom**
- `insert or update on table "user_profile" violates foreign key constraint ... Key (user_id)=(...) is not present in table "users"`

**Cause**
- The authenticated session user id did not exist in `newchums.users` in the target environment.
- In production, Auth.js can fail with `Server error` / `/api/auth/error` when required env vars are missing, preventing successful OAuth user creation.

**Fix**
- Added required Cloudflare Pages env vars:
  - `AUTH_SECRET` (Secret)
  - `GOOGLE_CLIENT_ID` (Secret)
  - `GOOGLE_CLIENT_SECRET` (Secret)
- Confirmed Google OAuth redirect URI:
  - `https://www.newchums.com/api/auth/callback/google`

### Production debugging notes

- Cloudflare Pages → Deployment → Functions tab:
  - Use “Begin log stream” for real-time logs.
- Auth error endpoint in production:
  - `https://www.newchums.com/api/auth/error`
- Apex vs `www` redirect check:
  - `curl -i https://newchums.com/api/auth/session` returns `301` to `https://www.newchums.com/api/auth/session` (expected if `www` is canonical).

