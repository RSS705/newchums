# Development Setup Guide

Last Updated: May 8, 2026

This document is the operational guide for running and deploying NewChums.
For architectural invariants and contracts, see `docs/Technical_Specs.md`.
For diagrams and flows, see `docs/System_Map.md`.
For product direction, terminology, and agent governance, see `AGENTS.md`.

**Where durable behavior lives:** `AGENTS.md`, `docs/Technical_Specs.md`, and `docs/System_Map.md` are the durable sources of truth for user-visible product behavior. There is no separate in-app system-logic page; when behavior changes, update the relevant repo doc in the same change set.

---

## Current State (Short)

- **Production:** Single production environment.
- **Workers:** Web = `newchums-web-dev` (production), API = `newchums-api`.
- **Canonical host:** `https://newchums.com` (www → non-www redirect enforced before Auth.js).
- **API migration:** All business logic is in the API worker: auth flows, profile, interests, Chums, Chum invites, events (plans), notifications, email unsubscribe, admin, avatar, contact form, scheduled tasks.
- **Signup/Onboarding:** Multi-step wizard for both email/password (4 steps) and Google OAuth (3 steps). Collects credentials + legal acceptance → username/DOB → hobbies (optional) → location/travel distance (optional). Required Terms of Use and Privacy Policy acceptance before signup. Shared `OnboardingProgress`, `StepTransition`, `HobbiesStep`, `LocationStep` components.
- **Events (plans):** Full event creation, context-aware RSVP (going/maybe/can't make it), invite, alternate time suggestion (with best-start-times overlap display), cancel, edit (host), request-to-join (host approval), host attendee removal. Visibility: invite_only, chums_only, public. Gradient banner presets + custom upload. Plan-change email notifications to attendees (edits, locks, cancellations). Per-plan participant chat with real-time WebSocket delivery via Cloudflare Durable Objects, unread chat indicators in bell and plan cards, daily unread-chat digest email. Host can lock/unlock plans. Attendance assurance (host-configurable final confirmation, min confirmed attendees, fallback policies, cron-based reminders and cutoff processing). Going attendees can invite others (host-controlled via `allow_attendee_invites`, on by default). Invites support optional "suggest a better time" mode when alt times are enabled. Unauthenticated visitors on share/invite links land on a **lightweight signup card** (email + DOB + legal) that issues a magic link; clicking it creates a real NewChums account, signs them in, and returns them to the plan (migration 084 removed the prior guest participation model).
- **Explore page:** Personalized discovery feed (`/`). Uses `GET /events/explore` with hobby-based ranking, sort options (upcoming/newest), personalization toggle, location-aware ordering (Haversine), hobby filter, time-range chips, text search, session state persistence via `localStorage`. Includes a local-signal footer (`GET /explore/local-signal`) showing nearby active-user counts for relevant hobbies (e.g. "14 active people near you are into board games") when the count meets a minimum threshold of 5.
- **Your Plans:** Tabbed upcoming/past view with hosted and joined sections, unread chat indicators, real API data.
- **Chums:** Two-part saved-people feature (On NewChums + Private Contacts) with search, email invite flow, privacy controls, public Chums on profiles, private per-chum notes, and birthday display. One-way only; no mutual indicator.
- **Notifications:** In-app bell with unread state for chum, plan, join-request, and shout-out notification types. Unread chat indicators derived from per-plan read tracking. 14 email notification types with per-type Settings toggles and tokenized email unsubscribe links.
- **Scheduled tasks:** Cloudflare Cron Trigger (`0 * * * *` UTC, hourly) runs the attendance assurance lifecycle (Phases 1-3 for the 24-hour check; Phase 4 for the optional RSVP-based minimum), the no-attendee auto-cancel, the daily unread-chat digest, the plan-match digest, post-plan feedback emails, and local-badge computation.
- **Admin:** Interests moderation, user account management (super_admin only), plan moderation, community moderation, safety/concern review, shout-out moderation, KPIs and growth-loop dashboard, roadmap moderation, QR redirects inventory.
- **Subscriptions and premium rollout:** Billing is **not** implemented yet. Organizer-facing access is planned around three manually assigned user plans: `free`, `super_host`, and `community_pro`. `community_pro` includes `super_host` benefits and is intended to cover up to 5 owned communities. Premium work can stay behind super-admin or QA-only gating until ready. Read-only `/your-plan` page surfaces the current tier in-app.
- **Communities:** Community create/browse/detail flows are live, including avatar upload, banner upload, hobby tagging, optional Website / Discord links, optional weekly operating hours, an Announcements tab with optional member email notifications and per-community email mute, and a Schedule tab (recurring weekly time blocks with optional per-block image and a "Start a plan during this time" deeplink). Plans can be linked to many communities (cap 10) via the `event_communities` junction table. Community chat is **not** implemented yet and is intended to be the first `community_pro` feature when added.
- **QR redirects:** Internal redirect layer at `https://newchums.com/qr/{code}` so printed codes can be remapped without reprinting. Super-admin inventory UI at `/admin/qr-redirects` with per-record scan log (CF-resolved geo, server-side dedupe, no raw IPs).
- **Roadmap:** Public product roadmap with submit/vote/follow/comment, optional anonymous submissions, per-item privacy gate, super-admin moderation.
- **Profiles:** Edit profile page and public profile page include live Attendance Record section (Going follow-through, follow-through rate, attendance checks answered, plans attended, plans hosted, host completion rate).
- **Legal:** Privacy Policy (`/privacy`) and Terms of Use (`/terms`) pages. Required legal acceptance checkbox on signup (credentials and OAuth). Acceptance metadata stored on users table.
- **Public site:** Homepage (updated copy, gradient event cards, screenshot placeholders), How it Works (updated copy, screenshot placeholders), Science of Friendship, Safety Center, Contact, all sharing `LandingLayout`. Footer includes Terms of Use and Privacy Policy links.
- **Build:** `cd web && npm run build` passes (Edge/OpenNext constraints apply).

---

## Local Development

### First-time or fresh clone

If you are doing UI work, restore gitignored assets per `docs/Gitignored_Assets_and_Restore.md` (env files only). New UI should reuse existing NewChums patterns and `docs/UI_Patterns.md`; the original purchased template is no longer used.

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

---

## Environment Files

### Web (`web/.env.local`)

Required (typical local dev):
- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_TRUST_HOST=true`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Optional / situational:
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, Cloudflare Turnstile site key for contact form (logged-out users). If unset, Turnstile widget is not shown.
- `NEXT_PUBLIC_API_BASE_URL`
  - Defaults via `.env.development` to `http://127.0.0.1:8787` unless overridden.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
  - Optional; required for Places autocomplete on Profile Location. If unset, address input behaves as plain text.
- `NEXT_PUBLIC_AVATAR_BASE_URL`
  - Defaults to `NEXT_PUBLIC_API_BASE_URL`.
  - **When sharing DB with prod:** set to the production API URL so avatar upload + display use the same R2 origin.

### API (`api/.dev.vars`)

Required:
- `DATABASE_URL` (same Neon URL as web)
- `NEXTAUTH_SECRET` (must match web `AUTH_SECRET`)

Email / Resend (required for email flows):
- `RESEND_API_KEY`, used for all transactional email sends (verification, reset, contact form, etc.) via raw fetch to `https://api.resend.com/emails`.
- `EMAIL_FROM` (e.g. `NewChums <no-reply@newchums.com>`)
- `WEB_BASE_URL`

Subject lines live in `api/src/email/subjects.ts` (keyed by template basename). Template HTML/text bodies live in `api/src/email/templates/` and are bundled at build time via the `[[rules]] type = "Text"` block in `wrangler.toml`, then rendered in-process by `mustache` via `api/src/email/renderTemplate.ts`. No template ID env vars are needed.

Optional:
- `TURNSTILE_SECRET_KEY`, Cloudflare Turnstile secret key for contact form verification (logged-out users). If unset, Turnstile is skipped (useful for local dev).
- `SENTRY_DSN`
- `AXIOM_TOKEN`
- `AXIOM_DATASET`

---

## Environment Variable Locations (API vs Web)

### API Worker (`newchums-api`)

- **Deployment:** Cloudflare Worker via `wrangler deploy`
- **Secrets:** `npx wrangler secret put <NAME>`, stored in Cloudflare, not in code (e.g. `DATABASE_URL`, `NEXTAUTH_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`)
- **Public vars:** `api/wrangler.toml` `[vars]` (e.g. `APP_ENV`, `EMAIL_FROM`, `WEB_BASE_URL`)
- **Local dev:** `api/.dev.vars` (gitignored; copy from `.dev.vars.example`)

### Web Worker (`newchums-web-dev`)

- **Deployment:** OpenNext → Cloudflare Worker via `wrangler deploy` from `web/`
- **NEXT_PUBLIC_* variables are baked in at build time.** They must exist when `opennextjs-cloudflare build` runs. They are **not** read from `wrangler.toml` (that only affects Worker runtime; the client bundle is pre-built).
- **Production build-time vars:**
  - `web/.env.production`, committed; used when `next build` runs. Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` here for production.
  - Or: the deploy script (`npm run deploy`) prefixes the build with `NEXT_PUBLIC_API_BASE_URL=...`, any vars you set in the environment before running `npm run deploy` are passed to the build.
- **Local dev:** `web/.env.local` (gitignored) overrides `.env.development`

**Where to set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` for production:**

1. **Option A (simplest):** Add to `web/.env.production` (Turnstile site key is public, so committing it is acceptable):
   ```
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAA...
   ```
2. **Option B:** Set in your shell or CI before deploy: `NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAA... npm run deploy`

**Redeploy after adding:** `cd web && npm run deploy`

---

## Key Flows (Operational Notes)

### Email verification (Credentials)

Credentials signups require email verification before sign-in.

1. Signup → user created with `email_verified_at = NULL`
2. API sends email: `POST /auth/email-verify/request`
3. Verify link hits `/auth/verify?email=&token=` → API confirm
4. Pending page polls verification status until verified
5. Google OAuth users are treated as verified at creation

### Contact form

- `POST /contact` sends email to `contact@newchums.com` from `contact@newchums.com` via Resend (uses `RESEND_API_KEY`).
- **Turnstile setup (production):**
  1. Create a Turnstile widget at [Cloudflare Dashboard → Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile).
  2. **Add your domain:** In the widget settings, add `newchums.com` (and `www.newchums.com` if used) to the widget's allowed domains. Otherwise the widget will not render.
  3. **Web:** Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to `web/.env.production` (see § Environment Variable Locations).
  4. **API:** Run `npx wrangler secret put TURNSTILE_SECRET_KEY` and paste the secret key.
  4. Logged-out users must complete the Turnstile challenge before submit. Logged-in users skip it.
- **Testing:** Use Cloudflare's [test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) (always pass) for local dev.
- For production rate limiting (5 per 10 min per IP): run `npx wrangler kv namespace create CONTACT_RATELIMIT`, then add the `[[kv_namespaces]]` block to `api/wrangler.toml` (see commented example in file).

**Troubleshooting: "For testing only" on production**

If the Turnstile widget shows "For testing only" on newchums.com/contact, you are using **test keys** instead of production keys. [Test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) always pass validation but display that warning.

**Common cause:** Next.js loads `.env.local` and it **overrides** `.env.production` during build. If `web/.env.local` contains `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA` (for local testing), that test key gets baked into the production bundle.

**Fix:**
1. Ensure `web/.env.production` has the production site key: `NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAA...`
2. **Remove or comment out** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` from `web/.env.local` if it holds a test key. The deploy script now explicitly passes the key from `.env.production`, overriding `.env.local`, so this is optional, but cleaning `.env.local` avoids confusion.
3. Deploy: `cd web && npm run deploy`. The deploy script sources `NEXT_PUBLIC_TURNSTILE_SITE_KEY` from `.env.production` and passes it to the build, so the production key is always used.
4. **API:** Run `cd api && npx wrangler secret put TURNSTILE_SECRET_KEY` and paste the production secret key (you only need to do this once).

### Public profile

- Route: `/u/[handle]` (e.g. `/u/yourhandle`). Works for both logged-in (app shell) and logged-out (landing layout) visitors.
- API: `GET /public/users/:handle` (no auth). Returns `{ user: { displayName, handle, age, bio, hobbies, avatarUrl } }`. DOB never exposed; age computed server-side.
- Profile page has "View public profile" button when username is set. Links to `/u/{handle}`.

### Password reset

End-to-end:
forgot-password → Resend reset email → reset-password page → confirm → login

API behavior:
- Unknown email: 404 `EMAIL_NOT_FOUND`
- OAuth-only: 409 `OAUTH_ACCOUNT`
- Credentials user: 200 `{ ok: true }`

### Email change (Settings)

Settings → request email change → confirm at new email + notify old → confirm → redirect to login with new email.

Migration required:
- `web/sql/011_email_change_requests.sql`

---

## Database Migrations

Migrations live in `web/sql/`. They are forward-only (a few early migrations have an accompanying `*.down.sql`; most do not), and the canonical workflow is "apply every numbered file in sorted order against your Neon database." `web/sql/` itself is the source of truth for what each file does; read the SQL when you need details.

**Apply every migration in order on a fresh database:**

```bash
cd web
ls sql/*.sql | sort | grep -v '\.down\.sql$' | xargs -I {} psql "$DATABASE_URL" -f {}
```

That command also works on an existing database, but most migrations are not idempotent, so you should only apply files newer than the last one already run. To check what is already applied, inspect the live schema (e.g. `psql "$DATABASE_URL" -c '\\d newchums.events'`) or compare against `git log -- web/sql/`.

**Migrations with non-obvious behavior worth knowing about before running them:**

- `084_remove_guest_participation.sql` is a **destructive consolidation** of the prior 035 / 043 / 077 guest-participation pattern. It deletes orphan guest rows from `event_rsvps`, `event_confirmations`, and `event_alt_times`, drops the `guest_email` / `guest_name` columns + guest-specific partial indexes, and restores `user_id NOT NULL` on all three tables. A pre-flight count aborts the migration if more than ~100 orphan guest rows exist as a safety catch. After 084, the lightweight magic-link signup flow (`POST /auth/plan-signup/request` + `POST /auth/magic-link/consume`) is the only way for unauthenticated visitors to participate in a plan.
- `092_event_communities_junction.sql` and `093_drop_event_community_id.sql` are a **paired schema change**: 092 introduces `event_communities` (many-to-many) and backfills it from the legacy `events.community_id` column; 093 then drops the old column. Apply 092 before deploying the new API + web bundle, and 093 only after the new code is live so the running worker never reads a column that no longer exists.
- `008_interests_seed.sql` requires the interests tables to exist and seeds the base hobby list.
- `015_interests_moderation.sql` adds the `role` column to `users` (this is what unlocks `super_admin` access).

For everything else, read the SQL file directly: each migration is small, has a one-line purpose comment at the top, and is named after what it does.

---

## Deployment

### Web

```bash
cd web
npm run deploy
```

Notes:
- Deploy script sets `NEXT_PUBLIC_API_BASE_URL` (and `NEXT_PUBLIC_AVATAR_BASE_URL`) to the production API URL so the client bundle never contains localhost.
- After deploy, verify signup and profile network calls hit the production API origin.

### API

```bash
cd api
npx wrangler secret put DATABASE_URL
npx wrangler secret put NEXTAUTH_SECRET
npx wrangler secret put RESEND_API_KEY
npm run deploy
```

---

## Email Templates

All transactional emails are sent via Resend. Templates live in `api/src/email/templates/` as `.html` + `.txt` pairs (plus `contactSubmission.ts` for the contact-form body). They are bundled at build time via the `[[rules]] type = "Text"` block in `wrangler.toml`, imported as strings, and rendered in-process using the `mustache` npm package via `api/src/email/renderTemplate.ts`. Subject lines live in `api/src/email/subjects.ts`, keyed by template basename (with `_host` / `_attendee` variants for `confirmationRequestUser`).

Template basenames currently shipped:

- `verifyEmail`, `passwordReset`
- `emailChangeConfirm`, `emailChangeNotifyOld`, `emailChangeSuccess`
- `magicLinkSignup`, `planSignin`, `signinLink`
- `chumInvite`
- `eventInvite`, `eventJoin`, `eventLeave`, `eventMaybe`, `eventChanged`, `attendeeRemoved`
- `joinRequestToHost`, `joinRequestApproved`, `joinRequestDeclined`
- `confirmationRequestUser` (host + attendee subject variants)
- `planAtRisk`, `planAutoCancelled`, `planRemovedByAdmin`, `planFeedback`
- `unreadChatDigest`, `eventMatchDigest`
- `communityJoinRequest`, `communityJoinApproved`, `communityJoinDeclined`, `communityJoinRequestReopened`, `communityMemberRemoved`, `communityMemberUnblocked`, `communityAnnouncement`
- `roadmapUpdate`, `concernReportAlert`

The send functions in `api/src/email/send.ts` noop safely when `RESEND_API_KEY` is not configured.

---

## Troubleshooting

| Issue | Fix |
|------|-----|
| Google OAuth "Invalid code verifier" | Ensure canonical host redirect is active and `AUTH_URL/NEXTAUTH_URL` are `https://newchums.com` |
| API says `DATABASE_URL is not set` | Ensure `api/.dev.vars` has non-empty `DATABASE_URL`; restart API; verify via `/health/env` |
| Authenticated API calls fail (401) | Ensure API `NEXTAUTH_SECRET` matches web `AUTH_SECRET` |
| Prod bundle calls localhost | Deploy using `npm run deploy` (not raw `next build`); hard refresh / clear cache |
| Password reset links wrong host | Ensure API `WEB_BASE_URL` is correct (`https://newchums.com` in prod) |
| Avatar mismatch local vs prod | Set `NEXT_PUBLIC_AVATAR_BASE_URL` to prod API URL when sharing DB so all avatar ops go through R2-backed origin |
| `NeonDbError: invalid input syntax for type uuid: "explore"` | Ensure `GET /events/explore` is registered **before** `GET /events/:id` in the Hono route table (see API route ordering in Technical_Specs.md) |

---

## Chunk Template

At end of each development session, append a Chunk:

```
Chunk XX, YYYY-MM-DD
- Goal:
- Changes:
- Verification:
- Deploy:
- Next Steps:
```

---

## Session Log (Chunks)

(Existing chunks should remain here. Add new chunks at the end.)

---

Chunk 17, 2026-03-18
- Goal: Allow guest (unauthenticated) invitees to suggest alternate times from the public plan details view.
- Changes:
  - **DB migration 043** (`event_alt_times`: `user_id` made nullable, added `guest_email TEXT NULL`). Mirrors the `event_rsvps` guest pattern.
  - **API:**
    - `POST /events/:id/guest-alt-time`, new endpoint. No auth required; validates invite token, verifies guest has going/maybe RSVP, enforces 10-suggestion limit per guest email. Inserts with `user_id = NULL, guest_email`.
    - `GET /events/:id`, alt-times query changed from `JOIN` to `LEFT JOIN newchums.users` so guest entries are included. Guest display name uses email prefix.
  - **Web, EventDetailClient.tsx:**
    - "Find a better time" section now visible for guest invitees (`isGuestInvite && (guestRsvpStatus === "going" || guestRsvpStatus === "maybe")`).
    - `handleAltTimeSubmit` routes through `POST /events/:id/guest-alt-time` (with invite token) when viewer is unauthenticated; otherwise uses the existing authenticated endpoint.
  - **Documentation:** Updated Technical_Specs.md (v13.2), Development_Setup_Guide.md.
- Verification: `npm run build` passes cleanly.
- Deploy: Run migration 043 against production DB before deploying API worker.

---

Chunk 16, 2026-03-18
- Goal: Plan invite flow enhancements, attendee invites, suggest-time mode, visual consistency.
- Changes:
  - **DB migration 042** (`allow_attendee_invites BOOLEAN NOT NULL DEFAULT true` on `events`).
  - **API:**
    - `POST /events/:id/invite`, expanded from host-only to host + Going attendees (when `allow_attendee_invites` is true). Server-side permission enforcement: checks Going RSVP status. Accepts optional `suggest_time: true` flag; when enabled (and `allow_alt_times` is true on the event), appends a suggest-time note to the invite email. `invited_by` column already tracks the inviter. Inviter name used in email (not always the host).
    - `POST /events/:id/toggle-attendee-invites`, new host-only toggle endpoint (mirrors `reserve-seats` pattern).
    - `POST /events` and `PATCH /events/:id`, accept and store `allow_attendee_invites`. PATCH uses COALESCE to preserve existing value when not explicitly provided.
  - **Email:** `sendEventInviteEmail` extended with optional `suggestTimeNote` parameter (added to Postmark template model).
  - **Web, EventDetailClient.tsx:**
    - "Invite people" header updated from `subtitle1`/600 to `h5`/700 with responsive font size, now matches "Find a better time" and "Join requests" sections.
    - Invite section shown for Going attendees when `allowAttendeeInvites` is true (not just host).
    - "Ask them to suggest a better time" toggle added to invite form (only visible when `allow_alt_times` is enabled on the plan).
    - "Let Going attendees invite others" toggle added to Host actions card.
    - `handleInvite` passes `suggest_time` flag to API.
  - **Web, CreateEventClient.tsx:** Added "Let Going attendees invite others" toggle (default on).
  - **Documentation:** Updated Technical_Specs.md (v13.1), Development_Setup_Guide.md.
- Verification: `npm run build` passes cleanly.
- Deploy: Run migration 042 against production DB. Deploy API first, then web. If using the suggest-time email feature, update the Postmark event invite template to conditionally render `{{#suggestTimeNote}}{{suggestTimeNote}}{{/suggestTimeNote}}`.
- Next Steps: Update Postmark event invite template (ID in `POSTMARK_TEMPLATE_EVENT_INVITE`) to render the `suggestTimeNote` variable if set.

---

Chunk 15, 2026-03-17
- Goal: Attendance Assurance system, legal pages and signup acceptance, attendance record, safety center image, hobbies bug fix, "Find a better time" improvements, unread chat digest fix, documentation update.
- Changes:
  - **Attendance Assurance (full implementation):**
    - DB migration 039 (`event_confirmations` table, attendance assurance columns on `events`).
    - DB migration 077 (guest support for `event_confirmations`: nullable `user_id`, `guest_email` column, partial unique indexes).
    - API: `POST /events/:id/confirm` (in-app, auth-required), `POST /events/:id/guest-confirm` (token-based guest confirmation, no login), `processAttendanceAssurance` cron handler (initial sends, reminders at 12h/3h, cutoff processing). Registered user confirmation emails use `?section=confirmation` deep-link pattern (login-required redirect). Guest confirmation emails include direct confirm/decline buttons and a "View plan" link (token-based, no login). `POST /events` and `PATCH /events/:id` accept `min_confirmed_attendees` and `fallback_policy`. `GET /events/:id` returns confirmation state and viability, including guest confirmations.
    - Cron changed from daily (`0 14 * * *`) to hourly (`0 * * * *`).
    - New Postmark templates: Confirmation Request (43984465), Plan At Risk (43984947), HTML and text versions.
    - `CreateEventClient.tsx`: Attendance assurance config (switch, min attendees, fallback policy dropdown).
    - `EventDetailClient.tsx`: Confirmation UI (confirm/decline buttons), viability info card, per-attendee confirmation status in "Who's in" section, email confirmation URL handling.
    - `api/wrangler.toml`: Updated cron schedule and template IDs.
  - **Event Changed email fix:** `PATCH /events/:id` now detects and includes attendance assurance field changes in the event-changed email. Created `eventChanged.txt` plain text template.
  - **"Find a better time" improvements:**
    - "Suggest a time" button indicates if user has already suggested times.
    - Default date/time in suggestion form matches the host-set event date/time.
    - Edit button scrolls user to the edit form.
    - "Best fits" section renamed to "Best start times".
    - Replaced pairwise overlap algorithm with sweep-line algorithm for maximal time overlaps.
  - **In-app confirmation:** Added UI for logged-in users to confirm/decline directly on the plan details page during the confirmation window.
  - **Unread chat digest email fix:** Refactored `sendUnreadChatDigestEmail` to pre-render plan cards as HTML/text strings to work around Postmark's Mustachio context-switching issue. Updated template. Created `unreadChatDigest.txt` plain text version.
  - **Legal pages and signup legal acceptance:**
    - DB migration 040 (`accepted_terms_version`, `accepted_privacy_version`, `accepted_legal_at` on `users`).
    - New pages: `/terms` (TermsContent.tsx), `/privacy` (PrivacyContent.tsx) using shared `LegalPageContent` component.
    - Footer updated with Terms of Use and Privacy Policy links.
    - Signup: required legal acceptance checkbox with inline links. Both credentials and OAuth paths.
    - API: `POST /auth/signup` accepts legal versions. New `POST /auth/record-legal-acceptance` endpoint for OAuth users.
    - `AppShell.tsx`: records legal acceptance from `sessionStorage` after OAuth.
  - **Hobbies step bug fix:** Refactored Autocomplete `onChange` handler to use `reason` parameter and route through `addInterest`. Added `disableClearable`.
  - **Safety Center image:** Replaced placeholder with `Jenga.jpg`.
  - **Attendance Record (full implementation):**
    - DB migration 041 (`committed_at` on `event_rsvps` with backfill and index).
    - API: `GET /public/users/:userId/attendance-record` computes 5 metrics (Shows up, Confirms attendance, Plans attended, Plans hosted, Host follow-through). `POST /events/:id/rsvp` and host RSVP set `committed_at`. `GET /profile` returns `userId`.
    - New component: `AttendanceRecordSection.tsx`, fetches metrics, handles loading/new-user states, renders metric grid.
    - Replaced placeholder cards in `PublicProfileView.tsx` and `ProfileClient.tsx`.
  - **Documentation:** Updated AGENTS.md, README.md, Technical_Specs.md (v13.0), System_Map.md, Development_Setup_Guide.md.
- Verification: TypeScript passes (`npx tsc --noEmit`) in both web and api. Next.js build (`npm run build`) passes.
- Deploy: Run migrations 039, 040, 041 against production DB. Deploy API first (new cron schedule, new endpoints, new template IDs), then web. Update Postmark templates 43984465, 43984947, 43975299, 43971187 with new HTML and text content from `api/src/email/templates/`.
- Next Steps: N/A

---

Chunk 14, 2026-03-16
- Goal: Documentation review and update, reflect all features built since last doc update.
- Changes:
  - `AGENTS.md`: Updated Cron status (active), event email templates status (many live), event chat status (has unread notifications and daily digest).
  - `README.md`: Updated feature list (personalized Explore, multi-step signup, email notifications, RSVP context-awareness, cron triggers). Removed "Event emails" from partially built. Added signup/onboarding and email notifications sections.
  - `docs/Technical_Specs.md` v12.0: Updated notification preference types table (13 keys with Postmark template IDs). Updated in-app notification types (added `event_updated`, `event_locked`, `join_request_withdrawn`). Added `POST /email/unsubscribe` endpoint. Documented Cron Triggers, `scheduled` handler, unread chat notifications (bell + digest), multi-step signup/onboarding, `resolveInterestSlugs` helper, context-aware RSVP UI, Explore personalization params. Added migrations 034–037 to schema. Updated email templates from "not created" to "active" with template IDs. Updated technical debt.
  - `docs/System_Map.md`: Updated production architecture and consolidated diagrams (Cron Triggers active). Updated incomplete flows table. Added email unsubscribe route. Updated signup flow descriptions.
  - `docs/Development_Setup_Guide.md`: Updated current state. Added new env vars and active template IDs. Added migrations 036–037 to list. Updated Postmark templates section (active vs scaffolded). Removed MVP reference.
- Verification: All docs cross-reference correctly. No speculative content documented as implemented.
- Deploy: No code changes. Documentation only.
- Next Steps: N/A

---

Chunk 13, 2026-03-13
- Goal: Unread plan chat notifications, in-app bell indicators and daily email digest.
- Changes:
  - DB migration 037 (`user_profile.chat_digest_sent_at TIMESTAMPTZ NULL`).
  - `api/src/lib/notificationPrefs.ts`: Added `unread_chat_digest` to VALID_KEYS and DEFAULT_PREFS.
  - `api/src/index.ts`: Extended `GET /notifications` to return `unreadChats` array (derived from `event_chat_messages` and `event_chat_reads`). Added `handleScheduled` function for daily digest cron job, queries users with unread chats, checks preferences, sends emails via `sendUnreadChatDigestEmail`, updates `chat_digest_sent_at`.
  - `api/src/email/send.ts`: Added `sendUnreadChatDigestEmail` with flattened template model.
  - `api/src/email/templates/unreadChatDigest.html`: New Postmark template for digest.
  - `api/src/db.ts`: Added `POSTMARK_TEMPLATE_UNREAD_CHAT_DIGEST` to Bindings.
  - `api/wrangler.toml`: Added template ID env var and `[triggers] crons = ["0 14 * * *"]`.
  - `web/src/components/layout/NotificationBell.tsx`: Added `UnreadChatRow` component, `unreadChats` state, chat bubble icon rendering.
  - `web/src/app/(app)/settings/notificationConfig.ts`: Added `unread_chat_digest` toggle.
  - `web/src/app/(public)/unsubscribe/UnsubscribeClient.tsx`: Added unsubscribe label.
- Verification: TypeScript passes in both packages. Bell shows unread chat entries. Settings toggle present.
- Deploy: Run migration 037. Deploy API first (new cron trigger + scheduled handler), then web.
- Next Steps: N/A

---

Chunk 12, 2026-03-13
- Goal: Context-aware RSVP buttons and improved Explore feed personalization.
- Changes:
  - `EventDetailClient.tsx`: "Can't make it" button conditionally rendered (only when `event.isInvited || event.hasRsvp`). RSVP heading text dynamically set ("Can you make it?" for invited users, "Are you in?" otherwise).
  - `api/src/index.ts`: `GET /events/explore` extended with `sort` (upcoming/newest) and `personalize` (0/1) params. Hobby-match ranking expression. ORDER BY prioritizes host's events → hobby match (when personalized) → distance/time.
  - `DashboardHome.tsx`: Added sort and personalization states with `localStorage` persistence (`nc_explore_state`). Added sort chips (Upcoming / Newest added) and toggleable Personalized chip with tooltip. Removed redundant location/distance context chips.
- Verification: TypeScript passes in both packages.
- Deploy: Standard web + API deploy.
- Next Steps: N/A

---

Chunk 11, 2026-03-12
- Goal: Multi-step signup/onboarding redesign, plan-change email notifications, email unsubscribe infrastructure, and various notification improvements.
- Changes:
  - New shared onboarding components: `OnboardingProgress`, `StepTransition`, `HobbiesStep`, `LocationStep` in `web/src/components/onboarding/`.
  - `SignupClient.tsx`: Rewritten as 4-step wizard (credentials → username/DOB → hobbies → location).
  - `OnboardingUsernameClient.tsx`: Rewritten as 3-step wizard (username/DOB → hobbies → location) for Google OAuth users.
  - `api/src/index.ts`: `POST /auth/signup` extended with optional `interest_slugs`, `home_city`, `home_lat`, `home_lng`, `travel_radius_km`. Extracted `resolveInterestSlugs` helper. Added `notifyAttendeesPlanChanged` for plan-change notifications. Added `POST /email/unsubscribe` endpoint.
  - Plan-change notifications: `PATCH /events/:id`, `POST /events/:id/lock`, `POST /events/:id/cancel` now notify going/maybe attendees via in-app notification and email (Postmark template 43971187).
  - Email unsubscribe: Tokenized JWT links in all notification email footers. `UnsubscribeClient.tsx` with label map. Settings toggles for all 13 notification types.
  - `NotificationBell.tsx`: Added cases for `event_updated`, `event_locked`, `join_request_withdrawn`.
  - DB migration 036 (join request withdrawn notification support).
  - Various Postmark template connections: RSVP status emails (43922675, 43922237, 43921920), attendee removed (43923102), join requests (43906440, 43906609, 43906703), plan changed (43971187).
- Verification: TypeScript passes in both packages.
- Deploy: Run migration 036. Deploy API then web.
- Next Steps: Add unread chat notifications.

---

Chunk 10, 2026-03-11
- Goal: Per-plan participant group chat with real-time WebSocket delivery, host-controlled plan locking, and unread indicators.
- Changes:
  - DB migration 029 (`newchums.event_chat_messages`, `newchums.event_chat_reads`, `events.locked_at TIMESTAMPTZ NULL`).
  - New Cloudflare Durable Object `ChatRoom` (`api/src/ChatRoom.ts`), per-plan WebSocket relay using the Hibernation API; stateless broadcast relay with database as source of truth.
  - `api/wrangler.toml`: added `[[durable_objects.bindings]]` (`CHAT_ROOM` → `ChatRoom`) and `[[migrations]]` (`v1`, `new_classes = ["ChatRoom"]`).
  - `api/src/db.ts`: added `CHAT_ROOM: DurableObjectNamespace` to `Bindings` type.
  - API: `GET /events/:id/chat` (fetch messages + lastReadAt), `POST /events/:id/chat` (insert + broadcast via DO), `POST /events/:id/chat/read` (upsert last_read_at), `GET /events/:id/chat/ws` (WebSocket upgrade with JWT auth + access check → ChatRoom DO), `POST /events/:id/lock` (host-only toggle). `POST /events/:id/rsvp` rejects new RSVPs on locked plans (`EVENT_LOCKED`). `GET /events/:id` includes `lockedAt`. `GET /events/mine` includes `has_unread_chat` subquery.
  - `web/src/lib/apiClient.ts`: exported `getAuthToken`; added `getChatWebSocketUrl` helper.
  - `EventDetailClient.tsx`: full chat UI (message list, composer, privacy notice, new-messages divider, empty/loading/access-denied states). WebSocket connection with exponential backoff reconnection and REST polling fallback. Lock/unlock button with explanatory text for host. "Locked" chip in header and chat. RSVP buttons disabled with message when plan is locked and user has no existing RSVP.
  - `EventCard.tsx`: unread chat dot (primary-colored) on plan cards when `hasUnreadChat` is true.
  - `ChatRoom` class exported from `api/src/index.ts` entry point.
- Verification: Chat messages persist and display in real-time via WebSocket. Lock prevents new joins. Host controls visible only to host. Non-participants cannot access chat. Unread indicators surface on Your Plans cards. WebSocket falls back to polling on connection failure.
- Deploy: Run migration 029 against production DB. Deploy API first (new DO binding + routes), then web. Durable Object migration (`v1`) runs automatically on first API deploy with the new wrangler.toml config.
- Next Steps: Future enhancements (reactions, threads, attachments, message editing/deletion) only when requested. Implement attendance reconfirmation email trigger. Create Postmark event email templates. Update account deletion cascade for chat tables.

---

Chunk 09, 2026-03-09
- Goal: Multiple polish passes, social/profile features, event details and creation experience, public marketing pages, attendance reconfirmation, and profile reliability placeholder.
- Changes:
  - DB migration 027 (`newchums.user_chums.note TEXT NULL`), private per-chum notes.
  - DB migration 028 (`newchums.events.require_reconfirmation BOOLEAN NOT NULL DEFAULT FALSE`), attendance reconfirmation setting.
  - API `GET /chums`: now returns `note` (private note) and `birthday` (month/day from DOB, respecting `is_hidden_age`) for each Chum.
  - API `PATCH /chums/:userId/note`: new endpoint for updating private Chum notes.
  - API `PATCH /events/:id`: new endpoint for host edits, accepts `title`, `description`, `starts_at`, `max_seats`, `visibility`, `require_reconfirmation`.
  - API `POST /events`: accepts `require_reconfirmation`. Host name in event responses prioritises `@username`. RSVP entries include `handle` for profile links.
  - API `GET /events/:id`: includes `requireReconfirmation` in response.
  - `web/src/lib/eventBanners.ts` (new): `BANNER_PRESETS` gradient library, `getGradientForEventId` (deterministic fallback), `suggestPreset` (keyword-based auto-suggest), `renderBannerPreset` (canvas → WebP blob).
  - `EventCard.tsx`: fallback gradient banner using `getGradientForEventId` when no `bannerKey` is present.
  - `ChumsClient.tsx`: birthday display (month/day) per Chum row; inline private note editing via pencil icon and `PATCH /chums/:userId/note`.
  - `EventDetailClient.tsx`: cancel now uses a custom MUI `Dialog` (replaced `window.confirm`). "Edit plan" button (host only) opens an inline dialog with pre-filled fields (title, description, date/time, seats, visibility, reconfirmation toggle). Attendee names link to `/u/{handle}`. Reconfirmation notice row shown when `requireReconfirmation` is true.
  - `CreateEventClient.tsx`: gradient banner preset picker with category chips and auto-suggestion; attendance reconfirmation `Switch` with explanatory caption.
  - `PlansPage.tsx`: refined wording to accurately represent both hosted and joined plans.
  - `AdminInterestsClient.tsx`: default sort changed to `created_at` descending (newest first).
  - `DashboardHome.tsx`: hobby `Autocomplete` wrapped with "Hobbies" label; filter layout uses `alignItems: "flex-end"` for alignment parity; hobby options sorted alphabetically.
  - `ProfileClient.tsx`: display name helper text shortened to "Your real name." Attendance record placeholder card added (visual-only; "Coming soon" chip; no scoring logic).
  - `LandingPageContent.tsx`: H1 updated to "around the things you enjoy"; group-chat copy removed; homepage event cards redesigned with 72px gradient banner strips; screenshot placeholders added.
  - `HowItWorksContent.tsx`: "Sign up free" → "Sign up"; group-chat references revised; screenshot placeholders added.
  - `page.tsx` + `how-it-works/page.tsx`: SEO metadata updated to remove group-chat framing.
- Verification: TypeScript passes (`npx tsc --noEmit`) in both web and api. No linter errors.
- Deploy: Run migrations 027 and 028 against production DB before deploying. Standard web + API deploy.
- Next Steps: Create Postmark event email templates. Implement attendance reconfirmation reminder (Cron Trigger or Queue → `POSTMARK_TEMPLATE_EVENT_REMINDER`). Update account deletion cascade for event tables. Drop legacy `events.interest_id` in a future cleanup migration.

---

Chunk 08, 2026-03-07
- Goal: Full documentation review and update, product direction, terminology, design tone, AI onboarding clarity.
- Changes:
  - `AGENTS.md`: Added Product Context section (positioning, terminology table, design/UX tone), Incomplete Areas table, Future_Ideas_Reference doc contract. Updated Agent Authority Clause with product-tone guidance.
  - `README.md`: Rewritten as strong onboarding doc, product description updated to current positioning, "What's Built" feature summary, architecture overview, terminology table, canonical doc index.
  - `docs/Technical_Specs.md` v8.0: Updated §1 mission context to current positioning with terminology note. Updated notification types table to match current user-facing titles. Added event-related notification types to In-app notifications section. Added Hono route ordering note. Added event tables to storage section. Added technical debt items (event email templates, account deletion cascade). Clarified "not yet implemented" for events.
  - `docs/System_Map.md`: Added product context cross-reference. Added §5 Key User Flows (logged-out, logged-in, incomplete flows table). Added §8 Web App Route Map (public + logged-in routes). Updated API boundary table with all current endpoints.
  - `docs/Development_Setup_Guide.md`: Added migration 024 to migration list. Added event email template env vars to API env section. Added Postmark Email Templates section (active + to-create). Added Hono route ordering troubleshooting entry. Updated Current State to reflect current system.
- Verification: All docs cross-reference correctly. Implemented vs planned clearly separated. No speculative content documented as implemented.
- Deploy: No code changes. Documentation only.
- Next Steps: Create Postmark event email templates. Update account deletion to cascade event tables.

---

Chunk 07, 2026-03-07
- Goal: Full redesign and rebuild of the logged-in Explore page as a real event discovery feed.
- Changes:
  - API: `GET /events/explore`, new discoverable events endpoint. Accepts `lat`/`lng`/`radius_km` for location-aware nearby-first ordering (Haversine formula), `hobby` (slug filter), `time_range` (this_week/this_weekend/next_30/all), `q` (text search). Applies visibility rules: shows `public` events to all, `chums_only` events to the host's chums, excludes `invite_only`. Distance computed server-side and returned as `distanceKm`. Falls back to chronological ordering when no location is provided.
  - Web, `DashboardHome.tsx` fully rebuilt: loads user profile (`GET /profile`) for location/radius defaults, fetches events via `GET /events/explore` with reactive filter state. Integrated filter bar with search input, time-range chips (This week / This weekend / Next 30 days / All upcoming), collapsible advanced filters (distance select via shared `DistanceSelect` component, hobby Autocomplete from `/interests`), clear-filters button. Location nudge banner when user has no `home_lat`/`home_lng` set, linking to profile. Contextual empty states: no events matching filters, no events nearby, no location set, no hobbies set. Empty states guide users to clear filters, start a plan, or update profile. Event feed uses responsive `Grid` with `EventCard` components.
  - `EventCard.tsx`, `PlanEvent` type extended with `description`, `hobbySlug`, `distanceKm` optional fields. Distance display added inline with location (e.g. "< 1 km", "5 km").
  - `ExploreFilterBar.tsx` and `EventListItem.tsx` deleted (dead code; superseded by integrated filter in `DashboardHome`).
  - Updated `docs/Technical_Specs.md`: added `GET /events/explore` to events API table; added Explore page to web pages table.
- Verification: TypeScript passes in both web and api. No linter errors. Explore page loads profile defaults, fetches events reactively on filter changes, handles empty states gracefully.
- Deploy: No DB migrations. Standard web + API deploy.
- Next Steps: Build full Event Details page. Wire homepage/How it Works mock panels to real event API. Add event edit endpoint.

---

Chunk 06, 2026-03-07
- Goal: First full iteration of the event/plan creation system, Your Plans view, event detail page, RSVP/invite/alternate-time system, and notification/email scaffolding.
- Changes:
  - DB migration 024 (`newchums.events`, `newchums.event_invites`, `newchums.event_rsvps`, `newchums.event_alt_times`). Events support visibility (invite_only / chums_only / public), status (draft / published / canceled), location (in_person / online), seats, hobby association, and alternate time toggle.
  - API: `POST /events` (create with inline invites + notifications + emails), `GET /events/mine` (upcoming/past with host/RSVP context), `GET /events/:id` (detail with visibility enforcement), `POST /events/:id/rsvp` (going/maybe/cant_make_it with capacity check), `POST /events/:id/alt-time` (alternate time suggestion), `POST /events/:id/cancel` (host only, notifies attendees), `POST /events/:id/invite` (add invitees post-creation).
  - Event email scaffolding: 5 Postmark template helpers (`sendEventInviteEmail`, `sendEventUpdatedEmail`, `sendEventCanceledEmail`, `sendEventReminderEmail`, `sendEventRsvpUpdateEmail`), all noop-safe when template IDs are not configured. Template env vars added to `Bindings` and placeholder entries in `wrangler.toml`.
  - In-app notifications created for: `event_invite`, `event_rsvp`, `event_alt_time`, `event_canceled`.
  - Web, `/events/create` (`CreateEventClient.tsx`): Full "Start a plan" form with fields for title, description, hobby (Autocomplete from `/interests`), seats, date/time, location type toggle (in-person name/address vs online link), visibility radio group with helper text, invite-people search (reuses `/chums/search`), email invite support, invitee chips, publish CTA.
  - Web, `/plans` (`PlansPage.tsx`): Replaced placeholder with real API-driven page. Tabs for Upcoming/Past. Sections for "Plans you're hosting" and "Plans you've joined or been invited to". Empty states with "Start a plan" CTA. Integrated with `GET /events/mine`.
  - Web, `/events/[id]` (`EventDetailClient.tsx`): New event detail page with RSVP actions (Going / Maybe / Can't make it), "Suggest another time" form, attendee response list, host cancel action, back navigation.
  - `EventCard.tsx` rebuilt from scratch for real `PlanEvent` data, hobby chip, visibility label, host indicator, RSVP status, formatted date/time, going count, CardActionArea linking to event detail.
  - `DashboardHome.tsx` updated to remove old `EventCardData` usage (removed placeholder past events section that used old type).
  - `AppShell.tsx`: "Create Event" button label updated to "Start a plan".
- Verification: TypeScript passes (`npx tsc --noEmit`) in both web and api. No linter errors. Event creation form validates and submits. Plans page tabs work. Event detail shows RSVP actions and attendee list.
- Deploy: Run migration 024 against production DB before deploying. Create Postmark email templates and add IDs to `wrangler.toml` (see `api/src/email/send.ts` for template model specs).
- Next Steps: Create Postmark templates for event emails. Build public event discovery/browse page. Add event update (edit) endpoint. Wire real event data into homepage and How it Works mock panels. Implement event reminder scheduling.

---

Chunk 05, 2026-03-07
- Goal: Build and polish all public marketing pages, Safety Center, redesigned homepage, and How it Works.
- Changes:
  - Safety Center (`/safety-center`): Created `SafetyCenterContent.tsx`. Seven sections: hero with eyebrow/H1/gold bar/CTAs/image placeholder, five-habits confidence checklist (icon cards), practical gathering tips (numbered 2-column grid), respect and comfort cards (2×2 top-border accent cards), "if something feels off" empowerment section with gold-border callout, reporting/contact section, CTA block.
  - Homepage redesign (`/`): Replaced `LandingHero` with `LandingPageContent.tsx`. New structure: hero (preserved headline + subtext, updated buttons to "Sign up" primary + "How it works" anchor secondary, desktop-only mini product-preview panel showing 3 event rows), event discovery section (6 mock event cards with interactive category filter chips, hover lift, empty state), "making plans easier" 3-column feature blocks, "why this works" top-border benefit cards with Science of Friendship bridge link, dark CTA section. Updated page metadata title and description.
  - How it Works (`/how-it-works`): Created route and both `page.tsx` + `HowItWorksContent.tsx` from scratch (was a 404; nav config referenced it but no route existed). Seven sections: hero with "See the steps" anchor CTA, 6-step product walkthrough (numbered gold badges with alternating icon backgrounds), "made for real plans" section with pain-point divider list and mock coordination panel (RSVP statuses, alternate time suggestion), friends + new connections 2-card section, discovery mock panel with 3 nearby event previews, trust/comfort icon-row cards with links to Science of Friendship and Safety Center, dark CTA section.
  - All pages share consistent design system: `SECTION_SPACING`, `CONTENT_MAX_WIDTH`, `SectionHeader` with `emphasis="primary" accentColor="secondary"`, full-bleed alternating backgrounds, gold accent bars, responsive collapse (centered mobile, left-aligned desktop), CTA section pattern (primary.dark bg, gold top stripe, numbered steps, secondary contained button).
  - Updated `page.tsx` to import `LandingPageContent` instead of `LandingHero`. `LandingHero.tsx` is now unused (preserved for reference; safe to delete).
  - Mock event data in homepage and How it Works is structured with typed arrays (`EventCard`, `MOCK_EVENTS`, `DISCOVERY_PREVIEWS`) for easy future replacement with real API data.
  - Updated `docs/Technical_Specs.md` v6.0: new §9 "Public Marketing Site" documenting shared structure, nav links, implemented pages, design system patterns, and future-ready elements. Renumbered §10–§15.
  - Updated `docs/Development_Setup_Guide.md`: Current State expanded to cover public marketing site.
- Verification: All four public pages render correctly with consistent nav/footer; category filter chips work on homepage; anchor links scroll to correct sections; pages are fully responsive; no linter errors.
- Deploy: No DB migrations. Standard web deploy: `cd web && npm run deploy`.
- Next Steps: Connect homepage/How it Works mock event data to real API when event system is ready. Add real hero images to replace gradient placeholders. Delete unused `LandingHero.tsx`.

Chunk 04, 2026-03-06
- Goal: Chum invite flow, email-based Chum search, Mutual Chums emoji refresh, display name fallback fix, admin "Users" rename.
- Changes:
  - DB migration 023 (`newchums.chum_invites` table, token hash, status, 30-day expiry, accepted_user_id).
  - API: `GET /chums/search` extended, detects email input, performs exact email lookup (hidden/suspended users treated as not found), returns `inviteEligible`, `inviteeEmail`, `alreadyInvited`; `POST /chums/invite` creates invite record and sends Postmark template 43805532; `POST /chums/invite/accept` consumes token during signup and creates mutual Chum links + notifications for both users. Rate limit: 10 invites per inviter per 24 h.
  - API route ordering fix: `POST /chums/invite` and `POST /chums/invite/accept` moved before `POST /chums/:userId` in the Hono route table to prevent "invite" being parsed as a UUID `:userId`.
  - API display name fallback: all Chum-related endpoints now fall back to username (without `@`) before the generic "NewChums user" string, when `name` is not set.
  - Web: `ChumsClient.tsx`, email-aware search input (mail icon when email detected), invite CTA banner with "Not on NewChums yet, invite them!" label, confirmation dialog (`InviteDialog`), already-sent state, success toasts. `SignupClient.tsx`, credentials path reads `?invite=<token>` from URL and calls `POST /chums/invite/accept` after account creation (non-fatal); Google OAuth path saves token to `sessionStorage` before the OAuth redirect. `AppShell.tsx`, on every authenticated profile load, checks `sessionStorage` for `nc_pending_invite` token, clears it, and calls `POST /chums/invite/accept` to handle the Google OAuth invite path. `SettingsClient.tsx`, privacy toggle label updated to "Hide me from NewChums search and discovery" with helper text covering email lookup.
  - Mutual Chums indicators: replaced all `HandshakeRoundedIcon` usages with 🤝 emoji in `ChumsClient.tsx`, `ProfileHeaderSection.tsx`, and `ProfileChumsSection.tsx`. Tooltips and accessible labels preserved.
  - Admin sidebar tab and page header renamed from "Chums" to "Users" (`nav.ts`, `AdminChumsClient.tsx`).
- Verification: Email search returns existing users or invite CTA; duplicate invite prevention works; invite token consumed on both credentials and Google OAuth signup paths creates mutual Chums; Mutual Chums emoji shows in all three locations; display name falls back to username when name is unset; `npm run build` passes.
- Deploy: Run migration 023 against production DB before deploying.
- Next Steps: N/A

Chunk 03, 2026-03-06
- Goal: First-version in-app notification system using the existing bell icon.
- Changes:
  - DB migration 022 (`newchums.notifications` table with general schema supporting future types).
  - API: `GET /notifications` (up to 50, newest first, actor info joined); `POST /notifications/read` (specific IDs or all unread); `POST /chums/:userId` updated, uses `RETURNING id` to detect new inserts and creates a `chum_added_you` notification only for genuine new Chum adds (not duplicate conflicts).
  - Web: new `NotificationBell` component (`web/src/components/layout/NotificationBell.tsx`), fetches on mount for initial state, opens Popover on click, marks unread as read, gold (#F4B400) filled icon when unread; `AppShell.tsx` updated to use it.
- Verification: Adding someone to Chums creates notification for them; bell turns gold; opening dropdown marks as read; re-adding after removal generates new notification; duplicate adds do not duplicate notifications; `npm run build` passes.
- Deploy: Run migration 022 against production DB before deploying.
- Next Steps: N/A

---

Chunk 02, 2026-03-06
- Goal: User suspension, gender + profile theme fields, and the "Your Chums" feature.
- Changes:
  - DB migrations 017 (user suspension fields + index), 018 (`gender`), 019 (`profile_theme`), 020 (Chum privacy columns), 021 (`user_chums` table).
  - API: suspension middleware (403 on all authenticated routes for suspended users); `POST /admin/users/:id/suspend|unsuspend`; `GET /admin/users`; `gender` and `profile_theme` on `GET/PUT /profile` and `GET /public/users/:handle`; `is_hidden_chum_list` and `is_hidden_from_chum_lists` on profile endpoints; `GET /chums`, `GET /chums/search`, `GET /chums/check/:userId`, `POST /chums/:userId`, `DELETE /chums/:userId`, `GET /public/users/:handle/chums`.
  - Auth: credentials login and OAuth sign-in reject suspended users; signup rejects suspended emails.
  - Web, Admin: `/admin/chums` page (view + suspend/unsuspend users); "Chums" tab added above "Interests" in super admin sidebar.
  - Web, Profile: gender select and profile accent (theme) dropdown on edit profile page; gender displayed in public profile identity line (`38 years old • Male`).
  - Web, Public profile: "Add to Chums" / "Remove from Chums" button in header card; public Chums section (paginated, privacy-gated) below hobbies card.
  - Web, Your Chums (`/chum-groups`): full replacement of stub with search + private Chum list view.
  - Web, Settings: two new Chum privacy toggles.
  - Auth error banners: shared `AuthErrorBanner` component; suspended-account messaging on `/login` and `/signup`.
- Verification: Chum add/remove works; search excludes hidden users; public Chums section respects both privacy toggles; empty section renders nothing; suspension blocks login, OAuth, API access, and signup; `npm run build` passes.
- Deploy: Run migrations 017–021 against production DB before deploying.
- Next Steps: N/A

---

Chunk 01, 2026-03-03
- Goal: Build super admin interests moderation system from scratch.
- Changes:
  - DB migrations 015 (`role` on `users`; moderation columns + index on `interests`) and 016 (`merged_into_interest_id` on `interests`).
  - API: `requireSuperAdmin` middleware helper; `GET/PATCH/DELETE /admin/interests/:id`; `POST /admin/interests/:id/restore`; `POST /admin/interests/merge`. `GET /interests` now filters `is_deleted = false`. `PUT /profile` resolves deleted/merged interests and returns `INTEREST_DELETED` for unmerged deletions. `GET /profile` returns `role`.
  - Web: `/admin/interests` page (server + client components), 404 for non-admins. Admin table with search, sort, edit, soft-delete, restore, and merge dialogs. Super Admin sidebar section in `AppShell` (visible to `super_admin` users on all pages). `getOrCreateAppUser` and app layout updated to pass `role`.
  - Profile: backspace no longer removes hobby chips; `isOptionEqualToValue` hardened against undefined; `INTEREST_DELETED` error surfaced as toast.
- Verification: `/admin/interests` accessible only to `super_admin`; merge moves `user_interests`, sets `merged_into_interest_id`, soft-deletes source; deleted interests hidden from profile hobby picker; `npm run build` passes.
- Deploy: Run migrations 015 and 016 against production DB before deploying.
