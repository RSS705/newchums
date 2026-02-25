# NewChums Agent Governance

Last Updated: February 24, 2026

This document defines how agents (AI or human) should operate within the NewChums repository.

The repository itself is the source of truth.
Agents are encouraged to inspect the full codebase and make architectural improvements when justified.

Architecture clarity > rigidity.

---

## Core Architectural Commitments

These are long-term structural decisions:

- Two-Worker Model
  - Web Worker (Next.js via OpenNext)
  - API Worker (Hono)
- Business logic belongs in the API Worker.
- The Web Worker focuses on rendering, auth orchestration, and UI composition.
- Avoid introducing new business logic inside Next.js route handlers.
- Structural UI changes should occur at the theme/layout level, not per-page patches.

Current production reality:

- `newchums-web-dev` is production (suffix mismatch acknowledged).
- `newchums-api` is the API worker.
- Single production environment.
- Domain live: newchums.com, www.newchums.com; canonical host enforced.
- R2, Cron, and Queues are planned but not yet implemented.

---

## Documentation Contract

The following documents serve distinct purposes and must remain structured accordingly:

### `docs/Technical_Specs.md`

- Defines architectural invariants, stack decisions, runtime constraints.
- Documents what exists today.
- Clearly separates **Implemented** vs **Planned / Not Implemented**.
- Does NOT track phases, chunks, or roadmap items.

### `docs/System_Map.md`

- Visual architecture and system flows.
- Maintains:
  - Big-picture diagram
  - Core flows
  - Local dev model
  - Architectural commitments
  - Single consolidated mega diagram at the end
- Reflects real production deployment.

### `docs/Development_Setup_Guide.md`

- Operational instructions.
- Local setup.
- Deployment process.
- Daily session “Chunk” log.
- Current State must remain short and accurate.

If architectural invariants change, update both:

- Technical_Specs.md
- System_Map.md

in the same change set.

---

## UI Governance Principles (Template Parity)

`template_reference/` at the repo root is the **canonical design/layout reference**. It is a purchased UI template; NewChums adapts its patterns, not invents from scratch.

### Template Parity Rules

- **New views:** Start by copying/adapting an equivalent template view or component. Do not invent new structure.
- **Styling:** Prefer theme overrides and shared components over per-page `sx` patches.
- **Mobile:** Avoid mobile-only CSS edits that diverge from desktop. Keep responsive behavior consistent with the template.
- **Done means:** Matches template structure, uses shared components, no ad-hoc styling drift.

### Where to Look First (Agent Checklist)

| Task | Look first | Then |
|------|------------|------|
| View/page change | `template_reference/src/app/` — find closest template page | Replicate structure in `web/src/app/` |
| Auth views (login, register, forgot-password) | `template_reference/src/app/auth/auth1/` or `auth2/` | Use AuthSplitLayout, AuthField patterns in `web/src/components/` |
| Global styling | `web/src/theme/` | Theme overrides, not per-page hacks |
| Component pattern | `template_reference/src/app/components/` | Copy and adapt for NewChums |

### Agent Workflow for UI Work

1. **Preflight:** Ensure gitignored assets are restored (env files, template_reference if doing UI). See [`docs/Gitignored_Assets_and_Restore.md`](docs/Gitignored_Assets_and_Restore.md).
2. **Always** inspect `template_reference/` before implementing a new UI view.
2. Prefer modifying shared components (`web/src/components/`), layouts, and theme.
3. Keep changes minimal and consistent with template patterns.
4. When in doubt: copy a template component and adapt it rather than inventing new structure.

### Technical Notes

- Inspect current theme: `web/src/theme/`
- Diagnose mismatches: typography scale, spacing, breakpoints, component overrides, provider duplication.
- Avoid: page-level `sx` patches unless isolated and intentional.

Agents may refactor theme structure if doing so improves long-term maintainability.

---

## API Boundary Rule

If business logic, database access, or mutation logic appears inside the Web Worker:

- Treat it as migration debt.
- New logic should be implemented in the API Worker.
- Refactoring for boundary clarity is encouraged.

---

## Deployment & Runtime Notes

- Web Worker runs on Edge runtime.
- Dynamic routes must export:

  `export const runtime = "edge";`

- Validate builds before deploy:

  `cd web && npm run build`

- API deploys via Wrangler.

---

## Agent Authority Clause

Agents may:

- Refactor for architectural clarity.
- Remove conflicting legacy code.
- Improve theme structure.
- Improve boundary separation.
- Update documentation when inaccurate.

Agents should:

- Avoid speculative architecture.
- Avoid overengineering.
- Preserve auth integrity and routing behavior.
- Clearly separate implemented vs planned systems.

---

NewChums prioritizes maintainability, clarity, and architectural integrity over short-term velocity.
