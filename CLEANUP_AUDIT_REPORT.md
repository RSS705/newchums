# NewChums Cleanup Audit Report

**Date:** February 18, 2026  
**Scope:** `/web`, `/api`, `/docs` (read-only)  
**Commit state:** Rollback build (stable, deployed)

---

## 1) Executive Summary (Top 5 Findings)

| # | Finding | Risk | Action |
|---|---------|------|--------|
| 1 | **Build tool deprecated:** Docs and Cloudflare Pages config use `@cloudflare/next-on-pages`, which is deprecated. OpenNext (`@opennextjs/cloudflare`) is now recommended. | Medium | Plan migration; update docs when ready |
| 2 | **Environment validation gaps:** `scripts/check-env.mjs` does not validate Auth.js–required keys (`AUTH_SECRET`, `AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) for web. | Medium | Add auth keys to `REQUIRED_WEB_KEYS` or create separate auth check |
| 3 | **Unused public assets:** `web/public/vercel.svg`, `web/public/window.svg`, `web/public/file.svg` are not referenced anywhere in the codebase (Next.js template leftovers). | Low | Safe to remove |
| 4 | **Stale doc references:** Setup guide and Chunk Log reference routes `/me`, `/protected`, and `/theme-test` that do not exist. Technical Specs schema section still contains `user_locations` references despite deprecation note. | Low | Update docs to match current routes; fix schema section |
| 5 | **No `.env.example` / `.dev.vars.example`:** New developers have no documented template for required env keys. `check-env.mjs` documents them implicitly but not as copy-paste templates. | Low | Add example files (values blank/placeholder) |

---

## 2) Web Findings

### 2.1 Unused Dependencies (`web/package.json`)

| Package | Evidence | Assessment |
|---------|----------|------------|
| `@emotion/react` | No direct imports in `web/src`. MUI uses Emotion internally. | **Needs confirmation** — Often required as peer/transitive for MUI; verify with `npm ls @emotion/react` before removing |
| `@emotion/styled` | No direct imports in `web/src`. | **Needs confirmation** — Same as above; MUI + Emotion integration may require it |
| All others | `@mui/*`, `@neondatabase/serverless`, `bcryptjs`, `next-auth`, `@sentry/nextjs`, `next`, `react`, `react-dom` — all have imports/usage | In use |

### 2.2 Unused Routes / Components / Assets

| Item | Path | Evidence |
|------|------|----------|
| **Unused assets** | `web/public/vercel.svg` | No references. Vercel template default. |
| | `web/public/window.svg` | No references. |
| | `web/public/file.svg` | No references. |
| **Stub/placeholder** | `web/src/app/(app)/ui/page.tsx` | Intentionally exists for theme/component demo; linked via nav config (`/ui`). **Keep** |
| **Sentry test** | `web/src/app/sentry-test/page.tsx` | Returns 404 in production; used for local Sentry validation. **Keep** |

**Suggested "safe to remove":** `vercel.svg`, `window.svg`, `file.svg`  
**Needs confirmation:** None for removal; Emotion deps require verification.

### 2.3 Duplicate / Obsolete Config Files

| Finding | Details |
|--------|---------|
| No duplicate configs | Single `next.config.ts`, `tsconfig.json`, `eslint.config.mjs` in `web/` |
| `web/README.md` | Contains default Next.js/Vercel template content (e.g., "Deploy on Vercel"). **Low priority** — optional to customize for NewChums |

### 2.4 Web Scripts

- `dev`, `build`, `start`, `lint` — all standard and used. No unused scripts.

---

## 3) API Findings

### 3.1 Dependencies & Bindings

| Package | Usage | Status |
|---------|-------|--------|
| `hono` | `api/src/index.ts` — main app | In use |
| `@neondatabase/serverless` | `api/src/db.ts` | In use |
| `@sentry/cloudflare` | `api/src/index.ts` — Sentry wrapper | In use |

All API dependencies are used.

### 3.2 Endpoints & Modules

| Endpoint/Module | Status |
|-----------------|--------|
| `GET /` | In use |
| `GET /health` | In use |
| `GET /health/db` | In use (prod-gated) |
| `GET /__sentry-test` | In use (prod-gated) |
| `GET /__log-test` | In use (prod-gated) |
| `GET /db/ping`, `GET /db/postgis` | In use |
| `GET /events`, `POST /events` | In use |
| `/dev/users` (CRUD) | Dev-only; intentional |
| `/email/*` (verification, password-reset, rsvp-confirmation, test) | In use |

All endpoints are used; no dead routes.

### 3.3 Wrangler Binding Drift vs `.dev.vars`

| Var/Secret | `wrangler.toml` | `api/src/db.ts` Bindings | `check-env.mjs` (api) | Notes |
|------------|-----------------|--------------------------|------------------------|------|
| `APP_ENV` | `env.preview.vars`, `env.production.vars` | ✓ | Required | Local `.dev.vars` must include `APP_ENV` for check to pass |
| `DATABASE_URL` | Secret (not in toml) | ✓ | Required | ✓ |
| `POSTMARK_SERVER_TOKEN` | Secret | ✓ | Required | ✓ |
| `SENTRY_DSN` | Secret | ✓ | Required | ✓ |
| `AXIOM_TOKEN` | Secret | ✓ | Required | ✓ |
| `AXIOM_DATASET` | `[vars]` | ✓ | Required | ✓ |
| `EMAIL_FROM`, `WEB_BASE_URL`, `POSTMARK_TEMPLATE_*` | `[vars]` | ✓ | Required | ✓ |
| `INTERNAL_TEST_TOKEN` | Secret | ✓ | Optional | ✓ |
| `ENVIRONMENT` | — | In Bindings type | — | Legacy/alternative to `APP_ENV`; not in wrangler |

**Note:** `ENVIRONMENT` appears in `api/src/db.ts` Bindings type and `internalAccess.ts` as fallback for `APP_ENV`. Wrangler does not define it. **Low risk** — code handles absence.

---

## 4) Docs Findings

### 4.1 Stale References

| Reference | Location | Issue |
|------------|----------|-------|
| `/me` | `docs/Development Setup Guide.md` (Chunk 9) | Documented as "authenticated session view"; route does not exist |
| `/protected` | `docs/Development Setup Guide.md` (Chunk 9), `docs/chunks/Chunk Log.md` | Documented as "route protection/redirect" demo; route does not exist |
| `theme-test` / `/theme-test` | `docs/Development Setup Guide.md` (Chunk 8), `docs/chunks/Chunk Log.md` | Described as created for theme verification; Chunk Log says it returned 404 (empty dir). Route does not exist; `/ui` serves similar purpose |
| `next-on-pages` | `docs/Technical Specs.md` (lines 1008, 1440), `docs/Development Setup Guide.md` (line 567) | Build uses `npx @cloudflare/next-on-pages@1` — package deprecated; OpenNext recommended |
| `OpenNext` | `docs/Development Setup Guide.md` (line 12) | Mentions "Next.js + OpenNext" for Workers size limit; build actually uses next-on-pages. **Inconsistent** |
| `user_locations` | `docs/Technical Specs.md` (lines 1329, 1348) | Schema shows `CREATE INDEX` and `JOIN` on `user_locations` despite deprecation comment (lines 1226–1227) |

### 4.2 Duplicate / Redirect Files

| File | Purpose |
|------|---------|
| `docs/Chunk Log.md` | Redirect stub: "Moved to docs/chunks/Chunk Log.md" |
| `docs/chunks/Chunk Log.md` | Canonical chunk log archive |

Acceptable pattern; no cleanup needed.

---

## 5) Environment Drift

### 5.1 Keys Referenced in Code

**Web (`web/`):**

| Key | Where Used |
|-----|------------|
| `DATABASE_URL` | `web/src/lib/db.ts` |
| `AUTH_SECRET` | Auth.js (implicit) |
| `AUTH_URL` | Auth.js (implicit) |
| `GOOGLE_CLIENT_ID` | `web/src/auth.ts` |
| `GOOGLE_CLIENT_SECRET` | `web/src/auth.ts` |
| `NEXT_PUBLIC_API_BASE_URL` | check-env, docs; not yet used for fetch in src (events/home are stubs) |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry init |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | `web/src/app/layout.tsx` |
| `NODE_ENV` | `layout.tsx`, `sentry-test/page.tsx` |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | `web/next.config.ts` (optional; source maps) |

**API (`api/`):**

| Key | Where Used |
|-----|------------|
| `APP_ENV`, `ENVIRONMENT` | `api/src/internalAccess.ts` |
| `DATABASE_URL` | `api/src/db.ts` |
| `POSTMARK_SERVER_TOKEN` | `api/src/email/postmark.ts` |
| `EMAIL_FROM`, `WEB_BASE_URL`, `POSTMARK_TEMPLATE_*` | `api/src/email/send.ts` |
| `SENTRY_DSN` | `api/src/index.ts` |
| `AXIOM_TOKEN`, `AXIOM_DATASET` | `api/src/index.ts` |
| `INTERNAL_TEST_TOKEN` | `api/src/internalAccess.ts` |

### 5.2 Example Files

| File | Exists? |
|------|---------|
| `web/.env.example` | **No** |
| `api/.dev.vars.example` | **No** |

### 5.3 check-env.mjs vs Actual Requirements

| Scope | check-env Validates | Missing from check |
|-------|---------------------|--------------------|
| Web | `DATABASE_URL`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | `AUTH_SECRET`, `AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| API | All required + optional `INTERNAL_TEST_TOKEN` | — |

### 5.4 Cloudflare (External)

Required keys for Pages/Workers (cannot verify locally):

- **Pages:** `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`
- **Workers:** `DATABASE_URL`, `POSTMARK_SERVER_TOKEN`, `SENTRY_DSN`, `AXIOM_TOKEN`, `INTERNAL_TEST_TOKEN` (optional)

---

## 6) Recommended Cleanup Plan

### Phase 1: Low-Risk, High-Confidence (Safe to Do Soon)

| Step | Action | Risk | Verification |
|------|--------|------|--------------|
| 1.1 | Delete `web/public/vercel.svg`, `window.svg`, `file.svg` | Low | `npm run build` in web; confirm no asset errors |
| 1.2 | Add `web/.env.example` and `api/.dev.vars.example` with placeholder keys (no values) | Low | New dev can copy and fill |
| 1.3 | Update docs: remove or correct references to `/me`, `/protected`, `/theme-test` (note `/ui` as replacement) | Low | Read-through of Setup Guide |

### Phase 2: Doc Fixes (No Code Changes)

| Step | Action | Risk | Verification |
|------|--------|------|--------------|
| 2.1 | Fix Technical Specs schema: remove or comment `user_locations` index and example query | Low | Schema section matches current design |
| 2.2 | Align Development Setup Guide line 12: use "next-on-pages" (or note OpenNext migration) | Low | Consistent with actual build |

### Phase 3: Environment & Tooling (Needs Validation)

| Step | Action | Risk | Verification |
|------|--------|------|--------------|
| 3.1 | Extend `check-env.mjs` `REQUIRED_WEB_KEYS` with `AUTH_SECRET`, `AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Medium | `node scripts/check-env.mjs` passes when keys present |
| 3.2 | Verify `@emotion/react` and `@emotion/styled` before removal: `npm ls` and try removing | Medium | `npm run build` and manual UI check |

### Phase 4: Build Tool Migration (Future)

| Step | Action | Risk | Verification |
|------|--------|------|--------------|
| 4.1 | Research OpenNext Cloudflare adapter; plan migration from next-on-pages | Medium | Separate migration task |
| 4.2 | Update Technical Specs and Setup Guide with new build command/output | Medium | Docs match Cloudflare Pages config |

---

**End of report.** No files were modified during this audit.
