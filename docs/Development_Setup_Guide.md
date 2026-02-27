# Development Setup Guide

Last Updated: February 26, 2026

---

## Current State

- **API migration:** Signup, password-reset, profile, interests, user/username, user/date-of-birth now live in API worker. Web calls API via NEXT_PUBLIC_API_BASE_URL; auth via JWT (Bearer) from GET /api/auth/api-token.
- **Email verification:** Credentials signups require verification before sign-in; Postmark sends link; /auth/verify and /auth/verify/pending handle flow.
- **Logged-in nav:** Explore (/), Your Plans (/plans), Your Chums (/chum-groups), Profile (/profile). Calendar removed. Mobile: hamburger drawer only (no bottom tab bar); Learn links (How it Works, Science of Friendship, Safety Center) in drawer below Create Event.
- **Your Plans:** /plans page with Upcoming + Previous sections (placeholder data). Explore page shows Explore New Gatherings + Previous Gatherings in your Area only.
- **Mobile UI:** SectionHeader centered with dynamic underline (50% of title width via ResizeObserver); Explore toggle pills centered with gap; EventListItem: no distance badge, full-width Join; welcome text centered on mobile, left on desktop.
- **Production environment:** Single deploy target (newchums-web-dev, newchums-api); domain newchums.com.
- **Build:** `cd web && npm run build` passes. No deploy run this session.
- **Next session:** Deploy to verify mobile UX changes; wire real data to Your Plans if ready.

---

## Template Parity (UI Governance)

`template_reference/` at the repo root is the **canonical design reference**. New views should copy/adapt template patterns.

### Template Reference Status

- **Location:** `template_reference/` (repo root)
- **Gitignored:** Yes. Not committed; not present in CI.
- **Obtaining:** See [`docs/Gitignored_Assets_and_Restore.md`](Gitignored_Assets_and_Restore.md). Source currently TBD (decision needed: commit reference vs. vendor bundle vs. re-download).
- **Risk:** If missing, agents and developers cannot enforce template parity. CI will not have it. Consider documenting restore steps and/or revisiting .gitignore if team consensus favors committing a reference copy for reproducibility.

### Where to Look First

| Task | First | Then |
|------|-------|------|
| New view/page | `template_reference/src/app/` — closest page | Replicate in `web/src/app/` |
| Auth views | `template_reference/src/app/auth/auth1/` | `web/src/components/layout/AuthSplitLayout.tsx` |
| Styling | `web/src/theme/` | Theme overrides, shared components |
| Components | `template_reference/src/app/components/` | Copy and adapt |

### Do / Don't

- **Do:** Copy template structure, use shared components, prefer theme overrides.
- **Don't:** Invent one-off styling, add mobile-only CSS that diverges from desktop, per-page `sx` patches (unless isolated).

---

## Local Development

**First-time or fresh clone:** Restore gitignored assets per [`docs/Gitignored_Assets_and_Restore.md`](Gitignored_Assets_and_Restore.md) (env files, template_reference if doing UI work).

### Web

```bash
cd web
npm install
npm run dev
```

→ http://localhost:3000

### API

```bash
cd api
npm install
cp .dev.vars.example .dev.vars   # fill values
npm run dev
```

→ http://127.0.0.1:8787 (or port shown)

---

## Environment Files

**Web (web/.env.local):**
- DATABASE_URL
- AUTH_SECRET
- AUTH_TRUST_HOST=true
- GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
- NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — optional; required for Profile Location Google Places autocomplete. If unset, address field works as plain text input.
- NEXT_PUBLIC_API_BASE_URL — optional; defaults from .env.development (http://127.0.0.1:8787). Only needed if overriding.

**Web env by mode:**
- **Local dev:** `.env.development` → `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8787`. `.env.local` overrides if present.
- **Production deploy:** `npm run deploy` sets `NEXT_PUBLIC_API_BASE_URL=https://newchums-api.robsmith775.workers.dev` so the client bundle always calls the public API — never localhost.

**API (api/.dev.vars):**
- DATABASE_URL (required; non-empty; same Neon URL as web/.env.local)
- NEXTAUTH_SECRET (must match web AUTH_SECRET; required for profile, user/username, user/date-of-birth)
- POSTMARK_SERVER_TOKEN, EMAIL_FROM, WEB_BASE_URL
- POSTMARK_TEMPLATE_VERIFY, POSTMARK_TEMPLATE_RESET, POSTMARK_TEMPLATE_RSVP
- SENTRY_DSN, AXIOM_TOKEN, AXIOM_DATASET (optional)

---

## Email Verification (Credentials)

Credentials signups require email verification before sign-in. Flow:

1. Signup → user created with `email_verified_at = NULL`; POST /auth/email-verify/request sends email; redirect to `/auth/verify/pending?email=...`
2. User clicks verify link in email → `/auth/verify?email=&token=` calls POST /auth/email-verify/confirm → success message
3. Pending page polls GET /auth/email-verify/status every ~3s; when verified, shows “Verified” + link to login
4. Login before verify → blocked with friendly message + “Resend verification email”

**API env:** `POSTMARK_TEMPLATE_VERIFY`, `POSTMARK_SERVER_TOKEN`, `EMAIL_FROM`, `WEB_BASE_URL` (verification link base).

**Google OAuth:** Users are treated as verified; no flow.

---

## Password Reset (Forgot Password)

End-to-end flow: forgot-password → Postmark reset email → reset-password page → confirm → login.

**API behavior:** Request endpoint returns **404 EMAIL_NOT_FOUND** if no account exists (no generic “if account exists” messaging). Confirm endpoint validates token (single-use, 1h expiry), updates password, consumes token.

**Env:** `POSTMARK_TEMPLATE_RESET`, `WEB_BASE_URL` (reset link base). Template expects `name`, `productName`, `resetUrl`, `year` (year is injected by base template model).

**Verification (local):**
```bash
# Request — unknown email → 404
curl -X POST http://127.0.0.1:8787/auth/password-reset/request \
  -H "Content-Type: application/json" -d '{"email":"nonexistent@example.com"}'
# → 404 {"ok":false,"error":"EMAIL_NOT_FOUND"}

# Request — Google OAuth-only email → 409 (use a real Google sign-in user from your DB)
curl -X POST http://127.0.0.1:8787/auth/password-reset/request \
  -H "Content-Type: application/json" -d '{"email":"your-google-user@gmail.com"}'
# → 409 {"ok":false,"error":"OAUTH_ACCOUNT"}

# Request — Credentials user → 200 (use a real email/password signup from your DB)
curl -X POST http://127.0.0.1:8787/auth/password-reset/request \
  -H "Content-Type: application/json" -d '{"email":"your-credentials-user@example.com"}'
# → 200 {"ok":true} (email sent)

# Confirm — use token from email link
curl -X POST http://127.0.0.1:8787/auth/password-reset/confirm \
  -H "Content-Type: application/json" -d '{"token":"<token-from-email>","password":"newpassword123"}'
# → {"ok":true} or 400 INVALID_OR_EXPIRED / INVALID_INPUT
```

**Production:** Same endpoints at `https://newchums-api.robsmith775.workers.dev`. Replace base URL in curl.

---


## Database Migrations

Migrations: `web/sql/` (001–008).

```bash
cd web
psql "$DATABASE_URL" -f sql/001_create_users.sql
psql "$DATABASE_URL" -f sql/002_password_reset_tokens.sql
psql "$DATABASE_URL" -f sql/003_add_username_to_users.sql
psql "$DATABASE_URL" -f sql/004_add_username_norm.sql
psql "$DATABASE_URL" -f sql/005_add_date_of_birth.sql
psql "$DATABASE_URL" -f sql/006_add_email_verified_at.sql
psql "$DATABASE_URL" -f sql/007_email_verification_tokens.sql
psql "$DATABASE_URL" -f sql/008_interests_seed.sql
```

**008 (interests seed):** Requires `interests` and `user_interests` tables to exist. Adds `is_seed` column, removes legacy seed slugs, inserts generic base list. Run before deploying API code that inserts interests with `is_seed`.

---

## Deployment

### Web

```bash
cd web
npm run deploy
```

Builds OpenNext → deploys to newchums-web-dev. The deploy script sets `NEXT_PUBLIC_API_BASE_URL` to the production API URL so the client bundle never contains localhost. Custom domains (newchums.com, www.newchums.com) and vars are preserved; wrangler.toml matches remote.

**Verification after deploy:** Open https://newchums.com/signup → DevTools Network tab → trigger signup → confirm requests go to `https://newchums-api.robsmith775.workers.dev` (not localhost). If stale, hard refresh (Ctrl+Shift+R) or clear cache.

### API

```bash
cd api
npx wrangler secret put DATABASE_URL   # if not set
npx wrangler secret put NEXTAUTH_SECRET   # if not set (must match web AUTH_SECRET)
npm run deploy
```

Deploys to root worker `newchums-api` (the worker the web calls). Use `npm run deploy:production` to deploy the `newchums-api-production` env.

---

## Deploy Notes (Wrangler Drift Resolved)

Previously, deploy could overwrite remote config (AUTH_URL reverting to workers.dev, custom domains removed). This is resolved by defining in wrangler.toml:

- Custom domain routes (newchums.com, www.newchums.com)
- workers_dev = false
- preview_urls = false
- AUTH_URL, NEXTAUTH_URL = https://newchums.com
- environment = "production" on service binding

Local config now matches production; deploy no longer triggers config drift warnings (after first deploy with new config).

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Invalid code verifier" (Google OAuth) | Ensure AUTH_URL = https://newchums.com; middleware enforces www → non-www before Auth.js |
| Routes not configured for Edge | Add `export const runtime = "edge";` to dynamic route |
| OpenNext middleware fail | Ensure `npm run build` runs patch-functions-config.js |
| Wrangler warns about config drift | Verify wrangler.toml has routes, workers_dev, preview_urls, vars matching remote |
| Signup / API returns "DATABASE_URL is not set" | Edit api/.dev.vars; add non-empty DATABASE_URL (same as web). Restart API. Verify with GET http://localhost:8787/health/env — DATABASE_URL should be true |
| Onboarding (username/DOB) returns 500 | Ensure NEXTAUTH_SECRET in api/.dev.vars matches web AUTH_SECRET; API uses newchums.users schema |
| api-token returns 401 after Google sign-in | Fixed: api-token now uses auth() + jose (not getToken). Redeploy web. |
| CORS blocked on API (preflight fails) | API uses explicit origin allowlist. Redeploy API. |
| /auth/signup, /profile, /interests return 404 in prod | Web points to root worker newchums-api. Deploy with `npm run deploy` (not `--env production`). |
| Signup / API calls go to localhost in prod | Client bundle was built with dev env. Use `npm run deploy` (not raw `next build`); it sets `NEXT_PUBLIC_API_BASE_URL` to prod. Hard refresh / clear cache. |
| Password reset link goes to localhost | Ensure `WEB_BASE_URL` in api/.dev.vars (local) or wrangler vars (prod) is correct. Prod must be `https://newchums.com`. |

---

## Chunk Template

At end of each development session, append a Chunk:

```
Chunk XX — YYYY-MM-DD
- Goal:
- Changes:
- Verification:
- Deploy:
- Next Steps:
```

---

## Session Log (Chunks)

### Chunk 1 — Web API routes → API worker migration

- **Goal:** Move business logic from web API routes into API worker; use JWT auth (Option A).
- **Changes:**
  - API: New endpoints `/auth/signup`, `/auth/password-reset/request`, `/auth/password-reset/confirm`, `/profile`, `/interests`, `/user/username`, `/user/date-of-birth`
  - API: JWT verification via @auth/core/jwt; shared modules resetTokens, username, ageValidation
  - Web: Removed 7 route handlers; added `/api/auth/api-token` (returns JWT for API calls)
  - Web: `apiFetch()` + `NEXT_PUBLIC_API_BASE_URL`; SignupClient, ResetPasswordClient, forgot-password, SettingsClient, ProfileClient, OnboardingUsernameClient now call API
- **Env vars added:** API NEXTAUTH_SECRET; Web NEXT_PUBLIC_API_BASE_URL
- **Password-reset email:** Migrated token logic; email sending left broken (to be fixed separately).
- **Verification:** Add NEXT_PUBLIC_API_BASE_URL to web/.env.local; NEXTAUTH_SECRET to api/.dev.vars; start API then web; run signup, profile, settings, forgot-password flows.

### Chunk 2 — Production deploy, CORS, api-token (Edge-compatible)

- **Goal:** Fix production onboarding (Google sign-in → api-token 401), CORS, deploy target.
- **Changes:**
  - api-token: Switched from getToken (fails on Workers) to auth() + jose (mints 15-min JWT). Web dependency: jose.
  - API verifyAuthToken: Supports jose-signed API token and Auth.js session JWT.
  - CORS: Explicit allowlist (newchums.com, www.newchums.com, localhost:3000); Vary: Origin.
  - API deploy: Root worker newchums-api is production target. `npm run deploy` uses `--env=""`; added deploy:production for newchums-api-production env. APP_ENV in root vars.
  - __routes: GET /__routes (dev-only) lists registered routes.
- **Verification:** Google sign-in → onboarding completes; POST /user/username, /user/date-of-birth succeed.

### Chunk 3 — 2026-02-26 — Mobile Explore refinements, nav cleanup

- **Goal:** Refine mobile Explore experience, add Learn links to drawer, consolidate nav (Explore/Your Plans), remove distance badge and bottom nav.
- **Changes Made:**
  - `web/src/config/nav.ts`: Home → Explore; Calendar removed; Your Plans added; headerNavLinks used in drawer.
  - `web/src/components/layout/AppShell.tsx`: Mobile bottom nav removed; Learn section (How it Works, Science of Friendship, Safety Center) added below Create Event in drawer; padding adjusted.
  - `web/src/components/ui/SectionHeader.tsx`: "use client"; dynamic underline width = 50% of title text via ref + ResizeObserver (mobile only); fallback 56px.
  - `web/src/components/events/ExploreFilterBar.tsx`: Toggle pills centered on mobile; gap between pills.
  - `web/src/components/events/EventListItem.tsx`: Distance badge removed; Join full-width and centered on mobile.
  - `web/src/components/dashboard/DashboardHome.tsx`: Welcome text centered on mobile, left on desktop (`textAlign: { xs: "center", sm: "left" }`).
- **Verification:** `cd web && npm run build` → ✓ Compiled successfully; routes include /plans.
- **Deploy:** None this session.
- **Open Issues / Next Steps:**
  - Deploy to production and verify mobile UX on device.
  - Wire real data to Your Plans (Upcoming / Previous) when APIs available.
