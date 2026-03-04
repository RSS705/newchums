# Technical Specifications

Last Updated: March 3, 2026  
Version: 5.5

This document defines the authoritative technical architecture of NewChums.  
It describes **what exists today** and the structural commitments we are making.

---

## 1) Mission Context

NewChums is an event-first platform focused on helping people meet through shared real-world activities.

Core action:
- Attend, be notified of, and create small public events around shared interests.

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
| VS Code | Primary editor |
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

## 5) Canonical Host and Middleware

### Problem solved

Google OAuth PKCE stores `code_verifier` in a cookie tied to origin.  
If sign-in starts on `www.newchums.com` and callback lands on `newchums.com`, the cookie is not sent → “Invalid code verifier.”

### Implementation

Middleware at `web/src/middleware.ts` runs before Auth.js.  
Any request to a host starting with `www.` is 301-redirected to the same path + query on the non-www host.

- Matcher includes `/api/auth/*` so OAuth flows always land on canonical host.
- Exclusions: static assets (`/_next/static`, `/_next/image`, `favicon.ico`, `robots.txt`, `sitemap.xml`).

---

## 6) Web ↔ API Auth Model (Bearer Token)

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

## 7) API Worker Responsibilities and Endpoints

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

| Key | Description | Frequency |
|-----|-------------|-----------|
| `event_match` | New events matching my interests | Immediate / daily / every 3 days / weekly / monthly / never |
| `host_join` | Someone joins my event | Immediate / daily / every 3 days / weekly / never |
| `host_leave` | Someone leaves my event | Immediate / daily / every 3 days / weekly / never |
| `feedback_requests` | Post-event feedback reminders (day after) | On/off only |
| `event_reminders` | 24-hour event reminders | On/off only |
| `event_changed_canceled` | Event canceled or changed | Immediate / daily / every 3 days / weekly / never |
| `product_announcements` | Product updates | Immediate / daily / every 3 days / weekly / monthly / never |

Defaults are applied at account creation (credentials signup, OAuth) and backfilled for existing users with missing keys. GET normalizes stored prefs and optionally persists backfilled values.

### Account deletion

- **Endpoint:** `DELETE /account` (auth required).
- **Credentials users:** Must send `{ password: string }` in body; password is verified before deletion.
- **OAuth users:** Empty body; no password required.
- **UI:** Settings → Danger zone → Delete account. Confirmation dialog; on success, user is signed out and redirected to `/`.
- **Deletion scope (current):** Hard delete in a single transaction: `user_interests`, `user_profile`, `newchums.users`. Cascades handle `password_reset_tokens`, `email_verification_tokens`, `email_change_requests`.
- **Maintenance note:** As the schema evolves (e.g. events, event_rsvps, chum groups), the delete logic in `api/src/index.ts` must be updated to remove or reassign related rows. Check `DELETE /account` when adding new user-scoped tables.

### Privacy preferences (Settings toggles)

Users manage privacy preferences in **Settings** (`/settings`). These toggles control profile visibility. Stored in `users` table (columns added in migration 013). Loaded via `GET /profile`, persisted via `PUT /profile` with `is_hidden_from_search` and `is_hidden_from_external_indexing` in the body. Both default to `false` (OFF) for new and existing users.

**Privacy toggles (current):**

| Column | UI label | Description | Enforcement |
|--------|----------|-------------|-------------|
| `is_hidden_from_search` | Hide my profile from NewChums search | When ON: profile not in Chum searches; others cannot add as chum or invite to events. Event attendees can still view profile. | Not yet implemented |
| `is_hidden_from_external_indexing` | Hide my profile from search engines | When ON: public profile page emits `robots: noindex, nofollow` so search engines do not index it. | Implemented |

**Implementation notes:** UI: `web/src/app/(app)/settings/PrivacyToggleRow.tsx`, `SettingsClient.tsx`. API: `GET /profile` and `PUT /profile` in `api/src/index.ts`. Schema: `web/sql/013_add_privacy_columns.sql`. Future work: enforce these flags in search, chum discovery, and SEO (e.g. noindex meta).

### Profile, onboarding, and lookups

- `GET /profile`, `PUT /profile` (auth required)
- `GET /public/users/:handle` (public; no auth) — returns public profile by handle: `{ user: { userId, displayName, handle, age, bio, hobbies, avatarUrl } }`. Age computed from DOB server-side; DOB never exposed.
- `GET /handles/available?handle=...` (auth required)
- `POST /user/username` (auth required)
- `POST /user/date-of-birth` (auth required)
- `GET /interests`

### Contact form

- `POST /contact` (public, no auth required)
  - JSON: `{ name: string, email: string, subject: string, message: string, website?: string, turnstileToken?: string }`
  - `subject`: required, must be one of (Account issue, Safety concern, Feature request / suggestion, Bug report, Partnership / business inquiry, Other)
  - Validation: name 1–80 chars, email valid format, message 10–2000 chars
  - Honeypot: `website` field; if non-empty, returns `{ ok: true }` without sending
  - Rate limit: 5 submissions per 10 minutes per IP (KV `CONTACT_RATELIMIT_KV`, optional)
  - **Spam protection (logged-out):** Cloudflare Turnstile required when `TURNSTILE_SECRET_KEY` is set. Logged-in users (Bearer token) skip Turnstile.
  - Email: Postmark sends to `contact@newchums.com` from `contact@newchums.com`, Reply-To from form; subject line "NewChums: Contact — &lt;Subject&gt;"; includes Subject, Name, Email, Message, Timestamp, IP, Environment; if logged in, includes userId and username

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

## 8) Content Safety (Inappropriate Word Validation)

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

## 9) Storage (Database + R2)

### Neon Postgres

Core tables include:
- `users` (credentials + oauth users; includes `email_verified_at`, `password_hash`, `avatar_key`, etc.)
- `user_profile` (profile fields; includes `bio` per migration 009)
- token tables for email verification and password reset
- `email_change_requests` (migration 011)
- interests tables
- `user_profile.notification_prefs` (JSONB, migration 012) — per-notification-type enabled + frequency
- `users.is_hidden_from_search`, `users.is_hidden_from_external_indexing` (boolean, migration 013) — privacy toggles (Settings), default false; is_hidden_from_external_indexing enforced via noindex meta on public profile page
- events and rsvps (present; implementation varies by feature maturity)

PostGIS is available for geo queries.

### Avatar storage (R2)

- Bucket: `newchums-media` (binding `MEDIA_BUCKET`)
- Users table stores `avatar_key` like `avatars/<userId>/<ts>.webp`
- Public serving via `GET /users/:userId/avatar`

**Cross-environment consistency:**  
When sharing the same DB between local and production, set `NEXT_PUBLIC_AVATAR_BASE_URL` in `web/.env.local` to the production API URL so all media operations and avatar display resolve through the same R2-backed origin.

---

## 10) Observability

- Sentry: frontend + API error tracking
- Axiom: API request logs
- Plausible: production analytics

---

## 11) Wrangler and Deploy Configuration (Invariants)

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

## 12) Runtime Constraints (Web)

Do NOT add `export const runtime = "edge"` to routes. OpenNext Cloudflare shims the edge runtime to an empty module, causing 500 Internal Server Error; Workers already run at the edge.

### Middleware patch

A post-build patch is required because Next.js 16 may emit middleware with `nodejs` runtime markers that break OpenNext.  
`web/scripts/patch-functions-config.js` runs after `next build` to remove/adjust the middleware entry in the functions config manifest.

Validation command:

```bash
cd web && npm run build
```

---

## 13) Technical Debt (Acknowledged)

- Web worker name suffix mismatch (`newchums-web-dev` is production).
- Schema normalization/cleanup will be required before broader public launch.
