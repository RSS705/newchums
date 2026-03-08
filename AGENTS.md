# NewChums Agent Governance

Last Updated: March 7, 2026

This document defines how agents (AI or human) should operate within the NewChums repository.

The repository itself is the source of truth.
Agents are encouraged to inspect the full codebase and make architectural improvements when justified.

Architecture clarity > rigidity.

---

## Product Context (Read This First)

NewChums helps people organize gatherings more easily around hobbies and shared interests.

**Current product positioning:**
- Primary pitch: making it easier to plan and coordinate real-world gatherings — board game nights, coffee walks, study sessions, pottery, sports, etc.
- Secondary pitch: reducing group chat chaos and helping people follow through on things they actually want to do.
- Tertiary / contextual: meeting new people naturally through shared interests and proximity.
- Broader mission: reducing loneliness and helping people build real-world social connections. This is still true and still core to why the product exists, but it is not always the front-facing message.

**Why this matters for agents:**
- Do not frame user-facing copy as primarily about "meeting strangers" or "finding friends." The product should feel like a practical tool for organizing real-life plans.
- Loneliness / friendship framing is appropriate on the Science of Friendship page, in mission-oriented contexts, and in internal docs — but it should not dominate product surfaces.
- The product should feel warm, practical, grounded, and social — not corporate, not heavy, not clinical.

### Terminology

| Term | Usage |
|------|-------|
| **plan** | Preferred user-facing term for an event/gathering. "Start a plan," "Your Plans." |
| **gathering** | Softer alternative to "event." Used in descriptions and copy where "plan" feels too rigid. |
| **event** | Acceptable in technical/internal contexts and in API naming. Avoid as the primary user-facing word in new UI copy. |
| **hobby** | User-facing term for interests. Aligned with the profile interests system. |
| **chum** | NewChums term for a saved person (one-way relationship, no approval flow). |

Internal code may use `event`, `PlanEvent`, `EventCard`, etc. — this is fine. The distinction is between code identifiers and user-visible strings.

### Design and UX Tone

NewChums should feel:
- warm, welcoming, social, grounded, practical, low-pressure, human

NewChums should NOT feel:
- corporate, ERP-like, cold, back-office, admin-heavy, sterile, overly formal

When building or modifying UI:
- Prefer friendly, approachable language over jargon
- Prefer "none" textTransform over "capitalize" or "uppercase" on buttons
- Keep empty states helpful and encouraging, not dead or embarrassing
- Keep helper text human and concise, not mechanical
- Use the theme's design language (softer shadows, warmer palette, rounded corners)

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
- Daily session "Chunk" log.
- Current State must remain short and accurate.

### `docs/Future_Ideas_Reference.md`

- Strategic idea bank maintained by Robert.
- Agents may read for context but must **not** treat contents as requirements.
- Agents must **not** modify this file.

If architectural invariants change, update both:

- Technical_Specs.md
- System_Map.md

in the same change set.

---

## Incomplete Areas (Do Not Overbuild)

The following areas are partially implemented. Agents should polish and improve them incrementally, but should not speculatively build out the full vision without being asked:

| Area | Status | Guidance |
|------|--------|----------|
| **Explore page** (`/`, logged in) | Functional but evolving. Real API data, filters, location-aware ordering. | Improve polish, fix bugs, refine empty states. Do not invent the final discovery experience. |
| **Event Details** (`/events/[id]`) | Detail view with RSVP, cancel, invite people, banner display. No edit, no chat, no public event page. | Fix issues, improve UI. Do not build chat, edit, or public sharing without being asked. |
| **Event email templates** | Scaffolded in code. Postmark templates not yet created. Sends noop safely. | Do not assume emails are live. Note template requirements when relevant. |
| **Recurring events** | Not implemented. Schema supports single-time events only. | Do not add recurring event logic. |
| **Event chat** | Not implemented. Scaffolded conceptually in schema. | Do not build. |

---

## UI Governance Principles (Template Parity)

`template_reference/` at the repo root is the **canonical design/layout reference**. It is a purchased UI template; NewChums adapts its patterns, not invents from scratch.

### Form Inputs (Label-Above Style)

- **Always prefer labels above fields.** Match the Date of birth / NCDatePicker pattern: a static Typography label above the input, not a floating or in-field label.
- **Use the right component:**
  - `AppTextField` — for text fields, selects, and any field with a label (renders label above automatically).
  - `AuthField` — for auth flows (login, signup, forgot-password); same label-above pattern with optional `noTopMargin`.
  - `NCDatePicker` — for date fields (e.g. date of birth).
- **Do not use** raw MUI `TextField` with `label` prop for new form fields. Use `AppTextField` instead.
- **For Autocomplete or custom inputs:** render a Typography label above (subtitle1, fontWeight 600, mb: 0.625), then the input with `label={undefined}`.
- Floating / in-field labels are not permitted. Do not reintroduce them.

### Template Parity Rules

- **New views:** Start by copying/adapting an equivalent template view or component. Do not invent new structure.
- **Styling:** Prefer theme overrides and shared components over per-page `sx` patches.
- **Mobile:** Avoid mobile-only CSS edits that diverge from desktop. Keep responsive behavior consistent with the template.
- **Done means:** Matches template structure, uses shared components, no ad-hoc styling drift.

### Where to Look First (Agent Checklist)

| Task                                          | Look first                                                 | Then                                                             |
| --------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| View/page change                              | `template_reference/src/app/` — find closest template page | Replicate structure in `web/src/app/`                            |
| Auth views (login, register, forgot-password) | `template_reference/src/app/auth/auth1/` or `auth2/`       | Use AuthSplitLayout, AuthField patterns in `web/src/components/` |
| Form fields (text, select, date)              | `web/src/components/ui/AppTextField.tsx`                  | AppTextField (label above), AuthField, NCDatePicker              |
| Global styling                                | `web/src/theme/`                                           | Theme overrides, not per-page hacks                              |
| Component pattern                             | `template_reference/src/app/components/`                   | Copy and adapt for NewChums                                      |

### Agent Workflow for UI Work

1. **Preflight:** Ensure gitignored assets are restored (env files, template_reference if doing UI). See [`docs/Gitignored_Assets_and_Restore.md`](docs/Gitignored_Assets_and_Restore.md).
2. **Always** inspect `template_reference/` before implementing a new UI view.
3. Prefer modifying shared components (`web/src/components/`), layouts, and theme.
4. Keep changes minimal and consistent with template patterns.
5. When in doubt: copy a template component and adapt it rather than inventing new structure.

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

- Web Worker runs on Cloudflare Workers (OpenNext).
- Do NOT add `export const runtime = "edge"` to routes. OpenNext CF shims the edge runtime to an empty module, causing 500 Internal Server Error. Workers already run at the edge.

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
- Use "plan" / "gathering" language in user-facing copy, not "event."
- Respect the product tone: warm, practical, grounded — not corporate.

---

NewChums prioritizes maintainability, clarity, and architectural integrity over short-term velocity.
