# Technical Specifications

Last Updated: March 7, 2026
Version: 8.0

This document defines the authoritative technical architecture of NewChums.
It describes **what exists today** and the structural commitments we are making.

---

## 1) Product Context

NewChums helps people organize gatherings more easily around hobbies and shared interests.

**Current positioning:**
- Primary: practical social coordination — making it easier to plan, coordinate, and follow through on real-world gatherings.
- Secondary: reducing group chat chaos and turning "we should do something sometime" into actual plans.
- Contextual: meeting new people naturally through shared interests and proximity.
- Broader mission: reducing loneliness by making real-world social connection more approachable.

**Terminology:** The system uses "event" internally (database, API routes, code) but user-facing surfaces prefer "plan" or "gathering." See `AGENTS.md` for full terminology guidance.

---

## 2) Current Technology Stack

### Application Layer

| Layer | Technology | Notes |
|------|------------|------|
| Web | Next.js (App Router) | Deployed via OpenNext to Cloudflare Workers |
| API | Hono | Runs in a separate Cloudflare Worker |
| Database | Neon PostgreSQL | PostGIS available |
| Auth | Auth.js (JWT sessions) | Google OAuth + Credentials |
| Email | Postmark | Transactional |
| Analytics | Plausible | Production |
| Error tracking | Sentry | Web + API |
| Logging | Axiom | API |
| Hosting | Cloudflare Workers | Two-worker model |

### Development Tools

| Tool | Purpose |
|------|---------|
| VS Code / Cursor | Primary editor |
| Wrangler CLI | Workers dev + deployment |
| GitHub | Version control |
| TypeScript | Type safety |
| ESLint | Code quality |

---

## 3) Deployment Model (Production Reality)

### Implemented

- **Single production environment** (intentionally; no separate dev Worker environment yet).
- **Web Worker:** `newchums-web-dev` (production; suffix mismatch acknowledged but stable).
- **API Worker:** `newchums-api`.
- **Custom domains:** `newchums.com`, `www.newchums.com` (defined in `web/wrangler.toml`).
- **Canonical host:** `https://newchums.com` (www → non-www redirect enforced before Auth.js).
- **Deploy safeguards:** `workers_dev = false`, `preview_urls = false`, and custom domain routes are code-defined to prevent deploy drift.

### Not implemented

- Dedicated dev Worker environment(s).
- Cron triggers and Queues.

---

## 4) Architectural Invariants

1. Two-worker model is a long-term strategy.
2. Business logic belongs in the API Worker.
3. The Web Worker handles rendering and auth orchestration.
4. Avoid introducing new API logic in Next.js route handlers.
5. Observability (Sentry/Axiom/Plausible) remains enabled.
6. Structural UI changes occur at theme/layout level, not per-page styling patches.
7. Canonical host is non-www; www redirects before Auth.js.

---

## 5) User Roles

### Implemented

The `users` table has a `role TEXT NULL` column (migration 015). The only supported value is `super_admin`. All other users have `role = NULL`.

| Role | Access |
|------|--------|
| `NULL` (default) | Standard user |
| `super_admin` | Admin API endpoints (`/admin/*`); Super Admin nav section in the web app sidebar |

**Role assignment:** Set directly in the database (`UPDATE newchums.users SET role = 'super_admin' WHERE id = '...'`). There is no self-service or UI-based promotion flow.

**Role propagation:** `GET /profile` returns `role`; `getOrCreateAppUser` in `web/src/lib/user.ts` reads it at layout time; `AppShell` conditionally renders the Super Admin sidebar section.

**Admin web pages:** `/admin/interests` (interests moderation) and `/admin/chums` (user account management + suspension) — server components check `role = 'super_admin'` and return 404 for non-admins.

---

## 6) Canonical Host and Middleware

### Problem solved

Google OAuth PKCE stores `code_verifier` in a cookie tied to origin.
If sign-in starts on `www.newchums.com` and callback lands on `newchums.com`, the cookie is not sent → "Invalid code verifier."

### Implementation

Middleware at `web/src/middleware.ts` runs before Auth.js.
Any request to a host starting with `www.` is 301-redirected to the same path + query on the non-www host.

- Matcher includes `/api/auth/*` so OAuth flows always land on canonical host.
- Exclusions: static assets (`/_next/static`, `/_next/image`, `favicon.ico`, `robots.txt`, `sitemap.xml`).

---

## 7) Web ↔ API Auth Model (Bearer Token)

### Web session

Auth.js uses JWT sessions (no DB adapter).

### API authentication

For authenticated API routes, the web client:
1. Calls `GET /api/auth/api-token` (same-origin; cookies sent).
2. The route calls `auth()` to obtain the session, then mints a **15-minute JWT** using `jose` (HS256).
3. The client sends `Authorization: Bearer <token>` to the API worker.

The API verifies:
- The short-lived jose JWT (API token), or
- The Auth.js session JWT (where applicable).

**Secret alignment requirement:** API `NEXTAUTH_SECRET` must match web `AUTH_SECRET`.

---

## 8) API Worker Responsibilities and Endpoints

The following business logic lives in the API worker; the web app calls it via `NEXT_PUBLIC_API_BASE_URL`:

### Auth and account flows

- `POST /auth/signup`
- `POST /auth/password-reset/request`
- `POST /auth/password-reset/confirm`
- `POST /auth/email-verify/request`
- `POST /auth/email-verify/confirm`
- `GET /auth/email-verify/status`
- `POST /account/email-change/request`
- `POST /account/email-change/confirm`
- `POST /account/password-change` (auth required; credentials users only)
- `DELETE /account` (auth required) — hard delete account and all related data; credentials users must send `{ password }` in body
- `GET /notification-preferences` (auth required) — returns persisted notification prefs
- `PUT /notification-preferences` (auth required) — saves notification prefs (JSONB on user_profile)

### Notification preferences (Settings toggles)

Users manage notification preferences in **Settings** (`/settings`). Each toggle controls whether and how often they receive emails for a given event type. Stored in `user_profile.notification_prefs` (JSONB). Single source of truth: `api/src/lib/notificationPrefs.ts`.

**Notification types (keys):**

| Key | UI title | Frequency |
|-----|----------|-----------|
| `event_match` | New plans matching my interests | Immediate / daily / every 3 days / weekly / monthly / never |
| `host_join` | Someone joins your plan | Immediate / daily / every 3 days / weekly / never |
| `host_leave` | Someone leaves your plan | Immediate / daily / every 3 days / weekly / never |
| `feedback_requests` | Post-gathering feedback | On/off only |
| `event_reminders` | 24-hour reminders | On/off only |
| `event_changed_canceled` | Plan canceled or changed | Immediate / daily / every 3 days / weekly / never |
| `product_announcements` | Product updates | Immediate / monthly / never |

Defaults are applied at account creation (credentials signup, OAuth) and backfilled for existing users with missing keys. GET normalizes stored prefs and optionally persists backfilled values.

### Account deletion

- **Endpoint:** `DELETE /account` (auth required).
- **Credentials users:** Must send `{ password: string }` in body; password is verified before deletion.
- **OAuth users:** Empty body; no password required.
- **UI:** Settings → Danger zone → Delete account. Confirmation dialog; on success, user is signed out and redirected to `/`.
- **Deletion scope (current):** Hard delete in a single transaction: `user_interests`, `user_profile`, `newchums.users`. Cascades handle `password_reset_tokens`, `email_verification_tokens`, `email_change_requests`.
- **Maintenance note:** As the schema evolves (e.g. events, event_rsvps, chum groups), the delete logic in `api/src/index.ts` must be updated to remove or reassign related rows. Check `DELETE /account` when adding new user-scoped tables.

### Privacy preferences (Settings toggles)

Users manage privacy preferences in **Settings** (`/settings`). Stored in the `users` table. Loaded via `GET /profile`, persisted via `PUT /profile`. All default to `false` (OFF) for new and existing users.

**Privacy toggles (current):**

| Column | UI label | Enforcement |
|--------|----------|-------------|
| `is_hidden_from_search` | Hide me from NewChums search and discovery | Enforced in `GET /chums/search` — users with this ON are excluded from both name/handle search AND exact email lookup in the Chum flow. Also blocks invite eligibility for their email (treated as "not found"). |
| `is_hidden_from_external_indexing` | Hide my profile from search engines | Public profile page emits `robots: noindex, nofollow`. |
| `is_hidden_age` | Hide my age | Age field is not shown on the public profile. |
| `is_hidden_chum_list` | Hide my Chums from my public profile | When ON, the Chums section is not rendered on the user's public profile. Private Chum lists are unaffected. |
| `is_hidden_from_chum_lists` | Hide me from appearing on other people's profile Chum lists | When ON, the user is excluded from `GET /public/users/:handle/chums` responses. They still appear on private Chum lists of users who have already added them. |

**Implementation notes:** UI: `web/src/app/(app)/settings/PrivacyToggleRow.tsx`, `SettingsClient.tsx`. API: `GET /profile` and `PUT /profile` in `api/src/index.ts`. Schema: migrations 013 (`is_hidden_from_search`, `is_hidden_from_external_indexing`), 014 (`is_hidden_age`), 020 (`is_hidden_chum_list`, `is_hidden_from_chum_lists`).

### Profile, onboarding, and lookups

- `GET /profile`, `PUT /profile` (auth required). Response includes `role`, `gender`, `profile_theme`, `is_hidden_chum_list`, `is_hidden_from_chum_lists`. `PUT /profile` validates `gender` (allowed: `male`, `female`, `other`, `prefer_not_to_say`) and `profile_theme` (allowed values defined in `web/src/lib/profileTheme.ts`).
- `GET /public/users/:handle` (public; no auth) — returns public profile by handle. Includes `gender` (suppressed if `prefer_not_to_say` or null), `profile_theme`, `is_hidden_chum_list`. Age computed from DOB server-side; DOB never exposed.
- `GET /handles/available?handle=...` (auth required)
- `POST /user/username` (auth required)
- `POST /user/date-of-birth` (auth required)
- `GET /interests` — user-facing list; excludes soft-deleted interests (`WHERE is_deleted = false`).

`PUT /profile` interest resolution:
- If an interest name matches an active interest → use it.
- If it matches a soft-deleted interest that was merged → silently remap to the canonical (target) interest.
- If it matches a soft-deleted interest that was **not** merged → return `400 { code: "INTEREST_DELETED" }`. Web app surfaces a user-facing error message.

### Contact form

- `POST /contact` (public, no auth required)
  - JSON: `{ name: string, email: string, subject: string, message: string, website?: string, turnstileToken?: string }`
  - `subject`: required, must be one of (Account issue, Safety concern, Feature request / suggestion, Bug report, Partnership / business inquiry, Other)
  - Validation: name 1–80 chars, email valid format, message 10–2000 chars
  - Honeypot: `website` field; if non-empty, returns `{ ok: true }` without sending
  - Rate limit: 5 submissions per 10 minutes per IP (KV `CONTACT_RATELIMIT_KV`, optional)
  - **Spam protection (logged-out):** Cloudflare Turnstile required when `TURNSTILE_SECRET_KEY` is set. Logged-in users (Bearer token) skip Turnstile.
  - Email: Postmark sends to `contact@newchums.com` from `contact@newchums.com`, Reply-To from form; subject line "NewChums: Contact — &lt;Subject&gt;"; includes Subject, Name, Email, Message, Timestamp, IP, Environment; if logged in, includes userId and username

### Admin — interests moderation (super_admin only)

All `/admin/*` routes require `role = 'super_admin'` on the requesting user, enforced server-side by a `requireSuperAdmin` helper in `api/src/index.ts`. Non-admins receive 403.

- `GET /admin/interests` — list all interests (including deleted). Query params: `q` (search name/slug), `sort=name|created_at`, `dir=asc|desc`. Returns: `id`, `name`, `slug`, `category`, `created_at`, `is_deleted`, `created_by_user_id`, `username` (joined from `users`).
- `PATCH /admin/interests/:id` — update `name` and/or `category`. Records `updated_at` and `updated_by_user_id`.
- `DELETE /admin/interests/:id` — soft-delete: sets `is_deleted = true`, `deleted_at`, `deleted_by_user_id`. Also hard-deletes all `user_interests` rows for that interest (users are disconnected).
- `POST /admin/interests/:id/restore` — restore a soft-deleted interest: clears `is_deleted`, `deleted_at`, `deleted_by_user_id`.
- `POST /admin/interests/merge` — body: `{ sourceInterestId, targetInterestId }`. Moves all `user_interests` from source → target (deduplicating to avoid unique constraint violations), sets `source.merged_into_interest_id = target.id`, then soft-deletes source. Target must be active.

### Admin — user accounts (super_admin only)

- `GET /admin/users` — list all user accounts. Query params: `q` (search email/handle/name/userId). Returns: `id`, `created_at`, `email`, `username`, `name`, `role`, `is_suspended`, `suspended_at`.
- `POST /admin/users/:id/suspend` — suspend a user. Stores `suspended_at`, `suspended_by_user_id`. Cannot self-suspend.
- `POST /admin/users/:id/unsuspend` — clear suspension fields.

**Web page:** `/admin/chums` — table with search, sort, status chips, suspend/unsuspend actions with confirmation dialogs. Sidebar tab and page header label: **"Users"**.

**Suspension enforcement:** credentials login rejected with `AccountSuspended`; OAuth sign-in redirected to `/login?error=AccountSuspended`; all authenticated API requests from suspended users return `403 USER_SUSPENDED`; signup with a suspended email returns `409 EMAIL_SUSPENDED`.

### Chums

One-way saved-people feature. No approval flow, no mutual-state requirement.

**API endpoints (auth required):**

| Route | Description |
|-------|-------------|
| `GET /chums` | Returns the authenticated user's full private Chum list (all added users, regardless of their privacy settings). Ordered by most recently added. |
| `GET /chums/search?q=` | Search for users to add. If `q` is a valid email, performs exact email lookup (returns single result or invite eligibility); otherwise searches by name/handle. Excludes self and hidden-from-search users in both modes. Min 2 chars. Returns up to 10 results with `isChummed`, and for email mode also `inviteEligible`, `inviteeEmail`, `alreadyInvited`. |
| `GET /chums/check/:userId` | Returns `{ isChummed, isMutual, sharedCount }` for a specific user. Used by the public profile page. |
| `POST /chums/:userId` | Add a user to Chum list. Idempotent (`ON CONFLICT DO NOTHING`). Cannot chum self. Creates `chum_added_you` notification for the recipient. |
| `DELETE /chums/:userId` | Remove a user from Chum list. |
| `POST /chums/invite` | Send a Chum invite email to an address not yet on NewChums. Prevents duplicate pending invites. Rate limit: 10 per inviter per 24 h. Uses Postmark template `43805532`. |
| `POST /chums/invite/accept` | Consume an invite token during signup. Called with `{ token, email }`. Verifies invite, creates mutual Chum links in both directions, creates `chum_added_you` notifications for both users. |
| `GET /public/users/:handle/chums` | Public-facing paginated Chum list for a profile. No auth required. Respects: owner's `is_hidden_chum_list` (if ON, returns `{ hidden: true }`) and each listed Chum's `is_hidden_from_chum_lists` (filters them out). Query params: `offset`, `limit` (max 20, default 8). |

**Privacy rules:**
- `is_hidden_from_search = true` → user excluded from `GET /chums/search` results AND from exact email lookup (treated as "not found"). Invite eligibility is also blocked for their email.
- Users already on a private Chum list remain there even if they later enable `is_hidden_from_search`.
- `is_hidden_chum_list = true` → Chums section hidden on that user's public profile (enforced in both the API response and the web component).
- `is_hidden_from_chum_lists = true` → user excluded from all `GET /public/users/:handle/chums` responses, but remains on private Chum lists.

**Invite flow details:**
- `POST /chums/invite` and `POST /chums/invite/accept` must be registered **before** `POST /chums/:userId` in the Hono route table. Hono matches routes in registration order; registering them after the parameterised route causes "invite" to be interpreted as a `:userId`, resulting in a UUID parse error.
- Invite token is a 32-byte URL-safe base64 string (same generator as password reset tokens). Only the SHA-256 hash is stored in the database; the plaintext token appears only in the invite URL.
- Invite expiry: 30 days from creation. Expired invites are ignored by `POST /chums/invite/accept`.
- Anti-spam: one valid pending invite per `(inviter_user_id, invitee_email)` pair; rate limit 10 invites per inviter per 24 hours.

**Invite acceptance — both signup paths:**

| Path | Mechanism |
|------|-----------|
| Credentials signup | `SignupClient.tsx` reads `?invite=<token>` from URL and calls `POST /chums/invite/accept` immediately after successful account creation (non-fatal). |
| Google OAuth signup | `SignupClient.tsx` saves the token to `sessionStorage` (`nc_pending_invite`) before triggering the OAuth redirect. `AppShell.tsx` reads and clears the token after the authenticated profile loads, then calls `POST /chums/invite/accept`. The token is removed from `sessionStorage` before the request fires to prevent double-execution. |

**Display name fallback:** All Chum-related API responses use `displayName: name?.trim() || username (without @) || "NewChums user"`. Users without a set display name show their username instead of the generic fallback.

**Web:**
- `/chum-groups` — "Your Chums" page. Single search input auto-detects email input (mail icon shown); name/handle search otherwise. For email lookups with no eligible account found, an invite CTA is shown inline. Confirmation dialog before sending invite; friendly "already sent" state for duplicate attempts. Private Chum list below with Remove action. Mutual Chums shown with 🤝 emoji.
- `/u/[handle]` — "Add to Chums" / "Remove from Chums" button in the profile header card (top-right). Shown for logged-in viewers who are not the profile owner. Chum status fetched via `GET /chums/check/:userId` after profile loads.
- Public Chums section renders below the hobbies card when the profile owner's `is_hidden_chum_list = false` and they have at least one public-visible Chum. Paginated (8 per page, prev/next). Section is entirely absent (no empty card) when the list is empty.

### In-app notifications

General notifications table (`newchums.notifications`, migration 022) designed for future extensibility.

**Schema:** `id`, `user_id` (recipient), `type`, `actor_user_id` (nullable), `entity_id` (nullable, for future entity links), `metadata` (JSONB, nullable), `read_at` (null = unread), `created_at`. Indexed on `(user_id, created_at DESC)` and a partial index for unread rows.

**Supported types:**

| Type | Trigger | Recipient |
|------|---------|-----------|
| `chum_added_you` | `POST /chums/:userId` — only when a new Chum is created (not a duplicate `ON CONFLICT`). Re-adding after removal generates a fresh notification. | The user who was added |
| `event_invite` | User invited to an event (at creation or via `POST /events/:id/invite`) | Invited user |
| `event_rsvp` | Someone RSVPs to an event | Event host |
| `event_alt_time` | Someone suggests an alternate time | Event host |
| `event_canceled` | Event is canceled | All attendees |

**API endpoints (auth required):**

| Route | Description |
|-------|-------------|
| `GET /notifications` | Returns up to 50 recent notifications for the authenticated user, newest first. Joins actor user row to include `actorDisplayName`, `actorHandle`, `actorAvatarUrl`. |
| `POST /notifications/read` | Marks notifications as read. Body: `{ ids?: string[] }`. If `ids` is omitted or empty, marks all unread as read. |

**Web — bell icon:** `web/src/components/layout/NotificationBell.tsx`, rendered in `AppShell` top nav. Fetches notifications on mount (for initial bell state). On click: refreshes list, marks unread as read, shows Popover dropdown with newest-first list. Bell icon turns `#F4B400` (brand gold) and switches to filled icon when unread notifications exist.

### Events (plans)

Event/gathering system. Events are created by a host and can be discovered, RSVP'd, and coordinated around.

**Schema (migration 024):**

| Table | Purpose |
|-------|---------|
| `newchums.events` | Core event entity — title, description, starts_at, location, max_seats, visibility, status, banner_key |
| `newchums.event_interests` | Junction table for event ↔ interest many-to-many (multi-hobby support) |
| `newchums.event_invites` | Invite records — supports both in-app users (user_id) and email invitees (email) |
| `newchums.event_rsvps` | Attendance responses — going, maybe, cant_make_it (one per user per event) |
| `newchums.event_alt_times` | Alternate date/time suggestions from attendees |

**Key fields on `events`:**
- `visibility`: `invite_only` | `chums_only` | `public`
- `status`: `draft` | `published` | `canceled`
- `location_type`: `in_person` | `online`
- `allow_alt_times`: boolean — whether attendees can suggest alternate times
- `interest_id`: FK to `interests` table (hobbies)

**API endpoints (auth required):**

| Route | Description |
|-------|-------------|
| `POST /events` | Create event. Validates title, starts_at, location_type, visibility. Accepts `invitees[]` array of `{ user_id?, email? }`. Published events send invite notifications and emails. |
| `GET /events/mine?filter=upcoming\|past` | List events the user hosts, is invited to, or has RSVP'd. Includes going/maybe counts, host info, RSVP status. |
| `GET /events/:id` | Event detail with RSVP list and alternate time suggestions. Visibility enforcement: invite_only requires invite/RSVP, chums_only requires chum relationship or invite. |
| `POST /events/:id/rsvp` | RSVP to an event — `{ status: "going"\|"maybe"\|"cant_make_it", note? }`. Capacity enforcement for going status. Notifies host via in-app notification and email. |
| `POST /events/:id/alt-time` | Suggest alternate time — `{ suggested_at, note? }`. Only if event.allow_alt_times. Notifies host. |
| `POST /events/:id/cancel` | Cancel event (host only). Notifies all attendees via in-app notification and email. |
| `POST /events/:id/invite` | Add invitees to published event (host only). Sends notifications and invite emails. |
| `GET /events/explore` | Discoverable events feed for logged-in users. Supports: `lat`/`lng`/`radius_km` (location), `hobby` (slug), `time_range` (this_week/this_weekend/next_30/all), `q` (text search). Applies visibility rules (public + chums_only for the user's chums). Distance computed via Haversine. Nearby-first ordering when location is provided. |

**Important: Hono route ordering** — `GET /events/explore` must be registered **before** `GET /events/:id` in the route table. Otherwise, Hono interprets "explore" as a UUID `:id`, resulting in a database error.

**Visibility enforcement:**
- `invite_only`: only host, invited users, and RSVP'd users can view
- `chums_only`: host, their chums, invited users, and RSVP'd users can view
- `public`: any authenticated user can view

**In-app notification types created:** `event_invite`, `event_rsvp`, `event_alt_time`, `event_canceled` (see In-app notifications section above).

**Email scaffolding (noop if template ID not configured):**

| Email | Env var | Template model |
|-------|---------|----------------|
| Event invite | `POSTMARK_TEMPLATE_EVENT_INVITE` | recipientName, hostName, eventTitle, eventDate, eventUrl |
| Event updated | `POSTMARK_TEMPLATE_EVENT_UPDATED` | recipientName, eventTitle, changeDescription, eventUrl |
| Event canceled | `POSTMARK_TEMPLATE_EVENT_CANCELED` | recipientName, hostName, eventTitle, eventDate |
| Event reminder | `POSTMARK_TEMPLATE_EVENT_REMINDER` | recipientName, eventTitle, eventDate, eventLocation, eventUrl |
| RSVP update to host | `POSTMARK_TEMPLATE_EVENT_RSVP_UPDATE` | hostName, attendeeName, eventTitle, rsvpStatus, eventUrl |

**Status: Postmark templates not yet created.** The send functions noop safely when template IDs are not configured. To activate, create templates in Postmark, then add template IDs as env vars in `api/wrangler.toml` or via `wrangler secret put`.

**Web pages:**

| Route | Component | Description |
|-------|-----------|-------------|
| `/` (logged in) | `DashboardHome` | Explore page — event discovery feed with search, time chips, distance/hobby filters, location-aware nearby-first ordering, location nudge, contextual empty states |
| `/events/create` | `CreateEventClient` | "Start a plan" form — title, description, hobby, seats, date/time, location (in-person/online), visibility, invite people, publish |
| `/plans` | `PlansPage` | Tabbed view (Upcoming / Past) with hosted/joined sections, real API data, empty states |
| `/events/[id]` | `EventDetailClient` | Event detail — RSVP actions, alternate time suggestions, attendee list, cancel (host) |

**Not yet implemented:** event editing, event chat, recurring events, public event sharing page (for non-users).

### Media (avatar)

- `POST /media/init` (auth required) → returns upload token and upload URL path
- Client `PUT` to API upload endpoint `PUT /media/upload/:token` with body
- `POST /media/finalize` (auth required) → associates avatar
- `DELETE /profile/avatar` (auth required)
- `GET /users/:userId/avatar` (public; cacheable)

### Diagnostics

- `GET /health`
- `GET /health/env` (local/dev diagnostics)

---

## 9) Public Marketing Site

The public-facing site (visible to logged-out visitors) consists of four marketing pages plus auth/onboarding flows, all sharing a common layout.

### Shared structure

| Component | Location | Role |
|-----------|----------|------|
| `LandingLayout` | `web/src/components/landing/LandingLayout.tsx` | Shared wrapper: fixed AppBar with `SiteHeader`, mobile drawer with auth-aware CTA + `MarketingNavSection`, `<main>` with `LandingContainer` (`Container maxWidth="lg"`, horizontal gutters `px: {xs:2, sm:3}`), footer with `LandingFooter`. |
| `SiteHeader` | `web/src/components/layout/SiteHeader.tsx` | Header bar shared by both `LandingLayout` and `AppShell`. Logo (left), centered desktop nav links, right slot (Sign in or user controls). `HEADER_MIN_HEIGHT = { xs: 64, lg: 80 }`. |
| `MarketingNavSection` | `web/src/components/layout/MarketingNavSection.tsx` | "Learn More" nav section listing `headerNavLinks` (How it Works, Science of Friendship, Safety Center). Used in both public and logged-in mobile drawers. |
| `LandingFooter` | `web/src/components/landing/LandingFooter.tsx` | Logo + tagline, links to How it Works / Safety Center / Science of Friendship / Contact, copyright. |
| `SectionHeader` | `web/src/components/ui/SectionHeader.tsx` | Reusable heading with accent bar (left border on desktop, dynamic underline on mobile). `emphasis` and `accentColor` props. |

### Nav links

Defined in `web/src/config/nav.ts` (`headerNavLinks`):

| Label | Route |
|-------|-------|
| How it Works | `/how-it-works` |
| Science of Friendship | `/science-of-friendship` |
| Safety Center | `/safety-center` |

### Implemented pages

All pages live under `web/src/app/(public)/` and follow the same pattern: a thin server-component `page.tsx` (auth check + metadata) wrapping a `"use client"` content component.

| Page | Route | Content component | Purpose |
|------|-------|-------------------|---------|
| Homepage | `/` | `LandingPageContent.tsx` | Hero (preserved headline), event discovery section with mock data and category filter chips, "making plans easier" feature blocks, "why this works" benefit cards, CTA. Logged-in users see `DashboardHome` instead. |
| How it Works | `/how-it-works` | `HowItWorksContent.tsx` | 6-step product walkthrough, "made for real plans" section with coordination mock panel, friends + new connections cards, discovery mock panel, trust/comfort section, CTA. |
| Science of Friendship | `/science-of-friendship` | `ScienceOfFriendshipContent.tsx` | Research-backed trust page. Interactive friendship-engine diagram, timeline visualization, two-column research cards, CTA. |
| Safety Center | `/safety-center` | `SafetyCenterContent.tsx` | Community guidance. Confidence checklist, gathering tips, respect/comfort cards, "if something feels off" section, reporting link, CTA. |

### Design system patterns (public pages)

- **Section spacing:** `SECTION_SPACING = { py: { xs: 5, sm: 8, md: 10 } }`; `CONTENT_MAX_WIDTH = 800` (widened to 1100 for discovery grids).
- **Full-bleed backgrounds:** Sections use `mx: { xs: -2, sm: -3 }, px: { xs: 2, sm: 3 }` to extend beyond `LandingContainer` gutters.
- **Alternating backgrounds:** white → `grey.100` → white → `grey.50` → `primary.dark` CTA.
- **Card styles:** Top-border accent cards (`borderTop: 3px solid`, `borderRadius: 2`, paper background, light shadow). Outlined lift cards (hover `translateY(-4px)`).
- **CTA section:** `primary.dark` background, gold `secondary.main` 3px top stripe via `::before`, white text, numbered step circles, `contained color="secondary"` button.
- **Responsive:** Mobile = centered text/stacked layout; `sm`+ = left-aligned/row. Consistent `textAlign: { xs: "center", sm: "left" }` and `alignSelf: { xs: "center", sm: "flex-start" }` across all sections.
- **Hero pattern:** Eyebrow (overline, gold) → H1 (800 weight) → gold accent bar (48×3px) → subtext → CTA buttons.
- **Button styling:** `borderRadius: 2.5`, `textTransform: "none"`, softened `boxShadow` on CTA buttons.

### Future-ready elements

The homepage and How it Works page contain mock event data and UI panels that are structured for easy replacement with real API data:

- **Homepage discovery section:** `MOCK_EVENTS` array with `EventCard` type, category filter chips with client-side state, empty state handler. Intended future fallback: nearby events → featured events → empty state.
- **Homepage hero panel:** Mini product-preview showing 3 event rows (desktop only).
- **How it Works coordination panel:** Mock RSVP response panel (Going / Maybe / Waiting statuses).
- **How it Works discovery panel:** Mock "Nearby Gatherings" panel with event rows.

---

## 10) Content Safety (Inappropriate Word Validation)

### Purpose

Block profanity, slurs, and similar terms in display names, usernames, and hobbies.

### Implementation

- **Server (canonical):**
  - `api/src/data/bannedTerms.ts` (~230 terms)
  - `api/src/lib/contentSafety.ts` validates input (camelCase split, leetspeak normalization, repeated-char collapse, separators, phrase checks).
- **Client (fast feedback):**
  - `web/src/lib/contentSafety.ts` smaller list (~90 terms), same general matching approach.

### Fields validated

- Signup username
- Onboarding username
- Profile display name
- Profile username/handle
- Profile hobbies (new/edited)

### Error shape

`{ ok: false, code: "INAPPROPRIATE_TEXT", field: "handle" | "display_name" | "hobby" }` (400)

---

## 11) Storage (Database + R2)

### Neon Postgres

Core tables include:
- `users` (credentials + oauth users; includes `email_verified_at`, `password_hash`, `avatar_key`, etc.)
- `user_profile` (profile fields; includes `bio` per migration 009)
- token tables for email verification and password reset
- `email_change_requests` (migration 011)
- `interests` + `user_interests` (interest/hobby associations)
- `user_profile.notification_prefs` (JSONB, migration 012) — per-notification-type enabled + frequency
- `users.is_hidden_from_search`, `users.is_hidden_from_external_indexing` (boolean, migration 013) — privacy toggles
- `users.is_hidden_age` (boolean, migration 014) — when true, age is not shown on public profile; default false
- `users.role` (TEXT NULL, migration 015) — user role; `super_admin` unlocks admin features
- `interests.is_deleted`, audit columns (migration 015) — soft-delete + audit trail for admin moderation
- `interests.merged_into_interest_id` (UUID NULL, migration 016) — merge target for deleted/duplicate interests
- `users.is_suspended`, `suspended_at`, `suspended_by_user_id`, `suspension_reason` (migration 017) — account suspension; indexed on `is_suspended = true`
- `users.gender` (TEXT NULL, migration 018) — allowed values: `male`, `female`, `other`, `prefer_not_to_say`; suppressed on public profile if `prefer_not_to_say` or null
- `users.profile_theme` (TEXT NULL, migration 019) — controls accent color of the identity card on the public profile; allowed values: 16 curated palette keys defined in `web/src/lib/profileTheme.ts`
- `users.is_hidden_chum_list`, `users.is_hidden_from_chum_lists` (boolean, migration 020) — Chums privacy toggles; both default false
- `newchums.user_chums` (migration 021) — one-way Chum relationships; columns: `id`, `user_id`, `chum_user_id`, `created_at`; unique constraint on `(user_id, chum_user_id)`; self-chum prevented by CHECK constraint; indexed on both FKs
- `newchums.notifications` (migration 022) — general notifications table; columns: `id`, `user_id`, `type`, `actor_user_id`, `entity_id`, `metadata` (JSONB), `read_at`, `created_at`; indexed for unread queries
- `newchums.chum_invites` (migration 023) — invite records for emails not yet on NewChums; columns: `id`, `inviter_user_id`, `invitee_email`, `token_hash`, `status` (`pending`/`accepted`/`expired`), `expires_at` (30 days), `accepted_at`, `accepted_user_id`, `created_at`; unique index on `token_hash`; indexed on `(invitee_email, status)` and `inviter_user_id`
- `newchums.events` (migration 024) — core event entity; columns include `host_user_id`, `title`, `description`, `interest_id` (legacy FK, being superseded by event_interests), `starts_at`, `location_type`, `location_name`, `location_address`, `location_lat`, `location_lng`, `online_link`, `max_seats`, `visibility`, `status`, `allow_alt_times`, `banner_key`, `created_at`, `updated_at`
- `newchums.event_interests` (migration 025) — junction table for event ↔ interest many-to-many; events can link to multiple hobbies
- `newchums.event_invites` (migration 024) — invite records supporting both user_id and email invitees
- `newchums.event_rsvps` (migration 024) — RSVP responses; one per user per event; status: `going`, `maybe`, `cant_make_it`
- `newchums.event_alt_times` (migration 024) — alternate time suggestions from attendees

PostGIS is available for geo queries.

### Avatar storage (R2)

- Bucket: `newchums-media` (binding `MEDIA_BUCKET`)
- Users table stores `avatar_key` like `avatars/<userId>/<ts>.webp`
- Public serving via `GET /users/:userId/avatar`

**Cross-environment consistency:**
When sharing the same DB between local and production, set `NEXT_PUBLIC_AVATAR_BASE_URL` in `web/.env.local` to the production API URL so all media operations and avatar display resolve through the same R2-backed origin.

---

## 12) Observability

- Sentry: frontend + API error tracking
- Axiom: API request logs
- Plausible: production analytics

---

## 13) Wrangler and Deploy Configuration (Invariants)

### Web (`web/wrangler.toml`)

- `workers_dev = false`
- `preview_urls = false`
- Custom domain routes: `newchums.com`, `www.newchums.com`
- Vars include `AUTH_URL`, `NEXTAUTH_URL`, `AUTH_TRUST_HOST`
- Service binding `WORKER_SELF_REFERENCE` points to the deployed worker

### API (`api/wrangler.toml`)

- Root worker `newchums-api` is the production API target
- Secrets (via Wrangler/CF dashboard): `DATABASE_URL`, `NEXTAUTH_SECRET`, `POSTMARK_SERVER_TOKEN`

CORS is enforced via an explicit allowlist (newchums.com, www, localhost:3000) in API code.

---

## 14) Runtime Constraints (Web)

Do NOT add `export const runtime = "edge"` to routes. OpenNext Cloudflare shims the edge runtime to an empty module, causing 500 Internal Server Error; Workers already run at the edge.

### Middleware patch

A post-build patch is required because Next.js 16 may emit middleware with `nodejs` runtime markers that break OpenNext.
`web/scripts/patch-functions-config.js` runs after `next build` to remove/adjust the middleware entry in the functions config manifest.

Validation command:

```bash
cd web && npm run build
```

---

## 15) Technical Debt (Acknowledged)

- Web worker name suffix mismatch (`newchums-web-dev` is production).
- Schema normalization/cleanup will be required before broader public launch.
- Event email templates not yet created in Postmark (sends noop safely).
- Account deletion (`DELETE /account`) does not yet cascade to events, event_rsvps, event_invites, or event_alt_times — must be updated when those tables accumulate production data.
