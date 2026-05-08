# Gitignored Assets and Restore Guide

Last Updated: May 8, 2026

## A) Purpose

Some files and directories are gitignored because they contain secrets or are machine-generated. They may be **required for full local functionality**. This doc lists them and how to restore each on a fresh machine.

**Do not change .gitignore rules** when restoring; use this guide to obtain or regenerate assets correctly.

---

## B) Quick Restore Checklist

After `git clone` on a fresh machine:

1. **Dependencies:** `cd web && npm install` then `cd api && npm install`
2. **Web env:** Create `web/.env.local` with required keys (see Inventory)
3. **API env:** `cp api/.dev.vars.example api/.dev.vars` then fill values
4. **Verify:** Run `node scripts/check-env.mjs` (expects `web/.env.local` and `api/.dev.vars` filled from `web/.env.example` and `api/.dev.vars.example`).

---

## C) Inventory Table

| Path/pattern | Why ignored | Required for | Where to get it | How to restore | Verify |
|--------------|-------------|--------------|-----------------|----------------|--------|
| `node_modules/` (root, web, api) | Dependencies, large, reproducible | dev, build | npm registry | `cd web && npm install`; `cd api && npm install` | `ls web/node_modules` and `ls api/node_modules` exist |
| `dist/` | Build output | build | Generated | `npm run build` in applicable package | N/A (generated) |
| `.env`, `.env.*` | Secrets (keys, tokens, URLs) | dev, prod | You / team / Cloudflare | Create manually; see Security notes | Keys present; never commit |
| `web/.env.local` | Web secrets (AUTH_SECRET, GOOGLE_*, DATABASE_URL, etc.) | dev | You / team | Create `web/.env.local`. Required keys: DATABASE_URL, AUTH_SECRET, AUTH_TRUST_HOST=true, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXT_PUBLIC_API_BASE_URL. If `web/.env.example` exists, copy it to `.env.local` and fill. Else use `docs/Development_Setup_Guide.md` § Environment Files | `web` dev server starts; Auth works |
| `api/.dev.vars` | API secrets for local wrangler dev | dev | You / team | `cp api/.dev.vars.example api/.dev.vars` then fill DATABASE_URL, NEXTAUTH_SECRET (min). See `api/.dev.vars.example` comments | `GET http://localhost:8787/health/env` shows DATABASE_URL: true |
| `.DS_Store` | macOS metadata | N/A | OS | Ignore; no restore | N/A |
| `web/.next/` | Next.js build cache | build | Generated | `cd web && npm run build` | N/A (generated) |
| `web/.open-next/` | OpenNext build output | deploy | Generated | `cd web && npm run deploy` (build step) | N/A (generated) |
| `web/.wrangler/` | Wrangler local state | dev | Generated | `cd web && npm run deploy` or wrangler commands | N/A (generated) |
| `web/coverage/` | Test coverage output | tests | Generated | `cd web && npm run test -- --coverage` | N/A (generated) |
| `.env.sentry-build-plugin` | Sentry upload config | build | Sentry / generated | Sentry CLI or `npx @sentry/wizard` if needed | N/A |

---

## D) Security Notes

**Never commit:**
- `web/.env.local`, AUTH_SECRET, GOOGLE_CLIENT_*, DATABASE_URL, etc.
- `api/.dev.vars`, DATABASE_URL, NEXTAUTH_SECRET, POSTMARK_SERVER_TOKEN, etc.
- Any file matching `.env` or `.env.*` (except opt-in `.env.example` if team chooses)

**Production secrets:**
- Use the **Cloudflare dashboard** > Workers > Secrets for `DATABASE_URL`, `NEXTAUTH_SECRET`
- Or: `npx wrangler secret put DATABASE_URL` (and similarly for other secrets)
- Web worker vars (AUTH_URL, etc.) are in `wrangler.toml`; sensitive values go to Cloudflare Pages Secrets

**Safe flow:**
1. Create env files locally from examples.
2. Fill with dev/test values (or paste from password manager).
3. Production: set via `wrangler secret put` or Cloudflare dashboard; never commit.

---

## E) Notes on legacy gitignored paths

The repo's `.gitignore` still excludes `_vendor/` and `template_reference/`. Both are no longer used:

- **`_vendor/`** never had a documented purpose and is not referenced by any code in the repo. It is safe to leave the `.gitignore` line in place; nothing needs to be restored.
- **`template_reference/`** held a purchased UI template that NewChums originally adapted from. New UI work no longer uses it. See `docs/UI_Patterns.md` for the current pattern catalogue and `AGENTS.md` for UI governance.

If either directory ever gets a real new use, document the source and restore steps in the inventory above.
