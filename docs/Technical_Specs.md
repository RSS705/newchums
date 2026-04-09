# Technical Specifications

Last Updated: March 24, 2026
Version: 15.0

This document defines the authoritative technical architecture of NewChums.
It describes **what exists today** and the structural commitments we are making.

---

## 1) Product Context

NewChums helps people organize gatherings more easily around hobbies and shared interests.

**Current positioning:**
- Primary: start, share, and join hobby-based plans nearby, a practical tool for organizing real-world gatherings.
- Secondary: reduces follow-through friction, clear invites, easy RSVPs, one place for updates.
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
| Analytics | Google Analytics (gtag.js) | Production |
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
5. Observability (Sentry/Axiom/Google Analytics) remains enabled.
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

**Admin web pages:** `/admin/interests` (interests moderation) and `/admin/chums` (user account management + suspension). Server components check `role = 'super_admin'` and return 404 for non-admins.

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

- `POST /auth/signup`, accepts optional `interest_slugs[]`, `home_city`, `home_lat`, `home_lng`, `travel_radius_km` for multi-step signup; accepts `accepted_terms_version`, `accepted_privacy_version` for legal acceptance recording
- `POST /auth/password-reset/request`
- `POST /auth/password-reset/confirm`
- `POST /auth/email-verify/request`
- `POST /auth/email-verify/confirm`
- `GET /auth/email-verify/status`
- `POST /account/email-change/request`
- `POST /account/email-change/confirm`
- `POST /account/password-change` (auth required; credentials users only)
- `DELETE /account` (auth required), hard delete account and all related data; credentials users must send `{ password }` in body
- `GET /notification-preferences` (auth required), returns persisted notification prefs
- `PUT /notification-preferences` (auth required), saves notification prefs (JSONB on user_profile)
- `POST /auth/record-legal-acceptance` (auth required), records legal acceptance for OAuth users post-authentication. Accepts `accepted_terms_version`, `accepted_privacy_version`. Only sets values if not already recorded (uses `COALESCE` to avoid overwriting).
- `POST /email/unsubscribe`, verifies a signed JWT (containing `userId` and `prefKey`), disables the corresponding notification preference. Used by tokenized unsubscribe links in email footers.

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
| `feedback_requests` | Post-plan feedback | `POSTMARK_TEMPLATE_PLAN_FEEDBACK` (template 44091936) |
| `event_changed_canceled` | Plan canceled or changed | `POSTMARK_TEMPLATE_EVENT_CHANGED` (template 43971187) |
| `attendee_removed` | You were removed from a plan | Template 43923102 |
| `product_announcements` | Product updates | N/A |
| `unread_chat_digest` | Unread messages in your plans | `POSTMARK_TEMPLATE_UNREAD_CHAT_DIGEST` (template 43975299) |
| `attendance_confirmation` | Attendance confirmation reminders | `POSTMARK_TEMPLATE_CONFIRMATION_REQUEST` (template 43984465) |
| `plan_feedback` | Post-plan feedback reminders | `POSTMARK_TEMPLATE_PLAN_FEEDBACK` (template 44091936) |

**Non-preference transactional emails (no toggle):**

| Purpose | Postmark template |
|---------|-------------------|
| Guest verification code (public RSVP) | `POSTMARK_TEMPLATE_GUEST_VERIFY` (template 44041128) |

Defaults are applied at account creation (credentials signup, OAuth) and backfilled for existing users with missing keys. GET normalizes stored prefs and optionally persists backfilled values.

**Event match digest (batch):** The hourly `scheduled` handler runs `processEventMatchDigest` after the unread-chat digest block. Recipients must have `event_match` enabled, a home location, and meet the same in-person / future / not-full / travel-radius / “new since last digest” gates as for public plans. **Public** plans require at least one overlapping hobby between the user and the plan. **Chums-only** plans use the **same** hobby overlap and distance rules; additionally the recipient must appear on the **host’s** On NewChums connections (`user_contacts`: host `user_id`, recipient `linked_user_id`, `type = 'on_newchums'`). **Invite-only** plans are excluded. **Already-connected suppression:** plans are excluded from a recipient's digest if they already have any `event_rsvps` row for that plan (any status: `going` / `maybe` / `cant_make_it`) or any `event_invites` row matched by `user_id` or by `LOWER(email) = LOWER(users.email)` (so a legacy email-only invite created before the recipient signed up still counts). The intent is that the digest is "new plans you're not yet involved with", not a second outreach channel for plans the recipient was already invited to or interacted with.

**Chum preference filtering (digest, implemented):** After the SQL query selects candidate (recipient, plan) pairs, a two-directional chum preference check runs before emails are sent:
1. **Viewer→host:** Does the host's metrics meet the recipient's chum preference thresholds (including hosting quality)? If not, the plan is excluded from this recipient's digest.
2. **Host→viewer:** Does the recipient's metrics meet the host's chum preference thresholds? If not, the plan is excluded (the host doesn't want this person matched to their plan).
Both checks use the centralized `evaluateChumPreferences` helper with `PREF_THRESHOLDS` (open=0, preferred≥35, important≥45, required≥55) against `user_metrics` scores (baseline 50). Users with preferences disabled or at "open" for all metrics pass all checks. If all plans for a user are filtered out, no digest email is sent for that user. **Plan-level overrides** are respected: if a plan has `pref_overrides` set, `resolveEffectiveHostPrefs` merges them with the host's global preferences before the host→viewer check (e.g. fully disabled or specific metrics bypassed).

Each RSVP status has a dedicated host notification email, each gated on its own preference toggle. Each email includes a tokenized unsubscribe link that toggles the corresponding preference. Migration 033 removes the obsolete `event_reminders` key and `frequency` fields from existing JSONB data.

### Postmark email templates (Mustachio)

Postmark uses **Mustachio** (a Mustache variant) for template rendering. Key rules for conditional sections:

**Empty strings are truthy.** In Mustachio, `""` is treated as truthy inside `{{#variable}}` blocks. This means `{{#someField}}...{{/someField}}` will render even when `someField` is `""`. To hide a conditional section when there is no value, pass `null` (not `""`) from the API code.

**Correct pattern for optional content blocks:**
- API code: pass the raw value (`null` when absent, the string when present). Do **not** coerce with `|| ""`.
- Template: use `{{#variable}}` as the section guard and `{{.}}` to render the value inside the block.
- Reference implementation: template 43906440 (`joinRequestToHost.html`), which conditionally shows a requester message.

```
// API (correct)
TemplateModel: { hostMessage }          // null when empty

// API (WRONG - will render the section with empty content)
TemplateModel: { hostMessage: hostMessage || "" }

// Template (correct)
{{#hostMessage}}
  <p>"{{.}}"</p>
{{/hostMessage}}

// Template (also works but less canonical inside a section)
{{#hostMessage}}
  <p>"{{hostMessage}}"</p>
{{/hostMessage}}
```

Local HTML copies of all Postmark templates are stored in `api/src/email/templates/` for reference. When updating a template, update both the local file and the Postmark dashboard.

### Host attendee removal

Hosts can remove attendees with status "going" or "maybe" from their plans via `POST /events/:id/remove-attendee`. The endpoint requires authentication and verifies the caller is the plan host. It:

1. Deletes the attendee's RSVP row from `event_rsvps`
2. Records the removal in `newchums.host_attendee_removals` (migration 034) for future host quality metrics, moderation review, and trust scoring
3. Sends a notification email to the removed user (Postmark template 43923102)

The `host_attendee_removals` table tracks: `event_id`, `host_user_id`, `removed_user_id`, `status_at_removal`, and `created_at`. Hosts cannot remove themselves or attendees with "can't make it" status (since they're already not attending).

### Guest RSVP for email-only invitees

When a host invites someone by email who does not have a NewChums account, that person can still RSVP and view the plan without signing up. The flow works via the invite token (JWT, 30-day expiry) embedded in the invite email.

**How it works:**
- `POST /events/:id/email-rsvp`, accepts `invite_token` (invite flow) or `participation_token` (public RSVP flow). When the token's email has no matching user account, a guest RSVP is created with `user_id = NULL` and `guest_email` set. The guest can change their RSVP using on-page buttons. Public RSVP tokens are only accepted for public-visibility events and skip the invite-record check.
- `GET /events/:id`, accepts an optional `invite_token` or `participation_token` query param. A valid token grants read access (invite tokens additionally grant access to invite-only and chums-only events). The response includes `guestInvite: true` and `guestRsvpStatus` so the frontend can render appropriate UI.
- The invite email's "View plan" link includes the invite token, so guests can revisit the plan page from the email at any time during the 30-day token window.
- Guest RSVPs appear in the attendee list with their email as the display name and no avatar.
- Migration 035 adds `guest_email TEXT NULL` and `guest_name TEXT NULL` to `event_rsvps` and makes `user_id` nullable, with a partial unique index on `(event_id, guest_email)` for guest rows.
- Host notification emails are sent for guest RSVPs the same way as for registered users.

### Public plan participation (share-link RSVP without account)

Visitors without an account can RSVP to **public** plans via a share link. The flow uses email verification to establish identity without requiring full account creation.

**How it works:**
1. `POST /events/:id/public-rsvp/request-code`, visitor submits their email. If the email belongs to an existing account, the response returns `{ existing_account: true }` and the frontend prompts sign-in. Otherwise, a 6-digit code is emailed and a **challenge token** (JWT, 10-minute expiry, HMAC-signed code digest) is returned.
2. `POST /events/:id/public-rsvp/confirm-code`, visitor submits the code + challenge token. On success, a **participation token** is issued (JWT, 30-day expiry, purpose `public_rsvp`) containing `eventId`, `email`, and optional `name`.
3. `POST /events/:id/email-rsvp`, accepts `{ participation_token, status, guest_name? }` in addition to the existing `invite_token` flow. Creates or updates a guest RSVP (`user_id = NULL`, `guest_email` set) the same way as email-invite guests.
4. `GET /events/:id`, accepts `participation_token` query param (same as `invite_token`). Grants read access and returns guest RSVP status.
5. `POST /events/:id/guest-alt-time`, accepts `participation_token` (requires existing RSVP rather than invite record).

**Security:**
- Challenge token uses HMAC digest so the 6-digit code cannot be extracted from the JWT.
- 10-minute expiry + Cloudflare infrastructure-level rate limiting make brute force impractical (no server-side state needed).
- Participation token mirrors invite token structure but with purpose `public_rsvp`; only accepted for public-visibility events.

**Account linking:** When a user later creates an account with the same email and views the plan (`GET /events/:id`), orphaned guest records (RSVPs, invites, alt-times) are automatically adopted, same mechanism used for email-invite guests.

**Cross-event email pre-fill:** The frontend stores participation tokens in `localStorage` as `nc_pub_{eventId}`. When visiting a new public plan, any existing `nc_pub_*` entry provides email pre-fill (a new verification code is still required).

**Email template:** Postmark template 44041128 (`POSTMARK_TEMPLATE_GUEST_VERIFY`). Variables: `code`, `planTitle`, `productName`.

### Plan details viewer/access state model

The `GET /events/:id` endpoint returns an `accessState` field that determines how the frontend renders the plan details page. There are four states:

| State | Condition | Experience |
|-------|-----------|------------|
| `"public"` | No auth, no valid token | Limited preview: title, date, approximate location, attendance counts. CTA to sign in. |
| `"invite"` | No auth, valid invite/participation/share token | Full plan details with RSVP buttons, availability tools, attendee list. |
| `"authenticated"` | Logged in, not host, no RSVP | Full plan details with RSVP buttons. |
| `"attending"` | Logged in, is host or has RSVP | Full plan details with host/attendee controls. |

**Token types and persistence:**

| Token | Purpose | Created when | Expiry | Stored in |
|-------|---------|--------------|--------|-----------|
| `invite_token` | `invite_rsvp` | Host invites someone | 30 days | `localStorage` as `nc_inv_{eventId}` |
| `participation_token` | `public_rsvp` | Guest completes email verification | 30 days | `localStorage` as `nc_pub_{eventId}` |
| `share_token` | Share link access | Deterministic HMAC per event | None | URL only (deterministic) |

Invite and participation tokens are persisted in `localStorage` so that page reloads do not degrade the viewer's access state. When a token-backed API call returns `accessState: "public"` (indicating the token is expired/invalid), the localStorage entry is cleared.

**Approval-required plans and invited guests:**
- Invited guests (via `invite_token`) bypass the host-approval requirement. They can RSVP directly.
- The frontend gates this via `isGuestInvite` (true when the API returns `guestInvite: true`).
- The API also returns `isInvited: true` for token-based guest invitees (not just authenticated users).
- The "Approval required" tooltip adjusts for invited guests to say "no approval needed."

**Availability/alternate times for invited guests:**
- Invited guests can suggest alternate times via `POST /events/:id/guest-alt-time` using their invite token.
- Invite-token guests do not need to RSVP first to suggest times (unlike participation-token guests, who must RSVP first).
- The `canSuggest` check includes `isGuestInvite` and `participationTokenRef`, ensuring the form renders for all token-backed viewers.

**Email deep-linking (`?section=` query param):**
- Email CTAs can include `?section=feedback`, `?section=chat`, `?section=availability`, or `?section=attendees` to scroll the plan page to a specific section.
- The param is extracted on load, cleaned from the URL, and triggers `scrollIntoView` on a corresponding `id="plan-section-{name}"` anchor after event data renders.
- Auth-required sections are listed in `AUTH_REQUIRED_SECTIONS` (currently `feedback`, `chat`) at the top of `web/src/app/(app)/events/[id]/EventDetailClient.tsx`.
- If the section requires authentication and the visitor has no auth token, the events client redirects them to `/login?next=/events/{id}?section={name}` **before** calling the plan endpoint. This avoids landing on the public preview path (which has no feedback form) or a "Plan not found" fallback. After signing in, Auth.js returns the user to the same plan + section, and the existing `scrollIntoView` logic opens the right section automatically.
- Logged-in viewers continue to load the plan normally; the redirect only fires when `getAuthToken()` returns null.

> **Agent guidance:** Invite-token-backed viewers must be treated as a distinct state. Do not assume all non-authenticated viewers are generic public visitors. Any change to public plan details rendering should verify behavior across all four access states.

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
| `is_hidden_from_search` | Hide me from NewChums search and discovery | Enforced in `GET /chums/search`, users with this ON are excluded from both name/handle search AND exact email lookup in the Chum flow. Also blocks invite eligibility for their email (treated as "not found"). |
| `is_hidden_from_external_indexing` | Hide my profile from search engines | Public profile page emits `robots: noindex, nofollow`. |
| `is_hidden_age` | Hide my age | Age field is not shown on the public profile (even for logged-in viewers). |
| `is_hidden_chum_list` | Hide my connections from my public profile | When ON, the Connections section is not rendered on the user's public profile. Private contact lists are unaffected. |
| `is_hidden_from_chum_lists` | Hide me from appearing on other people's connection lists | When ON, the user is excluded from `GET /public/users/:handle/chums` responses. They still appear on private contact lists of users who have already added them. |

**Implementation notes:** UI: `web/src/app/(app)/settings/PrivacyToggleRow.tsx`, `SettingsClient.tsx`. API: `GET /profile` and `PUT /profile` in `api/src/index.ts`. Schema: migrations 013 (`is_hidden_from_search`, `is_hidden_from_external_indexing`), 014 (`is_hidden_age`), 020 (`is_hidden_chum_list`, `is_hidden_from_chum_lists`).

**Logged-out viewer privacy rules:**

Public profiles (`/u/[handle]`) are viewable by anyone, but logged-out visitors see a privacy-reduced version:

| Field | Logged-in viewer | Logged-out viewer |
|-------|-----------------|-------------------|
| Display name (real name) | Shown | Hidden, username shown instead |
| Username / handle | Shown | Shown (primary identity) |
| Age | Shown (unless `is_hidden_age`) | Hidden |
| Gender | Shown (unless `prefer_not_to_say`) | Hidden |
| Avatar | Shown | Shown |
| Bio | Shown | Shown |
| Hobbies | Shown | Shown |
| Chum Stats, Reliability | Shown | Hidden |
| Chum Stats, Activity | Shown | Shown |
| Connections | Shown | Shown |

Enforced at both API level (endpoints return redacted data when no bearer token is present) and UI level (components receive `viewerLoggedIn` prop). The `ProfileHeaderSection` renders the `@handle` as the primary heading for logged-out viewers to avoid redundancy.

### Profile, onboarding, and lookups

- `GET /profile`, `PUT /profile` (auth required). Response includes `role`, `gender`, `profile_theme`, `is_hidden_chum_list`, `is_hidden_from_chum_lists`, `userId`. `PUT /profile` validates `gender` (allowed: `male`, `female`, `other`, `prefer_not_to_say`) and `profile_theme` (allowed values defined in `web/src/lib/profileTheme.ts`). The `/profile` edit page includes the live Attendance Record section.
- `GET /public/users/:userId/attendance-record` (public), computes and returns attendance metrics for the specified user. **Auth-aware:** when a valid bearer token is present, returns all six metrics (Going follow-through, Shows up, Confirms attendance, plans attended, plans hosted, Host follow-through) plus member-since date. When unauthenticated, returns only activity metrics (plans attended, plans hosted) and member-since date; reliability metrics are zeroed out and a `reliabilityHidden: true` flag is included. Used by the `AttendanceRecordSection` component on profile pages.
- `GET /public/users/:handle` (public), returns public profile by handle. **Auth-aware:** when a valid bearer token is present, returns full profile including `displayName` (real name), `age`, and `gender`. When unauthenticated, `displayName` falls back to the username only, `age` is null, and `gender` is null. Always includes `profile_theme`, `is_hidden_chum_list`, `bio`, `hobbies`, `avatarUrl`. Age computed from DOB server-side; DOB never exposed.
- `GET /handles/available?handle=...` (auth required)
- `POST /user/username` (auth required)
- `POST /user/date-of-birth` (auth required)
- `GET /interests`, user-facing list; excludes soft-deleted interests (`WHERE is_deleted = false`).

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
  - Email: Postmark sends to `contact@newchums.com` from `contact@newchums.com`, Reply-To from form; subject line "NewChums: Contact, &lt;Subject&gt;"; includes Subject, Name, Email, Message, Timestamp, IP, Environment; if logged in, includes userId and username

### Admin, interests moderation (super_admin only)

All `/admin/*` routes require `role = 'super_admin'` on the requesting user, enforced server-side by a `requireSuperAdmin` helper in `api/src/index.ts`. Non-admins receive 403.

- `GET /admin/interests`, list all interests (including deleted). Query params: `q` (search name/slug), `sort=name|created_at`, `dir=asc|desc`. Returns: `id`, `name`, `slug`, `category`, `created_at`, `is_deleted`, `created_by_user_id`, `username` (joined from `users`).
- `GET /admin/interests/categories`, returns distinct non-empty category values from active interests. Used to populate the category combo-box in the admin edit dialog.
- `PATCH /admin/interests/:id`, update `name` and/or `category`. Records `updated_at` and `updated_by_user_id`.
- `DELETE /admin/interests/:id`, soft-delete: sets `is_deleted = true`, `deleted_at`, `deleted_by_user_id`. Also hard-deletes all `user_interests` rows for that interest (users are disconnected).
- `POST /admin/interests/:id/restore`, restore a soft-deleted interest: clears `is_deleted`, `deleted_at`, `deleted_by_user_id`.
- `POST /admin/interests/merge`, body: `{ sourceInterestId, targetInterestId }`. Moves all `user_interests` from source → target (deduplicating to avoid unique constraint violations), sets `source.merged_into_interest_id = target.id`, then soft-deletes source. Target must be active.

**Interest categories:** The `category` column on `interests` is a free-text field used for grouping related hobbies (e.g. "Board games", "Outdoor sports"). Categories are optional — many interests may remain uncategorized. The admin edit dialog provides a combo-box (Autocomplete with freeSolo) that shows existing categories for selection and allows typing a new one. Categories are used by the Explore local-signal feature as a fallback when an exact hobby doesn't meet the display threshold. Admins can assign categories incrementally over time without needing to classify everything up front.

### Admin, user accounts (super_admin only)

- `GET /admin/users`, list all user accounts. Query params: `q` (search email/handle/name/userId). Returns: `id`, `created_at`, `email`, `username`, `name`, `role`, `is_suspended`, `suspended_at`.
- `POST /admin/users/:id/suspend`, suspend a user. Stores `suspended_at`, `suspended_by_user_id`. Cannot self-suspend.
- `POST /admin/users/:id/unsuspend`, clear suspension fields.

**Web page:** `/admin/chums`, table with search, sort, status chips, suspend/unsuspend actions with confirmation dialogs. Sidebar tab and page header label: **"Users"**.

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

**Invite acceptance, both signup paths:**

| Path | Mechanism |
|------|-----------|
| Credentials signup | `SignupClient.tsx` reads `?invite=<token>` from URL and calls `POST /chums/invite/accept` immediately after successful account creation (non-fatal). |
| Google OAuth signup | `SignupClient.tsx` saves the token to `sessionStorage` (`nc_pending_invite`) before triggering the OAuth redirect. `AppShell.tsx` reads and clears the token after the authenticated profile loads, then calls `POST /chums/invite/accept`. The token is removed from `sessionStorage` before the request fires to prevent double-execution. |

**Display name fallback:** All Chum-related API responses use `displayName: name?.trim() || username (without @) || "NewChums user"`. Users without a set display name show their username instead of the generic fallback.

**Web:**
- `/chum-groups`, "Connections" page. Two-section layout: **On NewChums** (on-platform connections with avatar, handle, birthday, note) and **Private Contacts** (off-platform contacts with email/name, note). Unified search/add flow at top: search finds existing users (save to On NewChums) or offers "Add as private contact" / "Invite to NewChums" for unrecognized emails. Add Private Contact dialog for manual entry. Each contact row supports inline private note editing (pencil icon, `PATCH /chums/:contactId/note`). No mutual indicator.
- `/u/[handle]`, "Save" / "Remove" button in the profile header card (top-right). Shown for logged-in viewers who are not the profile owner. Connection status fetched via `GET /chums/check/:userId` after profile loads.
- Public Connections section renders below the hobbies card when the profile owner's `is_hidden_chum_list = false` and they have at least one public-visible connection. Paginated (8 per page, prev/next). Section is entirely absent (no empty card) when the list is empty.

### In-app notifications

General notifications table (`newchums.notifications`, migration 022) designed for future extensibility.

**Schema:** `id`, `user_id` (recipient), `type`, `actor_user_id` (nullable), `entity_id` (nullable, for future entity links), `metadata` (JSONB, nullable), `read_at` (null = unread), `created_at`. Indexed on `(user_id, created_at DESC)` and a partial index for unread rows.

For `event_updated`, `event_locked`, and `event_canceled`, `metadata` includes `eventTitle` plus `hostUsername` (handle slug) and `hostName` (display name) from the host at send time, so the bell can show `@handle` (or a name fallback) even when the actor join alone would be ambiguous.

**Supported types:**

| Type | Trigger | Recipient |
|------|---------|-----------|
| `chum_added_you` | `POST /chums/:userId`, only when a new Chum is created (not a duplicate `ON CONFLICT`). Re-adding after removal generates a fresh notification. | The user who was added |
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

**Web, bell icon:** `web/src/components/layout/NotificationBell.tsx`, rendered in `AppShell` top nav. Fetches notifications on mount (for initial bell state). On click: refreshes list, marks unread as read, shows Popover dropdown with newest-first list. Bell icon turns `#F4B400` (brand gold) and switches to filled icon when unread notifications or unread chat entries exist. Unread chat entries are rendered with a chat bubble icon, plan title, unread count, latest message preview, and a link to the plan.

### Events (plans)

Event/gathering system. Events are created by a host and can be discovered, RSVP'd, and coordinated around.

**Schema (migration 024):**

| Table | Purpose |
|-------|---------|
| `newchums.events` | Core event entity, title, description, starts_at, location, max_seats, visibility, status, banner_key |
| `newchums.event_interests` | Junction table for event ↔ interest many-to-many (multi-hobby support) |
| `newchums.event_invites` | Invite records, supports both in-app users (user_id) and email invitees (email) |
| `newchums.event_rsvps` | Attendance responses, going, maybe, cant_make_it (one per user per event) |
| `newchums.event_alt_times` | Alternate date/time suggestions from attendees |
| `newchums.event_chat_messages` | Per-plan chat messages, id, event_id, user_id, body, created_at. Indexed on `(event_id, created_at ASC)` |
| `newchums.event_chat_reads` | Last-read tracking per user per plan, PK `(event_id, user_id)`, `last_read_at` timestamp |
| `newchums.event_confirmations` | Final attendance confirmations (migration 039), id, event_id, user_id, status (pending/confirmed/declined/expired), responded_at, reminder_count, last_reminder_at, created_at, updated_at. Unique constraint on `(event_id, user_id)`. |
| `newchums.event_join_requests` | Join request records (migration 030), id, event_id, user_id, status (pending/approved/declined), message, host_message, decided_at, created_at. Unique partial index on `(event_id, user_id) WHERE status = 'pending'` prevents duplicate active requests. |

**Key fields on `events`:**
- `visibility`: `invite_only` | `chums_only` | `public`
- `status`: `draft` | `published` | `canceled`
- `location_type`: `in_person` | `online`
- `allow_alt_times`: boolean, whether attendees can suggest alternate times
- `alt_times_mode`: `'suggest'` | `'availability'` (default `'suggest'`, migration 057), host-controlled presentation mode for the scheduling feature. `'suggest'` frames it as "suggest another time if needed" (original behavior). `'availability'` frames it as "share your availability" for collaborative scheduling. Both modes use the same underlying `event_alt_times` engine; only the attendee-facing copy differs.
- `allow_attendee_invites`: boolean (default true, migration 042), when true, Going attendees can invite others to the plan; host can toggle at any time
- `interest_id`: FK to `interests` table (hobbies)
- `require_reconfirmation`: boolean (migration 028), when true, enables the 24-hour attendance check; people who marked Going receive a confirmation request about 24 hours before the plan
- `min_confirmed_attendees`: integer (migration 039), minimum confirmed count for plan viability (host counts toward total)
- `fallback_policy`: text (migration 039), what happens if minimum is not met at cutoff: `proceed`, `notify_host`, or `auto_cancel`
- `confirmation_window_hours`, `confirmation_cutoff_hours`, `confirmation_sent_at`, `cutoff_processed_at`: 24-hour attendance check lifecycle timestamps (migration 039)
- `locked_at`: timestamptz nullable (migration 029), when set, the plan is locked and no new participants can join; existing participants and host retain access
- `require_approval`: boolean (migration 030), when true, non-invited users must submit a join request that the host approves or declines before being added to the plan

**API endpoints (auth required):**

| Route | Description |
|-------|-------------|
| `POST /events` | Create event. Validates title, starts_at, location_type, visibility. Accepts `invitees[]` array of `{ user_id?, email? }`, `require_reconfirmation`, `require_approval`, `allow_attendee_invites` (default true), `allow_alt_times` (default true), `alt_times_mode` (suggest/availability), `availability_deadline_at` (must be before starts_at, availability mode only), `reserve_seats`, `max_seats` (1-500), `pref_overrides` (JSONB), `community_id` (UUID, user must be active member), `hide_from_explore`. Published events send invite notifications and emails. |
| `GET /events/mine?filter=upcoming\|past` | List events the user hosts, is invited to, or has RSVP'd. Includes going/maybe counts, host info, RSVP status, `has_unread_chat` flag. Host name uses `@username` priority. |
| `GET /events/:id` | Event detail with RSVP list, alternate time suggestions, join requests, and attendance assurance state. Optional auth. Accepts query params: `invite_token`, `participation_token`, `share_token`. Returns `accessState` (`public` \| `invite` \| `authenticated` \| `attending`) and `shareToken` (for non-public states). Public access returns limited preview (counts only, no individual RSVPs). Full response includes `requireReconfirmation`, `lockedAt`, `requireApproval`, `isInvited`, `hasRsvp`, `confirmationWindowOpen`, `confirmationCutoffAt`, `confirmedCount`, `pendingConfirmationCount`, `myConfirmationStatus`, `planViability`, and per-RSVP `confirmationStatus`. Join requests: full list for host, own request only for non-hosts. |
| `PATCH /events/:id` | Edit event (host only). Accepts: `title`, `description`, `starts_at`, `max_seats`, `visibility`, `require_reconfirmation`, `require_approval`, `allow_alt_times`, `alt_times_mode`, `availability_deadline_at`, `allow_attendee_invites`, `reserve_seats`, `pref_overrides`, `community_id`, `hide_from_explore`, `timezone`, `interest_items`. Returns `{ ok: true }`. Sends plan-changed notifications to Going/Maybe attendees when meaningful fields change (title, date, description, capacity, visibility, confirmation settings, availability deadline). Automatically clears `availability_deadline_at` when mode switches away from availability. |
| `POST /events/:id/rsvp` | RSVP to an event, `{ status: "going"\|"maybe"\|"cant_make_it", note? }`. Capacity enforcement for going status. Locked plans reject new RSVPs (`EVENT_LOCKED` error) but allow existing participants to change status. Plans with `require_approval` reject non-invited users who have no existing RSVP (`APPROVAL_REQUIRED` error). Notifies host via in-app notification and email. UI: "Can't make it" button only shown when user is invited or has an existing RSVP; heading text is context-aware ("Can you make it?" for invited users, "Are you in?" otherwise). |
| `POST /events/:id/alt-time` | Suggest alternate time, `{ suggested_at, note? }`. Only if event.allow_alt_times. Notifies host. Auth required. |
| `POST /events/:id/guest-alt-time` | Guest alternate time suggestion via invite token or participation token, `{ invite_token|participation_token, suggested_at, ends_at?, note? }`. No auth required. Validates token; invite tokens require an invite record, participation tokens require an existing RSVP. Enforces 10-suggestion limit per guest. Stores with `user_id = NULL, guest_email = ...` (migration 043). |
| `POST /events/:id/cancel` | Cancel event (host only). Notifies all attendees via in-app notification and email. |
| `POST /events/:id/invite` | Add invitees to published event. Host can always invite; Going attendees can invite when `allow_attendee_invites` is true. Automatically includes a time-flexibility note in the invite email when `allow_alt_times` is enabled (wording varies by `alt_times_mode`: availability or suggest). Accepts optional `message` (string, max 500 chars) for a personal note included in the invite email. Rejects self-invites (invitee email matches inviter email) with `SELF_INVITE` error. `invited_by` column tracks who sent each invite. Sends notifications and invite emails with inviter's display name. **Cross-key dedup:** before insert, an email-only invitee whose address matches an existing user is normalized to that user's `user_id` (and `email` is cleared) so the row lands in canonical form. The handler then checks for any pre-existing invite via either identity column (incoming `user_id` against existing rows by `user_id` OR by the user's email; incoming email against existing rows by `email` OR by the user_id of any user with that email). Duplicates are silently skipped, no second invite email is sent, and the response is `{ ok: true, added, alreadyInvited }` so the client can surface a clear "already invited" toast. The same email→user_id normalization is applied at plan creation (`POST /events`) so creation-time invites land in canonical form too. Pending invites are visible to all viewers in the plan-details "Who's in" section, not only the host, so attendee-sent invites are surfaced to the rest of the group. |
| `PUT /share-link-modal-dismiss` | Permanently dismiss the share-link first-use info modal for the authenticated user. Sets `share_link_modal_dismissed = true` on the user record. |
| `POST /events/:id/toggle-attendee-invites` | Toggle `allow_attendee_invites` (host only). Returns updated value. |
| `GET /events/explore/public` | Public discovery feed for anonymous visitors. No authentication required. Only returns `visibility = 'public'` events. Privacy-safe: approximate location only (`location_area`), no exact addresses, no online links, no user-specific fields (`isHost` always false, `myRsvpStatus` always null, no `distanceKm`). Supports: `time_range`, `q` (text search), `sort` (upcoming/newest), `limit`/`offset`. |
| `GET /events/explore` | Personalized discovery feed for logged-in users. Supports: `lat`/`lng`/`radius_km` (location), `hobby` (slug), `time_range` (this_week/this_weekend/next_30/all), `q` (text search), `sort` (upcoming/newest), `personalize` (0/1, hobby-based ranking boost). Applies visibility rules (public + chums_only for the user's chums). Distance computed via Haversine. Prioritizes host's own events, then hobby matches (when personalized), then distance/time. |
| `GET /explore/local-signal` | Lightweight support signal for the bottom of the logged-in Explore feed. Returns one local-interest data point (`{ hobbyName, count }`) or `null`. Selection: (1) if `hobby` query param is set, try that exact hobby; (2) if exact hobby < 5, try its category; (3) else iterate viewer's profile hobbies and pick highest qualifying count (exact first, then category fallback). Threshold: minimum 5. "Active" = `last_active_at` within 6 months, not suspended. "Local" = within viewer's travel radius via Haversine. Degrades gracefully (returns null on error). |
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
| `POST /events/:id/public-rsvp/confirm-code` | Verify the 6-digit code. Body: `{ challenge, code, name? }`. On success returns `{ token }`, a participation token (JWT, 30-day expiry, purpose `public_rsvp`). |

**Important: Hono route ordering.** `GET /events/explore/public` and `GET /events/explore` must be registered **before** `GET /events/:id` in the route table. Otherwise, Hono interprets "explore" as a UUID `:id`, resulting in a database error.

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

Each plan has an embedded group chat visible to the host and participants with `going` RSVP status. Chat is delivered in real time via WebSockets, backed by a Cloudflare Durable Object (`ChatRoom`) that acts as a stateless broadcast relay; the database is the source of truth for message history, while the Durable Object holds open WebSocket connections and forwards new messages.

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
| Plan at risk (host) | `POSTMARK_TEMPLATE_PLAN_AT_RISK` (43984947) | (always sent to host) |

| Concern report admin alert | `POSTMARK_TEMPLATE_CONCERN_REPORT` (44107767) | (internal admin alert, always sent to contact@newchums.com) |

All emails with a notification preference toggle include a tokenized unsubscribe link in the footer. The unsubscribe endpoint (`POST /email/unsubscribe`) verifies a JWT containing the user ID and preference key, then disables that preference.

**Postmark email template source files:**

HTML and plain text versions of Postmark email templates are stored in `api/src/email/templates/`. When creating or updating a Postmark template, the source content should be maintained in this directory alongside the existing templates. Each template has an `.html` file and a `.txt` file (e.g. `concernReportAlert.html`, `concernReportAlert.txt`). These files are the canonical source for what gets pasted into Postmark; they are not compiled or deployed automatically.

**Remaining scaffolded templates (noop if template ID not configured):**

| Email | Env var | Template model |
|-------|---------|----------------|
| Event reminder (24h) | `POSTMARK_TEMPLATE_EVENT_REMINDER` | recipientName, eventTitle, eventDate, eventLocation, eventUrl |
| RSVP update to host (legacy) | `POSTMARK_TEMPLATE_EVENT_RSVP_UPDATE` | hostName, attendeeName, eventTitle, rsvpStatus, eventUrl |

**Web pages:**

| Route | Component | Description |
|-------|-----------|-------------|
| `/` (logged out) | `LandingPageContent` + `PublicExploreFeed` | Landing page with hero, brand positioning, features; includes an embedded public Explore feed showing real public plans via `GET /events/explore/public`. When the API returns no rows (default “all upcoming” query, no search), the UI shows curated **sample** plans from `web/src/lib/publicExploreSamplePlans.ts` (cards link to `/signup`, not real event IDs; gradient banners like other plans without uploaded banners). Search/time filters and load-more behave on real data only; API errors show an error empty state, not samples. |
| `/` (logged in) | `DashboardHome` | Explore page, personalized discovery feed with search, time chips, sort options (upcoming / newest), personalization toggle, distance/hobby filters, location-aware ordering, session state persistence via `localStorage`, location nudge, contextual empty states |
| `/events/create` | `CreateEventClient` | "Start a plan" form, title, description, hobby, seats, date/time, location (in-person/online), visibility, invite people, gradient banner preset picker with auto-suggestion, 24-hour attendance check config (enable/disable, min attendees, fallback policy), publish |
| `/plans` | `PlansPage` | Tabbed view (Upcoming / Past) with hosted/joined sections, real API data, empty states |
| `/events/[id]` | `EventDetailClient` | Event detail, RSVP actions, alternate time suggestions with best-start-times overlap display, attendee list with confirmation status, attendance assurance confirmation UI, participant chat (real-time via WebSocket), lock/unlock (host), cancel (host), edit plan (host) |

**Banner system:** `web/src/lib/eventBanners.ts` defines `BANNER_PRESETS` (named gradient slugs with hobby keyword mapping). `getGradientForEventId` provides a deterministic fallback gradient for cards with no `banner_key`. `renderBannerPreset` renders a preset to a WebP `Blob` via canvas for upload. `suggestPreset` picks a preset based on hobby keywords.

**Attendance Assurance (implemented):**

The Attendance Assurance system is a two-stage commitment flow built on top of RSVP. When enabled by the host (`require_reconfirmation = true`), it opens a confirmation window 24 hours before the event and asks all "going" attendees (including the host) to confirm their attendance.

- **Confirmation lifecycle:** `pending` → `confirmed` | `declined` | `expired`. Distinct from RSVP status; RSVP history is preserved.
- **Host configuration:** min confirmed attendees (includes host), fallback policy (`proceed` / `notify_host` / `auto_cancel`).
- **Cron processing (hourly):** Sends initial confirmation requests 24h before, follow-up reminders at 12h and 3h, processes cutoff 2h before event.
- **Email flow:** Confirmation request emails with secure one-click confirm/decline links (JWT-based). Plan-at-risk emails to hosts when minimum not met.
- **In-app confirmation:** Logged-in users can confirm/decline directly on the plan details page when the confirmation window is open.
- **Viability display:** Plan details page shows real-time confirmation status, viability assessment, and per-attendee confirmation state in the "Who's in" section.
- **RSVP integration:** Changing RSVP to "Can't make it" automatically sets confirmation to declined. Changing to "Going" during an open window creates a pending confirmation.

**Auto-cancel: no attendees (implemented):**

The hourly cron handler includes `cancelNoAttendeePlans()` which auto-cancels published plans where the host is the only "going" attendee and the plan start time has passed (within a 2-hour window to avoid reprocessing old plans). Sets `status = 'canceled'` and `cancellation_reason = 'no_attendees'`. No email notifications are sent for this auto-cancel; it is a silent cleanup for plans that effectively never happened.

**Attendance Record (implemented):**

Public profile section showing six reliability metrics computed from real event and RSVP data:

1. **Going follow-through**, of plans the user set Going on, how often they kept that Going RSVP without backing out to Maybe or Can't make it. Denominator: committed RSVPs (`committed_at IS NOT NULL`) on past non-canceled events where the user is not the host. Numerator: subset still with `status = 'going'`. Does NOT penalize for attendance issues (no-shows) — this metric purely measures commitment to a Going RSVP. Not affected by host removals (RSVP row deleted), plan cancellations (filtered out), or auto-cancellations. No schema change required — derived from existing `committed_at` + current `status`.
2. **Shows up** (follow-through rate), of plans the user committed to attend, how often they followed through. Same base query as Going follow-through but additionally subtracts undismissed no-show or very-late attendance issues. This captures both explicit backing-out (RSVP changed away from 'going') and reported no-shows/very-late arrivals.
3. **Attendance checks answered**, of plans that had a 24-hour attendance check, how often the user responded (confirmed or declined). Measures responsiveness to the pre-plan check-in.
4. **Plans attended**, count of completed plans attended (non-host, going, past, non-canceled).
5. **Plans hosted**, count of completed plans organized (host, past, non-canceled).
6. **Host follow-through** (host completion rate), of hosted plans where at least one non-host attendee committed as Going, how often the plan still went ahead instead of being canceled. Excludes plans where nobody committed to join (no non-host `committed_at` records) and excludes auto-canceled no-attendee plans (`cancellation_reason = 'no_attendees'`). This ensures hosts are not penalized for hosting in a thin network where nobody joins.

Uses `committed_at` on `event_rsvps` (migration 041) for accurate commitment tracking. New/low-history users see "Building history" treatment with underlying sample counts. Endpoint: `GET /public/users/:userId/attendance-record`.

**Plan Feedback / Matching Quality System (implemented, Phase 1 + Phase 2):**

Post-plan feedback allows attendees and hosts to leave lightweight, optional feedback about each other after a plan has passed. Feedback signals feed hidden per-user metric scores that power the chum preferences matching system.

*Hidden Metrics (per user, stored in `user_metrics`):*

| Metric | Definition | Weighting guidance |
|--------|-----------|-------------------|
| **Reliability** | Can this person be counted on to follow through? | Moves quickly; no-shows and very late cancellations matter immediately; positive follow-through recovers more slowly. |
| **Sociability** | Does this person make social interaction comfortable and enjoyable? | Moves gradually; subjective, relies on repeated signals. |
| **Cleanliness & Consideration** | Does this person show basic in-person cleanliness and considerate use of shared space? (Hygiene and shared-space courtesy, not appearance, style, or a safety/conduct judgment.) | Moves cautiously but firmly; sensitive area, but repeated negative signals should matter. |
| **Hosting Skills** | Does this person run plans that respect people's time and create a good experience? | Only moves from hosted-plan feedback. |
| **Match Quality** | Was this a good match for the reviewer personally? | Per-pair signal, not an absolute score. |

All metrics use a 0–100 scale, starting at 50.00 (neutral baseline). `signal_count` tracks how many feedback signals contributed.

*Scoring model (implemented):*

- **Baseline:** 50.00 for every metric, 0 signals.
- **Feedback movement:** Each feedback signal nudges the score toward a target using weighted averaging. "Yes" (agree) targets 80, "Somewhat" (maybe) targets 50, "No" (disagree) targets 20. Nudge = (target − current) / (signal_count + 5). This ensures early signals have a larger effect while later signals converge toward the running average.
- **Attendance penalties (Reliability only):** Raw penalties: No-show = −10, Very late = −8, Late cancel = −5. Effective penalty = raw × confidence (see trust model below). These are immediate penalties, not averaged.
- **Hosting Skills:** Only moves from the `hosting_skills` prompt on plans the user hosted.
- **Conduct / Safety:** Tracked separately from metric scoring. Does not affect scores.

*Tolerance thresholds (chum preference levels):*

| Level | Threshold | Meaning |
|-------|-----------|---------|
| **Open to anyone** | None | No filtering on that metric. |
| **Preferred** | Score ≥ 35 | Tolerates mild negative average. Meaningfully filters consistently poor signals. |
| **Important** | Score ≥ 45 | Only tolerates small negative average. Filters moderate negatives. |
| **Required** | Score ≥ 55 | Firm minimum. Requires near-baseline or positive record. |

*Feedback prompts (3-point scale: Yes / Somewhat / No):*

- Showed up and followed through reliably → Reliability
- I'd spend time with this person again → Sociability
- This person showed basic in-person cleanliness and consideration → Cleanliness & Consideration
- This was a good match for me → Match Quality
- Ran a well-organized plan → Hosting Skills (host-only prompt)

*Separate layers (not part of normal feedback):*

- **Attendance issues**, structured reports: no-show, cancelled too late, arrived very late. Stored in `attendance_issues`. Immediately penalizes Reliability score (modulated by confidence).
- **Conduct / Safety reports**, structured reasons: rude/aggressive, harassment, boundary issue, discriminatory, unsafe/intoxicated, disruptive, property damage, other. Stored in `conduct_reports` (with `status`: new/reviewed/closed per migration 053). Treated separately from normal scoring. Each submission triggers an immediate email alert (Postmark template 44107767) to contact@newchums.com and appears in the admin Safety tab for review.

*Attendance Trust Model (migration 052):*

The `attendance_issues` table has additional trust columns:

| Column | Type | Description |
|--------|------|-------------|
| `is_host_report` | boolean | Whether the reporter was the plan host |
| `confidence` | numeric(3,2) | 0.00–1.00 multiplier applied to raw penalty |
| `applied_penalty` | numeric(5,2) | Actual score deduction stored for clean reversal |
| `status` | text | `active` / `disputed` / `dismissed` / `confirmed` |

Confidence rules:

| Reporter | Corroborated? | Confidence |
|----------|---------------|------------|
| Host | N/A | 1.0 |
| Non-host | No | 0.75 |
| Non-host | Yes (2+ independent reporters, same plan/person/type) | 1.0 |
| Any | Disputed by user | 0.5 |
| Any | Dismissed by admin | 0 (penalty fully reversed) |
| Any | Confirmed by admin | 1.0 |

Product rule: 2 no-shows (50 − 20 = 30) or 1 no-show + 1 very-late (50 − 18 = 32) drops below Preferred (≥ 35), absent offsetting positive feedback.

Dispute mechanism:
- Users can dispute active attendance issues via `POST /events/:id/attendance-dispute`. All active issues on that plan against the user are set to `disputed` (confidence 0.5) and the reliability score is adjusted.
- Reporter identity is **never** revealed to the disputed user.
- Super admins can dismiss (confidence 0) or confirm (confidence 1.0) issues via `PUT /admin/attendance-issues/:id/status`.

Corroboration:
- When a new attendance report arrives and prior reports exist for the same plan/person/type from different reporters, all are boosted to confidence 1.0. Prior lower-confidence reports have their penalties retroactively adjusted.

*Chum Preferences (user-facing, implemented):*

Users configure matching preferences in their profile ("Your chum preferences" section, below Hobbies, above Attendance record). Settings:
- **Per-metric levels:** Reliability, Sociability, Cleanliness & consideration, Hosting quality, each set to Open to anyone / Preferred / Important / Required.
- **Age range:** Any age / Within 5 years / Within 10 years / Within 15 years. Evaluated dynamically against DOB at match time, never stored as absolute bounds. Users without DOB on file always pass this check.
- Defaults: Reliability = Preferred, all other metric levels = Open to anyone, Age range = Any age.
- Saved in `chum_preferences` table (upsert on change, auto-saves). The `enabled` master toggle was removed in migration 071; permissive values ("Open to anyone" + "Any age") now represent the no-filter state.

*Browsing vs. inbound matching behavior (implemented):*
- A user's chum preferences filter who gets matched **into their plans** and who appears in their **digest / recommendations**.
- **Digest:** Both directions are hard-filtered across all five preference dimensions (reliability, sociability, cleanliness & consideration, hosting quality, age range). Plans whose host fails the recipient's preferences (including hosting quality) are excluded. Plans where the recipient fails the host's preferences are also excluded.
- **Explore feed:** The host's preferences are enforced as a hard filter in the SQL query, including the host's age range vs the viewer's age (computed via `EXTRACT(YEAR FROM AGE(h.date_of_birth))` against the viewer's DOB injected as a parameter). Plan-level `pref_overrides` are respected inline in the SQL: `{ "disabled": true }` bypasses all host preference checks; `disabled_metrics` bypasses specific dimensions including `"age"`. The viewer's own preferences produce a soft **compatibility note** (`prefNote` in the API response), including age mismatches against the host, plans are not hidden from the viewer, but the frontend can indicate a mismatch.
- **Plan details:** When a logged-in user views a plan they didn't create, `GET /events/:id` evaluates the viewer's chum preferences against the host's metrics (including hosting quality) and against the host's DOB (when the viewer has an age preference set), then returns a `prefNote` array of failed dimensions. Per-attendee mismatches are computed the same way (each attendee's DOB and metrics are checked against the viewer's preferences). The frontend displays an informational banner: "Based on your chum preferences, this plan may not fully match your expectations for [dimension(s)]." Age mismatches surface as the generic phrase "age range" — exact ages, DOBs, and differences are never exposed in user-facing copy. This does **not** block access; it informs.
- A user's chum preferences do **not** block them from browsing and opening plans themselves.

*API endpoints:*

| Endpoint | Purpose |
|----------|---------|
| `GET /events/:id/feedback` | Existing feedback by this user + eligible attendees list |
| `POST /events/:id/feedback` | Submit/update feedback entries (batch); updates `user_metrics` |
| `POST /events/:id/attendance-issue` | Report attendance problem; penalizes Reliability (with confidence model) |
| `POST /events/:id/attendance-dispute` | Dispute active attendance issues filed against the current user on this plan |
| `POST /events/:id/conduct-report` | Report conduct/safety concern; triggers admin email alert |
| `PUT /admin/attendance-issues/:id/status` | Super-admin: dismiss or confirm an attendance issue |
| `GET /admin/concern-reports` | Super-admin: list all concern/conduct reports with user and plan details |
| `PUT /admin/concern-reports/:id/status` | Super-admin: update concern report status (new/reviewed/closed) |
| `GET /chum-preferences` | Current user's preference settings |
| `PUT /chum-preferences` | Save preference settings (upsert) |
| `GET /admin/users/:id/diagnostics` | Super-admin: per-user metric scores, preferences, feedback history, attendance/conduct summaries |

*Email:* Post-plan feedback reminder email sent ~3 hours after plan start time via the hourly cron handler. Uses Postmark template 44091936. One email per plan (tracked via `events.feedback_email_sent_at`). Sent to host + going RSVPs. Gated on the `feedback_requests` notification preference (users can unsubscribe). Each email includes a one-click unsubscribe link keyed to `feedback_requests`.

*UI:* Carousel-style "How did it go?" section appears on the plan detail page for past, non-canceled plans where the viewer is a participant. One-person-at-a-time stepper with progress dots, per-person feedback prompts, contextual attendance issue reporting, and separate conduct report dialog.

*Admin diagnostics (super-admin only):*
- Per-user diagnostics view at `/admin/chums/[id]` (linked from "Inspect" icon on admin Users table).
- Shows: hidden metric scores with progress bars, chum preference settings, attendance issue summary, conduct report summary, anonymized aggregated feedback table, recent feedback timeline (plan titles and reporter identity per row), and score derivation reference.
- Reporter identities are never shown in admin views to protect feedback privacy.

*Plan-level chum preference overrides (implemented):*

- Hosts can override their default chum preferences for a specific plan when creating or editing it.
- Overrides are stored as a JSONB column `pref_overrides` on `events` (migration 051).
- `{ "disabled": true }` disables all chum preference filtering for that plan (including age range).
- `{ "disabled_metrics": ["sociability", "age", ...] }` disables specific dimensions only; remaining dimensions use the host's profile defaults. Valid keys: `reliability`, `sociability`, `presentation`, `hosting_skills`, `age`.
- `NULL` means no override (use host's global preferences as-is).
- Overrides affect **outbound** matching only (digest + explore hard filters on the host's side). Viewer-side compatibility notes are not suppressed.
- The create and edit plan forms always expose this as a collapsible "Matching preferences for this plan" section. Since the master toggle was removed, there is no `hostHasPrefs` gate — the override card is always available.
- `resolveEffectiveHostPrefs(globalPrefs, planOverrides)` merges overrides with global prefs before evaluation. When `disabled: true` is set, it returns a fully permissive prefs row (every level `'open'`, `age_pref_years` `null`) — this replaces the previous master-toggle short-circuit. `parsePrefOverrides(raw)` validates the JSONB shape.
- The edit plan form has moved from an embedded Dialog in EventDetailClient to a dedicated page at `/events/[id]/edit`.

*Future direction (documented, not yet implemented):*

- New plans may inherit the creator's chum preferences by default (the override infrastructure now supports this).

*Schema:* Migration 049: `plan_feedback`, `attendance_issues`, `conduct_reports`, `user_metrics` tables + `events.feedback_email_sent_at` column. Migration 050: `chum_preferences` table. Migration 051: `events.pref_overrides` JSONB column. Migration 052: attendance trust columns on `attendance_issues`. Migration 053: `status` column on `conduct_reports`. Migration 054: `user_objective_completions` table + `users.tutorial_nudges_off` column. Migration 071: add `chum_preferences.age_pref_years` (SMALLINT NULL, CHECK IN 5/10/15), reset metric levels to `'open'` for users who had `enabled = false`, drop `chum_preferences.enabled`.

**Not yet implemented:** recurring events.

### Objectives / next-best-step nudge system

A durable objectives framework that guides users through onboarding and early retention via a single contextual "next best step" nudge.

**Architecture:**

- **Objective catalog** defined in code (`api/src/objectives.ts`): 12 objectives across 4 categories (profile, plans, social, engagement), each with a durable key, title, description, sequence, and action URL.
- **Completion evaluation** runs in real time against live product data (profile fields, RSVPs, contacts, chat messages, feedback), not cached state.
- **Completion records** stored durably in `user_objective_completions` for analytics and admin visibility; auto-recorded when evaluated.
- **User opt-out** via `users.tutorial_nudges_off` boolean; controllable directly from the nudge and from Settings → Tips & guidance.

**Objective sequence:** add_display_name → add_hobbies → set_location → set_travel_distance → add_bio → add_avatar → join_first_plan → attend_first_plan → send_first_message → give_first_feedback → create_first_plan → add_first_chum.

**API endpoints:**

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /objectives/next` | Bearer JWT | Returns the next best step, progress counts, and tutorial-off state |
| `PUT /objectives/tutorial-off` | Bearer JWT | Permanently enable/disable tutorial nudges |
| `GET /admin/objectives/kpi` | Super admin | Aggregate engagement rate, avg completion depth, opt-out count, per-objective funnel |
| `GET /profile` | Bearer JWT | Now includes `tutorial_nudges_off` in the profile response |

**Frontend:** `NextStepNudge` component (`web/src/components/objectives/NextStepNudge.tsx`) renders in AppShell above page content for authenticated non-admin views. Shows progress bar, current objective, action button, dismiss (session), and permanent turn-off link. Suppressed on `/admin/*` routes.

**Admin surfaces:**
- User Diagnostics: completed/incomplete objectives, tutorial state, current next step.
- KPI tab: engagement rate, avg completion depth, opt-out count, completion funnel table.
- System Logic tab: abbreviated explanation.

**Settings:** Users can re-enable tutorial tips via Settings → Tips & guidance toggle. This controls the `users.tutorial_nudges_off` flag via `PUT /objectives/tutorial-off`.

*Schema:* Migration 054: `user_objective_completions` table (user_id + objective_key unique, completed_at), `users.tutorial_nudges_off` boolean.

**Extensibility:** The catalog can be extended by adding entries to `OBJECTIVES` in `api/src/objectives.ts`. Future gamification layers (XP, badges, rewards) can be layered on top of the completion records without schema changes. The objective definition type can be extended with reward fields when needed.

### Signup and onboarding

Account creation is a multi-step wizard for both standard email/password and Google OAuth paths.

**Standard signup (`/signup`):** 4-step flow: (1) email, password, confirm password, legal acceptance checkbox → (2) username, date of birth → (3) hobbies (optional, skip available) → (4) location + travel distance (optional, skip available). Legal acceptance (Terms of Use and Privacy Policy) is required before proceeding. All data is submitted in a single `POST /auth/signup` call, which accepts optional `interest_slugs`, `home_city`, `home_lat`, `home_lng`, `travel_radius_km`, `accepted_terms_version`, `accepted_privacy_version`.

**Google OAuth onboarding (`/onboarding/username`):** 3-step flow: (1) username, date of birth → (2) hobbies (optional) → (3) location + travel distance (optional). Legal acceptance checkbox is required on the signup page before the OAuth redirect; acceptance data is stored in `sessionStorage` and recorded via `POST /auth/record-legal-acceptance` after authentication. Username/DOB submitted via existing `POST /user/username` + `POST /user/date-of-birth`; hobbies and location submitted via `PUT /profile`.

Shared UI components: `OnboardingProgress` (step indicator + progress bar), `StepTransition` (animated slide transitions), `HobbiesStep` (interest search + chip selection), `LocationStep` (Places autocomplete + travel distance select). All live in `web/src/components/onboarding/`.

**Interest resolution helper:** `resolveInterestSlugs` is extracted in `api/src/index.ts`, validates interest slugs, resolves merged interests, and returns resolved IDs. Used by both `POST /auth/signup` and `PUT /profile`.

### Media (avatar)

- `POST /media/init` (auth required) → returns upload token and upload URL path
- Client `PUT` to API upload endpoint `PUT /media/upload/:token` with body
- `POST /media/finalize` (auth required) → associates avatar
- `DELETE /profile/avatar` (auth required)
- `GET /users/:userId/avatar` (public; cacheable)

### Communities

Community pages where users can join, browse, and create plans together.

**Schema (migration 055, extended by 059):**

| Table | Purpose |
|-------|---------|
| `newchums.communities` | Core community entity, name, slug, description, avatar_key, banner_key, visibility (`public` / `private`), join_mode (`open` / `approval_required`), chat_enabled (boolean, deferred), location fields, owner_user_id, `status` (`active` / `closed`, default `active`, migration 059), timestamps |
| `newchums.community_members` | Membership records, community_id, user_id, role (`owner` / `member`), status (`active` / `pending` / `removed`). Unique on `(community_id, user_id)`. |
| `newchums.community_join_requests` | Join request records, community_id, user_id, status (`pending` / `approved` / `declined` / `withdrawn`), reviewed_by_user_id, timestamps. Unique partial index on `(community_id, user_id) WHERE status = 'pending'`. |

**Events table additions (migration 055):**
- `community_id UUID NULL` FK → `communities(id)` ON DELETE SET NULL, associates a plan with 0 or 1 community.
- `hide_from_explore BOOLEAN NOT NULL DEFAULT false`, when true, the plan is hidden from the general Explore feed (still visible in the community's own plan feed).

**API endpoints (auth required unless noted):**

| Route | Description |
|-------|-------------|
| `POST /communities` | Create a community. Validates name, slug (3–50 chars, lowercase alphanumeric + hyphens), visibility, join_mode. Creator becomes owner + member. |
| `GET /communities` | List communities. Query params: `filter=mine` (user's communities), `q` (search). Returns member_count. |
| `GET /communities/slug-available` | Check slug availability. |
| `GET /communities/:slug` | Community detail. Returns full community info, member_count, viewer's membership role/status, pending join request status. Private communities return limited info to non-members. Owner/admin sees pending join requests. Private communities include a share token (JWT, purpose `community_share`). |
| `PATCH /communities/:slug` | Update community (owner or super admin). Accepts: name, description, visibility, join_mode, chat_enabled, location fields, avatar_key. |
| `POST /communities/:slug/close` | Soft-close a community (owner or super admin). Sets `status = 'closed'`, nullifies `community_id` on linked events. Community data is preserved but hidden from listings. Irreversible. Migration 059 adds the `status` column. |
| `DELETE /communities/:slug` | Hard-delete community (owner or super admin). Cascades to members, join requests; events have `community_id` set to NULL. |
| `POST /communities/:id/join` | Join (open) or request to join (approval_required). Idempotent. Sends join-request email to owner when approval is required. |
| `POST /communities/:id/leave` | Leave community. Owner cannot leave (must transfer ownership first). Also withdraws any pending join request. |
| `GET /communities/:id/members` | List active members. Private communities restrict to members + super admin. |
| `POST /communities/:id/members/:userId/remove` | Remove a member (owner or super admin). Cannot remove owner. |
| `PUT /communities/:id/join-requests/:requestId` | Approve or decline a join request (owner or super admin). On approve, adds user as active member. Sends approved/declined email to requester. |
| `GET /communities/:id/join-requests` | List pending join requests (owner or super admin). |
| `GET /communities/:id/events` | Community plan feed. Returns published plans belonging to this community. Private communities restrict to members + super admin. Supports `limit`/`offset`. |

**Admin endpoints (super_admin only):**

| Route | Description |
|-------|-------------|
| `GET /admin/communities` | List all communities with member_count and plan_count. Supports `q` search. |
| `POST /admin/communities/:id/remove` | Admin delete a community. |

**Plan creation/edit integration:**
- `POST /events` accepts optional `community_id` and `hide_from_explore`. Validates that the user is an active member of the community.
- `PATCH /events/:id` accepts `community_id` (set or clear) and `hide_from_explore`.
- `GET /events/:id` includes `community` info (`id`, `slug`, `name`) when the plan belongs to a community.
- `GET /events/explore` includes community attribution (`community` object) on plans that belong to a community. Plans with `hide_from_explore = true` are still visible to members of the associated community.

**Community avatar upload:**
Uses the shared media upload pipeline (`POST /media/init` → `PUT /upload/:token` → `POST /media/finalize`) with purpose `community_avatar`. Object key pattern: `community_avatars/{userId}/{timestamp}.{ext}`. Finalize requires community ownership or super admin. Served via `GET /communities/:communityId/avatar`.

**Email templates (Postmark template IDs pending):**

| Email | Env var | Trigger |
|-------|---------|---------|
| Community join request (to owner) | `POSTMARK_TEMPLATE_COMMUNITY_JOIN_REQUEST` | User requests to join an approval_required community |
| Community join approved (to requester) | `POSTMARK_TEMPLATE_COMMUNITY_JOIN_APPROVED` | Owner approves a join request |
| Community join declined (to requester) | `POSTMARK_TEMPLATE_COMMUNITY_JOIN_DECLINED` | Owner declines a join request |

Template source files: `api/src/email/templates/communityJoinRequest.*`, `communityJoinApproved.*`, `communityJoinDeclined.*`.

**Share tokens (private communities):**

Private communities generate a share token (JWT, purpose `community_share`) returned in `GET /communities/:slug` responses for owners and super admins. The token grants non-members a way to view and request to join the community via a share link.

**Community chat:** The schema includes a `chat_enabled` column on `communities`, but community-level chat is **deferred** to a later pass. No chat implementation exists for communities.

**Web pages:**

| Route | Component | Description |
|-------|-----------|-------------|
| `/communities` | `CommunitiesListClient` | Browse and search communities; "my communities" filter |
| `/communities/create` | `CreateCommunityClient` | Create a new community |
| `/communities/[slug]` | `CommunityDetailClient` | Community detail, info, members, community plans feed, join/leave, join-request management (owner) |
| `/communities/[slug]/edit` | `EditCommunityClient` | Edit community settings (owner) |
| `/admin/communities` | `AdminCommunitiesClient` | Super admin community management, list, search, remove |

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
| How it Works | `/how-it-works` | `HowItWorksContent.tsx` | Comprehensive product feature deep-dive. Hero, lifecycle overview, 7 feature cluster sections (create, invite, schedule, confirm, chat, discover, trust), use cases grid, "why not group chat" comparison, CTA. Screenshot placeholders in `/public/images/how-it-works/`. |
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
- **Screenshot placeholders:** Strategic `Box` placeholders with dashed borders and "Screenshot placeholder" labels are used in `LandingPageContent.tsx` (Explore view, Event details view). Reuse the Safety Center pattern when replacing with real screenshots.

### Future-ready elements

The homepage contains mock event data and UI panels that are structured for easy replacement with real API data:

- **Homepage discovery section:** `MOCK_EVENTS` array with `EventCard` type, category filter chips with client-side state, empty state handler. Intended future fallback: nearby events → featured events → empty state.
- **Homepage hero panel:** Mini product-preview showing 3 event rows (desktop only).

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
- `user_profile.notification_prefs` (JSONB, migration 012; cleaned by migration 033), per-notification-type enabled toggle
- `users.is_hidden_from_search`, `users.is_hidden_from_external_indexing` (boolean, migration 013), privacy toggles
- `users.is_hidden_age` (boolean, migration 014), when true, age is not shown on public profile; default false
- `users.role` (TEXT NULL, migration 015), user role; `super_admin` unlocks admin features
- `interests.is_deleted`, audit columns (migration 015), soft-delete + audit trail for admin moderation
- `interests.merged_into_interest_id` (UUID NULL, migration 016), merge target for deleted/duplicate interests
- `users.is_suspended`, `suspended_at`, `suspended_by_user_id`, `suspension_reason` (migration 017), account suspension; indexed on `is_suspended = true`
- `users.gender` (TEXT NULL, migration 018), allowed values: `male`, `female`, `other`, `prefer_not_to_say`; suppressed on public profile if `prefer_not_to_say` or null
- `users.profile_theme` (TEXT NULL, migration 019), controls accent color of the identity card on the public profile; allowed values: 16 curated palette keys defined in `web/src/lib/profileTheme.ts`
- `users.is_hidden_chum_list`, `users.is_hidden_from_chum_lists` (boolean, migration 020), Chums privacy toggles; both default false
- `newchums.user_chums` (migration 021), **legacy**, replaced by `user_contacts` (migration 048). Retained temporarily as a safety net. One-way Chum relationships; columns: `id`, `user_id`, `chum_user_id`, `created_at`; unique constraint on `(user_id, chum_user_id)`.
- `newchums.user_contacts` (migration 048), two-part connection model replacing `user_chums`. Columns: `id` (UUID PK), `user_id` (FK), `type` (`'on_newchums'` or `'private'`), `linked_user_id` (FK, required for `on_newchums`), `contact_email`, `contact_name`, `note`, `created_at`. Unique indexes: `(user_id, linked_user_id)` WHERE linked; `(user_id, LOWER(contact_email))` WHERE private+unlinked. Auto-linking index on `LOWER(contact_email)` for promoting private contacts when they create accounts.
- `newchums.notifications` (migration 022), general notifications table; columns: `id`, `user_id`, `type`, `actor_user_id`, `entity_id`, `metadata` (JSONB), `read_at`, `created_at`; indexed for unread queries
- `newchums.chum_invites` (migration 023), invite records for emails not yet on NewChums; columns: `id`, `inviter_user_id`, `invitee_email`, `token_hash`, `status` (`pending`/`accepted`/`expired`), `expires_at` (30 days), `accepted_at`, `accepted_user_id`, `created_at`; unique index on `token_hash`; indexed on `(invitee_email, status)` and `inviter_user_id`
- `newchums.events` (migration 024), core event entity; columns include `host_user_id`, `title`, `description`, `interest_id` (legacy FK, being superseded by event_interests), `starts_at`, `location_type`, `location_name`, `location_address`, `location_lat`, `location_lng`, `online_link`, `max_seats`, `visibility`, `status`, `allow_alt_times`, `banner_key`, `require_reconfirmation` (migration 028), `locked_at` (migration 029), `created_at`, `updated_at`
- `newchums.event_interests` (migration 025), junction table for event ↔ interest many-to-many; events can link to multiple hobbies
- `newchums.event_invites` (migration 024), invite records supporting both user_id and email invitees. **Exactly one of `(user_id, email)` is populated per row (migration 075, `event_invites_single_identity` CHECK constraint).** The application layer resolves email -> user_id before insert whenever a user with that email already has an account, so the row lands in canonical form. Partial unique indexes on `(event_id, user_id)` and `(event_id, email) WHERE user_id IS NULL` enforce per-event uniqueness; the cross-key case (same recipient referenced by user_id vs email) is handled by a SELECT-before-INSERT check in `POST /events/:id/invite` that looks up by both identity columns simultaneously.
- `newchums.event_rsvps` (migration 024), RSVP responses; one per user per event; status: `going`, `maybe`, `cant_make_it`
- `newchums.event_alt_times` (migration 024), alternate time suggestions from attendees
- `newchums.user_chums.note` (migration 027), **legacy**, notes are now on `user_contacts.note`. `TEXT NULL` column on `user_chums` for private per-chum notes.
- `newchums.events.require_reconfirmation` (migration 028), `BOOLEAN NOT NULL DEFAULT FALSE` on `events`; when true, signals that attendees should receive a 24-hour reconfirmation reminder (email/cron trigger is future work)
- `newchums.event_chat_messages` (migration 029), per-plan chat messages; columns: `id` (UUID PK), `event_id` (FK), `user_id` (FK), `body` (TEXT NOT NULL), `created_at`; indexed on `(event_id, created_at ASC)`
- `newchums.event_chat_reads` (migration 029), last-read tracking; columns: `event_id`, `user_id`, `last_read_at`; PK `(event_id, user_id)`
- `newchums.events.locked_at` (migration 029), `TIMESTAMPTZ NULL` on `events`; when set, prevents new participants from joining; existing participants and host retain access
- `newchums.events.require_approval` (migration 030), `BOOLEAN NOT NULL DEFAULT FALSE`; when true, non-invited users must request to join and be approved by the host
- `newchums.event_join_requests` (migration 030), join request records; columns: `id` (UUID PK), `event_id` (FK), `user_id` (FK), `status` (pending/approved/declined), `message` (TEXT NULL), `host_message` (TEXT NULL), `decided_at` (TIMESTAMPTZ NULL), `created_at`; unique partial index on `(event_id, user_id) WHERE status = 'pending'`
- `newchums.host_attendee_removals` (migration 034), tracks host-initiated attendee removals; columns: `event_id`, `host_user_id`, `removed_user_id`, `status_at_removal`, `created_at`
- `newchums.event_rsvps` guest columns (migration 035), `user_id` made nullable, added `guest_email TEXT NULL`, `guest_name TEXT NULL`, partial unique index on `(event_id, guest_email)` for guest rows
- `newchums.user_profile.chat_digest_sent_at` (migration 037), `TIMESTAMPTZ NULL`; tracks when the daily unread-chat digest email was last sent to each user, enforcing once-per-day sending
- `newchums.events` attendance assurance columns (migration 039), `min_confirmed_attendees INT NULL`, `confirmation_window_hours INT NOT NULL DEFAULT 24`, `confirmation_cutoff_hours INT NOT NULL DEFAULT 2`, `fallback_policy TEXT NOT NULL DEFAULT 'proceed'`, `confirmation_sent_at TIMESTAMPTZ NULL`, `cutoff_processed_at TIMESTAMPTZ NULL`
- `newchums.event_confirmations` (migration 039), final attendance confirmation records; columns: `id` (UUID PK), `event_id` (FK), `user_id` (FK), `status` (pending/confirmed/declined/expired), `responded_at`, `reminder_count`, `last_reminder_at`, `created_at`, `updated_at`; unique constraint on `(event_id, user_id)`
- `newchums.users` legal acceptance columns (migration 040), `accepted_terms_version TEXT NULL`, `accepted_privacy_version TEXT NULL`, `accepted_legal_at TIMESTAMPTZ NULL`
- `newchums.event_rsvps.committed_at` (migration 041), `TIMESTAMPTZ NULL`; records when a user first committed (RSVP'd going) for accurate follow-through tracking; backfilled from `created_at` for existing going RSVPs; indexed on `(user_id, committed_at)` where not null
- `newchums.events.allow_attendee_invites` (migration 042), `BOOLEAN NOT NULL DEFAULT true`; when true, Going attendees can invite others to the plan; host can toggle at any time via `POST /events/:id/toggle-attendee-invites`
- `newchums.event_alt_times` guest support (migration 043), `user_id` made nullable, added `guest_email TEXT NULL`; mirrors event_rsvps guest pattern; allows unauthenticated invitees to suggest alternate times via invite token
- `newchums.plan_feedback` (migration 049), per-attendee feedback responses. Columns: `id` (UUID PK), `plan_id` (FK), `reviewer_user_id` (FK), `reviewee_user_id` (FK), `prompt` (reliability/sociability/presentation/match_quality/hosting_skills), `response` (agree/maybe/disagree), `created_at`. Unique on `(plan_id, reviewer_user_id, reviewee_user_id, prompt)`.
- `newchums.attendance_issues` (migration 049), structured attendance problem reports. Columns: `id` (UUID PK), `plan_id` (FK), `reporter_user_id` (FK), `reported_user_id` (FK), `issue_type` (no_show/late_cancel/very_late), `created_at`. Unique on `(plan_id, reporter_user_id, reported_user_id, issue_type)`.
- `newchums.conduct_reports` (migration 049, extended 053), safety/behavioral concern reports. Columns: `id` (UUID PK), `plan_id` (FK), `reporter_user_id` (FK), `reported_user_id` (FK), `reason`, `details` (TEXT NULL), `status` (new/reviewed/closed, migration 053), `created_at`.
- `newchums.user_metrics` (migration 049), aggregated hidden quality scores. Composite PK `(user_id, metric)`. Columns: `score` (NUMERIC(5,2), default 50.00), `signal_count` (INT, default 0), `updated_at`.
- `newchums.events.feedback_email_sent_at` (migration 049), `TIMESTAMPTZ NULL`; tracks when feedback reminder email was sent for a plan.
- `newchums.user_objective_completions` (migration 054), tracks per-user objective completion. Columns: `id` (UUID PK), `user_id` (FK), `objective_key` (TEXT), `completed_at` (TIMESTAMPTZ). Unique constraint on `(user_id, objective_key)`.
- `newchums.users.tutorial_nudges_off` (migration 054), `BOOLEAN NOT NULL DEFAULT false`; when true, tutorial nudges are permanently suppressed for the user.
- `newchums.communities` (migration 055), community entity. Columns: `id` (UUID PK), `slug` (TEXT UNIQUE), `name`, `description`, `avatar_key`, `banner_key`, `visibility` (public/private), `join_mode` (open/approval_required), `chat_enabled` (boolean, default true, deferred), `location_name`, `location_address`, `location_lat`, `location_lng`, `owner_user_id` (FK), `created_at`, `updated_at`. Indexed on `slug` (unique) and `owner_user_id`.
- `newchums.community_members` (migration 055), membership records. Columns: `id` (UUID PK), `community_id` (FK, CASCADE), `user_id` (FK, CASCADE), `role` (owner/member), `status` (active/pending/removed), `created_at`. Unique on `(community_id, user_id)`. Indexed on `user_id`.
- `newchums.community_join_requests` (migration 055), join request records. Columns: `id` (UUID PK), `community_id` (FK, CASCADE), `user_id` (FK, CASCADE), `status` (pending/approved/declined/withdrawn), `reviewed_by_user_id` (FK), `created_at`, `reviewed_at`. Unique partial index on `(community_id, user_id) WHERE status = 'pending'`.
- `newchums.events.community_id` (migration 055), `UUID NULL` FK → `communities(id)` ON DELETE SET NULL. Associates a plan with 0 or 1 community. Indexed where not null.
- `newchums.events.hide_from_explore` (migration 055), `BOOLEAN NOT NULL DEFAULT false`. When true, the plan is hidden from the general Explore feed but visible in the community's plan feed.
- `newchums.roadmap_items.attachment_key` (migration 056), `TEXT NULL`. Stores R2 object key for optional roadmap item attachments.
- `newchums.events.alt_times_mode` (migration 057), `TEXT NOT NULL DEFAULT 'suggest'`. Host-controlled presentation mode for the alternate times feature: `'suggest'` (default, current behavior) or `'availability'` (collaborative scheduling framing). Same underlying `event_alt_times` engine; only attendee-facing copy differs.
- `newchums.users.share_link_modal_dismissed` (migration 062), `BOOLEAN NOT NULL DEFAULT false`; when true, the share-link first-use info modal is permanently dismissed for the user.
- `newchums.events.availability_deadline_at` (migration 063), `TIMESTAMPTZ NULL`. Optional deadline by which attendees should submit their availability when the plan uses "Request availability" mode (`alt_times_mode = 'availability'`). Must be before `starts_at`. Automatically cleared when the plan's mode changes away from availability.
- `newchums.events.is_qa` (migration 065), `BOOLEAN NOT NULL DEFAULT false`. Marks a plan as a QA/testing plan. QA plans are invisible to normal users but fully functional for super admins. Normal users see 404 on direct access, and QA plans are excluded from all feeds, emails, notifications, and cron processing for non-admins. Super admins see QA plans in feeds and receive cron-driven emails/notifications normally. QA plans are excluded from KPI metrics and the public explore feed. Partial index `idx_events_is_qa` for efficient filtering.
- `newchums.roadmap_items.status` CHECK constraint updated (migration 066) to add `'planned'` status. Valid values are now: `'received'`, `'needs_clarification'`, `'in_progress'`, `'planned'`, `'completed'`, `'not_planned'`. Items with `received` status are only visible to the author and super admins on the public roadmap endpoints (`GET /roadmap`, `GET /roadmap/:id`, `GET /roadmap/:id/attachment`); once a super admin changes the status to any other value the item becomes publicly visible (unless `is_private` is also set — see migration 072).
- `newchums.roadmap_items.is_private` (migration 072), `BOOLEAN NOT NULL DEFAULT false`. Privacy gate that is independent of `status`. When true, the item (and its attachment) is only visible to the author and super admins, regardless of status. Lets a super admin advance an item through the workflow (e.g. set to `'planned'`) while keeping items containing personal information out of public view. Toggled via the admin Edit dialog (`POST /admin/roadmap/:id/edit` accepts `is_private`). The two visibility gates are OR'd: an item is hidden from non-author non-admin viewers iff `(status = 'received' OR is_private = true)`. The public roadmap list and item detail pages display a "Private" chip next to the status badge for the author so they understand the item is restricted.
- `newchums.roadmap_items.is_anonymous` (migration 067), `BOOLEAN NOT NULL DEFAULT false`. When true, public API responses (`GET /roadmap`, `GET /roadmap/:id`) replace the author username with `"anonymous"` and omit `author_user_id`. Admin endpoints (`GET /admin/roadmap`) always return the real author. The submit form (`POST /roadmap`) accepts an `is_anonymous` boolean. The admin table shows an "Anon" badge next to the real author for anonymous submissions.
- `newchums.event_rsvps.hide_name` (migration 068), `BOOLEAN NOT NULL DEFAULT false`. Per-plan privacy toggle. When true, the attendee's real name is replaced with their @handle in the `GET /events/:id` RSVP response; the handle and avatar remain visible. Toggled via `POST /events/:id/hide-name` (authenticated, toggles the viewer's own RSVP). The `hideName` field is only returned to the viewer for their own RSVP entry. Admin user diagnostics still show the real name via the users table.
- Backfill `committed_at` for going RSVPs (migration 069). The join-request approval path (`POST /events/:id/join-request/:requestId/approve`) was inserting RSVPs without setting `committed_at`, causing those attendees' Chum Stats to show `0 of 0` for "Going follow-through" and "Shows up." The API code path was fixed and existing rows backfilled. All code paths that create a `'going'` RSVP must set `committed_at` — see migration 041 for the original design intent.
- `newchums.shoutouts` (migration 073), moderated post-plan positive notes between participants. Columns: `id` (UUID PK), `plan_id` (FK, CASCADE), `sender_user_id` (FK, CASCADE), `recipient_user_id` (FK, CASCADE), `message` (TEXT, capped 280 chars in API), `status` (`pending`/`approved`/`rejected`, default `pending`), `created_at`, `updated_at`, `reviewed_at`, `reviewed_by_user_id` (FK SET NULL). Constraints: `shoutouts_no_self`, `shoutouts_status_valid`, and `shoutouts_unique_per_slot UNIQUE (plan_id, sender_user_id, recipient_user_id)`. Partial indexes for the moderation queue (`status = 'pending'`) and recipient profile section (`status = 'approved'`). API endpoints: `POST /events/:id/shoutout` (sender, upsert via `ON CONFLICT … WHERE shoutouts.status = 'pending'` so the slot locks after moderation), `GET /public/users/:handle/shoutouts` (recipient's approved shout-outs on the public profile; auth optional, owner sees their own items even when the section is hidden), `GET /admin/shoutouts` (super admin queue with status filter), `POST /admin/shoutouts/:id/status` (approve/reject; on approval inserts a `shoutout_received` notification with metadata `{ planTitle, planId }` for the recipient, no email). The moderation queue is gated by the standard `requireSuperAdmin` helper and badge-counted via the existing `admin_view_timestamps` table under section key `shoutouts`. The recipient bell notification deep-links to `/u/<handle>#shoutouts`. Approved shout-outs render in a "Shout-outs" section on the recipient's public profile (`/u/<handle>`); the section is intentionally section-level only with no per-shout-out curation.
- `newchums.users.is_hidden_shoutouts` (migration 074), `BOOLEAN NOT NULL DEFAULT false`. **Section-level** visibility toggle for the public-profile shout-outs section. When true, the Shout-outs section is hidden from non-owner viewers on `/u/<handle>`; the owner still sees the section here in a dimmed preview with a "Section hidden from visitors (Settings → Privacy)" caption. **Settable only from Settings → Privacy ("Hide shout-outs from my public profile"),** which writes through `PUT /profile`. There is intentionally no inline control for this flag on the public profile — the inline control on the public profile is per-card (see migration 076). Replaces the previous private "Shout-outs received" section on `/profile` and the `GET /profile/shoutouts` endpoint, both of which were removed when this column shipped.
- `newchums.shoutouts.hidden_by_recipient` (migration 076), `BOOLEAN NOT NULL DEFAULT false`. **Per-card** visibility toggle the recipient can flip from the inline icon button on each shout-out card on their public profile. Independent from the section-level `users.is_hidden_shoutouts` flag (migration 074); both dimensions are respected. When true, `GET /public/users/:handle/shoutouts` excludes the row for non-owner viewers entirely, while the owner still receives it with `hiddenByRecipient: true` so the card can render in a dimmed preview state alongside the "Show this shout-out" icon. Togglable via `PATCH /shoutouts/:id` with body `{ hidden: boolean }`, recipient-only (auth required, 403 otherwise). The inline UI is a subtle eye / eye-off `IconButton` at the top-right of each card with tooltips "Hide this shout-out" / "Show this shout-out", visible only when the viewer is the profile owner.
- `newchums.event_invites` single-identity cleanup (migration 075). Adds `CHECK ((user_id IS NULL) <> (email IS NULL))` as `event_invites_single_identity` so every row has exactly one recipient identity column populated. Migration first normalizes any legacy rows that had both columns set (clearing `email` and keeping `user_id`), then deletes email-only rows whose address matches an existing user who already has a user_id-keyed invite on the same event (to prevent a duplicate under the `(event_id, user_id)` unique index), then resolves the remaining email-only rows to `user_id` when the email matches a user account. Mirrors the same email -> user_id normalization the application performs on new inserts (POST `/events`, POST `/events/:id/invite`). The constraint is added via a DO block keyed on `pg_constraint.conname` so the migration is idempotent. Partial unique indexes from migration 024 are preserved as-is; the cross-key case still requires the application-side SELECT-before-INSERT check.

PostGIS is available for geo queries.

### Local recognition badges

The attendance-record endpoint (`GET /public/users/:userId/attendance-record`) returns a `badges` array alongside existing Chum Stats. Badges are public and returned for all viewers (authenticated or not).

**Schema:** `newchums.user_badges` (migration 070) stores precomputed badge results. Primary key `(user_id, badge_type)`. Columns: `tier`, `count`, `rank`, `total_in_area`, `computed_at`.

**Badge types:**

| Badge | Metric | Eligibility criteria |
|-------|--------|---------------------|
| Top Attendee | Plans attended with follow-through | Going RSVP, `committed_at` set, no unresolved no-show/very-late issues, event not canceled, not QA |
| Top Host | Plans successfully hosted | Host of non-canceled event, not QA, at least one non-host committed attendee, cancellation_reason != 'no_attendees' |

**Tiers (percentile of local ranking):**

| Tier | Percentile | Meaning |
|------|-----------|---------|
| Gold | Top 10% | Highest activity in area |
| Silver | Top 20% | Very active in area |
| Bronze | Top 30% | Active in area |

**Key parameters:**

- **Time window:** Rolling last 12 months (`e.starts_at >= NOW() - 365 days`)
- **Minimum threshold:** 1 qualifying plan (intentionally low for early-stage community; constant `BADGE_MIN_THRESHOLD` in the cron function)
- **Local area:** 50 km radius from each user's `home_lat`/`home_lng` (Haversine distance, constant `BADGE_RADIUS_KM`). All users with a home location within this radius are included in the comparison group.
- **No location = no badges:** Users without a home location set receive an empty badges array.

**Update cadence:**

- Badges are **precomputed hourly** by the `computeLocalBadges()` cron function, which runs as part of the existing Cloudflare Worker scheduled handler (`0 * * * *`).
- The cron function fetches global attendee/host counts in two queries, then ranks each located user against their 50 km neighborhood in-memory using Haversine distance.
- Results are written to `newchums.user_badges` (full table replace: DELETE + INSERT).
- The attendance-record endpoint reads badges with a simple `SELECT ... WHERE user_id = ?` — no per-request aggregation.
- A badge can appear, change tier, or disappear after the next hourly cron run.

**Response shape (per badge):**
```json
{ "type": "top_attendee", "tier": "gold", "count": 12, "rank": 1, "totalInArea": 47 }
```

**UI:** Badges render as compact tier-colored pill chips with a trophy icon in the Chum Stats card, between the header and the reliability metrics. Each badge has a tooltip explaining the tier, rank, area context, and 12-month window.

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
- Google Analytics (gtag.js, measurement ID `G-MN49WWXHDJ`): production analytics, loaded via Next.js `<Script>` in root layout, production only

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
- Cron Triggers: `[triggers] crons = ["0 * * * *"]`, hourly; processes attendance assurance, daily unread-chat digest, event match digest, and post-plan feedback emails
- Vars include `POSTMARK_TEMPLATE_UNREAD_CHAT_DIGEST`, `POSTMARK_TEMPLATE_EVENT_CHANGED`, `POSTMARK_TEMPLATE_CONFIRMATION_REQUEST`, `POSTMARK_TEMPLATE_PLAN_AT_RISK`, `POSTMARK_TEMPLATE_PLAN_FEEDBACK`, `POSTMARK_TEMPLATE_COMMUNITY_JOIN_REQUEST`, `POSTMARK_TEMPLATE_COMMUNITY_JOIN_APPROVED`, `POSTMARK_TEMPLATE_COMMUNITY_JOIN_DECLINED`, and other template IDs

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
- Account deletion (`DELETE /account`) does not yet cascade to events, event_rsvps, event_invites, event_alt_times, event_chat_messages, event_chat_reads, event_join_requests, event_confirmations, or host_attendee_removals; must be updated when those tables accumulate production data.
- `interest_id` on `events` is a legacy FK; `event_interests` is the canonical many-to-many source of truth. The legacy column should be dropped in a future migration once all queries are migrated.
- Legacy scaffolded email env vars (`POSTMARK_TEMPLATE_EVENT_RSVP_UPDATE`, `POSTMARK_TEMPLATE_EVENT_REMINDER`) can be removed once confirmed unused.
