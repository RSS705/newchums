# Development Setup Guide

Last Updated: February 24, 2026

---

## Current State

- **Production environment:** Single deploy target
- **Web Worker:** newchums-web-dev (production; suffix acknowledged)
- **API Worker:** newchums-api
- **Domain:** newchums.com and www.newchums.com live (custom domains in wrangler.toml)
- **Canonical host:** https://newchums.com; www → non-www redirect enforced via middleware
- **Google OAuth:** Operational (AUTH_URL / NEXTAUTH_URL = https://newchums.com)
- **Deploy config:** Wrangler drift resolved — routes, workers_dev, preview_urls, vars defined in code; deploy no longer wipes remote config
- **Plausible:** Live
- **Observability:** Sentry, Axiom configured

---

## Local Development

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
- NEXT_PUBLIC_API_BASE_URL (e.g. http://127.0.0.1:8787)

**API (api/.dev.vars):**
- DATABASE_URL
- POSTMARK_SERVER_TOKEN, EMAIL_FROM, WEB_BASE_URL
- Postmark template IDs
- SENTRY_DSN, AXIOM_TOKEN, AXIOM_DATASET (optional)

---

## Database Migrations

Migrations: `web/sql/` (001–005).

```bash
cd web
psql "$DATABASE_URL" -f sql/001_create_users.sql
psql "$DATABASE_URL" -f sql/002_password_reset_tokens.sql
psql "$DATABASE_URL" -f sql/003_add_username_to_users.sql
psql "$DATABASE_URL" -f sql/004_add_username_norm.sql
psql "$DATABASE_URL" -f sql/005_add_date_of_birth.sql
```

---

## Deployment

### Web

```bash
cd web
npm run deploy
```

Builds OpenNext → deploys to newchums-web-dev. Custom domains (newchums.com, www.newchums.com) and vars are preserved; wrangler.toml matches remote.

### API

```bash
cd api
wrangler secret put DATABASE_URL   # if not set
wrangler deploy
```

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

*(Add Chunk entries here.)*
