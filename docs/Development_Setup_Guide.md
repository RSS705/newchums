# Development Setup Guide

Last Updated: March 3, 2026

This document is the operational guide for running and deploying NewChums.  
For architectural invariants and contracts, see `docs/Technical_Specs.md`.  
For diagrams and flows, see `docs/System_Map.md`.

---

## Current State (Short)

- **Production:** Single production environment.
- **Workers:** Web = `newchums-web-dev` (production), API = `newchums-api`.
- **Canonical host:** `https://newchums.com` (www → non-www redirect enforced before Auth.js).
- **API migration:** Signup, email verification, password reset, email change, profile (incl. DOB + bio), interests, handle availability, onboarding username/DOB, avatar flows, and notification preferences are in the API worker.
- **Avatar storage:** R2 bucket `newchums-media` (binding `MEDIA_BUCKET`). Client can route media operations and avatar display through `NEXT_PUBLIC_AVATAR_BASE_URL` for cross-env consistency when sharing DB.
- **Build:** `cd web && npm run build` passes (Edge/OpenNext constraints apply).

---

## Local Development

### First-time or fresh clone

If you are doing UI work, restore gitignored assets per `docs/Gitignored_Assets_and_Restore.md` (env files, and `template_reference/` if available).

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

### Web (`web/.env.local`)

Required (typical local dev):
- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_TRUST_HOST=true`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Optional / situational:
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — Cloudflare Turnstile site key for contact form (logged-out users). If unset, Turnstile widget is not shown.
- `NEXT_PUBLIC_API_BASE_URL`  
  - Defaults via `.env.development` to `http://127.0.0.1:8787` unless overridden.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`  
  - Optional; required for Places autocomplete on Profile Location. If unset, address input behaves as plain text.
- `NEXT_PUBLIC_AVATAR_BASE_URL`  
  - Defaults to `NEXT_PUBLIC_API_BASE_URL`.
  - **When sharing DB with prod:** set to the production API URL so avatar upload + display use the same R2 origin.

### API (`api/.dev.vars`)

Required:
- `DATABASE_URL` (same Neon URL as web)
- `NEXTAUTH_SECRET` (must match web `AUTH_SECRET`)

Email / Postmark (required for email flows):
- `POSTMARK_SERVER_TOKEN` — used for all Postmark sends (verification, reset, contact form, etc.)
- `EMAIL_FROM`
- `WEB_BASE_URL`
- `POSTMARK_TEMPLATE_VERIFY`
- `POSTMARK_TEMPLATE_RESET`
- `POSTMARK_TEMPLATE_RSVP`
- `POSTMARK_TEMPLATE_EMAIL_CHANGE_CONFIRM`
- `POSTMARK_TEMPLATE_EMAIL_CHANGE_NOTIFY_OLD`
- `POSTMARK_TEMPLATE_EMAIL_CHANGE_SUCCESS`

Optional:
- `TURNSTILE_SECRET_KEY` — Cloudflare Turnstile secret key for contact form verification (logged-out users). If unset, Turnstile is skipped (useful for local dev).
- `SENTRY_DSN`
- `AXIOM_TOKEN`
- `AXIOM_DATASET`

---

## Environment Variable Locations (API vs Web)

### API Worker (`newchums-api`)

- **Deployment:** Cloudflare Worker via `wrangler deploy`
- **Secrets:** `npx wrangler secret put <NAME>` — stored in Cloudflare, not in code (e.g. `DATABASE_URL`, `NEXTAUTH_SECRET`, `POSTMARK_SERVER_TOKEN`, `TURNSTILE_SECRET_KEY`)
- **Public vars:** `api/wrangler.toml` `[vars]` (e.g. `APP_ENV`, `EMAIL_FROM`, `WEB_BASE_URL`, template IDs)
- **Local dev:** `api/.dev.vars` (gitignored; copy from `.dev.vars.example`)

### Web Worker (`newchums-web-dev`)

- **Deployment:** OpenNext → Cloudflare Worker via `wrangler deploy` from `web/`
- **NEXT_PUBLIC_* variables are baked in at build time** — they must exist when `opennextjs-cloudflare build` runs. They are **not** read from `wrangler.toml` (that only affects Worker runtime; the client bundle is pre-built).
- **Production build-time vars:**
  - `web/.env.production` — committed; used when `next build` runs. Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` here for production.
  - Or: the deploy script (`npm run deploy`) prefixes the build with `NEXT_PUBLIC_API_BASE_URL=...` — any vars you set in the environment before running `npm run deploy` are passed to the build.
- **Local dev:** `web/.env.local` (gitignored) overrides `.env.development`

**Where to set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` for production:**

1. **Option A (simplest):** Add to `web/.env.production` (Turnstile site key is public, so committing it is acceptable):
   ```
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAA...
   ```
2. **Option B:** Set in your shell or CI before deploy: `NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAA... npm run deploy`

**Redeploy after adding:** `cd web && npm run deploy`

---

## Key Flows (Operational Notes)

### Email verification (Credentials)

Credentials signups require email verification before sign-in.

1. Signup → user created with `email_verified_at = NULL`
2. API sends email: `POST /auth/email-verify/request`
3. Verify link hits `/auth/verify?email=&token=` → API confirm
4. Pending page polls verification status until verified
5. Google OAuth users are treated as verified at creation

### Contact form

- `POST /contact` sends email to `contact@newchums.com` from `contact@newchums.com` via Postmark (uses `POSTMARK_SERVER_TOKEN`).
- **Turnstile setup (production):**
  1. Create a Turnstile widget at [Cloudflare Dashboard → Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile).
  2. **Add your domain:** In the widget settings, add `newchums.com` (and `www.newchums.com` if used) to the widget’s allowed domains. Otherwise the widget will not render.
  3. **Web:** Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to `web/.env.production` (see § Environment Variable Locations).
  4. **API:** Run `npx wrangler secret put TURNSTILE_SECRET_KEY` and paste the secret key.
  4. Logged-out users must complete the Turnstile challenge before submit. Logged-in users skip it.
- **Testing:** Use Cloudflare’s [test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) (always pass) for local dev.
- For production rate limiting (5 per 10 min per IP): run `npx wrangler kv namespace create CONTACT_RATELIMIT`, then add the `[[kv_namespaces]]` block to `api/wrangler.toml` (see commented example in file).

**Troubleshooting: "For testing only" on production**

If the Turnstile widget shows "For testing only" on newchums.com/contact, you are using **test keys** instead of production keys. [Test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) always pass validation but display that warning.

**Common cause:** Next.js loads `.env.local` and it **overrides** `.env.production` during build. If `web/.env.local` contains `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA` (for local testing), that test key gets baked into the production bundle.

**Fix:**
1. Ensure `web/.env.production` has the production site key: `NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAA...`
2. **Remove or comment out** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` from `web/.env.local` if it holds a test key. The deploy script now explicitly passes the key from `.env.production`, overriding `.env.local`, so this is optional—but cleaning `.env.local` avoids confusion.
3. Deploy: `cd web && npm run deploy`. The deploy script sources `NEXT_PUBLIC_TURNSTILE_SITE_KEY` from `.env.production` and passes it to the build, so the production key is always used.
4. **API:** Run `cd api && npx wrangler secret put TURNSTILE_SECRET_KEY` and paste the production secret key (you only need to do this once).

### Password reset

End-to-end:
forgot-password → Postmark reset email → reset-password page → confirm → login

API behavior:
- Unknown email: 404 `EMAIL_NOT_FOUND`
- OAuth-only: 409 `OAUTH_ACCOUNT`
- Credentials user: 200 `{ ok: true }`

### Email change (Settings)

Settings → request email change → confirm at new email + notify old → confirm → redirect to login with new email.

Migration required:
- `web/sql/011_email_change_requests.sql`

---

## Database Migrations

Migrations live in `web/sql/`.

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
psql "$DATABASE_URL" -f sql/009_add_bio_to_user_profile.sql
psql "$DATABASE_URL" -f sql/010_add_avatar_to_users.sql
psql "$DATABASE_URL" -f sql/011_email_change_requests.sql
psql "$DATABASE_URL" -f sql/012_add_notification_prefs.sql
psql "$DATABASE_URL" -f sql/013_add_privacy_columns.sql
```

Notes:
- Migration `008_interests_seed.sql` requires the interests tables to exist and seeds the base list.

---

## Deployment

### Web

```bash
cd web
npm run deploy
```

Notes:
- Deploy script sets `NEXT_PUBLIC_API_BASE_URL` (and `NEXT_PUBLIC_AVATAR_BASE_URL`) to the production API URL so the client bundle never contains localhost.
- After deploy, verify signup and profile network calls hit the production API origin.

### API

```bash
cd api
npx wrangler secret put DATABASE_URL
npx wrangler secret put NEXTAUTH_SECRET
npx wrangler secret put POSTMARK_SERVER_TOKEN
npm run deploy
```

---

## Troubleshooting

| Issue | Fix |
|------|-----|
| Google OAuth “Invalid code verifier” | Ensure canonical host redirect is active and `AUTH_URL/NEXTAUTH_URL` are `https://newchums.com` |
| API says `DATABASE_URL is not set` | Ensure `api/.dev.vars` has non-empty `DATABASE_URL`; restart API; verify via `/health/env` |
| Authenticated API calls fail (401) | Ensure API `NEXTAUTH_SECRET` matches web `AUTH_SECRET` |
| Prod bundle calls localhost | Deploy using `npm run deploy` (not raw `next build`); hard refresh / clear cache |
| Password reset links wrong host | Ensure API `WEB_BASE_URL` is correct (`https://newchums.com` in prod) |
| Avatar mismatch local vs prod | Set `NEXT_PUBLIC_AVATAR_BASE_URL` to prod API URL when sharing DB so all avatar ops go through R2-backed origin |

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

(Existing chunks should remain here. Add new chunks at the end.)
