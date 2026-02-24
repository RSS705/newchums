# Technical Specifications

Last Updated: February 24, 2026
Version: 4.0

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

- Single production environment.
- Web Worker name: newchums-web-dev (production despite suffix).
- API Worker name: newchums-api.
- Domain binding to newchums.com pending.
- No dedicated dev environment yet.

---

# 4. Architectural Invariants

1. Two-worker model is long-term strategy.
2. Business logic belongs in API Worker.
3. Web Worker handles rendering and auth orchestration.
4. Avoid introducing new API logic in Next.js routes.
5. Observability (Sentry/Axiom/Plausible) remains enabled.
6. Structural UI changes must occur at theme/layout level.

---

# 5. UI Architecture

Canonical theme location:
web/src/theme/

Provider wiring:
web/src/app/layout.tsx

Principles:
- Prefer theme overrides over per-page sx patches.
- Shared layouts for cross-cutting UI structure.
- Single source of truth for typography, spacing, palette.

---

# 6. Database State

Neon PostgreSQL is active.

Core tables exist in varying completeness:
- users
- events
- rsvps
- interests
- user_profile (partial implementation)

Schema is still evolving as MVP stabilizes.
PostGIS is available for geospatial queries.

---

# 7. Observability

- Sentry: Frontend + API error tracking
- Axiom: API request logging
- Plausible: Production analytics

---

# 8. Planned Infrastructure (Not Yet Implemented)

- Cloudflare R2 (profile images)
- Cron triggers for automated workflows
- Queues for async jobs
- Dedicated dev environment
- Domain binding finalization

These are architectural placeholders, not current production components.

---

# 9. Runtime Constraints

Dynamic routes must export:

export const runtime = "edge";

Validation command:

cd web && npm run build

---

# 10. Technical Debt (Explicitly Acknowledged)

- Some API logic exists inside Web Worker.
- Worker naming mismatch (-dev suffix).
- Schema needs normalization/cleanup before public launch.

These are known and tracked outside this document.

---

Architecture clarity and long-term maintainability are prioritized over speed.
