# Technical Specs

**Last Updated:** February 23, 2026 **Version:** 2.0

## Overview

NewChums is a full-stack web application for organizing and discovering local events. The architecture consists of:

- **Web:** Next.js 16 (App Router) → OpenNext → Cloudflare Workers
- **API:** Hono on Cloudflare Workers
- **Database:** Neon PostgreSQL (with PostGIS for geolocation)
- **Auth:** Auth.js (NextAuth v5) with JWT sessions, Google OAuth + Credentials providers

---

## Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 16, React 19 |
| API (standalone) | Hono 4.x on Cloudflare Workers |
| Database | Neon PostgreSQL, @neondatabase/serverless |
| Auth | Auth.js (next-auth v5 beta), JWT strategy |
| UI | MUI v7, Emotion, Plus Jakarta Sans |
| Date picker | @mui/x-date-pickers, dayjs |
| Email | Postmark (transactional templates) |
| Observability | Sentry, Axiom, Plausible |
| Deployment | OpenNext (web → Cloudflare Workers), Wrangler (API) |

---

## Deployment Architecture

### Web App

- **Target:** Cloudflare Workers (via OpenNext)
- **Build:** `npm run build` (Next.js) + `scripts/patch-functions-config.js`; worker build: `opennextjs-cloudflare build`
- **Deploy:** `npm run deploy` or `npm run deploy:dev` (Wrangler) — single target: `newchums-web-dev`

### API

- **Target:** Cloudflare Workers (`newchums-api`)
- **Deploy:** `cd api && wrangler deploy`
- **Environments:** `preview` (APP_ENV), `production` (APP_ENV)

### Cloudflare / Edge Runtime Requirements

Our web app runs on Cloudflare Workers. **All non-static App Router routes must run in Edge Runtime.**

- Any route using `cookies()`, `headers()`, `auth()`, `getServerSession()`, or other server/dynamic APIs becomes **dynamic** (non-static).
- Dynamic routes without `runtime = "edge"` cause builds to fail with:
  ```
  The following routes were not configured to run with the Edge Runtime:
    - /index
  ```
- **`/index`** in the error refers to the root route **`/`**.

**Required configuration** — for every dynamic route, add at the top:

```ts
/** Cloudflare Workers require runtime='edge' for dynamic routes. */
export const runtime = "edge";
```

**Common causes of dynamic routes:**

- `auth()` or `getServerSession()` (session checks)
- `cookies()`, `headers()`, `draftMode()` from `next/headers`
- `fetch` with `{ cache: "no-store" }` or `revalidate = 0`
- `export const dynamic = "force-dynamic"`
- Database calls (Neon `sql`) — Edge-compatible but make the route dynamic
- Node-only imports (`fs`, `path`, Node `crypto`) — avoid; use Edge-safe alternatives (Web Crypto, fetch)

**Adding new routes checklist:**

1. **Is the route static?** (No server calls, no dynamic data.) If yes → no action.
2. **Is the route dynamic?** If yes → add `export const runtime = "edge";`.
3. **Does it import Node-only modules?** If yes → refactor to Edge-safe alternatives.
4. **Run local build:** `cd web && npm run build`. Confirm no "routes were not configured" errors.
5. **If build reports `/index`:** The offending route is the root page at `web/src/app/(public)/page.tsx`.

**Finding the offending route:**

- Build logs list routes with `ƒ` (dynamic) vs `○` (static).
- Route files: `web/src/app/**/page.tsx` and layouts `**/layout.tsx`. The route segment config must be in the page or layout that is dynamic.

**Preferred approach:** Prefer keeping marketing/home static when possible; move session-specific UI to client components or middleware. When a route must be dynamic, use `runtime = "edge"` and ensure all imports are Edge-compatible (Neon, Auth.js JWT, etc.).

### Patch: functions-config-manifest

`web/scripts/patch-functions-config.js` runs after `next build`. It removes `/_middleware` from `functions-config-manifest.json` because Next.js 16 outputs it with runtime `nodejs`, which causes OpenNext to fail. The patch lets OpenNext treat middleware as Edge.

---

## Database (Neon PostgreSQL)

### Connection

- **Web:** `process.env.DATABASE_URL` → `@neondatabase/serverless`
- **API:** `env.DATABASE_URL` (Worker secret) → Neon serverless driver

### Schema (migrations in `web/sql/`)

**001 – users**

- `id` (UUID, PK), `email` (unique), `name`, `password_hash`, `created_at`
- Extension: `pgcrypto`

**002 – password_reset_tokens**

- `id`, `user_id` (FK → users), `token_hash`, `expires_at`, `used_at`, `created_at`
- Index: `idx_password_reset_tokens_hash`

**003 – username** (added to users)

- `username` (NOT NULL, unique)

**004 – username_norm**

- `username_norm` (lowercase for case-insensitive uniqueness)
- Index: `idx_users_username_norm` (unique, partial: `WHERE username_norm IS NOT NULL`)

**005 – date_of_birth**

- `date_of_birth` (DATE, nullable)

**015 (chunks) – profile core**

- `interests` (catalog: id, name, category, slug, sort_order)
- `user_interests` (user_id, interest_id)
- `user_profile` (user_id, home_city, home_lat, home_lng, home_location GEOGRAPHY, travel_radius_km, email_prefs)
- Requires PostGIS: `CREATE EXTENSION IF NOT EXISTS postgis`

**Events table** (schema inferred from API; migration may be in chunks)

- `id`, `creator_id`, `title`, `description`, `location_name`, `location_address`, `location_place_id`
- `location` (PostGIS GEOGRAPHY POINT: `st_makepoint(lng, lat)`)
- `starts_at`, `duration_minutes`, `seat_limit`, `skill_level`, `is_private`, `created_at`

---

## Authentication (Auth.js)

- **Config:** `web/src/auth.ts`
- **Providers:** Google OAuth, Credentials (email/password)
- **Session:** JWT (no database adapter for sessions)
- **Callbacks:** `jwt` (store `id`), `session` (expose `user.id`), `redirect` (same-origin only)

### Credentials Provider

- Validates against `users` table: `email`, `password_hash` (bcrypt compare)
- Returns `{ id, email, name }` on success

### OAuth (Google)

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- New Google users are created without username; onboarding gate collects username + date_of_birth

### Environment

- `AUTH_SECRET` (required)
- `AUTH_TRUST_HOST=true` (required for Workers)
- `AUTH_URL` (in wrangler.toml vars: `https://newchums-web-dev.robsmith775.workers.dev`)

---

## Identity Model

- **users** columns: `id`, `email`, `name`, `password_hash`, `username`, `username_norm`, `date_of_birth`, `created_at`
- **Email** = login credential
- **Username** = public identity (case-preserving display, case-insensitive uniqueness)

### Username Rules

- **Validation regex:** `^[A-Za-z0-9_]{3,20}$` (no leading/trailing underscore)
- **Display:** Case-preserving in `username`
- **Uniqueness:** Lowercase in `username_norm`; unique index `idx_users_username_norm`
- **Confirm password** required on signup

### Error Codes (Signup / Username)

- `409` EMAIL_EXISTS
- `409` USERNAME_TAKEN
- `400` INVALID_USERNAME
- `400` UNDERAGE (date_of_birth)
- `400` REQUIRED, INVALID_DATE, FUTURE_DATE
- `500` SERVER_ERROR

---

## Post-Auth Redirect

- **Default landing:** `/` (not `/home` or dashboard)
- **Source of truth:** `web/src/lib/authRedirect.ts` — `DEFAULT_POST_AUTH_REDIRECT`, `getSafeRedirectPath`, `getRequestedPathFromHeaders`
- **Rules:** Honor safe `callbackUrl` / `returnTo` (relative internal paths only); new Google users complete onboarding first, then redirect to `/` or `returnTo`

---

## Root Page (`/`)

- **File:** `web/src/app/(public)/page.tsx` — exports `runtime = "edge"`
- **Logged out:** `LandingLayout` + `LandingHero` (Login / Sign up)
- **Logged in + onboarded:** Same layout with `isLoggedIn`: header shows Logout; hero shows Browse events / My profile
- **Logged in + not onboarded:** Redirect to `/onboarding/username?returnTo=/`
- **Dashboard (AppShell)** is used on `/home`, `/events`, `/profile`, etc. — not on `/`

---

## Onboarding Gate

- **Root `/`:** `(public)/page.tsx` checks `getOrCreateAppUser`; if username or date_of_birth missing → redirect to `/onboarding/username?returnTo=/`
- **App routes:** `(app)/layout.tsx` guards `/home`, `/events`, `/profile`; if incomplete → redirect to `/onboarding/username?returnTo=<requestedPath>`
- **Form:** Single form at `/onboarding/username` collects username and date of birth. OAuth users complete both; 18+ enforced on submit

---

## API Endpoints (Hono)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Service alive |
| GET | `/health` | Health check |
| GET | `/health/db` | DB connectivity (internal: non-prod or `x-internal-token`) |
| GET | `/db/ping` | Simple DB ping |
| GET | `/db/postgis` | PostGIS smoke test |
| GET | `/events` | List events (limit 50) |
| POST | `/events` | Create event |
| POST | `/email/verification` | Send verification email (Postmark) |
| POST | `/email/password-reset` | Send password reset email |
| POST | `/email/rsvp-confirmation` | Send RSVP confirmation |
| POST | `/email/test` | Test email (dev) |
| GET/POST/PATCH/DELETE | `/dev/users/*` | Dev user CRUD (non-prod or local only) |
| GET | `__sentry-test` | Sentry test (internal) |
| GET | `__log-test` | Axiom test (internal) |

### Internal Routes

- `canAccessInternalTestRoute` allows access when: (a) `APP_ENV` is dev/preview/staging, or (b) request is from localhost, or (c) prod + valid `x-internal-token` = `INTERNAL_TEST_TOKEN`
- Health/db, Sentry test, log test use this guard

---

## Environment Variables

### Web (Next.js)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres connection string |
| `AUTH_SECRET` | Auth.js signing secret |
| `AUTH_TRUST_HOST` | `true` for Workers |
| `AUTH_URL` | Full URL for OAuth redirect (per env in wrangler) |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `NEXT_PUBLIC_API_BASE_URL` | API base (e.g. `https://api.newchums.com` or `http://127.0.0.1:8787`) |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps (optional) |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN (client) |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Plausible (e.g. `newchums.com`) |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Sentry source maps (build) |

### API (Workers)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon (secret) |
| `POSTMARK_SERVER_TOKEN` | Postmark |
| `EMAIL_FROM`, `WEB_BASE_URL` | Email vars |
| `POSTMARK_TEMPLATE_VERIFY`, `POSTMARK_TEMPLATE_RESET`, `POSTMARK_TEMPLATE_RSVP` | Postmark template IDs |
| `SENTRY_DSN` | API Sentry |
| `AXIOM_TOKEN`, `AXIOM_DATASET` | Axiom logs |
| `APP_ENV` | `development` / `preview` / `production` |
| `INTERNAL_TEST_TOKEN` | Optional; for prod internal routes |

---

## Observability

- **Sentry:** Web (`@sentry/nextjs`), API (`@sentry/cloudflare`). Tunnel route: `/monitoring`.
- **Axiom:** API request logging; ingest to `AXIOM_DATASET` (e.g. `newchums-api`).
- **Plausible:** Analytics via `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`.
- **Security:** Do not log secrets, tokens, reset links, or auth headers.

---

## Date Picker

- **Library:** @mui/x-date-pickers + dayjs
- **Adapter:** AdapterDayjs (LocalizationProvider in ThemeRegistry)
- **Component:** `components/fields/NCDatePicker.tsx` — value/onChange as YYYY-MM-DD

---

## Security Conventions

- Never commit secrets.
- Use Cloudflare Workers secrets (`wrangler secret put`) for sensitive values.
- If any secret appears in chat/logs/screenshots, assume compromised and rotate.
