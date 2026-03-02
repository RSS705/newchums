# NewChums

NewChums is an event-first platform designed to help people connect through small, interest-based real-world gatherings.

This repository contains the full-stack application deployed on Cloudflare Workers.

---

## Production Reality

Active workers:

- `newchums-web-dev` → **Production Web Worker** (suffix mismatch acknowledged)
- `newchums-api` → API Worker

Current state:

- Single production environment
- Domain live: `newchums.com`, `www.newchums.com` (custom domains in wrangler.toml)
- Canonical host: `https://newchums.com`; www → non-www redirect enforced (middleware)
- Google OAuth operational (AUTH_URL / NEXTAUTH_URL aligned)
- Deploy config aligned (routes, vars in code; no drift on deploy)
- Plausible analytics live
- R2, Cron, and Queues planned but not yet implemented

---

## Architecture Overview

Users → Cloudflare Edge → Web Worker (Next.js via OpenNext) → API Worker (Hono) → Neon PostgreSQL

Web handles:

- UI rendering
- Auth.js
- Session orchestration

API handles:

- Business logic
- Data access
- Email dispatch
- Future background workflows

Two-worker separation is intentional and long-term.

---

## UI Template Governance

`template_reference/` at the repo root is the canonical design reference (purchased UI template). When building or modifying views:

- Copy/adapt patterns from `template_reference/` instead of inventing structure
- Prefer theme overrides and shared components over per-page hacks
- Avoid mobile-only CSS that diverges from desktop
- **Form fields:** Always use label-above style (like Date of birth). Use `AppTextField`, `AuthField`, or `NCDatePicker`; never floating/in-field labels. See `AGENTS.md` Form Inputs section.

`template_reference/` is gitignored; obtain it separately (see `docs/Development_Setup_Guide.md`). Template parity is a core principle for any UI work.

**Restoring gitignored assets:** See [`docs/Gitignored_Assets_and_Restore.md`](docs/Gitignored_Assets_and_Restore.md) for a complete list and step-by-step restore instructions.

---

## Canonical Documentation

These documents are the source of truth:

### `docs/Technical_Specs.md`

Architectural contract.

- Stack decisions
- Runtime constraints
- Deployment model
- Invariants
- Implemented vs Planned separation
- No phases, chunks, or roadmap tracking

### `docs/System_Map.md`

System architecture diagrams.

- Big-picture model
- Core flows
- Local development model
- Consolidated mega diagram
- Production boundaries

### `docs/Development_Setup_Guide.md`

Operational guide.

- Local setup
- Deployment steps
- Troubleshooting
- Current State
- Daily session “Chunk” log

---

## Documentation Workflow

At the end of each development session:

- Update **Current State**
- Append a new Chunk to `Development_Setup_Guide.md`

If architectural invariants change:

- Update both `Technical_Specs.md`
- And `System_Map.md`
- In the same change set

The repository is the source of truth.
Documentation reflects reality, not aspiration.

---

## Local Development

### Web

```bash
cd web
npm install
npm run dev
```
