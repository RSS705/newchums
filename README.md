# NewChums

NewChums helps people organize gatherings more easily around hobbies and shared interests — from board game nights and coffee walks to pottery sessions and pickup sports.

The broader mission is reducing loneliness by making real-world social connection easier. The product achieves this by focusing on practical coordination: clear plans, shared interests, and ways to get together with existing friends or meet new people naturally.

---

## What's Built

NewChums is a live, deployed product — not a prototype. The current system includes:

- **Event/plan creation and discovery** — users create gatherings around hobbies, invite people, set visibility (invite-only / chums-only / public), manage RSVPs (going / maybe / can't make it / suggest another time), and edit or cancel plans. Banner images with gradient presets or custom uploads. Attendance reconfirmation setting (24-hour reminder opt-in; email logic is future work).
- **Explore feed** — logged-in users browse discoverable plans with location-aware nearby-first ordering, hobby filtering, time-range chips, and text search.
- **Your Plans** — tabbed view of upcoming/past plans the user hosts or has joined.
- **Chums** — one-way saved-people system with search, email invite flow, mutual indicators, privacy controls, and private per-chum notes. Birthday display (month/day only, respecting privacy settings).
- **Profiles** — editable profiles with hobbies, location, bio, gender, profile theme, avatar upload, and public profile pages (`/u/handle`). Attendance record placeholder (visual-only; no scoring engine yet).
- **Settings** — notification preferences, privacy toggles, email/password change, account deletion.
- **Admin** — interests moderation (soft delete, merge, restore, default sort newest-first) and user account management (search, suspend/unsuspend). Requires `super_admin` role.
- **In-app notifications** — bell icon with unread state, currently supports chum and event notification types.
- **Public marketing site** — homepage (gradient event cards, screenshot placeholders, updated copy), How it Works (screenshot placeholders, "Sign up" CTA), Science of Friendship, Safety Center, and contact form.
- **Auth** — Google OAuth + email/password credentials, email verification, password reset, suspended account handling.

### What's Partially Built or Evolving

- **Attendance reconfirmation** — setting is saved and surfaced in plan creation, edit dialog, and event details. The 24-hour reminder email and cron/queue trigger are not yet implemented.
- **Attendance record / reliability** — profile placeholder card is present. No data engine or scoring system yet.
- **Event emails** — code scaffolded with noop-safe sends; Postmark templates not yet created.
- **Explore page** — functional with real data, but likely to evolve as event supply grows.
- **Event chat** — planned as a group chat created on event creation; not yet implemented.

---

## Architecture

Two Cloudflare Workers backed by Neon PostgreSQL:

```
Users → Cloudflare Edge → Web Worker (Next.js via OpenNext) → API Worker (Hono) → Neon PostgreSQL
```

| Layer | Technology | Role |
|-------|-----------|------|
| Web Worker | Next.js (App Router) via OpenNext | UI rendering, auth orchestration (Auth.js), session management, API token minting |
| API Worker | Hono | All business logic, database access, transactional email (Postmark), media upload (R2) |
| Database | Neon PostgreSQL (PostGIS available) | Primary data store |
| Auth | Auth.js (JWT sessions) | Google OAuth + Credentials |
| Email | Postmark | Transactional emails |
| Storage | Cloudflare R2 | Avatar media |
| Observability | Sentry + Axiom + Plausible | Error tracking, API logs, analytics |

**Key rule:** Business logic belongs in the API Worker. The Web Worker handles rendering and auth. Do not introduce new business logic in Next.js route handlers.

---

## Production

- **Web Worker:** `newchums-web-dev` (suffix mismatch acknowledged; this is production)
- **API Worker:** `newchums-api`
- **Canonical host:** `https://newchums.com` (www → non-www redirect enforced before Auth.js)
- **Single production environment** (no separate dev Worker environment yet)

---

## Canonical Documentation

| Document | Purpose |
|----------|---------|
| `AGENTS.md` | Agent governance — architectural rules, product direction, terminology, UI governance, design tone. **Read this first.** |
| `docs/Technical_Specs.md` | Authoritative technical spec — stack, invariants, endpoints, schemas, implemented vs planned. |
| `docs/System_Map.md` | Diagrams, production architecture, core flows, system boundaries. |
| `docs/Development_Setup_Guide.md` | Operational guide — local setup, env vars, migrations, deployment, session log. |
| `docs/Future_Ideas_Reference.md` | Strategic idea bank (Robert only). Agents may read for context but must not treat contents as requirements or modify the file. |
| `docs/Gitignored_Assets_and_Restore.md` | Guide for restoring gitignored files on a fresh clone. |

---

## Terminology

| Term | Usage |
|------|-------|
| **plan** | Preferred user-facing term for an event/gathering |
| **gathering** | Alternative used in descriptions |
| **event** | Used in code, API routes, and database tables — acceptable internally |
| **hobby** | User-facing term for interests (aligned with profile system) |
| **chum** | NewChums term for a saved person (one-way, no approval) |

---

## Quick Start

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

→ http://127.0.0.1:8787

For full setup details, env vars, migrations, deployment, and troubleshooting, see `docs/Development_Setup_Guide.md`.

---

## UI Governance

`template_reference/` is the canonical UI reference (purchased template; gitignored; dev-only).

- Start new UI work by copying/adapting the closest template pattern.
- Prefer theme overrides + shared components over per-page styling patches.
- Form fields: label-above style only (`AppTextField`, `AuthField`, `NCDatePicker`). No floating/in-field labels.
See `AGENTS.md` for detailed UI governance rules.
