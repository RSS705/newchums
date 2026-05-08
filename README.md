# NewChums

NewChums helps people organize gatherings more easily around hobbies and shared interests, from board game nights and coffee walks to pottery sessions and pickup sports.

The broader mission is reducing loneliness by making real-world social connection easier. The product achieves this by focusing on practical coordination: clear plans, shared interests, and ways to get together with existing friends or meet new people naturally.

---

## What's Built

NewChums is a live, deployed product, not a prototype. The current system includes:

- **Event/plan creation and discovery**: users create gatherings around hobbies, invite people, set visibility (invite-only / chums-only / public), manage RSVPs (context-aware going / maybe / can't make it / suggest another time / share availability), and edit or cancel plans. Banner images with gradient presets or custom uploads. 24-hour attendance check (people who marked Going are asked to confirm they are still coming, with minimum confirmed attendees, fallback policies, cron-based reminders and cutoff processing). Optional RSVP-based minimum-attendees auto-cancel (Phase 4 of the cron). Per-plan participant group chat with real-time WebSocket delivery. Host-controlled plan locking to stabilize attendee lists. Request-to-join with host approval flow. Plan-change email notifications to attendees (edits, locks, cancellations). Plans can be linked to one or more communities they belong to (many-to-many via `event_communities`).
- **Explore feed**: personalized discovery feed with hobby-based ranking, sort options (upcoming / newest), location-aware ordering, hobby filtering, time-range chips, text search, session state persistence, and a local-signal footer showing nearby active-user counts for relevant hobbies. A "Recently happened" section below shows recent past public plans as social proof.
- **Your Plans**: tabbed view of upcoming/past plans the user hosts or has joined, with unread chat indicators.
- **Chums**: two-part saved-people system. **On NewChums** covers on-platform users (search, privacy controls, per-chum notes, birthday display). **Private Contacts** covers off-platform people tracked for planning. Both are one-way; adding does not notify the other person; there is no mutual indicator. Private Contacts auto-promote to On NewChums when the contact signs up with a matching email.
- **Profiles**: editable profiles with hobbies, location, travel distance, bio, gender, profile theme, avatar upload, and public profile pages (`/u/handle`). Public attendance record section (Going follow-through, Shows up, Attendance checks answered, Plans attended, Plans hosted, Host follow-through). Local recognition badges (Top Attendee, Top Host) computed from rolling 12-month activity within 50 km. Optional moderated post-plan shout-outs section with section-level and per-card visibility controls.
- **Settings**: notification preferences (14 email toggles, including community announcements), privacy toggles, email/password change, account deletion. Lightweight-signup users land here with a "Set a password" card until setup is complete.
- **Admin**: interests moderation (soft delete, merge, restore, default sort newest-first, category combo-box), user account management (search, suspend/unsuspend, subscription plan dropdown, setup-status chip), plan moderation, community moderation, safety/concern review, shout-out moderation, KPIs and growth-loop dashboard, roadmap moderation, QR redirects inventory. Requires `super_admin` role.
- **QA plans**: plans can be marked as QA by super admins. QA plans are invisible to normal users but fully functional for super admins, including feeds, emails, cron jobs, notifications, and chat. Excluded from KPIs and the public Explore feed. Used for production-safe end-to-end testing.
- **Communities**: dedicated community pages where users can join, browse plans, and organize gatherings together. Public or private visibility, open or approval-required join modes, member management, community plan feeds, hobby tagging, optional Website / Discord links, optional banner image, optional weekly operating hours, an Announcements tab (owner-only posting with optional member email notifications and per-community email mute), and a Schedule tab (recurring weekly time blocks with optional per-block image and a "Start a plan during this time" deeplink). Super admin moderation. Each user is capped at 5 active owned communities.
- **QR redirects**: super-admin redirect layer at `/qr/{code}` so printed QR posters and proxy cards can be remapped without reprinting. Lightweight inventory table with media type, assigned store, and per-record scan log (CF-resolved geo, server-side dedupe, no raw IPs).
- **Roadmap**: public product roadmap where users can submit, vote on, follow, and comment on items. Items in `received` status are private until super-admin review. Optional anonymous submissions and per-item privacy gate.
- **Subscription plans (no billing yet)**: three user-level plans (`free`, `super_host`, `community_pro`) assigned manually via admin. `community_pro` includes Super Host benefits and is inherited by communities the user owns. Surfaced read-only on `/your-plan`.
- **In-app notifications**: bell icon with unread state for chum, plan, join-request, and shout-out notification types. Unread chat message indicators derived from per-plan read tracking.
- **Email notifications**: transactional emails for invites, RSVPs, plan changes, join requests, attendee removals, confirmation requests, plan-at-risk alerts, post-plan feedback, plan-match digest, community announcements, community join-request lifecycle, and a daily unread-chat digest. Per-type unsubscribe via tokenized email links. Sent via Postmark.
- **Signup and onboarding**: multi-step wizard for both email/password and Google OAuth paths. Collects required fields (email, password, username, DOB) across focused steps, then optionally captures hobbies and location/travel distance. Required legal acceptance (Terms of Use and Privacy Policy) before signup.
- **Legal pages**: Privacy Policy and Terms of Use pages with footer links and required acceptance during signup for both credentials and OAuth paths.
- **Public marketing site**: homepage (gradient event cards, screenshot placeholders, updated copy), How it Works (screenshot placeholders, "Sign up" CTA), Science of Friendship, Safety Center, and contact form.
- **Auth**: Google OAuth + email/password credentials, email verification, password reset, suspended account handling.

### What's Partially Built or Evolving

- **Plan feedback and matching**: post-plan feedback with hidden-metric scoring and chum preferences. Both directions of digest filtering and host-side hard filtering on Explore are live; viewer-side compatibility notes on plan details and digests are wired. Plan-level inheritance and richer compatibility warnings remain to be expanded.
- **Plan chat enhancements**: the per-plan group chat ships with real-time WebSocket delivery, unread indicators, and a daily digest email. Reactions, threads, and attachments are not built.
- **Community chat**: schema toggle exists but community-level chat is not implemented. Planned as the first Community Pro feature.
- **Recurring plans**: not implemented; the schema supports single-time events only.

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
| Real-time | Cloudflare Durable Objects | WebSocket relay for plan chat (ChatRoom, Hibernation API) |
| Scheduled tasks | Cloudflare Cron Triggers | Hourly handler runs 24-hour attendance check processing (Phases 1-3), the RSVP-based minimum-attendees auto-cancel (Phase 4), no-attendee auto-cancel, post-plan feedback emails, plan-match digest, local badge computation, and (once per day) the unread-chat digest |
| Storage | Cloudflare R2 | Avatar, banner, community banner, and schedule-block image media |
| Observability | Sentry + Axiom + Google Analytics | Error tracking, API logs, analytics |

**Key rule:** Business logic belongs in the API Worker. The Web Worker handles rendering and auth. Do not introduce new business logic in Next.js route handlers.

---

## Production

- **Web Worker:** `newchums-web-dev` (suffix mismatch acknowledged; this is production)
- **API Worker:** `newchums-api`
- **Canonical host:** `https://newchums.com` (www to non-www redirect enforced before Auth.js by `web/src/middleware.ts`)
- **Single production environment** (no separate dev Worker environment yet)

---

## Canonical Documentation

| Document | Purpose |
|----------|---------|
| `AGENTS.md` | Agent governance, architectural rules, product direction, terminology, UI governance, design tone. **Read this first.** |
| `docs/Technical_Specs.md` | Authoritative technical spec, stack, invariants, endpoints, schemas, implemented vs planned. |
| `docs/System_Map.md` | Diagrams, production architecture, core flows, system boundaries. |
| `docs/Development_Setup_Guide.md` | Operational guide, local setup, env vars, migrations, deployment, session log. |
| `docs/UI_Patterns.md` | Reusable UI recipes (hero cards, empty states, success dialogs, three-zone discovery cards, etc.). Skim before any UI change. |
| `docs/Rollback_Procedures.md` | Practical rollback notes for a bad deploy (Worker rollback, Neon PITR, migration safety). |
| `docs/Future_Ideas_Reference.md` | Strategic idea bank (Robert only). Agents may read for context but must not treat contents as requirements or modify the file. |
| `docs/Gitignored_Assets_and_Restore.md` | Guide for restoring gitignored files on a fresh clone. |
| `docs/legal/` | Source markdown for Terms of Use and Privacy Policy. |

**Durable behavior lives in repo docs.** When user-visible product behavior changes, update the relevant repo doc (`AGENTS.md`, `docs/Technical_Specs.md`, or `docs/System_Map.md`) in the same change set rather than maintaining a separate in-app summary surface.

---

## Terminology

| Term | Usage |
|------|-------|
| **plan** | Preferred user-facing term for an event/gathering |
| **gathering** | Alternative used in descriptions |
| **event** | Used in code, API routes, and database tables; acceptable internally |
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

NewChums no longer relies on the original purchased template (`template_reference/`). New UI work should:

- Skim `docs/UI_Patterns.md` for an existing recipe (hero cards, empty states, success dialogs, three-zone discovery cards, etc.) and adopt its conventions.
- Look at the closest live page in `web/src/app/` for matching structure, and reuse shared components in `web/src/components/`.
- Prefer theme overrides + shared components over per-page styling patches.
- Form fields: label-above style only (`AppTextField`, `AuthField`, `NCDatePicker`). No floating/in-field labels.

See `AGENTS.md` for detailed UI governance rules.
