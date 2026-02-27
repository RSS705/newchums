# Technical Specifications

Last Updated: February 26, 2026
Version: 5.1

This document defines the authoritative technical architecture of NewChums.
It describes what exists today and the structural commitments we are making.

---

# 1. Mission Context

NewChums is an event-first platform focused on helping people meet through shared real-world activities.

Core action:
Attend, be notified of, and create small public events around shared interests.

---

# 2. Current Technology Stack

## Application Layer

| Layer | Technology | Notes |
|--------|------------|-------|
| Web | Next.js (App Router) | Deployed via OpenNext to Cloudflare Workers |
| API | Hono | Runs in separate Cloudflare Worker |
| Database | Neon PostgreSQL | PostGIS available |
| Auth | Auth.js (JWT) | Google OAuth + Credentials |
| Email | Postmark | Transactional |
| Analytics | Plausible | Live |
| Error Tracking | Sentry | Web + API |
| Logging | Axiom | API |
| Hosting | Cloudflare Workers | Two-worker model |

## Development Tools

| Tool | Purpose |
|------|--------|
| VS Code | Primary editor |
| Wrangler CLI | Workers deployment |
| GitHub | Version control |
| TypeScript | Type safety |
| ESLint | Code quality |

---

# 3. Deployment Reality

## Production Environment (Implemented)

- **Single production environment.**
- **Web Worker:** `newchums-web-dev` (production; suffix mismatch acknowledged).
- **API Worker:** `newchums-api`.
- **Domain binding:** `newchums.com` and `www.newchums.com` are live as custom domains (wrangler.toml routes).
- **Canonical host:** `https://newchums.com`. All traffic to `www.newchums.com` is 301-redirected to non-www before Auth.js runs (prevents PKCE code_verifier mismatch).
- **AUTH_URL / NEXTAUTH_URL:** Set to `https://newchums.com` in wrangler vars.
- **Deploy safeguards:** Custom domain routes and `workers_dev = false`, `preview_urls = false` are defined in wrangler.toml so deploy does not wipe remote config.

## API Migration (Web → API Worker)

The following business logic now lives in the API worker; the web app calls it via `NEXT_PUBLIC_API_BASE_URL`:

| Endpoint | Purpose |
|----------|---------|
| POST /auth/signup | User signup |
| POST /auth/password-reset/request | Create reset token, send Postmark email; 404 EMAIL_NOT_FOUND if no user; 409 OAUTH_ACCOUNT if OAuth-only |
| POST /auth/password-reset/confirm | Validate token, set new password; single-use, 1h expiry; 400 INVALID_OR_EXPIRED if token invalid |
| POST /auth/email-verify/request | Send verification email (Credentials only; always 200) |
| POST /auth/email-verify/confirm | Confirm token and set email_verified_at |
| GET /auth/email-verify/status | Returns { verified: boolean } for polling |
| POST /auth/email-verify/mark-oauth | Auth required; sets email_verified_at for Google OAuth users |
| GET /profile, PUT /profile | User profile (auth required). Returns name, username, date_of_birth, bio, home_city, travel_radius_km, interests. PUT accepts name, bio, date_of_birth, location, interests. |
| GET /handles/available | Auth required. Query `?handle=...` returns `{ available: boolean }`. Used for handle uniqueness check before save. |
| GET /interests | List interests |
| POST /user/username, POST /user/date-of-birth | Onboarding (auth required) |
| GET /health | Health check `{ ok: true }` |
| GET /health/env | Diagnostic: reports DATABASE_URL, NEXTAUTH_SECRET, WEB_BASE_URL presence (local/dev) |

The web retains only `GET/POST /api/auth/[...nextauth]` for Auth.js. All other former web API routes have been removed.

**Required env:** Web needs `NEXT_PUBLIC_API_BASE_URL`; API needs `DATABASE_URL`, `NEXTAUTH_SECRET` (same value as web AUTH_SECRET). Production web deploy sets `NEXT_PUBLIC_API_BASE_URL` to the public API URL (e.g. `https://newchums-api.robsmith775.workers.dev`) — the client bundle must never call localhost in production.

## Not Implemented

- No dedicated dev Worker environment yet.
- R2, Cron, Queues are planned but not in production.

---

# 4. Canonical Host and Middleware

**Problem solved:** Google OAuth PKCE stores `code_verifier` in a cookie tied to origin. If signin starts on `www.newchums.com` and callback lands on `newchums.com`, the cookie is not sent → "Invalid code verifier."

**Implementation:** Middleware at `web/src/middleware.ts` runs before Auth.js. Any request to a host starting with `www.` is 301-redirected to the same path and query on the non-www host.

- **Matcher:** Includes `/api/auth/*` so OAuth flows hit canonical host.
- **Exclusions:** `/_next/static`, `/_next/image`, `favicon.ico`, `robots.txt`, `sitemap.xml`.

---

# 5. Architectural Invariants

1. Two-worker model is long-term strategy.
2. Business logic belongs in API Worker.
3. Web Worker handles rendering and auth orchestration.
4. Avoid introducing new API logic in Next.js routes.
5. Observability (Sentry/Axiom/Plausible) remains enabled.
6. Structural UI changes must occur at theme/layout level.
7. Canonical host is non-www; www redirects before Auth.js.

---

# 6. UI Architecture

**Template parity:** `template_reference/` at repo root is the canonical design reference (non-runtime; development only). Template parity is a core principle: new views copy/adapt template patterns; avoid ad-hoc structure or styling drift.

Canonical theme location:
web/src/theme/

Provider wiring:
web/src/app/layout.tsx

Principles:
- Prefer theme overrides over per-page sx patches.
- Shared layouts for cross-cutting UI structure.
- Single source of truth for typography, spacing, palette.
- Inspect template_reference before building new views; use shared components.

**template_reference:** Not deployed. Influences how we build web UI. Gitignored (obtain separately; see Development_Setup_Guide).

---

# 7. Auth (Auth.js)

- **Providers:** Google OAuth, Credentials (email/password).
- **Email verification (Credentials only):** Signups with email/password require verification. User is created with `email_verified_at = NULL`. Credentials sign-in is blocked until verified. Google OAuth users are treated as verified at creation.
- **Verification flow:** Signup → POST /auth/email-verify/request → redirect to /auth/verify/pending → user clicks link → POST /auth/email-verify/confirm → /auth/verify success. Pending page polls GET /auth/email-verify/status until verified.
- **Password reset:** Forgot-password flow sends reset link via Postmark. 404 EMAIL_NOT_FOUND if no user; 409 OAUTH_ACCOUNT if OAuth-only (no password). Tokens single-use, 1h expiry.
- **Session:** JWT (no DB adapter).
- **Post-auth redirect:** `/` by default. Source: `web/src/lib/authRedirect.ts`.
- **Onboarding gate:** If username or date_of_birth missing → redirect to `/onboarding/username?returnTo=<path>`. Guards root `/`, `(app)/` layout.
- **Canonical host requirement:** AUTH_URL and NEXTAUTH_URL must be `https://newchums.com` so OAuth callback matches signin origin.
- **API worker auth:** For routes that require a logged-in user (profile, user/username, user/date-of-birth, handles/available), the web client obtains the JWT via `GET /api/auth/api-token` and sends it as `Authorization: Bearer <token>`. The api-token route uses auth() to get session, then mints a 15-min JWT with jose (HS256). The API verifies using `api/src/auth.ts`: jose jwtVerify (API token) or @auth/core decode (Auth.js session JWT). getBearerToken supports Hono `req.header()` and standard `req.headers.get()`.
- **Auth UI routes:** /login, /signup, /forgot-password, /reset-password, /auth/verify, /auth/verify/pending.

---

# 8. Database State

Neon PostgreSQL is active.

Core tables exist in varying completeness. API worker queries use `newchums.users` schema.
- **users** — includes email_verified_at (Credentials verification), password_hash (Credentials)
- **email_verification_tokens** — single-use, 24h expiry; for Credentials signup verification
- **password_reset_tokens** — single-use, 1h expiry; for forgot-password flow
- events
- rsvps
- interests
- **user_profile** — home_city, home_lat, home_lng, travel_radius_km, email_chat_digest, email_new_events, bio (VARCHAR 500; migration 009)

Schema is still evolving as MVP stabilizes.
PostGIS is available for geospatial queries.

---

# 9. Observability

- **Sentry:** Frontend + API error tracking
- **Axiom:** API request logging
- **Plausible:** Production analytics

---

# 10. Wrangler and Deploy Configuration

**Web (web/wrangler.toml):**
- `workers_dev = false` — no workers.dev subdomain when using custom domains
- `preview_urls = false`
- Custom domain routes: `newchums.com`, `www.newchums.com` (zone_name, custom_domain = true)
- Vars: AUTH_URL, NEXTAUTH_URL, AUTH_TRUST_HOST
- Service binding: WORKER_SELF_REFERENCE → newchums-web-dev (environment = "production")
- Local config must match remote or deploy would override and remove routes.

**API (api/wrangler.toml):**
- Root worker `newchums-api` is production (web points here). Deploy with `npm run deploy` (uses `--env=""`). Env production deploys `newchums-api-production` (separate worker).
- Envs: preview, production (APP_ENV)
- Vars: EMAIL_FROM, WEB_BASE_URL, POSTMARK_TEMPLATE_VERIFY, POSTMARK_TEMPLATE_RESET, POSTMARK_TEMPLATE_RSVP, AXIOM_DATASET
- Secrets (via `npx wrangler secret put`): DATABASE_URL, NEXTAUTH_SECRET (must match web AUTH_SECRET)
- CORS: Explicit allowlist (newchums.com, www.newchums.com, localhost:3000) in api/src/index.ts

---

# 11. Runtime Constraints

Dynamic routes must export:

```ts
export const runtime = "edge";
```

**Middleware patch:** `web/scripts/patch-functions-config.js` runs after `next build`. Next.js 16 outputs `/_middleware` with runtime `nodejs`, which breaks OpenNext. The patch removes it from functions-config-manifest.json so OpenNext treats middleware as Edge.

Validation command:

```bash
cd web && npm run build
```

---

# 12. Planned Infrastructure (Not Yet Implemented)

- Cloudflare R2 (profile images)
- Cron triggers for automated workflows
- Queues for async jobs
- Dedicated dev Worker environment

These are architectural placeholders, not current production components.

---

# 13. Technical Debt (Explicitly Acknowledged)

- Worker naming mismatch (-dev suffix on production Web Worker).
- Schema needs normalization/cleanup before public launch.

These are known and tracked outside this document.

---

Architecture clarity and long-term maintainability are prioritized over speed.
