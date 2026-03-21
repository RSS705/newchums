# Gitignored Assets and Restore Guide

Last Updated: February 24, 2026

## A) Purpose

Some files and directories are gitignored because they contain secrets, are machine-generated, or are obtained from external sources. They may be **required for full local functionality**. This doc lists them and how to restore each on a fresh machine.

**Do not change .gitignore rules** when restoring; use this guide to obtain or regenerate assets correctly.

---

## B) Quick Restore Checklist

After `git clone` on a fresh machine:

1. **Dependencies:** `cd web && npm install` then `cd api && npm install`
2. **Web env:** Create `web/.env.local` with required keys (see Inventory)
3. **API env:** `cp api/.dev.vars.example api/.dev.vars` then fill values
4. **template_reference:** Restore if doing UI work (SOURCE TBD — see Decision needed)
5. **_vendor:** Restore only if used (SOURCE TBD — see Decision needed)
6. **Verify:** Run `node scripts/check-env.mjs` (expects `web/.env.local` and `api/.dev.vars` filled from `web/.env.example` and `api/.dev.vars.example`).

---

## C) Inventory Table

| Path/pattern | Why ignored | Required for | Where to get it | How to restore | Verify |
|--------------|-------------|--------------|-----------------|----------------|--------|
| `node_modules/` (root, web, api) | Dependencies, large, reproducible | dev, build | npm registry | `cd web && npm install`; `cd api && npm install` | `ls web/node_modules` and `ls api/node_modules` exist |
| `dist/` | Build output | build | Generated | `npm run build` in applicable package | N/A (generated) |
| `.env`, `.env.*` | Secrets (keys, tokens, URLs) | dev, prod | You / team / Cloudflare | Create manually; see Security notes | Keys present; never commit |
| `web/.env.local` | Web secrets (AUTH_SECRET, GOOGLE_*, DATABASE_URL, etc.) | dev | You / team | Create `web/.env.local`. Required keys: DATABASE_URL, AUTH_SECRET, AUTH_TRUST_HOST=true, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXT_PUBLIC_API_BASE_URL. If web/.env.example exists, copy it to .env.local and fill. Else use docs/Development_Setup_Guide.md § Environment Files | `web` dev server starts; Auth works |
| `api/.dev.vars` | API secrets for local wrangler dev | dev | You / team | `cp api/.dev.vars.example api/.dev.vars` then fill DATABASE_URL, NEXTAUTH_SECRET (min). See api/.dev.vars.example comments | `GET http://localhost:8787/health/env` shows DATABASE_URL: true |
| `.DS_Store` | macOS metadata | — | OS | Ignore; no restore | N/A |
| `_vendor/` | Unknown / legacy | Unknown | **SOURCE TBD** | **SOURCE TBD —** see Decision needed | N/A |
| `template_reference/` | Purchased UI template; large; license | dev (UI work) | **SOURCE TBD** | **SOURCE TBD —** see Decision needed | `ls template_reference/src/app` exists |
| `web/.next/` | Next.js build cache | build | Generated | `cd web && npm run build` | N/A (generated) |
| `web/.open-next/` | OpenNext build output | deploy | Generated | `cd web && npm run deploy` (build step) | N/A (generated) |
| `web/.wrangler/` | Wrangler local state | dev | Generated | `cd web && npm run deploy` or wrangler commands | N/A (generated) |
| `web/coverage/` | Test coverage output | tests | Generated | `cd web && npm run test -- --coverage` | N/A (generated) |
| `.env.sentry-build-plugin` | Sentry upload config | build | Sentry / generated | Sentry CLI or `npx @sentry/wizard` if needed | N/A |

---

## D) Security Notes

**Never commit:**
- `web/.env.local` — AUTH_SECRET, GOOGLE_CLIENT_*, DATABASE_URL, etc.
- `api/.dev.vars` — DATABASE_URL, NEXTAUTH_SECRET, POSTMARK_SERVER_TOKEN, etc.
- Any file matching `.env` or `.env.*` (except opt-in `.env.example` if team chooses)

**Production secrets:**
- Use **Cloudflare dashboard** → Workers → Secrets for `DATABASE_URL`, `NEXTAUTH_SECRET`
- Or: `npx wrangler secret put DATABASE_URL` (and similarly for other secrets)
- Web worker vars (AUTH_URL, etc.) are in wrangler.toml; sensitive values go to Cloudflare Pages Secrets

**Safe flow:**
1. Create env files locally from examples.
2. Fill with dev/test values (or paste from password manager).
3. Production: set via `wrangler secret put` or Cloudflare dashboard; never commit.

---

## Decision Needed

The following items have **SOURCE TBD**. The team must decide:

| Item | Decision required |
|------|-------------------|
| `template_reference/` | **Option A:** Commit a sanitized/reference copy for reproducibility (remove .gitignore entry). **Option B:** Store in private vendor bundle (S3, artifact store, shared drive) and document exact fetch URL/command. **Option C:** Document purchase receipt location; developers re-download from vendor. |
| `_vendor/` | **Clarify purpose:** If unused, remove from .gitignore. If used (e.g. Go/PHP vendor, private deps), document source and restore steps. |

Until decided, developers doing UI work will not have `template_reference/` in CI or on fresh clones without manual restore from an unspecified source.
