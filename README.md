# NewChums

NewChums is an event-first platform designed to help people connect through small, interest-based real-world gatherings.

This repository contains the full-stack application deployed on Cloudflare Workers (two-worker model).

---

## Production Reality (Current)

- **Single production environment** (we are intentionally not running a separate dev Worker environment yet).
- **Web Worker:** `newchums-web-dev` (this is production; the `-dev` suffix is acknowledged but stable).
- **API Worker:** `newchums-api`
- **Canonical host:** `https://newchums.com`  
  - All `www.newchums.com` traffic is 301-redirected to `newchums.com` *before* Auth.js runs (prevents OAuth PKCE code_verifier mismatches).
- **Custom domains:** `newchums.com`, `www.newchums.com` (configured in `web/wrangler.toml`).
- **Observability:** Plausible (analytics), Sentry (web + API), Axiom (API logs).
- **Planned (not implemented):** Cron triggers, Queues.

---

## Architecture Overview

Users → Cloudflare Edge → **Web Worker** (Next.js via OpenNext) → **API Worker** (Hono) → Neon PostgreSQL

### Web Worker responsibilities

- UI rendering (Next.js App Router)
- Auth.js (`/api/auth/[...nextauth]`)
- Session orchestration + minting API Bearer tokens (`/api/auth/api-token`)

### API Worker responsibilities

- Business logic + data access
- Transactional email dispatch (Postmark)
- Media upload orchestration (avatar init/finalize)
- Public avatar serving (`GET /users/:userId/avatar`)

---

## Canonical Documentation

These docs are the source of truth:

- `docs/Technical_Specs.md` — architectural contract (invariants, constraints, implemented vs planned).
- `docs/System_Map.md` — diagrams + core flows + boundaries (production reality).
- `docs/Development_Setup_Guide.md` — operational guide (setup, env, deploy, troubleshooting, chunk log).
- `AGENTS.md` — governance for agents (Cursor/AI + humans): invariants, UI rules, doc contract.

---

## UI Governance (Template Parity)

`template_reference/` at the repo root is the canonical UI reference (purchased template; dev-only; not deployed).

Rules:

- Start new UI work by copying/adapting the closest template pattern.
- Prefer theme overrides + shared components over per-page styling patches.
- Avoid mobile-only styling that diverges from desktop.
- **Form fields:** label-above style only. Use `AppTextField`, `AuthField`, or `NCDatePicker`. No floating/in-field labels.

See `AGENTS.md` for detailed UI governance.

---

## Local Development (Quick Start)

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

For detailed setup, env vars, migrations, and deploy steps, see:
`docs/Development_Setup_Guide.md`
