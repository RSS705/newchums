# Development Setup Guide

Last Updated: March 7, 2026

This document is the operational guide for running and deploying NewChums.  
For architectural invariants and contracts, see `docs/Technical_Specs.md`.  
For diagrams and flows, see `docs/System_Map.md`.

---

## Current State (Short)

- **Production:** Single production environment.
- **Workers:** Web = `newchums-web-dev` (production), API = `newchums-api`.
- **Canonical host:** `https://newchums.com` (www → non-www redirect enforced before Auth.js).
- **API migration:** Signup, email verification, password reset, email change, profile (incl. DOB, bio, gender, profile theme), interests, handle availability, onboarding, avatar flows, notification preferences, admin moderation, user suspension, Chums, Chum invites, and events (plans) are in the API worker.
- **Events (plans):** Full event creation, RSVP, invite, and alternate time system. `/events/create` — "Start a plan" form. `/plans` — tabbed Upcoming/Past view with hosted/joined sections (real API data). `/events/[id]` — event detail with RSVP actions. Visibility: invite_only, chums_only, public. RSVP: going, maybe, cant_make_it. Event email templates scaffolded but require Postmark template creation.
- **Super admin:** Users with `role = 'super_admin'` can access `/admin/interests` (interests moderation) and `/admin/chums` (view + suspend/unsuspend user accounts). Role is set directly in the database; no UI promotion flow.
- **Chums:** One-way saved-people feature. `/chum-groups` page (search by name, @handle, or exact email + private list). Search auto-detects email input and offers an invite flow for non-existing emails. Add/Remove button on public profiles. Public Chums section on profiles (privacy-gated). Two new privacy toggles in Settings. Mutual Chums state shown via 🤝 emoji indicator.
- **Notifications:** In-app notification bell in top nav. Currently supports `chum_added_you`. Bell turns gold when unread notifications exist; dropdown marks them as read on open.
- **Avatar storage:** R2 bucket `newchums-media` (binding `MEDIA_BUCKET`). Client can route media operations and avatar display through `NEXT_PUBLIC_AVATAR_BASE_URL` for cross-env consistency when sharing DB.
- **Public marketing site:** Four polished public pages sharing `LandingLayout`: Homepage (redesigned with event discovery section, category filters, and product-preview hero panel), How it Works (6-step walkthrough, coordination mock panel, discovery panel), Science of Friendship (interactive research page), Safety Center (community guidance). All pages use shared design system (SectionHeader, section spacing, CTA blocks, responsive patterns). Nav links defined in `web/src/config/nav.ts` (`headerNavLinks`). Former `LandingHero.tsx` is superseded by `LandingPageContent.tsx`.
- **Build:** `cd web && npm run build` passes (Edge/OpenNext constraints apply).

---

## Local Development

### First-time or fresh clone

If you are doing UI work, restore gitignored assets per `docs/Gitignored_Assets_and_Restore.md` (env files, and `template_reference/` if available).

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
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — Cloudflare Turnstile site key for contact form (logged-out users). If unset, Turnstile widget is not shown.
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

Email / Postmark (required for email flows):
- `POSTMARK_SERVER_TOKEN` — used for all Postmark sends (verification, reset, contact form, etc.)
- `EMAIL_FROM`
- `WEB_BASE_URL`
- `POSTMARK_TEMPLATE_VERIFY`
- `POSTMARK_TEMPLATE_RESET`
- `POSTMARK_TEMPLATE_RSVP`
- `POSTMARK_TEMPLATE_EMAIL_CHANGE_CONFIRM`
- `POSTMARK_TEMPLATE_EMAIL_CHANGE_NOTIFY_OLD`
- `POSTMARK_TEMPLATE_EMAIL_CHANGE_SUCCESS`

Optional:
- `TURNSTILE_SECRET_KEY` — Cloudflare Turnstile secret key for contact form verification (logged-out users). If unset, Turnstile is skipped (useful for local dev).
- `SENTRY_DSN`
- `AXIOM_TOKEN`
- `AXIOM_DATASET`

---

## Environment Variable Locations (API vs Web)

### API Worker (`newchums-api`)

- **Deployment:** Cloudflare Worker via `wrangler deploy`
- **Secrets:** `npx wrangler secret put <NAME>` — stored in Cloudflare, not in code (e.g. `DATABASE_URL`, `NEXTAUTH_SECRET`, `POSTMARK_SERVER_TOKEN`, `TURNSTILE_SECRET_KEY`)
- **Public vars:** `api/wrangler.toml` `[vars]` (e.g. `APP_ENV`, `EMAIL_FROM`, `WEB_BASE_URL`, template IDs)
- **Local dev:** `api/.dev.vars` (gitignored; copy from `.dev.vars.example`)

### Web Worker (`newchums-web-dev`)

- **Deployment:** OpenNext → Cloudflare Worker via `wrangler deploy` from `web/`
- **NEXT_PUBLIC_* variables are baked in at build time** — they must exist when `opennextjs-cloudflare build` runs. They are **not** read from `wrangler.toml` (that only affects Worker runtime; the client bundle is pre-built).
- **Production build-time vars:**
  - `web/.env.production` — committed; used when `next build` runs. Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` here for production.
  - Or: the deploy script (`npm run deploy`) prefixes the build with `NEXT_PUBLIC_API_BASE_URL=...` — any vars you set in the environment before running `npm run deploy` are passed to the build.
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

- `POST /contact` sends email to `contact@newchums.com` from `contact@newchums.com` via Postmark (uses `POSTMARK_SERVER_TOKEN`).
- **Turnstile setup (production):**
  1. Create a Turnstile widget at [Cloudflare Dashboard → Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile).
  2. **Add your domain:** In the widget settings, add `newchums.com` (and `www.newchums.com` if used) to the widget’s allowed domains. Otherwise the widget will not render.
  3. **Web:** Add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to `web/.env.production` (see § Environment Variable Locations).
  4. **API:** Run `npx wrangler secret put TURNSTILE_SECRET_KEY` and paste the secret key.
  4. Logged-out users must complete the Turnstile challenge before submit. Logged-in users skip it.
- **Testing:** Use Cloudflare’s [test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) (always pass) for local dev.
- For production rate limiting (5 per 10 min per IP): run `npx wrangler kv namespace create CONTACT_RATELIMIT`, then add the `[[kv_namespaces]]` block to `api/wrangler.toml` (see commented example in file).

**Troubleshooting: "For testing only" on production**

If the Turnstile widget shows "For testing only" on newchums.com/contact, you are using **test keys** instead of production keys. [Test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) always pass validation but display that warning.

**Common cause:** Next.js loads `.env.local` and it **overrides** `.env.production` during build. If `web/.env.local` contains `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA` (for local testing), that test key gets baked into the production bundle.

**Fix:**
1. Ensure `web/.env.production` has the production site key: `NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAA...`
2. **Remove or comment out** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` from `web/.env.local` if it holds a test key. The deploy script now explicitly passes the key from `.env.production`, overriding `.env.local`, so this is optional—but cleaning `.env.local` avoids confusion.
3. Deploy: `cd web && npm run deploy`. The deploy script sources `NEXT_PUBLIC_TURNSTILE_SITE_KEY` from `.env.production` and passes it to the build, so the production key is always used.
4. **API:** Run `cd api && npx wrangler secret put TURNSTILE_SECRET_KEY` and paste the production secret key (you only need to do this once).

### Public profile

- Route: `/u/[handle]` (e.g. `/u/yourhandle`). Works for both logged-in (app shell) and logged-out (landing layout) visitors.
- API: `GET /public/users/:handle` (no auth). Returns `{ user: { displayName, handle, age, bio, hobbies, avatarUrl } }`. DOB never exposed; age computed server-side.
- Profile page has “View public profile” button when username is set. Links to `/u/{handle}`.

### Password reset

End-to-end:
forgot-password → Postmark reset email → reset-password page → confirm → login

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

Migrations live in `web/sql/`.

```bash
cd web
psql "$DATABASE_URL" -f sql/001_create_users.sql
psql "$DATABASE_URL" -f sql/002_password_reset_tokens.sql
psql "$DATABASE_URL" -f sql/003_add_username_to_users.sql
psql "$DATABASE_URL" -f sql/004_add_username_norm.sql
psql "$DATABASE_URL" -f sql/005_add_date_of_birth.sql
psql "$DATABASE_URL" -f sql/006_add_email_verified_at.sql
psql "$DATABASE_URL" -f sql/007_email_verification_tokens.sql
psql "$DATABASE_URL" -f sql/008_interests_seed.sql
psql "$DATABASE_URL" -f sql/009_add_bio_to_user_profile.sql
psql "$DATABASE_URL" -f sql/010_add_avatar_to_users.sql
psql "$DATABASE_URL" -f sql/011_email_change_requests.sql
psql "$DATABASE_URL" -f sql/012_add_notification_prefs.sql
psql "$DATABASE_URL" -f sql/013_add_privacy_columns.sql
psql "$DATABASE_URL" -f sql/014_add_is_hidden_age.sql
psql "$DATABASE_URL" -f sql/015_interests_moderation.sql
psql "$DATABASE_URL" -f sql/016_interests_merged_into.sql
psql "$DATABASE_URL" -f sql/017_add_user_suspension.sql
psql "$DATABASE_URL" -f sql/018_add_gender.sql
psql "$DATABASE_URL" -f sql/019_add_profile_theme.sql
psql "$DATABASE_URL" -f sql/020_add_chum_privacy_columns.sql
psql "$DATABASE_URL" -f sql/021_create_user_chums.sql
psql "$DATABASE_URL" -f sql/022_create_notifications.sql
psql "$DATABASE_URL" -f sql/023_create_chum_invites.sql
```

Notes:
- Migration `008_interests_seed.sql` requires the interests tables to exist and seeds the base list.
- Migration `015_interests_moderation.sql` adds `role` to `users` and moderation columns (`is_deleted`, audit fields) to `interests`.
- Migration `016_interests_merged_into.sql` adds `merged_into_interest_id` to `interests` for tracking merge targets.
- Migration `017_add_user_suspension.sql` adds suspension columns and a partial index on `is_suspended = true`.
- Migration `018_add_gender.sql` adds `gender TEXT NULL` to `users`.
- Migration `019_add_profile_theme.sql` adds `profile_theme TEXT NULL` to `users`.
- Migration `020_add_chum_privacy_columns.sql` adds `is_hidden_chum_list` and `is_hidden_from_chum_lists` (both boolean, default false) to `users`.
- Migration `021_create_user_chums.sql` creates the `newchums.user_chums` table for one-way Chum relationships.
- Migration `022_create_notifications.sql` creates the `newchums.notifications` table for in-app notifications.
- Migration `023_create_chum_invites.sql` creates the `newchums.chum_invites` table for Chum invite links (token hash, status, 30-day expiry).

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
npx wrangler secret put POSTMARK_SERVER_TOKEN
npm run deploy
```

---

## Troubleshooting

| Issue | Fix |
|------|-----|
| Google OAuth “Invalid code verifier” | Ensure canonical host redirect is active and `AUTH_URL/NEXTAUTH_URL` are `https://newchums.com` |
| API says `DATABASE_URL is not set` | Ensure `api/.dev.vars` has non-empty `DATABASE_URL`; restart API; verify via `/health/env` |
| Authenticated API calls fail (401) | Ensure API `NEXTAUTH_SECRET` matches web `AUTH_SECRET` |
| Prod bundle calls localhost | Deploy using `npm run deploy` (not raw `next build`); hard refresh / clear cache |
| Password reset links wrong host | Ensure API `WEB_BASE_URL` is correct (`https://newchums.com` in prod) |
| Avatar mismatch local vs prod | Set `NEXT_PUBLIC_AVATAR_BASE_URL` to prod API URL when sharing DB so all avatar ops go through R2-backed origin |

---

## Chunk Template

At end of each development session, append a Chunk:

```
Chunk XX — YYYY-MM-DD
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

Chunk 06 — 2026-03-07
- Goal: First full iteration of the event/plan creation system, Your Plans view, event detail page, RSVP/invite/alternate-time system, and notification/email scaffolding.
- Changes:
  - DB migration 024 (`newchums.events`, `newchums.event_invites`, `newchums.event_rsvps`, `newchums.event_alt_times`). Events support visibility (invite_only / chums_only / public), status (draft / published / canceled), location (in_person / online), seats, hobby association, and alternate time toggle.
  - API: `POST /events` (create with inline invites + notifications + emails), `GET /events/mine` (upcoming/past with host/RSVP context), `GET /events/:id` (detail with visibility enforcement), `POST /events/:id/rsvp` (going/maybe/cant_make_it with capacity check), `POST /events/:id/alt-time` (alternate time suggestion), `POST /events/:id/cancel` (host only, notifies attendees), `POST /events/:id/invite` (add invitees post-creation).
  - Event email scaffolding: 5 Postmark template helpers (`sendEventInviteEmail`, `sendEventUpdatedEmail`, `sendEventCanceledEmail`, `sendEventReminderEmail`, `sendEventRsvpUpdateEmail`) — all noop-safe when template IDs are not configured. Template env vars added to `Bindings` and placeholder entries in `wrangler.toml`.
  - In-app notifications created for: `event_invite`, `event_rsvp`, `event_alt_time`, `event_canceled`.
  - Web — `/events/create` (`CreateEventClient.tsx`): Full "Start a plan" form with fields for title, description, hobby (Autocomplete from `/interests`), seats, date/time, location type toggle (in-person name/address vs online link), visibility radio group with helper text, invite-people search (reuses `/chums/search`), email invite support, invitee chips, publish CTA.
  - Web — `/plans` (`PlansPage.tsx`): Replaced placeholder with real API-driven page. Tabs for Upcoming/Past. Sections for "Plans you're hosting" and "Plans you've joined or been invited to". Empty states with "Start a plan" CTA. Integrated with `GET /events/mine`.
  - Web — `/events/[id]` (`EventDetailClient.tsx`): New event detail page with RSVP actions (Going / Maybe / Can't make it), "Suggest another time" form, attendee response list, host cancel action, back navigation.
  - `EventCard.tsx` rebuilt from scratch for real `PlanEvent` data — hobby chip, visibility label, host indicator, RSVP status, formatted date/time, going count, CardActionArea linking to event detail.
  - `DashboardHome.tsx` updated to remove old `EventCardData` usage (removed placeholder past events section that used old type).
  - `AppShell.tsx`: "Create Event" button label updated to "Start a plan".
- Verification: TypeScript passes (`npx tsc --noEmit`) in both web and api. No linter errors. Event creation form validates and submits. Plans page tabs work. Event detail shows RSVP actions and attendee list.
- Deploy: Run migration 024 against production DB before deploying. Create Postmark email templates and add IDs to `wrangler.toml` (see `api/src/email/send.ts` for template model specs).
- Next Steps: Create Postmark templates for event emails. Build public event discovery/browse page. Add event update (edit) endpoint. Wire real event data into homepage and How it Works mock panels. Implement event reminder scheduling.

---

Chunk 05 — 2026-03-07
- Goal: Build and polish all public marketing pages — Safety Center, redesigned homepage, and How it Works.
- Changes:
  - Safety Center (`/safety-center`): Created `SafetyCenterContent.tsx`. Seven sections: hero with eyebrow/H1/gold bar/CTAs/image placeholder, five-habits confidence checklist (icon cards), practical gathering tips (numbered 2-column grid), respect and comfort cards (2×2 top-border accent cards), "if something feels off" empowerment section with gold-border callout, reporting/contact section, CTA block.
  - Homepage redesign (`/`): Replaced `LandingHero` with `LandingPageContent.tsx`. New structure: hero (preserved headline + subtext, updated buttons to "Sign up" primary + "How it works" anchor secondary, desktop-only mini product-preview panel showing 3 event rows), event discovery section (6 mock event cards with interactive category filter chips, hover lift, empty state), "making plans easier" 3-column feature blocks, "why this works" top-border benefit cards with Science of Friendship bridge link, dark CTA section. Updated page metadata title and description.
  - How it Works (`/how-it-works`): Created route and both `page.tsx` + `HowItWorksContent.tsx` from scratch (was a 404 — nav config referenced it but no route existed). Seven sections: hero with "See the steps" anchor CTA, 6-step product walkthrough (numbered gold badges with alternating icon backgrounds), "made for real plans" section with pain-point divider list and mock coordination panel (RSVP statuses, alternate time suggestion), friends + new connections 2-card section, discovery mock panel with 3 nearby event previews, trust/comfort icon-row cards with links to Science of Friendship and Safety Center, dark CTA section.
  - All pages share consistent design system: `SECTION_SPACING`, `CONTENT_MAX_WIDTH`, `SectionHeader` with `emphasis="primary" accentColor="secondary"`, full-bleed alternating backgrounds, gold accent bars, responsive collapse (centered mobile, left-aligned desktop), CTA section pattern (primary.dark bg, gold top stripe, numbered steps, secondary contained button).
  - Updated `page.tsx` to import `LandingPageContent` instead of `LandingHero`. `LandingHero.tsx` is now unused (preserved for reference; safe to delete).
  - Mock event data in homepage and How it Works is structured with typed arrays (`EventCard`, `MOCK_EVENTS`, `DISCOVERY_PREVIEWS`) for easy future replacement with real API data.
  - Updated `docs/Technical_Specs.md` v6.0: new §9 "Public Marketing Site" documenting shared structure, nav links, implemented pages, design system patterns, and future-ready elements. Renumbered §10–§15.
  - Updated `docs/Development_Setup_Guide.md`: Current State expanded to cover public marketing site.
- Verification: All four public pages render correctly with consistent nav/footer; category filter chips work on homepage; anchor links scroll to correct sections; pages are fully responsive; no linter errors.
- Deploy: No DB migrations. Standard web deploy: `cd web && npm run deploy`.
- Next Steps: Connect homepage/How it Works mock event data to real API when event system is ready. Add real hero images to replace gradient placeholders. Delete unused `LandingHero.tsx`.

Chunk 04 — 2026-03-06
- Goal: Chum invite flow, email-based Chum search, Mutual Chums emoji refresh, display name fallback fix, admin "Users" rename.
- Changes:
  - DB migration 023 (`newchums.chum_invites` table — token hash, status, 30-day expiry, accepted_user_id).
  - API: `GET /chums/search` extended — detects email input, performs exact email lookup (hidden/suspended users treated as not found), returns `inviteEligible`, `inviteeEmail`, `alreadyInvited`; `POST /chums/invite` creates invite record and sends Postmark template 43805532; `POST /chums/invite/accept` consumes token during signup and creates mutual Chum links + notifications for both users. Rate limit: 10 invites per inviter per 24 h.
  - API route ordering fix: `POST /chums/invite` and `POST /chums/invite/accept` moved before `POST /chums/:userId` in the Hono route table to prevent "invite" being parsed as a UUID `:userId`.
  - API display name fallback: all Chum-related endpoints now fall back to username (without `@`) before the generic "NewChums user" string, when `name` is not set.
  - Web: `ChumsClient.tsx` — email-aware search input (mail icon when email detected), invite CTA banner with "Not on NewChums yet — invite them!" label, confirmation dialog (`InviteDialog`), already-sent state, warm success toasts. `SignupClient.tsx` — credentials path reads `?invite=<token>` from URL and calls `POST /chums/invite/accept` after account creation (non-fatal); Google OAuth path saves token to `sessionStorage` before the OAuth redirect. `AppShell.tsx` — on every authenticated profile load, checks `sessionStorage` for `nc_pending_invite` token, clears it, and calls `POST /chums/invite/accept` to handle the Google OAuth invite path. `SettingsClient.tsx` — privacy toggle label updated to "Hide me from NewChums search and discovery" with helper text covering email lookup.
  - Mutual Chums indicators: replaced all `HandshakeRoundedIcon` usages with 🤝 emoji in `ChumsClient.tsx`, `ProfileHeaderSection.tsx`, and `ProfileChumsSection.tsx`. Tooltips and accessible labels preserved.
  - Admin sidebar tab and page header renamed from "Chums" to "Users" (`nav.ts`, `AdminChumsClient.tsx`).
- Verification: Email search returns existing users or invite CTA; duplicate invite prevention works; invite token consumed on both credentials and Google OAuth signup paths creates mutual Chums; Mutual Chums emoji shows in all three locations; display name falls back to username when name is unset; `npm run build` passes.
- Deploy: Run migration 023 against production DB before deploying.
- Next Steps: —

Chunk 03 — 2026-03-06
- Goal: First-version in-app notification system using the existing bell icon.
- Changes:
  - DB migration 022 (`newchums.notifications` table with general schema supporting future types).
  - API: `GET /notifications` (up to 50, newest first, actor info joined); `POST /notifications/read` (specific IDs or all unread); `POST /chums/:userId` updated — uses `RETURNING id` to detect new inserts and creates a `chum_added_you` notification only for genuine new Chum adds (not duplicate conflicts).
  - Web: new `NotificationBell` component (`web/src/components/layout/NotificationBell.tsx`) — fetches on mount for initial state, opens Popover on click, marks unread as read, gold (#F4B400) filled icon when unread; `AppShell.tsx` updated to use it.
- Verification: Adding someone to Chums creates notification for them; bell turns gold; opening dropdown marks as read; re-adding after removal generates new notification; duplicate adds do not duplicate notifications; `npm run build` passes.
- Deploy: Run migration 022 against production DB before deploying.
- Next Steps: —

---

Chunk 02 — 2026-03-06
- Goal: User suspension, gender + profile theme fields, and the "Your Chums" MVP.
- Changes:
  - DB migrations 017 (user suspension fields + index), 018 (`gender`), 019 (`profile_theme`), 020 (Chum privacy columns), 021 (`user_chums` table).
  - API: suspension middleware (403 on all authenticated routes for suspended users); `POST /admin/users/:id/suspend|unsuspend`; `GET /admin/users`; `gender` and `profile_theme` on `GET/PUT /profile` and `GET /public/users/:handle`; `is_hidden_chum_list` and `is_hidden_from_chum_lists` on profile endpoints; `GET /chums`, `GET /chums/search`, `GET /chums/check/:userId`, `POST /chums/:userId`, `DELETE /chums/:userId`, `GET /public/users/:handle/chums`.
  - Auth: credentials login and OAuth sign-in reject suspended users; signup rejects suspended emails.
  - Web — Admin: `/admin/chums` page (view + suspend/unsuspend users); "Chums" tab added above "Interests" in super admin sidebar.
  - Web — Profile: gender select and profile accent (theme) dropdown on edit profile page; gender displayed in public profile identity line (`38 years old • Male`).
  - Web — Public profile: "Add to Chums" / "Remove from Chums" button in header card; public Chums section (paginated, privacy-gated) below hobbies card.
  - Web — Your Chums (`/chum-groups`): full replacement of stub with search + private Chum list view.
  - Web — Settings: two new Chum privacy toggles.
  - Auth error banners: shared `AuthErrorBanner` component; suspended-account messaging on `/login` and `/signup`.
- Verification: Chum add/remove works; search excludes hidden users; public Chums section respects both privacy toggles; empty section renders nothing; suspension blocks login, OAuth, API access, and signup; `npm run build` passes.
- Deploy: Run migrations 017–021 against production DB before deploying.
- Next Steps: —

---

Chunk 01 — 2026-03-03
- Goal: Build super admin interests moderation system from scratch.
- Changes:
  - DB migrations 015 (`role` on `users`; moderation columns + index on `interests`) and 016 (`merged_into_interest_id` on `interests`).
  - API: `requireSuperAdmin` middleware helper; `GET/PATCH/DELETE /admin/interests/:id`; `POST /admin/interests/:id/restore`; `POST /admin/interests/merge`. `GET /interests` now filters `is_deleted = false`. `PUT /profile` resolves deleted/merged interests and returns `INTEREST_DELETED` for unmerged deletions. `GET /profile` returns `role`.
  - Web: `/admin/interests` page (server + client components) — 404 for non-admins. Admin table with search, sort, edit, soft-delete, restore, and merge dialogs. Super Admin sidebar section in `AppShell` (visible to `super_admin` users on all pages). `getOrCreateAppUser` and app layout updated to pass `role`.
  - Profile: backspace no longer removes hobby chips; `isOptionEqualToValue` hardened against undefined; `INTEREST_DELETED` error surfaced as toast.
- Verification: `/admin/interests` accessible only to `super_admin`; merge moves `user_interests`, sets `merged_into_interest_id`, soft-deletes source; deleted interests hidden from profile hobby picker; `npm run build` passes.
- Deploy: Run migrations 015 and 016 against production DB before deploying.
