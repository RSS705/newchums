# Technical Specifications

Last Updated: March 19, 2026
Version: 14.0

This document defines the authoritative technical architecture of NewChums.
It describes **what exists today** and the structural commitments we are making.

---

## 1) Product Context

NewChums helps people organize gatherings more easily around hobbies and shared interests.

**Current positioning:**
- Primary: start, share, and join hobby-based plans nearby, a practical tool for organizing real-world gatherings.
- Secondary: reduces follow-through friction — clear invites, easy RSVPs, one place for updates.
- Tertiary: meeting new people naturally through shared interests and smaller gatherings.
- Broader mission: reducing loneliness by supporting real-world connection; emphasized on Science of Friendship page, lightly referenced on homepage.

**Note on group chat:** Each plan has a built-in participant group chat with real-time WebSocket delivery. Marketing copy must not position NewChums as "without group chats." Frame the pitch around clarity and follow-through.

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
| Real-time | Cloudflare Durable Objects | WebSocket relay for plan chat (Hibernation API) |
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

- **Durable Objects:** `ChatRoom` class bound as `CHAT_ROOM` in the API worker. Per-plan WebSocket relay for real-time chat. Uses the Hibernation API so idle connections consume no CPU. Configured via `[[durable_objects.bindings]]` and `[[migrations]]` in `api/wrangler.toml`.

- **Cron Triggers:** `[triggers] crons = ["0 * * * *"]` in `api/wrangler.toml`. Runs hourly. The `scheduled` handler processes attendance assurance (confirmation requests, reminders, cutoff processing), daily unread-chat digest email (gated to run once per day at ~2 PM UTC via `chat_digest_sent_at` cooldown), event match digest, and post-plan feedback reminder emails (sent ~3h after plan start, tracked via `events.feedback_email_sent_at`). Integrated into the Sentry-wrapped export alongside `fetch`.

### Not implemented

- Dedicated dev Worker environment(s).
- Queues.

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

- `POST /auth/signup` — accepts optional `interest_slugs[]`, `home_city`, `home_lat`, `home_lng`, `travel_radius_km` for multi-step signup; accepts `accepted_terms_version`, `accepted_privacy_version` for legal acceptance recording
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
- `POST /auth/record-legal-acceptance` (auth required) — records legal acceptance for OAuth users post-authentication. Accepts `accepted_terms_version`, `accepted_privacy_version`. Only sets values if not already recorded (uses `COALESCE` to avoid overwriting).
- `POST /email/unsubscribe` — verifies a signed JWT (containing `userId` and `prefKey`), disables the corresponding notification preference. Used by tokenized unsubscribe links in email footers.

### Notification preferences (Settings toggles)

Users manage notification preferences in **Settings** (`/settings`). Each notification type is a simple on/off toggle; supported emails send immediately when enabled. Stored in `user_profile.notification_prefs` (JSONB). Single source of truth: `api/src/lib/notificationPrefs.ts`.

**Notification types (keys):**

| Key | UI title | Postmark template |
|-----|----------|-------------------|
| `event_match` | New plans matching my interests | `POSTMARK_TEMPLATE_EVENT_MATCH_DIGEST` (template 44018889) |
| `event_invite` | Someone invited you to a plan | `POSTMARK_TEMPLATE_RSVP` |
| `join_request_received` | Someone requested to join your plan | Template 43906440 |
| `join_request_accepted` | Your join request was accepted | Template 43906609 |
| `join_request_declined` | Your join request was declined | Template 43906703 |
| `host_join` | Someone is going to your plan | Template 43922675 |
| `host_maybe` | Someone might attend your plan | Template 43922237 |
| `host_leave` | Someone leaves your plan | Template 43921920 |
| `feedback_requests` | Post-gathering feedback | — (not yet wired) |
| `event_changed_canceled` | Plan canceled or changed | `POSTMARK_TEMPLATE_EVENT_CHANGED` (template 43971187) |
| `attendee_removed` | You were removed from a plan | Template 43923102 |
| `product_announcements` | Product updates | — |
| `unread_chat_digest` | Unread messages in your plans | `POSTMARK_TEMPLATE_UNREAD_CHAT_DIGEST` (template 43975299) |
| `attendance_confirmation` | Attendance confirmation reminders | `POSTMARK_TEMPLATE_CONFIRMATION_REQUEST` (template 43984465) |
| `plan_feedback` | Post-plan feedback reminders | `POSTMARK_TEMPLATE_PLAN_FEEDBACK` (template 44091936) |

**Non-preference transactional emails (no toggle):**

| Purpose | Postmark template |
|---------|-------------------|
| Guest verification code (public RSVP) | `POSTMARK_TEMPLATE_GUEST_VERIFY` (template 44041128) |

Defaults are applied at account creation (credentials signup, OAuth) and backfilled for existing users with missing keys. GET normalizes stored prefs and optionally persists backfilled values.

**Event match digest (batch):** The hourly `scheduled` handler runs `processEventMatchDigest` after the unread-chat digest block. Recipients must have `event_match` enabled, a home location, and meet the same in-person / future / not-full / travel-radius / “new since last digest” gates as for public plans. **Public** plans require at least one overlapping hobby between the user and the plan. **Chums-only** plans use the **same** hobby overlap and distance rules; additionally the recipient must appear on the **host’s** On NewChums connections (`user_contacts`: host `user_id`, recipient `linked_user_id`, `type = 'on_newchums'`). **Invite-only** plans are excluded.

Each RSVP status has a dedicated host notification email, each gated on its own preference toggle. Each email includes a tokenized unsubscribe link that toggles the corresponding preference. Migration 033 removes the obsolete `event_reminders` key and `frequency` fields from existing JSONB data.

### Host attendee removal

Hosts can remove attendees with status "going" or "maybe" from their plans via `POST /events/:id/remove-attendee`. The endpoint requires authentication and verifies the caller is the plan host. It:

1. Deletes the attendee's RSVP row from `event_rsvps`
2. Records the removal in `newchums.host_attendee_removals` (migration 034) for future host quality metrics, moderation review, and trust scoring
3. Sends a notification email to the removed user (Postmark template 43923102)

The `host_attendee_removals` table tracks: `event_id`, `host_user_id`, `removed_user_id`, `status_at_removal`, and `created_at`. Hosts cannot remove themselves or attendees with "can't make it" status (since they're already not attending).

### Guest RSVP for email-only invitees

When a host invites someone by email who does not have a NewChums account, that person can still RSVP and view the plan without signing up. The flow works via the invite token (JWT, 30-day expiry) embedded in the invite email.

**How it works:**
- `POST /events/:id/email-rsvp` — accepts `invite_token` (invite flow) or `participation_token` (public RSVP flow). When the token's email has no matching user account, a guest RSVP is created with `user_id = NULL` and `guest_email` set. The guest can change their RSVP using on-page buttons. Public RSVP tokens are only accepted for public-visibility events and skip the invite-record check.
- `GET /events/:id` — accepts an optional `invite_token` or `participation_token` query param. A valid token grants read access (invite tokens additionally grant access to invite-only and chums-only events). The response includes `guestInvite: true` and `guestRsvpStatus` so the frontend can render appropriate UI.
- The invite email's "View plan" link includes the invite token, so guests can revisit the plan page from the email at any time during the 30-day token window.
- Guest RSVPs appear in the attendee list with their email as the display name and no avatar.
- Migration 035 adds `guest_email TEXT NULL` and `guest_name TEXT NULL` to `event_rsvps` and makes `user_id` nullable, with a partial unique index on `(event_id, guest_email)` for guest rows.
- Host notification emails are sent for guest RSVPs the same way as for registered users.

### Public plan participation (share-link RSVP without account)

Visitors without an account can RSVP to **public** plans via a share link. The flow uses email verification to establish identity without requiring full account creation.

**How it works:**
1. `POST /events/:id/public-rsvp/request-code` — visitor submits their email. If the email belongs to an existing account, the response returns `{ existing_account: true }` and the frontend prompts sign-in. Otherwise, a 6-digit code is emailed and a **challenge token** (JWT, 10-minute expiry, HMAC-signed code digest) is returned.
2. `POST /events/:id/public-rsvp/confirm-code` — visitor submits the code + challenge token. On success, a **participation token** is issued (JWT, 30-day expiry, purpose `public_rsvp`) containing `eventId`, `email`, and optional `name`.
3. `POST /events/:id/email-rsvp` — accepts `{ participation_token, status, guest_name? }` in addition to the existing `invite_token` flow. Creates or updates a guest RSVP (`user_id = NULL`, `guest_email` set) the same way as email-invite guests.
4. `GET /events/:id` — accepts `participation_token` query param (same as `invite_token`). Grants read access and returns guest RSVP status.
5. `POST /events/:id/guest-alt-time` — accepts `participation_token` (requires existing RSVP rather than invite record).

**Security:**
- Challenge token uses HMAC digest so the 6-digit code cannot be extracted from the JWT.
- 10-minute expiry + Cloudflare infrastructure-level rate limiting make brute force impractical (no server-side state needed).
- Participation token mirrors invite token structure but with purpose `public_rsvp`; only accepted for public-visibility events.

**Account linking:** When a user later creates an account with the same email and views the plan (`GET /events/:id`), orphaned guest records (RSVPs, invites, alt-times) are automatically adopted — same mechanism used for email-invite guests.

**Cross-event email pre-fill:** The frontend stores participation tokens in `localStorage` as `nc_pub_{eventId}`. When visiting a new public plan, any existing `nc_pub_*` entry provides email pre-fill (a new verification code is still required).

**Email template:** Postmark template 44041128 (`POSTMARK_TEMPLATE_GUEST_VERIFY`). Variables: `code`, `planTitle`, `productName`.

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
| `is_hidden_chum_list` | Hide my connections from my public profile | When ON, the Connections section is not rendered on the user's public profile. Private contact lists are unaffected. |
| `is_hidden_from_chum_lists` | Hide me from appearing on other people's connection lists | When ON, the user is excluded from `GET /public/users/:handle/chums` responses. They still appear on private contact lists of users who have already added them. |

**Implementation notes:** UI: `web/src/app/(app)/settings/PrivacyToggleRow.tsx`, `SettingsClient.tsx`. API: `GET /profile` and `PUT /profile` in `api/src/index.ts`. Schema: migrations 013 (`is_hidden_from_search`, `is_hidden_from_external_indexing`), 014 (`is_hidden_age`), 020 (`is_hidden_chum_list`, `is_hidden_from_chum_lists`).

### Profile, onboarding, and lookups

- `GET /profile`, `PUT /profile` (auth required). Response includes `role`, `gender`, `profile_theme`, `is_hidden_chum_list`, `is_hidden_from_chum_lists`, `userId`. `PUT /profile` validates `gender` (allowed: `male`, `female`, `other`, `prefer_not_to_say`) and `profile_theme` (allowed values defined in `web/src/lib/profileTheme.ts`). The `/profile` edit page includes the live Attendance Record section.
- `GET /public/users/:userId/attendance-record` (public; no auth) — computes and returns five attendance reliability metrics for the specified user: follow-through rate, confirmation rate, plans attended, plans hosted, host completion rate, and member-since date. Used by the `AttendanceRecordSection` component on profile pages.
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
| `GET /chums` | Returns the authenticated user's contacts split by type: `onNewChums` (on-platform connections with avatar, handle, birthday, note) and `privateContacts` (off-platform entries with email, name, note). Ordered by most recently added. |
| `PATCH /chums/:contactId/note` | Update the private note for any contact entry (On NewChums or Private Contact). Body: `{ note: string \| null }`. Persisted on `newchums.user_contacts.note`. Visible only to the authenticated user. |
| `GET /chums/search?q=` | Search for users to add. If `q` is a valid email, performs exact email lookup (returns single result or invite eligibility); otherwise searches by name/handle. Excludes self and hidden-from-search users. Min 2 chars. Returns up to 10 results with `isSaved`, and for email mode also `inviteEligible`, `inviteeEmail`, `alreadyInvited`, `isPrivateContact`. |
| `GET /chums/check/:userId` | Returns `{ isSaved: boolean }` for a specific user. Used by the public profile page. |
| `POST /chums/:userId` | Save an on-platform user to the authenticated user's On NewChums connections. Idempotent (`ON CONFLICT DO NOTHING`). Cannot add self. No notification sent. |
| `POST /chums/private` | Add a Private Contact. Body: `{ email?, name?, note? }`. If email matches an existing user, auto-creates as `on_newchums` instead. |
| `DELETE /chums/:id` | Remove a contact entry by contact row ID or linked user ID. Works for both On NewChums and Private Contact entries. |
| `POST /chums/invite` | Send an invite email to an address not yet on NewChums. Also creates a Private Contact entry for the invitee if one doesn't exist. Prevents duplicate pending invites. Rate limit: 10 per inviter per 24 h. Uses Postmark template `43805532`. |
| `POST /chums/invite/accept` | Consume an invite token during signup. Called with `{ token, email }`. Verifies invite, creates two independent `on_newchums` entries (inviter → new user, new user → inviter). Also auto-links any Private Contacts matching the new user's email across all users. No mutual indicator. |
| `GET /public/users/:handle/chums` | Public-facing paginated connections list for a profile. No auth required. Only shows `on_newchums` entries. Respects: owner's `is_hidden_chum_list` (if ON, returns `{ hidden: true }`) and each listed connection's `is_hidden_from_chum_lists` (filters them out). Query params: `offset`, `limit` (max 20, default 8). |

**Privacy rules:**
- `is_hidden_from_search = true` → user excluded from `GET /chums/search` results AND from exact email lookup (treated as "not found"). Invite eligibility is still offered for their email.
- Users already saved as a contact remain there even if they later enable `is_hidden_from_search`.
- `is_hidden_chum_list = true` → Connections section hidden on that user's public profile (enforced in both the API response and the web component).
- `is_hidden_from_chum_lists = true` → user excluded from all `GET /public/users/:handle/chums` responses, but remains on private contact lists.

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
- `/chum-groups` — "Connections" page. Two-section layout: **On NewChums** (on-platform connections with avatar, handle, birthday, note) and **Private Contacts** (off-platform contacts with email/name, note). Unified search/add flow at top: search finds existing users (save to On NewChums) or offers "Add as private contact" / "Invite to NewChums" for unrecognized emails. Add Private Contact dialog for manual entry. Each contact row supports inline private note editing (pencil icon, `PATCH /chums/:contactId/note`). No mutual indicator.
- `/u/[handle]` — "Save" / "Remove" button in the profile header card (top-right). Shown for logged-in viewers who are not the profile owner. Connection status fetched via `GET /chums/check/:userId` after profile loads.
- Public Connections section renders below the hobbies card when the profile owner's `is_hidden_chum_list = false` and they have at least one public-visible connection. Paginated (8 per page, prev/next). Section is entirely absent (no empty card) when the list is empty.

### In-app notifications

General notifications table (`newchums.notifications`, migration 022) designed for future extensibility.

**Schema:** `id`, `user_id` (recipient), `type`, `actor_user_id` (nullable), `entity_id` (nullable, for future entity links), `metadata` (JSONB, nullable), `read_at` (null = unread), `created_at`. Indexed on `(user_id, created_at DESC)` and a partial index for unread rows.

For `event_updated`, `event_locked`, and `event_canceled`, `metadata` includes `eventTitle` plus `hostUsername` (handle slug) and `hostName` (display name) from the host at send time, so the bell can show `@handle` (or a name fallback) even when the actor join alone would be ambiguous.

**Supported types:**

| Type | Trigger | Recipient |
|------|---------|-----------|
| `chum_added_you` | `POST /chums/:userId` — only when a new Chum is created (not a duplicate `ON CONFLICT`). Re-adding after removal generates a fresh notification. | The user who was added |
| `event_invite` | User invited to an event (at creation or via `POST /events/:id/invite`) | Invited user |
| `event_rsvp` | Someone RSVPs to an event | Event host |
| `event_alt_time` | Someone suggests an alternate time | Event host |
| `event_updated` | Host edits plan details (date, description, capacity, visibility) | Going/maybe attendees |
| `event_locked` | Host locks a plan | Going/maybe attendees |
| `event_canceled` | Event is canceled | Going/maybe attendees |
| `join_request` | User submits a join request | Event host |
| `join_request_withdrawn` | User withdraws their pending join request | Event host |
| `join_request_approved` | Host approves a join request | Requester |
| `join_request_declined` | Host declines a join request | Requester |

**API endpoints (auth required):**

| Route | Description |
|-------|-------------|
| `GET /notifications` | Returns up to 50 recent notifications for the authenticated user, newest first. Joins actor user row to include `actorDisplayName`, `actorHandle`, `actorAvatarUrl`. Also returns an `unreadChats` array (up to 10 plans with unread messages), derived from `event_chat_messages` and `event_chat_reads`. |
| `POST /notifications/read` | Marks notifications as read. Body: `{ ids?: string[] }`. If `ids` is omitted or empty, marks all unread as read. |

**Web — bell icon:** `web/src/components/layout/NotificationBell.tsx`, rendered in `AppShell` top nav. Fetches notifications on mount (for initial bell state). On click: refreshes list, marks unread as read, shows Popover dropdown with newest-first list. Bell icon turns `#F4B400` (brand gold) and switches to filled icon when unread notifications or unread chat entries exist. Unread chat entries are rendered with a chat bubble icon, plan title, unread count, latest message preview, and a link to the plan.

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
| `newchums.event_chat_messages` | Per-plan chat messages — id, event_id, user_id, body, created_at. Indexed on `(event_id, created_at ASC)` |
| `newchums.event_chat_reads` | Last-read tracking per user per plan — PK `(event_id, user_id)`, `last_read_at` timestamp |
| `newchums.event_confirmations` | Final attendance confirmations (migration 039) — id, event_id, user_id, status (pending/confirmed/declined/expired), responded_at, reminder_count, last_reminder_at, created_at, updated_at. Unique constraint on `(event_id, user_id)`. |
| `newchums.event_join_requests` | Join request records (migration 030) — id, event_id, user_id, status (pending/approved/declined), message, host_message, decided_at, created_at. Unique partial index on `(event_id, user_id) WHERE status = 'pending'` prevents duplicate active requests. |

**Key fields on `events`:**
- `visibility`: `invite_only` | `chums_only` | `public`
- `status`: `draft` | `published` | `canceled`
- `location_type`: `in_person` | `online`
- `allow_alt_times`: boolean — whether attendees can suggest alternate times
- `allow_attendee_invites`: boolean (default true, migration 042) — when true, Going attendees can invite others to the plan; host can toggle at any time
- `interest_id`: FK to `interests` table (hobbies)
- `require_reconfirmation`: boolean (migration 028) — when true, enables the Attendance Assurance system; attendees receive confirmation requests 24 hours before the event
- `min_confirmed_attendees`: integer (migration 039) — minimum confirmed count for plan viability (host counts toward total)
- `fallback_policy`: text (migration 039) — what happens if minimum is not met at cutoff: `proceed`, `notify_host`, or `auto_cancel`
- `confirmation_window_hours`, `confirmation_cutoff_hours`, `confirmation_sent_at`, `cutoff_processed_at`: attendance assurance lifecycle timestamps (migration 039)
- `locked_at`: timestamptz nullable (migration 029) — when set, the plan is locked and no new participants can join; existing participants and host retain access
- `require_approval`: boolean (migration 030) — when true, non-invited users must submit a join request that the host approves or declines before being added to the plan

**API endpoints (auth required):**

| Route | Description |
|-------|-------------|
| `POST /events` | Create event. Validates title, starts_at, location_type, visibility. Accepts `invitees[]` array of `{ user_id?, email? }`, `require_reconfirmation`, `require_approval`, and `allow_attendee_invites` (default true) booleans. Published events send invite notifications and emails. |
| `GET /events/mine?filter=upcoming\|past` | List events the user hosts, is invited to, or has RSVP'd. Includes going/maybe counts, host info, RSVP status, `has_unread_chat` flag. Host name uses `@username` priority. |
| `GET /events/:id` | Event detail with RSVP list, alternate time suggestions, join requests, and attendance assurance state. Optional auth. Accepts query params: `invite_token`, `participation_token`, `share_token`. Returns `accessState` (`public` \| `invite` \| `authenticated` \| `attending`) and `shareToken` (for non-public states). Public access returns limited preview (counts only, no individual RSVPs). Full response includes `requireReconfirmation`, `lockedAt`, `requireApproval`, `isInvited`, `hasRsvp`, `confirmationWindowOpen`, `confirmationCutoffAt`, `confirmedCount`, `pendingConfirmationCount`, `myConfirmationStatus`, `planViability`, and per-RSVP `confirmationStatus`. Join requests: full list for host, own request only for non-hosts. |
| `PATCH /events/:id` | Edit event (host only). Accepts: `title`, `description`, `starts_at`, `max_seats`, `visibility`, `require_reconfirmation`, `require_approval`. Returns the updated event. |
| `POST /events/:id/rsvp` | RSVP to an event — `{ status: "going"\|"maybe"\|"cant_make_it", note? }`. Capacity enforcement for going status. Locked plans reject new RSVPs (`EVENT_LOCKED` error) but allow existing participants to change status. Plans with `require_approval` reject non-invited users who have no existing RSVP (`APPROVAL_REQUIRED` error). Notifies host via in-app notification and email. UI: "Can't make it" button only shown when user is invited or has an existing RSVP; heading text is context-aware ("Can you make it?" for invited users, "Are you in?" otherwise). |
| `POST /events/:id/alt-time` | Suggest alternate time — `{ suggested_at, note? }`. Only if event.allow_alt_times. Notifies host. Auth required. |
| `POST /events/:id/guest-alt-time` | Guest alternate time suggestion via invite token or participation token — `{ invite_token|participation_token, suggested_at, ends_at?, note? }`. No auth required. Validates token; invite tokens require an invite record, participation tokens require an existing RSVP. Enforces 10-suggestion limit per guest. Stores with `user_id = NULL, guest_email = ...` (migration 043). |
| `POST /events/:id/cancel` | Cancel event (host only). Notifies all attendees via in-app notification and email. |
| `POST /events/:id/invite` | Add invitees to published event. Host can always invite; Going attendees can invite when `allow_attendee_invites` is true. Accepts optional `suggest_time: true` to include a "suggest a better time" note in the invite email (only when `allow_alt_times` is enabled). `invited_by` column tracks who sent each invite. Sends notifications and invite emails with inviter's display name. |
| `POST /events/:id/toggle-attendee-invites` | Toggle `allow_attendee_invites` (host only). Returns updated value. |
| `GET /events/explore/public` | Public discovery feed for anonymous visitors. No authentication required. Only returns `visibility = 'public'` events. Privacy-safe: approximate location only (`location_area`), no exact addresses, no online links, no user-specific fields (`isHost` always false, `myRsvpStatus` always null, no `distanceKm`). Supports: `time_range`, `q` (text search), `sort` (upcoming/newest), `limit`/`offset`. |
| `GET /events/explore` | Personalized discovery feed for logged-in users. Supports: `lat`/`lng`/`radius_km` (location), `hobby` (slug), `time_range` (this_week/this_weekend/next_30/all), `q` (text search), `sort` (upcoming/newest), `personalize` (0/1 — hobby-based ranking boost). Applies visibility rules (public + chums_only for the user's chums). Distance computed via Haversine. Prioritizes host's own events, then hobby matches (when personalized), then distance/time. |
| `GET /events/:id/chat` | Fetch chat messages and user's `lastReadAt` for a plan. Access: host or `going` RSVP only. |
| `POST /events/:id/chat` | Send a chat message. Body: `{ body: string }`. Inserts into DB, then broadcasts to the ChatRoom Durable Object for real-time delivery. Access: host or `going` RSVP only. |
| `POST /events/:id/chat/read` | Mark chat as read. Upserts `last_read_at` in `event_chat_reads`. |
| `GET /events/:id/chat/ws` | WebSocket upgrade endpoint. Authenticates via `?token=` query param (JWT), verifies chat access, then forwards to the ChatRoom Durable Object. Returns 101 on success. |
| `POST /events/:id/lock` | Toggle plan lock (host only). Sets or clears `locked_at` on the event. Returns updated `lockedAt`. |
| `POST /events/:id/confirm` | Confirm or decline attendance (auth required). Body: `{ action: "confirm" \| "decline" }`. Upserts `event_confirmations` record. Available when confirmation window is open. On success, marks unread `confirmation_requested` bell notifications for that user and plan as read. |
| `POST /events/:id/email-confirm` | Token-based attendance confirmation from email links. Body: `{ token, action: "confirm" \| "decline" }`. Verifies signed JWT, updates confirmation status. On success, marks unread `confirmation_requested` bell notifications for that user and plan as read (idempotent). |
| `POST /events/:id/join-request` | Submit a join request (requires `require_approval` to be on). Body: `{ message? }`. Validates not-host, not-invited, not-already-RSVP'd, no duplicate pending request. Notifies host via in-app notification and email (template 43906440). |
| `POST /events/:id/join-request/:requestId/approve` | Approve a join request (host only). Body: `{ message? }`. Checks seat capacity. Marks request approved, adds user as Going RSVP. Notifies requester via in-app notification and email (template 43906609). |
| `POST /events/:id/join-request/:requestId/decline` | Decline a join request (host only). Body: `{ message? }`. Marks request declined. Notifies requester via in-app notification and email (template 43906703). |
| `GET /events/:id/feedback` | Existing feedback by this user for this plan + eligible attendees. Auth required; plan must be past. |
| `POST /events/:id/feedback` | Submit/update feedback. Body: `{ entries: [{ revieweeUserId, prompt, response }] }`. Prompts: reliability, sociability, presentation, match_quality, hosting_skills (host-only). Responses: agree, maybe, disagree. Upserts on conflict. |
| `POST /events/:id/attendance-issue` | Report attendance issue. Body: `{ reportedUserId, issueType }`. Types: no_show, late_cancel, very_late. One report per type per pair per plan. |
| `POST /events/:id/conduct-report` | Report conduct/safety concern. Body: `{ reportedUserId, reason, details? }`. Reasons: rude_aggressive, harassment, boundary_issue, discriminatory, unsafe_intoxicated, disruptive, property_damage, other. |
| `POST /events/:id/public-rsvp/request-code` | Share-link email verification. Body: `{ email, share_token? }`. If email belongs to existing account, returns `{ existing_account: true }`. Otherwise sends 6-digit code via Postmark template 44041128 and returns `{ challenge }` (JWT, 10-min expiry). Without a valid `share_token`, requires the plan to have public visibility; with a valid share token, works for any published plan. |
| `POST /events/:id/public-rsvp/confirm-code` | Verify the 6-digit code. Body: `{ challenge, code, name? }`. On success returns `{ token }` — a participation token (JWT, 30-day expiry, purpose `public_rsvp`). |

**Important: Hono route ordering** — `GET /events/explore/public` and `GET /events/explore` must be registered **before** `GET /events/:id` in the route table. Otherwise, Hono interprets "explore" as a UUID `:id`, resulting in a database error.

**Visibility enforcement:**
- Visibility controls **discoverability** (explore feed, digests), **not** direct URL access.
- Anyone with the plan URL can view published plans (draft plans remain host-only).
- `invite_only`: excluded from explore feed and digests
- `chums_only`: shown in explore/digests only to the host's chums
- `public`: shown in explore feed and digests to all eligible users

**Plan Access States:**

Every request to `GET /events/:id` resolves to one of four access states. The access state determines what data is returned and how the frontend renders the experience. The API includes `accessState` in every response.

| State | Condition | Data scope |
|-------|-----------|------------|
| **`attending`** | Logged in + host or has RSVP | Full detail: RSVPs, invites, alt-times, join requests, chat access, exact location (per `location_visibility`), attendance assurance, host controls |
| **`authenticated`** | Logged in, not attending | Full detail minus host-only controls. Own join request only. Can RSVP or request to join. |
| **`invite`** | Valid `invite_token`, `participation_token`, or `share_token`, not logged in | Full detail with guest hints (`guestInvite`, `guestEmail`, `guestRsvpStatus`). Guest RSVP via email verification flow. |
| **`public`** | No auth, no token | Limited preview: title, description, date, hobby, host name, location (approximate only), attendee counts (going/maybe, no individual RSVPs). No RSVP flow. CTA to sign in or create account. |

**Precedence:** `attending` > `authenticated` > `invite` > `public`. A logged-in user with an invite token who is already attending resolves to `attending`.

**Share tokens (plan-level access links):**

Share tokens are plan-level JWTs (`purpose: "share"`) that grant guest access to a plan's full detail view and the email RSVP flow. Unlike invite tokens, share tokens are not user-specific and have no expiry.

- Generated server-side via `createShareToken(eventId, secret)`.
- Included in `GET /events/:id` responses for non-public access states as `shareToken`.
- The **Copy Link** button builds the share URL as `/events/[id]?share_token=xxx`.
- The `share_token` query param is verified by `verifyParticipationOrInviteToken` (same verifier as invite/participation tokens).
- The `public-rsvp/request-code` endpoint accepts an optional `share_token` body param to allow the email RSVP flow on non-public-visibility plans.

**URL distinction (public vs share):**
- Plain URL `/events/[id]` → `accessState: "public"` → limited preview, no RSVP.
- Share URL `/events/[id]?share_token=xxx` → `accessState: "invite"` → full detail with guest RSVP.
- Invite URL `/events/[id]?invite_token=xxx` → `accessState: "invite"` → full detail with guest RSVP.

**Public access data restrictions:**
- Individual RSVP entries are not returned (only aggregate counts)
- Location is always approximate (no exact address, name, or coordinates)
- Online links are not exposed
- Invite list, join requests, and alt-time suggestions are empty
- Attendance assurance fields are zeroed/null
- `createdAt` timestamp is omitted
- No `shareToken` is included (prevents share-link bootstrapping from public access)

**Plan chat (real-time):**

Each plan has an embedded group chat visible to the host and participants with `going` RSVP status. Chat is delivered in real time via WebSockets, backed by a Cloudflare Durable Object (`ChatRoom`) that acts as a stateless broadcast relay — the database is the source of truth for message history, while the Durable Object holds open WebSocket connections and forwards new messages.

Architecture:
1. Client opens a WebSocket via `GET /events/:id/chat/ws?token=<jwt>`.
2. API worker authenticates the JWT, verifies chat access (host or `going` RSVP), then forwards the connection to the per-plan `ChatRoom` Durable Object.
3. When a message is sent via `POST /events/:id/chat`, the API inserts it into the database, then POSTs to the Durable Object's `/broadcast` endpoint.
4. The Durable Object relays the message payload to all connected WebSocket clients.
5. If the WebSocket connection drops, the frontend falls back to REST polling (`GET /events/:id/chat`) with exponential backoff reconnection attempts.

The Durable Object uses the Hibernation API so idle connections consume no CPU. The `ChatRoom` class is defined in `api/src/ChatRoom.ts` and bound as `CHAT_ROOM` in `api/wrangler.toml`.

Access control:
- Host can always access chat.
- Participants with `going` RSVP can access chat.
- Non-participants, `maybe`, and `cant_make_it` statuses cannot access chat.
- If a user leaves or is removed, they lose chat access.

Unread tracking:
- `event_chat_reads` table stores `last_read_at` per user per event.
- `GET /events/mine` includes a `has_unread_chat` flag (subquery comparing last message time to last read time).
- `EventCard` on the Your Plans page shows a small primary-colored dot when `hasUnreadChat` is true.
- Chat view includes a "new messages" divider for unread messages.

**Unread chat notifications:**

- **Bell icon:** `GET /notifications` returns an `unreadChats` array derived from `event_chat_messages` and `event_chat_reads`. These are not persisted as notification rows; they are computed at query time. The bell UI renders them as separate entries above regular notifications.
- **Daily email digest:** The hourly Cron Trigger (`0 * * * *` UTC) includes the daily unread-chat digest handler, which queries for users with unread chat messages in plans they are part of (host or going RSVP). It checks the `unread_chat_digest` preference, enforces a 23-hour cooldown via `user_profile.chat_digest_sent_at` (migration 037), and sends via Postmark template 43975299. The email lists up to 10 plans with unread counts and direct links.

**Plan lock (host-controlled):**

The host can lock a plan to prevent new participants from joining. This stabilizes the attendee list and chat access.

- `POST /events/:id/lock` toggles `locked_at` on the event (host only).
- When locked: new RSVPs are rejected with `EVENT_LOCKED` error; existing participants can still change their RSVP status.
- UI shows a "Locked" chip in the header and chat section; RSVP buttons are disabled for non-participants with an explanatory message.
- Explanatory text below the lock button helps the host understand the feature.

**Request to join (host approval required):**

Hosts can enable `require_approval` on a plan, requiring non-invited users to submit a join request before being added. Invited users bypass this and can RSVP normally.

- `event_join_requests` table tracks each request with status (`pending`, `approved`, `declined`), requester message, host response message, and timestamps.
- Unique partial index `(event_id, user_id) WHERE status = 'pending'` prevents duplicate active requests.
- On approval, the requester is automatically added to the plan as Going (subject to seat capacity).
- Three Postmark email templates: request submitted (to host, template 43906440), approved (to requester, template 43906609), declined (to requester, template 43906703).
- In-app notification types: `join_request` (to host), `join_request_approved` (to requester), `join_request_declined` (to requester).
- UI: plan details shows "Request to join" CTA with optional message for non-invited users; shows request status (pending/approved/declined) after submission; host sees a "Join requests" review section with approve/decline actions and optional response message.
- Plan header shows an "Approval required" badge when enabled.
- Setting available in both create and edit plan forms.

**In-app notification types created:** `event_invite`, `event_rsvp`, `event_alt_time`, `event_updated`, `event_locked`, `event_canceled`, `join_request`, `join_request_withdrawn`, `join_request_approved`, `join_request_declined` (see In-app notifications section above).

**Active event email templates:**

| Email | Template ID / Env var | Gated by preference |
|-------|----------------------|---------------------|
| Event invite | `POSTMARK_TEMPLATE_RSVP` | `event_invite` |
| Plan changed/locked/canceled (attendee) | `POSTMARK_TEMPLATE_EVENT_CHANGED` (43971187) | `event_changed_canceled` |
| Someone is going | Template 43922675 | `host_join` |
| Someone is maybe | Template 43922237 | `host_maybe` |
| Someone can't make it | Template 43921920 | `host_leave` |
| Attendee removed by host | Template 43923102 | `attendee_removed` |
| Join request received | Template 43906440 | `join_request_received` |
| Join request accepted | Template 43906609 | `join_request_accepted` |
| Join request declined | Template 43906703 | `join_request_declined` |
| Unread chat digest (daily) | `POSTMARK_TEMPLATE_UNREAD_CHAT_DIGEST` (43975299) | `unread_chat_digest` |
| Confirmation request | `POSTMARK_TEMPLATE_CONFIRMATION_REQUEST` (43984465) | `attendance_confirmation` |
| Plan at risk (host) | `POSTMARK_TEMPLATE_PLAN_AT_RISK` (43984947) | — (always sent to host) |

All emails with a notification preference toggle include a tokenized unsubscribe link in the footer. The unsubscribe endpoint (`POST /email/unsubscribe`) verifies a JWT containing the user ID and preference key, then disables that preference.

**Remaining scaffolded templates (noop if template ID not configured):**

| Email | Env var | Template model |
|-------|---------|----------------|
| Event reminder (24h) | `POSTMARK_TEMPLATE_EVENT_REMINDER` | recipientName, eventTitle, eventDate, eventLocation, eventUrl |
| RSVP update to host (legacy) | `POSTMARK_TEMPLATE_EVENT_RSVP_UPDATE` | hostName, attendeeName, eventTitle, rsvpStatus, eventUrl |

**Web pages:**

| Route | Component | Description |
|-------|-----------|-------------|
| `/` (logged out) | `LandingPageContent` + `PublicExploreFeed` | Landing page with hero, brand positioning, features — includes an embedded public Explore feed showing real public plans via `GET /events/explore/public`. Search and time filtering. Signup/login CTAs. Clicking a plan navigates to the public plan details view. |
| `/` (logged in) | `DashboardHome` | Explore page — personalized discovery feed with search, time chips, sort options (upcoming / newest), personalization toggle, distance/hobby filters, location-aware ordering, session state persistence via `localStorage`, location nudge, contextual empty states |
| `/events/create` | `CreateEventClient` | "Start a plan" form — title, description, hobby, seats, date/time, location (in-person/online), visibility, invite people, gradient banner preset picker with auto-suggestion, attendance assurance config (enable/disable, min attendees, fallback policy), publish |
| `/plans` | `PlansPage` | Tabbed view (Upcoming / Past) with hosted/joined sections, real API data, empty states |
| `/events/[id]` | `EventDetailClient` | Event detail — RSVP actions, alternate time suggestions with best-start-times overlap display, attendee list with confirmation status, attendance assurance confirmation UI, participant chat (real-time via WebSocket), lock/unlock (host), cancel (host), edit plan (host) |

**Banner system:** `web/src/lib/eventBanners.ts` defines `BANNER_PRESETS` (named gradient slugs with hobby keyword mapping). `getGradientForEventId` provides a deterministic fallback gradient for cards with no `banner_key`. `renderBannerPreset` renders a preset to a WebP `Blob` via canvas for upload. `suggestPreset` picks a preset based on hobby keywords.

**Attendance Assurance (implemented):**

The Attendance Assurance system is a two-stage commitment flow built on top of RSVP. When enabled by the host (`require_reconfirmation = true`), it opens a confirmation window 24 hours before the event and asks all "going" attendees (including the host) to confirm their attendance.

- **Confirmation lifecycle:** `pending` → `confirmed` | `declined` | `expired`. Distinct from RSVP status — RSVP history is preserved.
- **Host configuration:** min confirmed attendees (includes host), fallback policy (`proceed` / `notify_host` / `auto_cancel`).
- **Cron processing (hourly):** Sends initial confirmation requests 24h before, follow-up reminders at 12h and 3h, processes cutoff 2h before event.
- **Email flow:** Confirmation request emails with secure one-click confirm/decline links (JWT-based). Plan-at-risk emails to hosts when minimum not met.
- **In-app confirmation:** Logged-in users can confirm/decline directly on the plan details page when the confirmation window is open.
- **Viability display:** Plan details page shows real-time confirmation status, viability assessment, and per-attendee confirmation state in the "Who's in" section.
- **RSVP integration:** Changing RSVP to "Can't make it" automatically sets confirmation to declined. Changing to "Going" during an open window creates a pending confirmation.

**Attendance Record (implemented):**

Public profile section showing five reliability metrics computed from real event and RSVP data:

1. **Follow-through rate** — of committed plans that occurred, how many did the user attend
2. **Confirmation rate** — of plans requiring confirmation, how often did the user respond
3. **Plans attended** — count of completed plans attended
4. **Plans hosted** — count of completed plans organized
5. **Host completion rate** — of hosted plans, how many went ahead

Uses `committed_at` on `event_rsvps` (migration 041) for accurate commitment tracking. New/low-history users see "Building history" treatment with underlying sample counts. Endpoint: `GET /public/users/:userId/attendance-record`.

**Plan Feedback / Matching Quality System (implemented — Phase 1):**

Post-plan feedback allows attendees and hosts to leave lightweight, optional feedback about each other after a plan has passed. This is the foundation for a future chum preferences / compatibility system.

*Hidden Metrics (per user, stored in `user_metrics`):*

| Metric | Definition | Weighting guidance |
|--------|-----------|-------------------|
| **Reliability** | Can this person be counted on to follow through? | Moves quickly — no-shows and very late cancellations matter immediately; positive follow-through recovers more slowly. |
| **Sociability** | Does this person make social interaction comfortable and enjoyable? | Moves gradually — subjective, relies on repeated signals. |
| **Presentation** | Does this person show up with basic hygiene and in-person consideration? | Moves cautiously but firmly — sensitive area, but repeated negative signals should matter. |
| **Hosting Skills** | Does this person run plans that respect people's time and create a good experience? | Only moves from hosted-plan feedback. |
| **Match Quality** | Was this a good match for the reviewer personally? | Per-pair signal, not an absolute score. |

All metrics use a 0–100 scale, starting at 50 (neutral). `signal_count` tracks how many feedback signals contributed.

*Feedback prompts (3-point scale: Agree / Maybe / Disagree):*

- Followed through reliably → Reliability
- I'd spend time with them again → Sociability
- Showed personal care → Presentation
- Good match for me → Match Quality
- I'd join their plans again → Hosting Skills (host-only prompt)

*Separate layers (not part of normal feedback):*

- **Attendance issues** — structured reports: no-show, cancelled too late, arrived very late. Stored in `attendance_issues`.
- **Conduct / Safety reports** — structured reasons: rude/aggressive, harassment, boundary issue, discriminatory, unsafe/intoxicated, disruptive, property damage, other. Stored in `conduct_reports`. Treated separately from normal scoring; serious issues may require moderation/review behavior later.

*API endpoints:*

| Endpoint | Purpose |
|----------|---------|
| `GET /events/:id/feedback` | Existing feedback by this user + eligible attendees list |
| `POST /events/:id/feedback` | Submit/update feedback entries (batch) |
| `POST /events/:id/attendance-issue` | Report attendance problem |
| `POST /events/:id/conduct-report` | Report conduct/safety concern |

*Email:* Post-plan feedback reminder email sent ~3 hours after plan start time via the hourly cron handler. Uses Postmark template 44091936. One email per plan (tracked via `events.feedback_email_sent_at`). Sent to host + going RSVPs.

*UI:* Collapsible "How did it go?" section appears on the plan detail page for past, non-canceled plans where the viewer is a participant. Compact per-person cards with toggle-button feedback prompts. Attendance issues and conduct reports use separate dialogs.

*Future direction (documented, not implemented):*

- Users will have **chum preferences** defining minimum acceptable metric thresholds.
- Plans may inherit default chum preference strictness from the creator.
- Plan creators may override strictness per-plan.
- By default the platform remains broadly open; over time users set firm boundaries for who they are matched with.
- Metric aggregation/update logic (applying feedback responses to `user_metrics` scores) is not yet implemented — Phase 1 captures the data foundation.

*Schema (migration 049):* `plan_feedback`, `attendance_issues`, `conduct_reports`, `user_metrics` tables + `events.feedback_email_sent_at` column.

**Not yet implemented:** recurring events.

### Signup and onboarding

Account creation is a multi-step wizard for both standard email/password and Google OAuth paths.

**Standard signup (`/signup`):** 4-step flow — (1) email, password, confirm password, legal acceptance checkbox → (2) username, date of birth → (3) hobbies (optional, skip available) → (4) location + travel distance (optional, skip available). Legal acceptance (Terms of Use and Privacy Policy) is required before proceeding. All data is submitted in a single `POST /auth/signup` call, which accepts optional `interest_slugs`, `home_city`, `home_lat`, `home_lng`, `travel_radius_km`, `accepted_terms_version`, `accepted_privacy_version`.

**Google OAuth onboarding (`/onboarding/username`):** 3-step flow — (1) username, date of birth → (2) hobbies (optional) → (3) location + travel distance (optional). Legal acceptance checkbox is required on the signup page before the OAuth redirect; acceptance data is stored in `sessionStorage` and recorded via `POST /auth/record-legal-acceptance` after authentication. Username/DOB submitted via existing `POST /user/username` + `POST /user/date-of-birth`; hobbies and location submitted via `PUT /profile`.

Shared UI components: `OnboardingProgress` (step indicator + progress bar), `StepTransition` (animated slide transitions), `HobbiesStep` (interest search + chip selection), `LocationStep` (Places autocomplete + travel distance select). All live in `web/src/components/onboarding/`.

**Interest resolution helper:** `resolveInterestSlugs` is extracted in `api/src/index.ts` — validates interest slugs, resolves merged interests, and returns resolved IDs. Used by both `POST /auth/signup` and `PUT /profile`.

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
| `LandingFooter` | `web/src/components/landing/LandingFooter.tsx` | Logo + tagline, links to How it Works / Safety Center / Science of Friendship / Contact, legal links (Terms of Use, Privacy Policy), copyright. |
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
| Homepage | `/` | `LandingPageContent.tsx` | Hero (organize and join hobby-based plans), examples section (mock plans + category filter), "why it helps" feature blocks, "social upside" benefit cards, CTA. Logged-in users see `DashboardHome` instead. |
| How it Works | `/how-it-works` | `HowItWorksContent.tsx` | 6-step product walkthrough, "made for real plans" section with coordination mock panel, friends + new connections cards, discovery mock panel, trust/comfort section, CTA. |
| Science of Friendship | `/science-of-friendship` | `ScienceOfFriendshipContent.tsx` | Research-backed trust page. Interactive friendship-engine diagram, timeline visualization, two-column research cards, CTA. |
| Safety Center | `/safety-center` | `SafetyCenterContent.tsx` | Community guidance. Confidence checklist, gathering tips, respect/comfort cards, "if something feels off" section, reporting link, CTA. Hero image (Jenga.jpg). |
| Terms of Use | `/terms` | `TermsContent.tsx` | Legal terms of use. Rendered via shared `LegalPageContent` component. |
| Privacy Policy | `/privacy` | `PrivacyContent.tsx` | Privacy policy. Rendered via shared `LegalPageContent` component. |

### Design system patterns (public pages)

- **Section spacing:** `SECTION_SPACING = { py: { xs: 5, sm: 8, md: 10 } }`; `CONTENT_MAX_WIDTH = 800` (widened to 1100 for discovery grids).
- **Full-bleed backgrounds:** Sections use `mx: { xs: -2, sm: -3 }, px: { xs: 2, sm: 3 }` to extend beyond `LandingContainer` gutters.
- **Alternating backgrounds:** white → `grey.100` → white → `grey.50` → `primary.dark` CTA.
- **Card styles:** Top-border accent cards (`borderTop: 3px solid`, `borderRadius: 2`, paper background, light shadow). Outlined lift cards (hover `translateY(-4px)`).
- **CTA section:** `primary.dark` background, gold `secondary.main` 3px top stripe via `::before`, white text, numbered step circles, `contained color="secondary"` button.
- **Responsive:** Mobile = centered text/stacked layout; `sm`+ = left-aligned/row. Consistent `textAlign: { xs: "center", sm: "left" }` and `alignSelf: { xs: "center", sm: "flex-start" }` across all sections.
- **Hero pattern:** Eyebrow (overline, gold) → H1 (800 weight) → gold accent bar (48×3px) → subtext → CTA buttons.
- **Button styling:** `borderRadius: 2.5`, `textTransform: "none"`, subtle `boxShadow` on CTA buttons.

### Copy and design conventions (public pages)

- **Group chat framing:** Homepage and How it Works copy no longer reference "no group chat" or "without group chat chaos." The product plans to create group chats. Copy focuses on clarity, follow-through, and low-pressure coordination.
- **CTAs:** "Sign up" (not "Sign up free" or "Sign up for free").
- **Event cards (homepage):** Use 72px gradient banner strips at the top (colored by category), matching the in-app `EventCard` design.
- **Screenshot placeholders:** Strategic `Box` placeholders with dashed borders and "Screenshot placeholder" labels are used in `LandingPageContent.tsx` and `HowItWorksContent.tsx` (Explore view, Event details view, Create a plan view, Your Plans view). Reuse the Safety Center pattern when replacing with real screenshots.

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
- `user_profile.notification_prefs` (JSONB, migration 012; cleaned by migration 033) — per-notification-type enabled toggle
- `users.is_hidden_from_search`, `users.is_hidden_from_external_indexing` (boolean, migration 013) — privacy toggles
- `users.is_hidden_age` (boolean, migration 014) — when true, age is not shown on public profile; default false
- `users.role` (TEXT NULL, migration 015) — user role; `super_admin` unlocks admin features
- `interests.is_deleted`, audit columns (migration 015) — soft-delete + audit trail for admin moderation
- `interests.merged_into_interest_id` (UUID NULL, migration 016) — merge target for deleted/duplicate interests
- `users.is_suspended`, `suspended_at`, `suspended_by_user_id`, `suspension_reason` (migration 017) — account suspension; indexed on `is_suspended = true`
- `users.gender` (TEXT NULL, migration 018) — allowed values: `male`, `female`, `other`, `prefer_not_to_say`; suppressed on public profile if `prefer_not_to_say` or null
- `users.profile_theme` (TEXT NULL, migration 019) — controls accent color of the identity card on the public profile; allowed values: 16 curated palette keys defined in `web/src/lib/profileTheme.ts`
- `users.is_hidden_chum_list`, `users.is_hidden_from_chum_lists` (boolean, migration 020) — Chums privacy toggles; both default false
- `newchums.user_chums` (migration 021) — **legacy**, replaced by `user_contacts` (migration 048). Retained temporarily as a safety net. One-way Chum relationships; columns: `id`, `user_id`, `chum_user_id`, `created_at`; unique constraint on `(user_id, chum_user_id)`.
- `newchums.user_contacts` (migration 048) — two-part connection model replacing `user_chums`. Columns: `id` (UUID PK), `user_id` (FK), `type` (`'on_newchums'` or `'private'`), `linked_user_id` (FK, required for `on_newchums`), `contact_email`, `contact_name`, `note`, `created_at`. Unique indexes: `(user_id, linked_user_id)` WHERE linked; `(user_id, LOWER(contact_email))` WHERE private+unlinked. Auto-linking index on `LOWER(contact_email)` for promoting private contacts when they create accounts.
- `newchums.notifications` (migration 022) — general notifications table; columns: `id`, `user_id`, `type`, `actor_user_id`, `entity_id`, `metadata` (JSONB), `read_at`, `created_at`; indexed for unread queries
- `newchums.chum_invites` (migration 023) — invite records for emails not yet on NewChums; columns: `id`, `inviter_user_id`, `invitee_email`, `token_hash`, `status` (`pending`/`accepted`/`expired`), `expires_at` (30 days), `accepted_at`, `accepted_user_id`, `created_at`; unique index on `token_hash`; indexed on `(invitee_email, status)` and `inviter_user_id`
- `newchums.events` (migration 024) — core event entity; columns include `host_user_id`, `title`, `description`, `interest_id` (legacy FK, being superseded by event_interests), `starts_at`, `location_type`, `location_name`, `location_address`, `location_lat`, `location_lng`, `online_link`, `max_seats`, `visibility`, `status`, `allow_alt_times`, `banner_key`, `require_reconfirmation` (migration 028), `locked_at` (migration 029), `created_at`, `updated_at`
- `newchums.event_interests` (migration 025) — junction table for event ↔ interest many-to-many; events can link to multiple hobbies
- `newchums.event_invites` (migration 024) — invite records supporting both user_id and email invitees
- `newchums.event_rsvps` (migration 024) — RSVP responses; one per user per event; status: `going`, `maybe`, `cant_make_it`
- `newchums.event_alt_times` (migration 024) — alternate time suggestions from attendees
- `newchums.user_chums.note` (migration 027) — **legacy**, notes are now on `user_contacts.note`. `TEXT NULL` column on `user_chums` for private per-chum notes.
- `newchums.events.require_reconfirmation` (migration 028) — `BOOLEAN NOT NULL DEFAULT FALSE` on `events`; when true, signals that attendees should receive a 24-hour reconfirmation reminder (email/cron trigger is future work)
- `newchums.event_chat_messages` (migration 029) — per-plan chat messages; columns: `id` (UUID PK), `event_id` (FK), `user_id` (FK), `body` (TEXT NOT NULL), `created_at`; indexed on `(event_id, created_at ASC)`
- `newchums.event_chat_reads` (migration 029) — last-read tracking; columns: `event_id`, `user_id`, `last_read_at`; PK `(event_id, user_id)`
- `newchums.events.locked_at` (migration 029) — `TIMESTAMPTZ NULL` on `events`; when set, prevents new participants from joining; existing participants and host retain access
- `newchums.events.require_approval` (migration 030) — `BOOLEAN NOT NULL DEFAULT FALSE`; when true, non-invited users must request to join and be approved by the host
- `newchums.event_join_requests` (migration 030) — join request records; columns: `id` (UUID PK), `event_id` (FK), `user_id` (FK), `status` (pending/approved/declined), `message` (TEXT NULL), `host_message` (TEXT NULL), `decided_at` (TIMESTAMPTZ NULL), `created_at`; unique partial index on `(event_id, user_id) WHERE status = 'pending'`
- `newchums.host_attendee_removals` (migration 034) — tracks host-initiated attendee removals; columns: `event_id`, `host_user_id`, `removed_user_id`, `status_at_removal`, `created_at`
- `newchums.event_rsvps` guest columns (migration 035) — `user_id` made nullable, added `guest_email TEXT NULL`, `guest_name TEXT NULL`, partial unique index on `(event_id, guest_email)` for guest rows
- `newchums.user_profile.chat_digest_sent_at` (migration 037) — `TIMESTAMPTZ NULL`; tracks when the daily unread-chat digest email was last sent to each user, enforcing once-per-day sending
- `newchums.events` attendance assurance columns (migration 039) — `min_confirmed_attendees INT NULL`, `confirmation_window_hours INT NOT NULL DEFAULT 24`, `confirmation_cutoff_hours INT NOT NULL DEFAULT 2`, `fallback_policy TEXT NOT NULL DEFAULT 'proceed'`, `confirmation_sent_at TIMESTAMPTZ NULL`, `cutoff_processed_at TIMESTAMPTZ NULL`
- `newchums.event_confirmations` (migration 039) — final attendance confirmation records; columns: `id` (UUID PK), `event_id` (FK), `user_id` (FK), `status` (pending/confirmed/declined/expired), `responded_at`, `reminder_count`, `last_reminder_at`, `created_at`, `updated_at`; unique constraint on `(event_id, user_id)`
- `newchums.users` legal acceptance columns (migration 040) — `accepted_terms_version TEXT NULL`, `accepted_privacy_version TEXT NULL`, `accepted_legal_at TIMESTAMPTZ NULL`
- `newchums.event_rsvps.committed_at` (migration 041) — `TIMESTAMPTZ NULL`; records when a user first committed (RSVP'd going) for accurate follow-through tracking; backfilled from `created_at` for existing going RSVPs; indexed on `(user_id, committed_at)` where not null
- `newchums.events.allow_attendee_invites` (migration 042) — `BOOLEAN NOT NULL DEFAULT true`; when true, Going attendees can invite others to the plan; host can toggle at any time via `POST /events/:id/toggle-attendee-invites`
- `newchums.event_alt_times` guest support (migration 043) — `user_id` made nullable, added `guest_email TEXT NULL`; mirrors event_rsvps guest pattern; allows unauthenticated invitees to suggest alternate times via invite token
- `newchums.plan_feedback` (migration 049) — per-attendee feedback responses. Columns: `id` (UUID PK), `plan_id` (FK), `reviewer_user_id` (FK), `reviewee_user_id` (FK), `prompt` (reliability/sociability/presentation/match_quality/hosting_skills), `response` (agree/maybe/disagree), `created_at`. Unique on `(plan_id, reviewer_user_id, reviewee_user_id, prompt)`.
- `newchums.attendance_issues` (migration 049) — structured attendance problem reports. Columns: `id` (UUID PK), `plan_id` (FK), `reporter_user_id` (FK), `reported_user_id` (FK), `issue_type` (no_show/late_cancel/very_late), `created_at`. Unique on `(plan_id, reporter_user_id, reported_user_id, issue_type)`.
- `newchums.conduct_reports` (migration 049) — safety/behavioral concern reports. Columns: `id` (UUID PK), `plan_id` (FK), `reporter_user_id` (FK), `reported_user_id` (FK), `reason`, `details` (TEXT NULL), `created_at`.
- `newchums.user_metrics` (migration 049) — aggregated hidden quality scores. Composite PK `(user_id, metric)`. Columns: `score` (NUMERIC(5,2), default 50.00), `signal_count` (INT, default 0), `updated_at`.
- `newchums.events.feedback_email_sent_at` (migration 049) — `TIMESTAMPTZ NULL`; tracks when feedback reminder email was sent for a plan.

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
- Durable Objects: `[[durable_objects.bindings]]` binds `CHAT_ROOM` → `ChatRoom` class; `[[migrations]]` tag `v1` with `new_classes = ["ChatRoom"]`
- Cron Triggers: `[triggers] crons = ["0 * * * *"]` — hourly; processes attendance assurance, daily unread-chat digest, event match digest, and post-plan feedback emails
- Vars include `POSTMARK_TEMPLATE_UNREAD_CHAT_DIGEST`, `POSTMARK_TEMPLATE_EVENT_CHANGED`, `POSTMARK_TEMPLATE_CONFIRMATION_REQUEST`, `POSTMARK_TEMPLATE_PLAN_AT_RISK`, `POSTMARK_TEMPLATE_PLAN_FEEDBACK`, and other template IDs

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
- Account deletion (`DELETE /account`) does not yet cascade to events, event_rsvps, event_invites, event_alt_times, event_chat_messages, event_chat_reads, event_join_requests, event_confirmations, or host_attendee_removals — must be updated when those tables accumulate production data.
- `interest_id` on `events` is a legacy FK; `event_interests` is the canonical many-to-many source of truth. The legacy column should be dropped in a future migration once all queries are migrated.
- Legacy scaffolded email env vars (`POSTMARK_TEMPLATE_EVENT_RSVP_UPDATE`, `POSTMARK_TEMPLATE_EVENT_REMINDER`) can be removed once confirmed unused.
