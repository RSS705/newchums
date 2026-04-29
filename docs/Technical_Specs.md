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

### Organizer subscription plans (implemented, no billing yet)

NewChums defines organizer subscription behavior **before** payment processing exists. The goal is to establish stable product boundaries and backend access rules now, then add billing later only after the value is proven.

**Schema:** `users.subscription_plan TEXT NOT NULL DEFAULT 'free'` (migration 083). Constrained to `('free', 'super_host', 'community_pro')`. Sparse index on non-free plans. Change history tracked in `subscription_plan_history` table (audit trail with `old_plan`, `new_plan`, `assigned_by`, `assigned_at`).

**Current plans:**

| Plan | Scope | Purpose |
|------|-------|---------|
| `free` | User-level | Baseline user and community functionality |
| `super_host` | User-level | Advanced **plan / event-level** functionality anywhere the user hosts |
| `community_pro` | User-level | Advanced **community-level** functionality for communities owned by the user, and it **includes Super Host benefits** |

**Access resolution (implemented):**
- `hasSuperHostAccess(plan)`: returns `true` when plan is `super_host` or `community_pro`.
- `hasCommunityProAccess(plan)`: returns `true` when plan is `community_pro`.
- `communityInheritsProAccess(sql, communityId)`: joins `communities.owner_user_id` to `users.subscription_plan` and checks for `community_pro`.
- Helpers live in `api/src/lib/subscriptionAccess.ts`.
- `GET /profile` returns `subscription_plan` alongside `role`.

**Community Pro inheritance:**
- A community inherits Community Pro access from its **owner's** plan. If the owner has `community_pro`, the communities they own gain premium community features.
- A user may own **at most 5 active communities**, regardless of plan. Enforced in `POST /communities` via `countOwnedCommunities()` (counts non-closed communities owned by the user). Attempting to create a 6th returns HTTP 403 with `error: "COMMUNITY_CAP_REACHED"`; the Create Community form surfaces this as a simple dialog. Closing an existing community frees up a slot. Community Pro therefore covers all five of a Community Pro user's owned communities.

**Admin controls:**
- Super admins can view and change any user's subscription plan from the **Users** tab (`/admin/chums`) via an inline dropdown.
- API endpoint: `PATCH /admin/users/:id/subscription-plan` (body: `{ plan: "free" | "super_host" | "community_pro" }`).
- All changes are logged to `subscription_plan_history`.

**User-facing surface:**
- The **Your Plan** page (`web/src/app/(app)/your-plan/`, route `/your-plan`) is the canonical in-app view of the plan model. It is linked from the top-right account menu in `AppShell` (alongside Settings and Give Feedback) and is reachable by every signed-in user. The page reads the viewer's plan from `GET /profile` (`data.profile.subscription_plan`) and renders three calm tier cards (Free / Super Host / Community Pro) with only the bullets that are actually enforced at runtime today.
- There is **no pricing, checkout, upgrade CTA, or billing flow** on this page by design, it's an account/access surface, not a sales page. A short, calm rollout note at the bottom acknowledges that plans are currently assigned by the NewChums team and that plan details will expand as more organizer features launch.
- **Keep the tier bullets honest.** When a new feature actually starts being gated at runtime (e.g. a new `hasSuperHostAccess` call-site ships), add its bullet to `PLANS` in `YourPlanClient.tsx` in the same change set. Do not pre-populate speculative bullets.

**Current product rules:**
- Plans are assigned through internal admin tooling. There is **no billing, checkout, or self-service upgrade flow yet**.
- There is **no separate Founding Access layer**. Early pilot access is handled by manually assigning `super_host` or `community_pro`.
- **Community ownership cap:** all users are limited to 5 active owned communities (see "Community Pro inheritance" above). Enforced at creation time.
- While a premium feature is still under construction, it may remain restricted with **super-admin-only** or **QA-only** gating until it is ready.
- Premium functionality should be hidden when unavailable in normal product UI rather than surfaced as locked tabs inside core workflows.

**Feature access strategy:**
- Product plans are the user-facing bundles.
- Individual premium capabilities may still be implemented internally as distinct modules or checks.
- The backend resolves effective access from the user's assigned plan plus any temporary internal override needed during development.

**Strategic scope guardrail:**
Communities should first become the **smallest organizer operating system that creates obvious value**: a public-facing hub, membership, plans, communication, legitimacy, and easy sharing. NewChums should not overbuild communities into a full ERP or vertical-specific platform unless real organizer demand clearly justifies that move.

---

## 6) Canonical Host and Middleware

### Problem solved

Google OAuth PKCE stores `code_verifier` in a cookie tied to origin.
If sign-in starts on `www.newchums.com` and callback lands on `newchums.com`, the cookie is not sent → "Invalid code verifier."

### Implementation

The Next.js proxy file at `web/src/proxy.ts` (formerly `middleware.ts`, renamed for the Next.js 16 `proxy` convention) runs before Auth.js.
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
| Lightweight-signup magic link | `POSTMARK_TEMPLATE_MAGIC_LINK_SIGNUP` (template 44523927) |
| Plan-signin notice (email already has an account) | `POSTMARK_TEMPLATE_PLAN_SIGNIN` (template 44523947) |
| Sign-in link for `password_setup_pending` accounts (return-visit, distinct copy from initial signup) | `POSTMARK_TEMPLATE_SIGNIN_LINK` (template 44802964) |

Defaults are applied at account creation (credentials signup, OAuth) and backfilled for existing users with missing keys. GET normalizes stored prefs and optionally persists backfilled values.

**Event match digest (batch):** The hourly `scheduled` handler runs `processEventMatchDigest` after the unread-chat digest block. Recipients must have `event_match` enabled, a home location, and meet the same in-person / future / not-full / travel-radius / “new since last digest” gates as for public plans. **Public** plans require at least one overlapping hobby between the user and the plan. **Chums-only** plans use the **same** hobby overlap and distance rules; additionally the recipient must appear on the **host’s** On NewChums connections (`user_contacts`: host `user_id`, recipient `linked_user_id`, `type = 'on_newchums'`). **Invite-only** plans are excluded. **Already-connected suppression:** plans are excluded from a recipient's digest if they already have any `event_rsvps` row for that plan (any status: `going` / `maybe` / `cant_make_it`) or any `event_invites` row matched by `user_id` or by `LOWER(email) = LOWER(users.email)` (so a legacy email-only invite created before the recipient signed up still counts). The intent is that the digest is "new plans you're not yet involved with", not a second outreach channel for plans the recipient was already invited to or interacted with. **Community members-only gate (additive):** when a plan has `community_id IS NOT NULL AND hide_from_explore = true` (the "only show this plan to community members" toggle), the digest additionally requires the recipient to be an active member of that community (`community_members` row with matching `community_id`, `user_id`, `status = 'active'`). This mirrors the Explore-feed visibility rule and is **layered on top of** every other digest criterion; it narrows eligibility, never broadens it. Concretely: public-visibility plans scoped to community members only reach matching-hobby, in-radius, non-RSVP'd users who are also active members; chums-only plans scoped to community members only reach users who pass both the chums-contact check and the membership check. A plan with `community_id IS NOT NULL AND hide_from_explore = false` is treated like any other public/chums-only plan; community linkage alone does not narrow digest eligibility, only the members-only toggle does. QA plans and super-admin bypass rules are unchanged: the community gate is applied uniformly, so a super admin who isn't in the community still won't receive a community-members-only plan in their digest.

**Chum preference filtering (digest, implemented):** After the SQL query selects candidate (recipient, plan) pairs, a two-directional chum preference check runs before emails are sent:
1. **Viewer→host:** Does the host's metrics meet the recipient's chum preference thresholds (including hosting quality)? If not, the plan is excluded from this recipient's digest.
2. **Host→viewer:** Does the recipient's metrics meet the host's chum preference thresholds? If not, the plan is excluded (the host doesn't want this person matched to their plan).
Both checks use the centralized `evaluateChumPreferences` helper with `PREF_THRESHOLDS` (open=0, preferred≥35, important≥45, required≥55) against `user_metrics` scores (baseline 50). Users with preferences disabled or at "open" for all metrics pass all checks. If all plans for a user are filtered out, no digest email is sent for that user. **Plan-level overrides** are respected: if a plan has `pref_overrides` set, `resolveEffectiveHostPrefs` merges them with the host's global preferences before the host→viewer check (e.g. fully disabled or specific metrics bypassed).

Each RSVP status has a dedicated host notification email, each gated on its own preference toggle. Each email includes a tokenized unsubscribe link that toggles the corresponding preference. Migration 033 removes the obsolete `event_reminders` key and `frequency` fields from existing JSONB data.

### Postmark email templates (Mustachio)

Postmark renders templates with **Mustachio**, a Mustache variant with two quirks that together caused most of the recurring email bugs in this codebase. If you're touching any template or any `send*Email` helper, read this whole subsection first.

#### Quirk 1: Empty strings are truthy

In Mustachio, `""` is truthy inside `{{#variable}}` blocks. That means `{{#someField}}...{{/someField}}` will render even when `someField` is the empty string. **Callers must never pass `""`** for an "absent" value; use `null` or omit the field entirely. Any coercion like `someField || ""` is a footgun; callers should write:

```ts
someField: typeof someField === "string" && someField.trim() ? someField.trim() : null,
// or use the `hasContent` helper in api/src/email/send.ts:
someField: hasContent(someField) ? someField : null,
```

#### Quirk 2: No parent-scope lookup inside a scalar section

This is the critical rule and the one we learned the hard way. In standard Mustache, `{{#foo}}...{{bar}}...{{/foo}}` looks up `bar` first on `foo`'s context, then walks up to the parent. **Postmark's Mustachio does not walk up.** Inside a scalar section, any `{{otherField}}` lookup that isn't on the section's own value resolves to empty and renders as a blank space.

**This means the `{{#hasField}}...{{field}}...{{/hasField}}` pattern does NOT work in Postmark**, even though it's legal Mustache. Inside `{{#hasMessage}}` where `hasMessage` is `true`, the section's "context" is the boolean, which has no `message` property, so `{{message}}` renders nothing. You get the wrapper but not the value, i.e. an empty quoted block.

#### The one safe pattern: same-name scalar section + `{{.}}` inside

This is the only conditional-section idiom supported by Postmark Mustachio for rendering optional string values. Every new and existing template in this codebase uses it:

```ts
// API: pass the value itself, null when absent (NEVER empty string).
TemplateModel: {
  hostMessage: hasContent(hostMessage) ? hostMessage : null,
}
```

```mustache
{{! Template: same-name scalar section, dot renders the scalar value. }}
{{#hostMessage}}
  <p>"{{.}}"</p>
{{/hostMessage}}
```

How it behaves:
- `hostMessage: null` → section hidden ✓
- `hostMessage: "some text"` → section renders with `"some text"` inside ✓
- `hostMessage: ""` → would render an empty block, but the API layer never sends `""`. This is the API-side guarantee that makes the pattern bulletproof.

#### True boolean gates (no inner value lookup)

When a conditional has NO inner variable lookup (it only toggles static text or static HTML), a plain boolean section works fine:

```ts
TemplateModel: {
  isFinal: true, // or false
}
```

```mustache
{{#isFinal}}FINAL REMINDER{{/isFinal}}
```

This is safe because there's no `{{someOtherField}}` inside the section to trip Quirk 2. Used for things like `isFinal` / `isReminder` on the confirmation-request emails. **Never** put a `{{otherField}}` lookup inside a boolean section; if you need both a gate and a value, the same-name pattern above is always the answer.

#### Multi-item lists: pre-render server-side

If a template needs to emit a variable-length list (e.g. multiple "what changed" rows, multiple unread chat cards), build the entire list block as a single pre-formatted string in the API helper and render it with `{{#blockField}}{{{.}}}{{/blockField}}` (triple-brace for HTML, double-brace for text). Reference implementations:

- `sendUnreadChatDigestEmail`: `planCards` / `planCardsText` built via `buildPlanCardHtml` / `buildPlanCardText`.
- `sendEventChangedEmail`: `changesBlockHtml` / `changesBlockText` built inline from the `changes[]` array.

Do NOT try to build a fixed-slot array (`change1`, `change2`, ... `change5`) with per-slot boolean gates. That pattern hits Quirk 2 and can't be rescued.

#### Iteration over arrays

Arrays of objects DO work in Postmark Mustachio because the section context becomes the item object, and `{{propertyOnItem}}` is a valid lookup on that item:

```ts
TemplateModel: {
  orders: [{ id: "A", total: "$10" }, { id: "B", total: "$20" }],
}
```

```mustache
{{#orders}}
  <p>{{id}}: {{total}}</p>
{{/orders}}
```

Use this only for TRUE lists (same shape per item). For heterogeneous blocks or styled wrappers, pre-render server-side as above.

#### Never embed literal Mustachio tag syntax in template text

Postmark's parser scans every character of the template, including HTML comments, backticks, and string literals, looking for `{{...}}` / `{{{...}}}` tokens. A comment like `<!-- {{#foo}} is the opening tag -->` or `<!-- dumped via {{{.}}} -->` will be parsed as a real tag and the save will fail, sometimes with the specific "scope block ... not closed" error, sometimes with a vague "There is an unknown issue parsing the template." Describe tag syntax in prose in this doc, never inside template files.

**Rule of thumb:** if you'd write the literal `{{` anywhere in an `.html`/`.txt` template for any reason other than being an actual tag (inside Outlook-conditional `<!--[if mso]>...` markup is fine; those run through Postmark's variable substitution), rewrite the passage.

**One exception that IS safe:** Outlook conditional comments like `<!--[if mso]><v:roundrect ... href="{{ctaUrl}}" ...></v:roundrect><![endif]-->`. Postmark actually substitutes variables inside these, because they're intentional fallback markup for Outlook's mail client. That's why every template in the repo has `{{url}}` inside `[if mso]` without trouble. The ban is on PLAIN HTML comments that happen to mention tag syntax for documentation purposes.

#### Deploying a template fix: both sides must ship together

Every template fix touches two systems:

1. The **API `send*Email` helper** in `api/src/email/send.ts`, which is what the code passes into `TemplateModel`.
2. The **Postmark-hosted template** in the dashboard, which is what renders the HTML/text.

Both have to be on the new shape for the email to render correctly. Until both sides land, you can be in one of these broken states (all of which have bitten us):

| API helper | Postmark template | Behaviour |
|---|---|---|
| old (`field \|\| ""`) | old (`{{#field}}...{{field}}...{{/field}}`) | The original empty-block bug when `field` is absent |
| old | new (same-name + `{{.}}`) | Field renders when present (old still sends the raw string); but API may still send `""` on some paths and leak the empty-block bug |
| new (`field: hasContent(field) ? field : null`) | old | Field renders when present, block correctly hidden when absent |
| new | new | Correct: renders when present, hidden when absent |

Checklist when shipping a template fix:

1. Edit the local `.html` and `.txt` files in `api/src/email/templates/`. That's the source of truth.
2. Update the corresponding `send*Email` helper in `api/src/email/send.ts` to send the value as `field: hasContent(x) ? x : null` (never `x || ""`).
3. Deploy the API (`cd api && wrangler deploy`). A running `wrangler dev` session needs a restart to pick up `send.ts` edits.
4. Paste the updated local HTML and text into Postmark dashboard template #N and save.
5. If the dashboard "Template Model" JSON panel (used by the **Send test email** button) references removed fields like `hasFoo`, update it to match the new shape or you'll see confusing preview results that don't match production.
6. End-to-end test on prod by exercising the real flow (not the dashboard test-send). Include both the "value present" and "value absent" cases.

The local `.html` and `.txt` files are the source of truth; the Postmark dashboard is what actually ships. Drift between the two is a recurring class of email bug, so treat them as one change set.

#### Template ID map

| Local filename | `POSTMARK_TEMPLATE_*` env var | Template ID |
|---|---|---|
| `verifyEmail` | `POSTMARK_TEMPLATE_VERIFY` | 43483393 |
| `passwordReset` | `POSTMARK_TEMPLATE_RESET` | 43483403 |
| `eventInvite` | `POSTMARK_TEMPLATE_EVENT_INVITE` | 43910392 |
| `eventJoin` | `POSTMARK_TEMPLATE_EVENT_JOIN` | 43922675 |
| `eventLeave` | `POSTMARK_TEMPLATE_EVENT_LEAVE` | 43921920 |
| `eventMaybe` | `POSTMARK_TEMPLATE_EVENT_MAYBE` | 43922237 |
| `eventChanged` | `POSTMARK_TEMPLATE_EVENT_CHANGED` | 43971187 |
| `attendeeRemoved` | `POSTMARK_TEMPLATE_ATTENDEE_REMOVED` | 43923102 |
| `joinRequestToHost` | *(hard-coded id)* | 43906440 |
| `joinRequestApproved` | *(hard-coded id)* | 43906609 |
| `joinRequestDeclined` | *(hard-coded id)* | 43906703 |
| `planAtRisk` | `POSTMARK_TEMPLATE_PLAN_AT_RISK` | 43984947 |
| `planAutoCancelled` | `POSTMARK_TEMPLATE_PLAN_AUTO_CANCELLED` | 44165043 |
| `planRemovedByAdmin` | `POSTMARK_TEMPLATE_PLAN_REMOVED` | 43998481 |
| `confirmationRequestUser` | `POSTMARK_TEMPLATE_CONFIRMATION_REQUEST_USER` | 44415561 |
| `unreadChatDigest` | `POSTMARK_TEMPLATE_UNREAD_CHAT_DIGEST` | 43975299 |
| `eventMatchDigest` | `POSTMARK_TEMPLATE_EVENT_MATCH_DIGEST` | 44018889 |
| `planFeedback` | `POSTMARK_TEMPLATE_PLAN_FEEDBACK` | 44091936 |
| `roadmapUpdate` | `POSTMARK_TEMPLATE_ROADMAP_UPDATE` | 44007454 |
| `communityJoinRequest` | `POSTMARK_TEMPLATE_COMMUNITY_JOIN_REQUEST` | 44111064 |
| `communityJoinApproved` | `POSTMARK_TEMPLATE_COMMUNITY_JOIN_APPROVED` | 44111212 |
| `communityJoinDeclined` | `POSTMARK_TEMPLATE_COMMUNITY_JOIN_DECLINED` | 44111205 |
| `communityMemberRemoved` | `POSTMARK_TEMPLATE_COMMUNITY_MEMBER_REMOVED` | 44452043 |
| `communityMemberUnblocked` | `POSTMARK_TEMPLATE_COMMUNITY_MEMBER_UNBLOCKED` | 44470363 |
| `communityJoinRequestReopened` | `POSTMARK_TEMPLATE_COMMUNITY_JOIN_REQUEST_REOPENED` | 44470744 |
| `concernReportAlert` | `POSTMARK_TEMPLATE_CONCERN_REPORT` | 44107767 |
| `magicLinkSignup` | `POSTMARK_TEMPLATE_MAGIC_LINK_SIGNUP` | 44523927 |
| `planSignin` | `POSTMARK_TEMPLATE_PLAN_SIGNIN` | 44523947 |
| `signinLink` | `POSTMARK_TEMPLATE_SIGNIN_LINK` | 44802964 |
| `emailChangeConfirm` | `POSTMARK_TEMPLATE_EMAIL_CHANGE_CONFIRM` | 43739983 |
| `emailChangeNotifyOld` | `POSTMARK_TEMPLATE_EMAIL_CHANGE_NOTIFY_OLD` | 43740027 |
| `emailChangeSuccess` | `POSTMARK_TEMPLATE_EMAIL_CHANGE_SUCCESS` | 43740066 |

### Host attendee removal

Hosts can remove attendees with status "going" or "maybe" from their plans via `POST /events/:id/remove-attendee`. The endpoint requires authentication and verifies the caller is the plan host. It:

1. Deletes the attendee's RSVP row from `event_rsvps`
2. Records the removal in `newchums.host_attendee_removals` (migration 034) for future host quality metrics, moderation review, and trust scoring
3. Sends a notification email to the removed user (Postmark template 43923102)

The `host_attendee_removals` table tracks: `event_id`, `host_user_id`, `removed_user_id`, `status_at_removal`, and `created_at`. Hosts cannot remove themselves or attendees with "can't make it" status (since they're already not attending).

### Lightweight plan signup (magic link, replaces guest participation)

Guest participation (unauthenticated users with nullable `user_id` + `guest_email`) has been removed (migration 084). In its place, unauthenticated visitors who land on a plan via a share or invite link see a **"Join to RSVP" card** that collects email, date of birth (18+), and Terms/Privacy acceptance, then emails them a one-click verification link. The flow is intentionally lightweight: no password is collected at this step. Clicking the link creates (or reuses) a real NewChums account with a `password_setup_pending = TRUE` flag and returns the user to the plan where they can RSVP, chat, and suggest alt-times. A soft in-app banner then nudges them to finish setup by setting a password; the nudge is non-blocking so the user can complete their RSVP first.

The magic link only confirms the email. It does not auto-RSVP, so the visitor still picks Going / Maybe / Can't make it on the plan itself.

**Account setup state (migration 086):** `newchums.users.password_setup_pending` is a boolean that disambiguates three otherwise-identical `password_hash IS NULL` states:

| State | `password_hash` | `password_setup_pending` |
|-------|-----------------|-------------------------|
| Full credential account | set | `FALSE` |
| Google-OAuth-only account | `NULL` | `FALSE` |
| Lightweight-signup in progress | `NULL` | `TRUE` |
| Lightweight-signup + password set | set | `FALSE` |

The flag is cleared any time a password is established: via Settings > Set a password (`POST /auth/password/set`), via the standard reset flow (`POST /auth/password-reset/confirm`), or any future migration path that sets `password_hash`. It is never set to `TRUE` outside the lightweight-signup insert, so existing Google-OAuth and credentials users are unaffected.

**Endpoints:**

- `POST /auth/plan-signup/request` (unauthenticated). Body: `{ email, date_of_birth, accepted_legal, turnstile_token, next }`. Validates email format, 18+ (via `isAtLeast18`), Turnstile, and legal-acceptance boolean. Server pins the current legal versions (clients can't forge them). Rate-limited per IP and per email via `checkRateLimit`. Branches on account state:
  - **No account / unverified account** → creates or refreshes the user row (auto-generated fun username via `generateFunUsername`, legal versions pinned, `email_verified_at = NULL`, `password_hash = NULL`, `password_setup_pending = TRUE` on fresh insert, DOB set), invalidates any prior unused `email_verification_tokens` rows for that user, issues a fresh hashed token with **15-minute TTL**, emails the magic link. Returns `{ ok: true, state: "pending" }`. An in-flight unverified row is refreshed but its `password_setup_pending` state is left untouched so a repeat submission doesn't clobber a completed setup.
  - **Verified account exists** → no DB writes. Sends a plan-signin notice pointing at `/login?next=<safe_next>`. Returns `{ ok: true, state: "existing_account", next }`. The client (`PlanSignupCard`) flips the card into an inline "You already have a NewChums account" panel that explains what happened, mentions the emailed sign-in link, and offers a **Sign in to continue** button that opens `/login?next=<plan>&email=<email>` (email prefilled). A secondary "Use a different email" action resets the card back to the idle state. After sign-in the normal `/login` flow returns the user to the plan URL, landing on the RSVP section.
- `POST /auth/magic-link/consume` (unauthenticated). Body: `{ email, token }`. Verifies the token against `email_verification_tokens` (shared table with credential-signup email verification), marks the row `used_at = NOW()`, sets `email_verified_at = NOW()`, and returns the user record for the Auth.js `magic-link` Credentials provider to build a session from. Rejects suspended users without consuming the token.
- `POST /auth/signin-link/request` (unauthenticated). Body: `{ email, turnstile_token }` (any client-supplied `next` is ignored, see below). Issues a magic sign-in link for accounts where `password_setup_pending = TRUE`, for the return-visit case where a user didn't set a password before logging out. Silently returns `ok` for non-pending accounts (or no account) so the endpoint cannot be used to probe account existence; only pending accounts actually receive an email. Rate-limited identically to plan-signup. **Email template:** sends `POSTMARK_TEMPLATE_SIGNIN_LINK` (template ID `44802964`, source files `signinLink.html` / `signinLink.txt`). Distinct from `POSTMARK_TEMPLATE_MAGIC_LINK_SIGNUP`, whose copy frames the email as a fresh signup confirmation; this template's copy is for an existing account signing back in. **Redirect target:** the server hard-codes `next = "/settings#account"` for this flow regardless of what the client posts. The recipient's open task is to finish setup; landing them on `/settings#account` puts the password-setup card in view immediately so they can complete it in one step. The magic link lands on `/auth/magic` like plan-signup, consumes the token via `POST /auth/magic-link/consume`, and Auth.js's `redirectTo: "/settings#account"` lands them on the password-setup section. The `password_setup_pending` flag stays `TRUE` until they actually call `POST /auth/password/set`, so the `PasswordSetupBanner` is visible alongside the in-page Account card.
- `POST /auth/password/set` (authenticated). Body: `{ password }`. First-time password setup for a lightweight-signup account. Only accepts the write when the caller's row has `password_setup_pending = TRUE`, so it cannot be used to bypass the current-password check on an established account. On success, hashes + stores the password, flips `password_setup_pending` to `FALSE`, and invalidates any outstanding `email_verification_tokens` rows for the user.

**Magic-link consumption on the web side**, `/auth/magic` page (server component) reads `?token`, `?email`, `?next` from the URL, checks current session:
- Already signed in as the same email → idempotent redirect to `next`.
- Signed in as a different email → `WrongSessionPanel` interstitial ("Sign out first") to prevent hijack.
- Not signed in → `MagicClient` calls `signIn("magic-link", { email, token, redirect: true, redirectTo: next })`. NextAuth's second Credentials provider (`magic-link`, registered alongside the password provider in `web/src/auth.ts`) POSTs to `/auth/magic-link/consume` via `NEXT_PUBLIC_API_BASE_URL`.

**Username auto-generation**, `generateFunUsername(sql)` in `api/src/username.ts` picks `<Adjective><Animal><###>` from curated lists in `api/src/data/usernameWords.ts` (e.g. `HappyOtter273`), validates against `USERNAME_REGEX` and `validateCleanText`, checks uniqueness against `username_norm`, and retries up to 10 times. Falls back to `Chum` + 6 hex chars.

**Login with password_setup_pending = TRUE:** when the user returns to `/login` and tries password sign-in without having set a password yet, the credentials provider in `web/src/auth.ts` throws `CredentialsSignin` with code `PasswordSetupPending`. `LoginClient` catches this and reveals a **Email me a sign-in link** button that POSTs to `/auth/signin-link/request` and tells the user to check their inbox. The dedicated `POSTMARK_TEMPLATE_SIGNIN_LINK` template is sent (not the lightweight-signup confirmation template), so the copy reads as "Sign in to NewChums" rather than "create your NewChums account". Clicking the link in the email takes them through the normal magic-link flow and lands them on `/settings#account`, with the `PasswordSetupBanner` and the in-page password-setup form both visible so they can finish setup in one step.

**Legacy password-less accounts (no pending flag):** Google-OAuth-only accounts, and any lightweight-signup accounts created before migration 086, have `password_hash = NULL` and `password_setup_pending = FALSE`. The credentials provider surfaces `NoPasswordOnFile` for these and the login page points them at "Forgot password?" (which accepts password-less accounts and sets a password, clearing any residual pending flag along the way) or Google sign-in.

**Setup-pending banner:** `PasswordSetupBanner` (client component) renders above the app shell for any authenticated viewer whose `password_setup_pending` is `TRUE`. The flag is resolved server-side via `getOrCreateAppUser` in `web/src/app/(app)/layout.tsx` and passed to `AppShell`, so no client round-trip is required to decide whether to render it. Dismissal is per-session (state in the component); the banner reappears on next page load until setup is actually completed. Settings > Account additionally swaps the "Change password" button for a "Set a password" card that explains the state and opens the same dialog in first-time-setup mode (no current-password field, POSTs to `/auth/password/set`).

**Token surface after removal of guest model:**

| Token | Purpose | Lifetime | Stored as |
|-------|---------|----------|-----------|
| `invite_token` (JWT, `purpose: invite_rsvp`) | View grant for invited email recipient; carries the invite row's identity so the invitee's new `user_id` can adopt the invite row after lightweight signup | 30 days | Signed JWT only |
| `share_token` (HMAC, deterministic per event) | View grant for share-link visitors **and** RSVP-bypass for the `invite_only` and `require_approval` gates (the host generated the link, so its holder is treated as host-extended access). Logged-out holders still go through the lightweight-signup card before RSVPing. | No expiry (deterministic) | Short base64url HMAC in the URL; persisted to `localStorage` as `nc_share_{eventId}` so the grant survives the lightweight-signup round-trip |
| Magic-link token | Single-use confirmation token for lightweight signup / sign-in | 15 min | Hashed row in `email_verification_tokens`, linked to `user_id` |

The prior `participation_token` (JWT, purpose `public_rsvp`), `guest_challenge` (10-min HMAC-signed code), `guest_confirmation` (JWT, purpose `guest_confirmation`), and 6-digit verification code have all been removed.

**Email template:** `POSTMARK_TEMPLATE_MAGIC_LINK_SIGNUP` (template 44523927) for new-account confirmation, `POSTMARK_TEMPLATE_PLAN_SIGNIN` (template 44523947) for existing-account sign-in notices. Source HTML/text live in `api/src/email/templates/magicLinkSignup.{html,txt}` and `planSignin.{html,txt}`.

**Invite-email adoption flow**, when a host invites an off-platform email via `POST /events/:id/invite`, the email link lands the invitee on `/events/[id]?invite_token=...`. Logged-out visitors see the same lightweight-signup card with their email pre-fill. After magic-link click, the `GET /events/:id` handler adopts any matching `event_invites` row (`WHERE LOWER(email) = <user email> AND user_id IS NULL`) onto their new `user_id` so they show as invited and bypass any join-approval gate.

### Plan details viewer/access state model

The `GET /events/:id` endpoint returns an `accessState` field that determines how the frontend renders the plan details page. There are four states:

| State | Condition | Experience |
|-------|-----------|------------|
| `"public"` | No auth, no valid token | Preview view: title, hobby chips, host label, date, approximate location + approximate-area map for in-person plans, attendance counts, description, an anonymized **Who's in** card (generic avatar rows labelled "Host" / "Attendee 1", "Attendee 2", ..., with a `+N more going` overflow row; no handles, names, avatars, or profile links are exposed, labels are fictional placeholders driven purely off the public `goingCount` / `maybeCount` fields), a locked **Can't make this time?** preview section explaining alt-time suggestions and nudging to sign in, and the **Interested in this plan?** sign-in / create-an-account CTA. The two preview sections render for all future non-canceled plans so the public page mirrors the logged-in rhythm; the preview sections do **not** reveal any additional private data beyond what the public payload already carries. |
| `"invite"` | No auth, valid `invite_token` or `share_token` | Full plan details (no RSVP buttons), plus the lightweight-signup card so the visitor can complete signup and come back fully authenticated. |
| `"authenticated"` | Logged in, not host, no RSVP | Full plan details with RSVP buttons. |
| `"attending"` | Logged in, is host or has RSVP | Full plan details with host/attendee controls. |

**Token types and persistence:**

| Token | Purpose | Created when | Expiry | Stored in |
|-------|---------|--------------|--------|-----------|
| `invite_token` | `invite_rsvp` | Host invites someone | 30 days | `localStorage` as `nc_inv_{eventId}` |
| `share_token` | Share link access | Deterministic HMAC per event | None | URL **and** `localStorage` as `nc_share_{eventId}` (mirrors `invite_token` persistence so the grant survives the lightweight-signup round-trip) |

Both `invite_token` and `share_token` are persisted in `localStorage` (keys `nc_inv_{eventId}` and `nc_share_{eventId}`) so that page reloads and the lightweight-signup round-trip do not degrade the viewer's access state. When a token-backed API call returns `accessState: "public"` (indicating the token is expired/invalid for this plan), the corresponding localStorage entry is cleared. The server-side gates re-verify the token on every RSVP, so client persistence never weakens the access check.

**RSVP requires authentication.** All RSVP / alt-time / confirmation / chat actions require a logged-in user. Unauthenticated visitors see the plan preview plus a Lightweight signup card (see the "Lightweight plan signup" section above). Once they click the magic link they return as an authenticated user and the normal RSVP flow unlocks.

**Invite adoption on first authenticated load.** The first time a newly-authenticated user opens a plan page that had an email-only invite matching their address, `GET /events/:id` runs an idempotent `UPDATE event_invites SET user_id = $uid WHERE LOWER(email) = $email AND user_id IS NULL` so the row is adopted onto their account. They then appear as invited (`isInvited: true`) and bypass any host-approval requirement.

**Email deep-linking (`?section=` query param):**
- Email CTAs can include `?section=feedback`, `?section=chat`, `?section=availability`, `?section=attendees`, `?section=confirmation`, or `?section=join-requests` to scroll the plan page to a specific section.
- The param is extracted on load, cleaned from the URL, and triggers `scrollIntoView` on a corresponding `id="plan-section-{name}"` anchor after event data renders.
- Auth-required sections are listed in `AUTH_REQUIRED_SECTIONS` at the top of `web/src/app/(app)/events/[id]/EventDetailClient.tsx` and mirrored in `AUTH_REQUIRED_EVENT_SECTIONS` in `web/src/app/(app)/layout.tsx`. The two lists must stay in sync; the layout copy is the server-side short-circuit that runs before any HTML renders.
- If the section requires authentication and the visitor has no auth token, the (app) layout redirects them to `/login?next=/events/{id}?section={name}` **before** calling the plan endpoint. After signing in, Auth.js returns the user to the same plan + section, and the existing `scrollIntoView` logic opens the right section automatically. Two emails rely on this for non-public access cases:
  - **"Review request"** (host-side join-request email) → `?section=join-requests`. Without the redirect, a logged-out host clicking the email landed on "Plan not found" on QA plans (the public-preview path 404s for QA) and on private plans where the host had no view permission.
  - **"Request approved"** (requester-side email) → `?section=attendees`. Same redirect pattern; after login the new attendee scrolls to Who's in.
- QA-plan isolation is preserved by the API: a non-super-admin who follows the redirect, authenticates, and lands on a QA plan still sees the same `NOT_FOUND` response from `GET /events/:id`. The redirect only ensures authorised recipients reach the page they were sent to.
- Logged-in viewers continue to load the plan normally; the redirect only fires when the layout sees `auth()` returning null.

> **Agent guidance:** The `invite` state is distinct from `public`, the visitor holds a valid token but is not authenticated. The plan preview is visible but RSVP is gated behind the lightweight signup card. Do not conflate `invite` with `public`; changes to plan-details rendering should verify behavior across all four access states.

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
| `is_hidden_communities` | Hide my communities from my public profile | When ON, `GET /public/users/:handle/communities` returns `{ ok: true, communities: [], hidden: true }` and the Communities section does not render on the user's public profile. Their actual community memberships are unaffected. |

**Implementation notes:** UI: `web/src/app/(app)/settings/PrivacyToggleRow.tsx`, `SettingsClient.tsx`. API: `GET /profile` and `PUT /profile` in `api/src/index.ts`. Schema: migrations 013 (`is_hidden_from_search`, `is_hidden_from_external_indexing`), 014 (`is_hidden_age`), 020 (`is_hidden_chum_list`, `is_hidden_from_chum_lists`), 090 (`is_hidden_communities`).

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

**Interest categories:** The `category` column on `interests` is a free-text field used for grouping related hobbies (e.g. "Board games", "Outdoor sports"). Categories are optional; many interests may remain uncategorized. The admin edit dialog provides a combo-box (Autocomplete with freeSolo) that shows existing categories for selection and allows typing a new one. Categories are used by the Explore local-signal feature as a fallback when an exact hobby doesn't meet the display threshold. Admins can assign categories incrementally over time without needing to classify everything up front.

**Hobby/interest system and effective category matching:**

The interest system underpins personalization across plans, communities, and discovery feeds. Key behaviors:

- **Effective category**: For matching and personalization, each interest resolves to an "effective category" via `LOWER(COALESCE(NULLIF(TRIM(i.category), ''), i.name))`. If the interest has a `category` set, the category is used; otherwise, the interest name itself is the effective category. This allows "Chess" and "Go" to both match if they share a "Board games" category.
- **HobbyPickerField** (`web/src/components/common/HobbyPickerField.tsx`): Shared autocomplete component used in plan create/edit, community create/edit, and profile onboarding. Supports free-text entry (creates new interests via API if needed), suggestion search against `GET /interests?q=`, content safety validation, duplicate detection, and chip-based display with optional collapse. This component's behavior is important to preserve; it handles interest creation, slug generation, and validation uniformly across all surfaces.
- **Interest linking**: Plans use `event_interests` junction table. Communities use `community_interests` junction table. User profiles use `user_interests`. All three follow the same pattern: many-to-many via interest IDs.
- **Personalization scoring**: Both Explore (plans) and the Communities feed compute a `hobby_match_count` by counting how many of the item's interests share an effective category with the viewer's profile interests. This count is used as the primary sort key when personalization is enabled.
- **Hobby filter**: Both Explore and Communities support a `hobby` query param that filters by effective category match, not exact slug. This means filtering by "Chess" also includes plans/communities tagged with "Go" if both share the "Board games" category.
- **Client-side highlighting**: `effectiveCategorySet()` (`web/src/lib/interestUtils.ts`) builds a Set of the viewer's effective categories. Community and plan cards use this to highlight matching hobby chips in a different color.

### Admin, user accounts (super_admin only)

- `GET /admin/users`, list all user accounts. Query params: `q` (search email/handle/name/userId). Returns: `id`, `created_at`, `email`, `username`, `name`, `role`, `subscription_plan`, `is_suspended`, `suspended_at`.
- `POST /admin/users/:id/suspend`, suspend a user. Stores `suspended_at`, `suspended_by_user_id`. Cannot self-suspend.
- `POST /admin/users/:id/unsuspend`, clear suspension fields.
- `PATCH /admin/users/:id/subscription-plan`, update a user's subscription plan. Body: `{ plan: "free" | "super_host" | "community_pro" }`. Logs change to `subscription_plan_history`.

**Web page:** `/admin/chums`, table with search, sort, status chips, inline subscription plan dropdown, suspend/unsuspend actions with confirmation dialogs. Sidebar tab and page header label: **"Users"**.

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
| `GET /events/:id` | Event detail with RSVP list, alternate time suggestions, join requests, and attendance assurance state. Optional auth. Accepts query params: `invite_token`, `share_token`. Returns `accessState` (`public` \| `invite` \| `authenticated` \| `attending`) and `shareToken` (for non-public states). Public access returns limited preview (counts only, no individual RSVPs). Full response includes `requireReconfirmation`, `lockedAt`, `requireApproval`, `isInvited`, `hasRsvp`, `confirmationWindowOpen`, `confirmationCutoffAt`, `confirmedCount`, `pendingConfirmationCount`, `myConfirmationStatus`, `planViability`, and per-RSVP `confirmationStatus`. Join requests: full list for host, own request only for non-hosts. On first authenticated load, idempotently adopts any matching email-only `event_invites` row (`WHERE LOWER(email) = <user email> AND user_id IS NULL`) onto the user's account. |
| `PATCH /events/:id` | Edit event (host only). Accepts: `title`, `description`, `starts_at`, `max_seats`, `visibility`, `require_reconfirmation`, `require_approval`, `allow_alt_times`, `alt_times_mode`, `availability_deadline_at`, `allow_attendee_invites`, `reserve_seats`, `pref_overrides`, `community_id`, `hide_from_explore`, `timezone`, `interest_items`. Returns `{ ok: true }`. Sends plan-changed notifications to Going/Maybe attendees when meaningful fields change (title, date, description, capacity, visibility, confirmation settings, availability deadline). Automatically clears `availability_deadline_at` when mode switches away from availability. |
| `POST /events/:id/rsvp` | RSVP to an event, `{ status: "going"\|"maybe"\|"cant_make_it", note?, share_token?, invite_token? }`. Capacity enforcement for going status. Locked plans reject new RSVPs (`EVENT_LOCKED` error) but allow existing participants to change status. Plans with `require_approval` reject users without host-extended access (`APPROVAL_REQUIRED` error). Host-extended access is satisfied by ANY of: an existing RSVP, an `event_invites` row for the user, a valid `share_token` in the body (Copy Link share path), or a valid `invite_token` in the body (email-mismatch safety net). Plans with `visibility = invite_only` apply the same bypass set under `INVITE_ONLY`. Notifies host via in-app notification and email. UI: "Can't make it" button only shown when user is invited or has an existing RSVP; heading text is context-aware ("Can you make it?" for invited users, "Are you in?" otherwise). |
| `POST /events/:id/alt-time` | Suggest alternate time, `{ suggested_at, note? }`. Only if event.allow_alt_times. Notifies host. Auth required. |
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
| `POST /events/:id/confirm` | Confirm or decline attendance (auth required). Body: `{ action: "confirm" \| "decline" }`. Upserts `event_confirmations` record. Available when confirmation window is open. On success, marks unread `confirmation_requested` bell notifications for that user and plan as read. All attendees are authenticated users post-migration 084; confirmation emails deep-link to `?section=confirmation` and require login. |
| `POST /events/:id/join-request` | Submit a join request (requires `require_approval` to be on). Body: `{ message? }`. Validates not-host, not-invited, not-already-RSVP'd, no duplicate pending request. Notifies host via in-app notification and email (template 43906440). |
| `POST /events/:id/join-request/:requestId/approve` | Approve a join request (host only). Body: `{ message? }`. Checks seat capacity. Marks request approved, adds user as Going RSVP. Notifies requester via in-app notification and email (template 43906609). |
| `POST /events/:id/join-request/:requestId/decline` | Decline a join request (host only). Body: `{ message? }`. Marks request declined. Notifies requester via in-app notification and email (template 43906703). |
| `GET /events/:id/feedback` | Existing feedback by this user for this plan + eligible attendees. Auth required; plan must be past. |
| `POST /events/:id/feedback` | Submit/update feedback. Body: `{ entries: [{ revieweeUserId, prompt, response }] }`. Prompts: reliability, sociability, presentation, match_quality, hosting_skills (host-only). Responses: agree, maybe, disagree. Upserts on conflict. |
| `POST /events/:id/attendance-issue` | Report attendance issue. Body: `{ reportedUserId, issueType }`. Types: no_show, late_cancel, very_late. One report per type per pair per plan. |
| `POST /events/:id/conduct-report` | Report conduct/safety concern. Body: `{ reportedUserId, reason, details? }`. Reasons: rude_aggressive, harassment, boundary_issue, discriminatory, unsafe_intoxicated, disruptive, property_damage, other. |

**Unauthenticated share-link / invite-link signup** is handled by `POST /auth/plan-signup/request` + `POST /auth/magic-link/consume` (see "Lightweight plan signup" section above). These endpoints replaced the retired `POST /events/:id/email-rsvp`, `POST /events/:id/public-rsvp/request-code`, `POST /events/:id/public-rsvp/confirm-code`, `POST /events/:id/guest-confirm`, and `POST /events/:id/guest-alt-time` endpoints (migration 084, guest participation removed).

**Important: Hono route ordering.** `GET /events/explore/public` and `GET /events/explore` must be registered **before** `GET /events/:id` in the route table. Otherwise, Hono interprets "explore" as a UUID `:id`, resulting in a database error.

**Visibility enforcement:**
- Plan `visibility` controls **discoverability** (Explore feed, community feed, digests), **not** direct URL access.
- Anyone with the plan URL can view published plans (draft plans remain host-only).
- `invite_only`: excluded from Explore feed, community feed, and digests. Cannot be linked to a community (server-side invariant on POST and PATCH).
- `chums_only`: shown in Explore, community feed, and digests only to the host, the host's on-NewChums chums, and viewers already RSVP'd. Community linkage does not widen this audience.
- `public`: shown in Explore feed, community feed, and digests to all eligible users, subject to `hide_from_explore` for Explore.
- For community-linked plans, `hide_from_explore` ("Only show this plan to community members") layers on top of `visibility` to gate Explore only. It does not affect direct URL access or the community's own plan feed. See the **Plan Feeds, Community Linkage, and "Only show this plan to community members" Toggle** subsection under Communities for the full matrix.

**Add Plan / Edit Plan parity:** `CreateEventClient.tsx` (`/events/create`) and `EditEventClient.tsx` (`/events/[id]/edit`) are a single plan form system; the four historically drift-prone sections (Extra options, Community, Matching preferences, QA plan) are extracted under `web/src/components/events/planForm/` and shared between both files. See `AGENTS.md` → **Add Plan / Edit Plan Parity Rule**. Changes to remaining duplicated sections should be mirrored in the other form.

**Plan Access States:**

Every request to `GET /events/:id` resolves to one of four access states. The access state determines what data is returned and how the frontend renders the experience. The API includes `accessState` in every response.

| State | Condition | Data scope |
|-------|-----------|------------|
| **`attending`** | Logged in + host or has RSVP | Full detail: RSVPs, invites, alt-times, join requests, chat access, exact location (per `location_visibility`), attendance assurance, host controls |
| **`authenticated`** | Logged in, not attending | Full detail minus host-only controls. Own join request only. Can RSVP or request to join. |
| **`invite`** | Valid `invite_token` or `share_token`, not logged in | Full plan detail (read-only). Lightweight-signup card replaces the RSVP buttons; the visitor completes signup/sign-in via magic link and comes back as an authenticated user. |
| **`public`** | No auth, no token | Limited preview: title, description, date, hobby, host name, location (approximate only), attendee counts (going/maybe, no individual RSVPs). No RSVP flow. CTA to sign in or create account. |

**Precedence:** `attending` > `authenticated` > `invite` > `public`. A logged-in user with an invite token who is already attending resolves to `attending`.

**Share tokens (plan-level access links):**

Share tokens are short deterministic HMACs (not JWTs) that grant preview access to a plan's full detail view. They are not user-specific and have no expiry. RSVPing still requires authentication, visitors complete the lightweight signup flow first.

- Generated server-side via `createShareToken(eventId, secret)` (HMAC, base64url, 16 chars).
- Included in `GET /events/:id` responses for non-public access states as `shareToken`.
- The **Copy Link** button builds the share URL as `/events/[id]?share_token=xxx`.
- Verified by `verifyShareToken(token, eventId, secret)`.

**URL distinction (public vs share vs invite):**
- Plain URL `/events/[id]` → `accessState: "public"` → limited preview, no RSVP.
- Share URL `/events/[id]?share_token=xxx` → `accessState: "invite"` (for unauthenticated visitors) → full plan detail + lightweight signup card.
- Invite URL `/events/[id]?invite_token=xxx` → `accessState: "invite"` (for unauthenticated visitors) → full plan detail + lightweight signup card pre-filled with the invited email; after magic-link click, the matching `event_invites` row is adopted onto the new user's account.

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

Hosts can enable `require_approval` on a plan, requiring users without host-extended access to submit a join request before being added. Host-extended access is anything the host explicitly issued: an `event_invites` row, a valid `invite_token`, or a valid `share_token` (Copy Link). Holders of any of these can RSVP normally; everyone else (random discovery via Explore / community / direct URL) must use Request to join. The bypass set matches the one used by the `invite_only` visibility gate so the two rules behave consistently in code and in user-visible behavior.

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
- **Email flow:** Confirmation request emails deep-link to `/events/:id?section=confirmation`. Recipients sign in if needed, then confirm or decline via `POST /events/:id/confirm`. Plan-at-risk emails to hosts when minimum not met. On `auto_cancel`, cancellation notifications go to all attendees. All attendees are authenticated users post-migration 084, the previous guest-email fan-out no longer exists.
- **In-app confirmation:** Logged-in users can confirm/decline directly on the plan details page when the confirmation window is open.
- **Viability display:** Plan details page shows real-time confirmation status, viability assessment, and per-attendee confirmation state in the "Who's in" section.
- **Post-cancellation display:** Per-attendee confirmation badges (Going & Confirmed / Going - Didn't confirm) keep rendering after the window closes, including on plans auto-canceled for `min_attendees_not_met`, so the reason for cancellation stays visible rather than collapsing every attendee back to a plain "Going" chip. The plan-detail API exposes `confirmationsIssued` (true once `confirmation_sent_at` is set); the UI uses it as the gate for confirmation badges instead of the narrower `confirmationWindowOpen` flag, which flips false the moment `status !== 'published'`. The cancellation banner also surfaces the final confirmed count against the minimum. Confirmation endpoints continue to check `status = 'published'`, so no new confirmations can land on a canceled plan.
- **RSVP integration:** Changing RSVP to "Can't make it" automatically sets the `event_confirmations` row to `declined`. Changing to "Going" during an open window creates a pending confirmation if none exists. Changing from Going to "Maybe" rolls any prior `confirmed` row back to `pending` (clearing `responded_at`); `declined` and `expired` rows are left untouched because they represent an explicit decline or a cycle-final state that shouldn't silently undo itself when the RSVP softens. This keeps `min_confirmed_attendees` accurate: a soft-committed Maybe attendee does not keep contributing to the "confirmed" count, and if they later flip back to Going they are correctly prompted to reconfirm. When a host removes an attendee (`POST /events/:id/remove-attendee`), the attendee's `event_confirmations` row is deleted alongside their RSVP, so a stale `confirmed` row does not keep counting toward `min_confirmed_attendees`.

**Auto-cancel: no attendees (implemented):**

The hourly cron handler includes `cancelNoAttendeePlans()` which auto-cancels published plans where the host is the only "going" participant and the plan start time has passed (within a 2-hour window to avoid reprocessing old plans). Sets `status = 'canceled'` and `cancellation_reason = 'no_attendees'`. No email notifications are sent for this auto-cancel; it is a silent cleanup for plans that effectively never happened.

**Defensive SQL pattern.** Attendee-counting queries use `er.user_id IS DISTINCT FROM e.host_user_id` rather than a plain `!=`. Post-migration 084 `event_rsvps.user_id` is `NOT NULL`, but the `IS DISTINCT FROM` pattern remains as cheap NULL-safety in case a future schema change reintroduces nullability. Any new attendee-counting lifecycle query should follow the same pattern.

**Attendance Record (implemented):**

Public profile section showing six reliability metrics computed from real event and RSVP data:

1. **Going follow-through**, of plans the user set Going on, how often they kept that Going RSVP without backing out to Maybe or Can't make it. Denominator: committed RSVPs (`committed_at IS NOT NULL`) on past non-canceled events. Numerator: subset still with `status = 'going'`. Does NOT penalize for attendance issues (no-shows); this metric purely measures commitment to a Going RSVP. Not affected by host removals (RSVP row deleted), plan cancellations (filtered out), or auto-cancellations. Derived from existing `committed_at` + current `status`.
2. **Shows up** (no-show-free rate), of plans the user *stayed* committed to attend, how often they were not reported as a no-show or very-late arrival. Denominator: past non-canceled non-QA plans where the user both committed (`committed_at IS NOT NULL`) and still has `status = 'going'`, i.e. didn't back out. Numerator: subset with no undismissed `no_show` or `very_late` attendance issue against the user. Backing out ahead of the event (Going→Maybe / Going→Can't make it) drops the plan from **both** sides of this ratio, so it's neutral here; that behaviour is captured by Going follow-through instead. Only a real no-show or very-late report against a still-Going RSVP moves this number.
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
- **Plan details:** When a logged-in user views a plan they didn't create, `GET /events/:id` evaluates the viewer's chum preferences against the host's metrics (including hosting quality) and against the host's DOB (when the viewer has an age preference set), then returns a `prefNote` array of failed dimensions. Per-attendee mismatches are computed the same way (each attendee's DOB and metrics are checked against the viewer's preferences). The frontend displays an informational banner: "Based on your chum preferences, this plan may not fully match your expectations for [dimension(s)]." Age mismatches surface as the generic phrase "age range"; exact ages, DOBs, and differences are never exposed in user-facing copy. This does **not** block access; it informs.
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
- The create and edit plan forms always expose this as a collapsible "Matching preferences for this plan" section. Since the master toggle was removed, there is no `hostHasPrefs` gate; the override card is always available.
- `resolveEffectiveHostPrefs(globalPrefs, planOverrides)` merges overrides with global prefs before evaluation. When `disabled: true` is set, it returns a fully permissive prefs row (every level `'open'`, `age_pref_years` `null`); this replaces the previous master-toggle short-circuit. `parsePrefOverrides(raw)` validates the JSONB shape.
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

Community pages where users can join, browse, and create plans together. The communities discovery feed supports distance-based filtering, hobby personalization, and search, similar to the Explore feed for plans. Community subscription access is inherited from the **owner's `subscription_plan`** (see section 5): if the owner has `community_pro`, their owned communities gain premium community features. Resolved at runtime via `communityInheritsProAccess()` in `api/src/lib/subscriptionAccess.ts`.

**Schema (migration 055, extended by 059, 078, 082, 087):**

| Table | Purpose |
|-------|---------|
| `newchums.communities` | Core community entity, name, slug, description, avatar_key, banner_key (Community Pro banner image, migration 055 column, upload wired in 087 scope), visibility (`public` / `private`), join_mode (`open` / `approval_required`), chat_enabled (boolean, deferred), `is_online` (boolean, default false), `website` (text, max 500), `discord_url` (text, max 500, migration 082), `operating_hours` (jsonb, nullable, migration 087; optional day-by-day open/close times, free for all plans), location fields, owner_user_id, `status` (`active` / `closed`, default `active`, migration 059), timestamps. Migration 078 adds `is_online`, `website`, `join_link`; migration 082 adds `discord_url` and stops using `join_link`; migration 087 adds `operating_hours`. |
| `newchums.community_members` | Membership records, community_id, user_id, role (`owner` / `member`), status (`active` / `pending` / `removed`). Unique on `(community_id, user_id)`. |
| `newchums.community_join_requests` | Join request records, community_id, user_id, status (`pending` / `approved` / `declined` / `withdrawn`), reviewed_by_user_id, `message` (text, nullable, max 500, migration 079), timestamps. Unique partial index on `(community_id, user_id) WHERE status = 'pending'`. |
| `newchums.community_interests` | Hobby/interest tagging for communities. Composite PK on `(community_id, interest_id)`. FK to `communities` (CASCADE) and `interests` (CASCADE). Indexed on `interest_id`. Migration 078. |

**Unified access model:** The forms present a single "Access" setting with two options: **Open** (visibility=public, join_mode=open) and **Private** (visibility=private, join_mode=approval_required). The API accepts an `access` field that maps to these DB column pairs. The underlying `visibility` and `join_mode` columns are preserved for backward compatibility, but the only supported combinations going forward are these two. Private communities are discoverable in the communities discovery feed and in the community detail page; non-members see a preview (description, hobbies, metadata) but internal contents (plans, members) are restricted until the viewer is an approved member. In-app notifications (`community_join_request`, `community_join_request_approved`, `community_join_request_declined`) and Postmark emails support the full join request lifecycle including optional requester messages.

**Community privacy vs plan-level Explore visibility.** A community's `visibility` (`public` / `private`) gates access to the **community page and plan feed**. It does **not** remove the community's plans from the Explore feed. Per-plan Explore visibility is controlled exclusively by the host's `hide_from_explore` toggle on that plan. A plan in a private community with the toggle off still appears in Explore for non-members (subject to normal plan-visibility and personalization filters); the same plan with the toggle on is scoped to community members and RSVP'd viewers. See the **Plan Feeds, Community Linkage, and "Only show this plan to community members" Toggle** subsection below for the full matrix and enforcement points.

**Events table additions (migration 055):**
- `community_id UUID NULL` FK → `communities(id)` ON DELETE SET NULL, associates a plan with 0 or 1 community. Forced to NULL by `POST /events` and `PATCH /events/:id` when `visibility = 'invite_only'`.
- `hide_from_explore BOOLEAN NOT NULL DEFAULT false`, when true, the plan is hidden from the general Explore feed for non-members / non-RSVP'd viewers. Independent of base `visibility`, which still applies in both Explore and the community feed.

**API endpoints (auth required unless noted):**

| Route | Description |
|-------|-------------|
| `POST /communities` | Create a community. Validates name, slug (3-50 chars), description (required). Accepts unified `access` field (`"open"` or `"private"`) which maps to the DB columns: open = `visibility=public, join_mode=open`; private = `visibility=private, join_mode=approval_required`. Also accepts legacy `visibility`/`join_mode` for backward compatibility. Requires at least one hobby (`interest_items`). Requires location for offline communities (`is_online = false`). Accepts `is_online`, `website`, `discord_url`, and optional `operating_hours` (see **Community operating hours** below). Creator becomes owner + member. Links hobbies via `community_interests`. |
| `GET /communities` | Discovery feed. Query params: `mine=1` (user's communities, ignores distance), `q` (search), `lat`/`lng`/`radius_km` (distance filtering for offline communities; online communities bypass distance), `hobby` (filter by hobby slug via effective category matching), `personalize` (0 to disable hobby-match ranking). Returns `member_count`, `hobby_match_count`, `distance_km`, `hobbies` array, `hasMore`. Default ordering: hobby_match_count DESC, distance ASC (with location) or member_count DESC (without). |
| `GET /public/communities` | **No auth.** Logged-out discovery feed, the community equivalent of `GET /events/explore/public`. Powers the public `/communities` page. Returns only `visibility = 'public'` and `status = 'active'` communities (private communities are completely excluded from every public discovery surface). Query params: `q` (search), `lat`/`lng`/`radius_km` (manual viewer-entered location from the Places picker; same offline-only distance rule as the authenticated feed, online communities always pass through), `hobby` (slug filter, same effective-category normalization as the authenticated feed), `limit` (1-50, default 20), `offset`. Response shape matches `GET /communities` so the shared card component renders both feeds, with viewer-scoped fields statically null / zero (`viewer_role = null`, `hobby_match_count = 0`). `upcoming_plan_count` is additionally filtered to `visibility = 'public'` AND `hide_from_explore = false` plans, so the count a logged-out viewer sees can never reveal a chums-only or invite-only plan. **Ordering:** location proximity first when the viewer supplies a location, then alphabetically; `distance_km ASC NULLS LAST, LOWER(c.name) ASC, c.created_at DESC` when a location is supplied; `LOWER(c.name) ASC, c.created_at DESC` otherwise. The authenticated feed intentionally diverges (it boosts hobby-match first and uses member-count as a tiebreak) because signed-in users want personalization; the public feed prioritizes browseability over engagement-weighting. |
| `GET /communities/slug-available` | Check slug availability. |
| `GET /communities/:slug` | Community detail. **Auth optional**, the slug URL is the canonical public / shareable destination for a community (see **Canonical community URL** below) and this endpoint mirrors that: logged-in viewers get full detail (membership, plans metadata, website, Discord link if private-and-member), logged-out viewers get either the full public view (for `visibility = 'public'` communities) or the same restricted preview a logged-in non-member would get (for `visibility = 'private'`). The privacy contract is identical across authenticated and anonymous non-members: no member list, no plan details, no `website`, and no `discord_url` leak. Returns full community info including `is_online`, `website`, `discord_url`, `hobbies` array, member_count, viewer's membership role/status, pending join request status. **Private communities** return a preview for non-members (name, description, avatar, hobbies, location, member count, visibility, plus `upcoming_plan_count` so the locked preview can surface a real number without leaking plan detail) with `restricted: true`; plans, members, `website`, and `discord_url` are hidden from non-members to keep those links scoped to approved members only. Non-member responses also include `viewerPendingRequestSentLabel` (pre-formatted "Sent N days ago" string), `viewerPendingRequestRefreshable` (boolean; true once the pending request has aged past the cooldown), `viewerPendingRequestDaysUntilRefreshable` (number or null), and `viewerPendingRequestCooldownDays` (echoes the server-side constant) so the client can render the pending-state card without doing any time math of its own. Anonymous-viewer responses omit those viewer-specific fields, there is no viewer identity to key them on. Owner/admin sees pending join requests with message and avatar URLs. |
| `PATCH /communities/:slug` | Update community (owner or super admin). Accepts unified `access` field (`"open"` or `"private"`, preferred) or legacy `visibility`/`join_mode`. Also: name, description (required), chat_enabled, `is_online`, `website`, `discord_url`, `operating_hours` (see **Community operating hours**), location fields, avatar_key, `banner_key` (only `null` is accepted to clear; setting a key is done via `/media/finalize` so the Pro gate is enforced there, not here), `interest_items` (replaces all community hobbies; at least one required). |
| `POST /communities/:slug/close` | Soft-close a community (owner or super admin). Sets `status = 'closed'`, nullifies `community_id` on linked events. Community data is preserved but hidden from listings. Irreversible. Migration 059 adds the `status` column. |
| `DELETE /communities/:slug` | Hard-delete community (owner or super admin). Cascades to members, join requests; events have `community_id` set to NULL. |
| `POST /communities/:id/join` | Join (open) or request to join (approval_required). Accepts optional JSON body with `message` (max 500 chars). Idempotent. For approval_required: creates a join request, creates in-app notification for owner (`community_join_request`), sends join-request email to owner (Postmark template 44111064, respects `community_join_request_received` notification pref). The email's "Review request" CTA links to `/communities/:slug?tab=requests` so the owner lands directly on the Requests tab (see **Community detail tab deep-links** below). The message field is passed to the template via the `hasMessage` + `message` pair so the "Their message" block only renders when the requester included a note. **Re-request cooldown:** if a pending request already exists, the server checks its age. Within `COMMUNITY_JOIN_REQUEST_COOLDOWN_DAYS` (default 7) the endpoint returns `{ ok: true, status: "already_pending", cooldownDays, daysRemaining }` without notifying anyone. After the cooldown, the existing pending row is refreshed in place (`created_at = NOW()`, `message` replaced), the owner is re-notified, and the response is `{ ok: true, status: "refreshed" }`. The partial unique index guarantees only one active pending row per `(community, user)`. |
| `POST /communities/:id/leave` | Leave community. Owner cannot leave (must transfer ownership first). Also withdraws any pending join request. |
| `GET /communities/:id/members` | List active members. Private communities restrict to members + super admin. |
| `POST /communities/:id/members/:userId/remove` | Remove a member (owner or super admin). Cannot remove owner. |
| `PUT /communities/:id/join-requests/:requestId` | Approve or decline a join request (owner or super admin). On approve, adds user as active member. Sends approved/declined email to requester. |
| `GET /communities/:id/join-requests` | List pending join requests (owner or super admin). |
| `GET /communities/:id/events` | Community plan feed. Returns published plans belonging to this community, gated by the per-plan `visibility` rule: `invite_only` rows are always excluded; `chums_only` rows are shown only to the host, the host's on-NewChums chums, and viewers already RSVP'd; `public` rows are always shown. No `hide_from_explore` filter. Private communities restrict endpoint access to members + super admin. Supports `limit`/`offset`. |

**Admin endpoints (super_admin only):**

| Route | Description |
|-------|-------------|
| `GET /admin/communities` | List all communities with member_count and plan_count. Supports `q` search. |
| `POST /admin/communities/:id/remove` | Admin delete a community. |
| `POST /admin/communities/:id/change-owner` | Reassign community ownership to another user. Body: `{ userId: string }`. Updates both `communities.owner_user_id` (authoritative FK) and the `community_members` rows in sync: the old owner is demoted to `role = 'member'` (kept as an active member), and the new owner is upserted as `role = 'owner', status = 'active'` (reactivated if previously removed). Any pending `community_join_requests` row for the new owner on this community is withdrawn. Rejects assignment to a suspended user (`USER_SUSPENDED`). Returns `{ ok: true, status: "no_change" }` when the target is already the owner. Community Pro banner-edit access follows the new owner's `subscription_plan`; an existing `banner_key` stays in place when ownership moves to a non-Pro user but can no longer be changed until someone with Pro owns the community again. |

**Plan creation/edit integration:**
- `POST /events` accepts optional `community_id` and `hide_from_explore`. Validates that the user is an active member of the community. A plan belongs to zero or one community. **Invite-only invariant:** when `visibility = 'invite_only'`, the server forces `community_id = null` and `hide_from_explore = false` regardless of what the client sends.
- `PATCH /events/:id` accepts `community_id` (set or clear) and `hide_from_explore`. Active-community-membership is re-validated only when the linkage changes to a *different* community; clearing the link and a no-op save that reuses the existing `community_id` both skip the membership check, so a host who has since left the linked community can still edit the plan's other fields without being forced to detach. Same invite-only invariant as POST: setting `visibility = 'invite_only'` on a PATCH clears `community_id` and forces `hide_from_explore = false`.
- `GET /events/:id` includes `community` info (`id`, `slug`, `name`) when the plan belongs to a community.
- `GET /events/explore` includes community attribution (`community` object) on plans that belong to a community. Plans with `hide_from_explore = true` are still visible in Explore to active community members and viewers with an existing RSVP.
- **Plan form community selector:** The Add and Edit plan forms both render the shared `CommunityLinkSection` (`web/src/components/events/planForm/CommunityLinkSection.tsx`) with the same prop shape and the same UX; the section is a single-select dropdown of the user's communities plus a "None" option, with the "Only show this plan to community members" toggle (`hide_from_explore`) appearing when a community is selected. Both forms fetch the user's communities via `GET /communities?mine=1` on mount. The Edit form additionally seeds the dropdown with the event's currently-linked community so it still renders when the host has since left that community (lets them detach or leave it linked); the Edit form's PATCH body omits `community_id` / `hide_from_explore` from the payload when they haven't changed, so a no-op save doesn't re-trigger the server's membership validation for ex-members. When arriving at the Add form from a community detail page, the `community_id` search param preselects that community and its location is prefilled into the venue/address field (for in-person communities). The whole Community section is hidden when `visibility = 'invite_only'`; both forms also run a `useEffect` on `visibility` that auto-clears community linkage state when the host switches to invite-only. When `visibility = 'chums_only'` and a community is linked, a reminder renders inside the section clarifying that community members who aren't on the host's Chum List still won't see the plan.

#### Plan Feeds, Community Linkage, and "Only show this plan to community members" Toggle

This is the authoritative contract for how plans appear in the **Explore feed** vs a **community's own plan feed**. Any change to a filter, toggle label, or payload shape below must update this subsection in the same change set, plus the parallel contract section in `AGENTS.md` and the bullets on the Super Admin System Logic page.

**Two distinct feeds.**

| Feed | Endpoint | Purpose | Filters |
|---|---|---|---|
| Explore (authenticated) | `GET /events/explore` | Personalized discovery for logged-in users | Plan `visibility` + `hide_from_explore` + community-member/RSVP bypass + chum-prefs + distance + hobby + QA-isolation |
| Explore (public) | `GET /events/explore/public` | Anonymous discovery on the landing page | `visibility = 'public'` + `hide_from_explore = false` + `is_qa = false` + distance + hobby |
| Community plan feed | `GET /communities/:id/events` | The community's own upcoming plan list | `community_id = :id` + per-plan `visibility` gate (invite_only excluded; chums_only scoped to host + host's on-NewChums chums + RSVP'd viewers) + QA-isolation. **No `hide_from_explore` filter.** Endpoint-level privacy check: private communities restrict access to active members + super admin. |

**Core principle.** Community linkage is organizational context, not audience expansion. Linking a plan to a community **never broadens** the plan's audience beyond what the base `visibility` setting allows. Community members who would not otherwise satisfy `visibility` still do not see the plan.

**Visibility × community-linkage matrix.** This is how the three `visibility` values behave with community linkage across both feeds.

| Plan `visibility` | Can link to community? | Community feed | Explore feed |
|---|---|---|---|
| `public` | Yes | Shown (subject to community-privacy access) | Shown; `hide_from_explore` governs non-member visibility |
| `chums_only` | Yes | Shown only to host, host's on-NewChums chums, and viewers already RSVP'd | Same chums_only rule; `hide_from_explore` layers on top |
| `invite_only` | **No.** Forms hide the Community section; server forces `community_id = null` on POST and PATCH | Never shown | Hidden except to viewers already RSVP'd (standing Explore rule) |

**Toggle semantics (per plan; stored as `hide_from_explore`, default `false`).** Shown on Add Plan and Edit Plan only when a community is selected and `visibility` is not `invite_only`. The toggle only affects **Explore**; the community feed applies the base `visibility` rule from the matrix above regardless.

| Toggle state | `hide_from_explore` | Community plan feed | Explore for non-members | Explore for community members / RSVP'd |
|---|---|---|---|---|
| OFF (default) | `false` | Per visibility matrix | Per visibility matrix | Per visibility matrix |
| ON | `true` | Per visibility matrix (unchanged) | Hidden | Shown if the visibility matrix already shows it (member or RSVP branch) |

**Invariants that hold regardless of the toggle.**

- Community `visibility` (`public` / `private`) gates the community page and its plan feed endpoint; it does not override `hide_from_explore` for Explore.
- Plan `visibility` (`public` / `chums_only` / `invite_only`) applies in both Explore and the community feed. `visibility` controls discoverability only; direct URL access to a published plan is governed by the plan's access-state rules (see §11).
- Chum-preference filtering and plan-level `pref_overrides` still apply in Explore.
- Super admins bypass the `is_qa = false` clause in every community- and explore-related plan query. Normal users never see QA plans in any feed, notification, or email.
- **Community membership is a discovery gate, not a participation gate.** `hide_from_explore` and community `visibility` narrow what non-members *find*; they never block a non-member from viewing or RSVPing to a specific plan they were directly invited to or reached via a valid share/invite token. Specifically: `POST /events/:id/invite` (host or Going-attendee invite with `allow_attendee_invites`) and `POST /events/:id/rsvp` (authenticated) deliberately omit any community-membership check, since the invite or RSVP action itself is the grant. Unauthenticated share/invite link visitors reach the plan preview, complete the lightweight signup flow, and then RSVP normally as authenticated users. Once a non-member has an RSVP or invite row, `GET /events/mine` and the Explore RSVP-bypass both include the plan normally. Do not add a community-membership gate to any of these endpoints.

**Enforcement points (kept in sync).**

- Database: `newchums.events.hide_from_explore BOOLEAN NOT NULL DEFAULT false` and `newchums.events.community_id UUID NULL` (migration 055). `visibility TEXT NOT NULL` with values in `{public, chums_only, invite_only}`.
- **Invite-only server-side invariant.** `POST /events` and `PATCH /events/:id` both force `community_id = null` and `hide_from_explore = false` when `visibility === 'invite_only'`, regardless of what the client sends. The forms hide the Community section so this is rarely triggered in practice, but any client bypassing the UI still cannot create or save an invite_only plan with a linked community.
- Explore filter: `hide_from_explore` gate is `COALESCE(e.hide_from_explore, false) = false OR (community member) OR (viewer has an existing RSVP row)`. Do not re-add a separate community-visibility override here; it caused the April 2026 regression that required a doc pass. Visibility gate is: invite_only hidden unless RSVP'd; chums_only shown to host + on-NewChums chums + RSVP'd.
- Event match digest (`processEventMatchDigest` in `api/src/index.ts`): same `hide_from_explore` members-only gate applies inside both UNION branches (public and chums_only). Predicate: `COALESCE(e.hide_from_explore, false) = false OR (e.community_id IS NOT NULL AND <recipient is an active community_members row>)`. The RSVP-bypass third branch present in the Explore query is omitted because the digest already suppresses plans the recipient has any RSVP on (standing rule: the digest is a "new plans you're not yet involved with" channel, not a second outreach for plans already surfaced). The community gate is additive on top of hobby / distance / visibility / QA / suppression filters; it only narrows eligibility.
- Community feed: per-plan `visibility` gate is enforced in SQL. `invite_only` rows never match (no RSVP bypass). `chums_only` rows match for host + host's on-NewChums chums + RSVP'd viewers. `public` rows always match. QA-isolation filter: `AND (COALESCE(e.is_qa, false) = false OR <isSuperAdmin>)`. No `hide_from_explore` filter.
- Form state: `hideFromExplore`, `selectedCommunityId` / `communityId`, and `visibility` in both `CreateEventClient.tsx` and `EditEventClient.tsx`. Both forms run a `useEffect` on `visibility` that auto-clears community linkage when `visibility === 'invite_only'`. Initial value on Edit is `ev.hideFromExplore === true`.
- Shared UI: `CommunityLinkSection` (`web/src/components/events/planForm/CommunityLinkSection.tsx`) takes a `visibility` prop. Returns `null` for `invite_only`. Renders a "Chums only" reminder under the Community section when `visibility === 'chums_only'` so authors don't assume community members will see a chums-only plan.
- UI label: "Only show this plan to community members" on both Add Plan and Edit Plan. Helper text on Edit: "When on, this plan only appears in the community feed and to members in their Explore. Others won't see it."

**QA plans in community flows.**

- QA plans can be linked to communities the super admin is a member of (standard membership validation at `POST /events`).
- QA plans flow through the community plan feed, Explore, digests, and notifications for super admins only.
- Every community- or events-related plan query must carry `AND (COALESCE(e.is_qa, false) = false OR <viewer_is_super_admin>)` or an equivalent role check. Counts that surface to super admins (e.g. a community card's `upcoming_plan_count`) must bypass the filter for super admin viewers so the count matches their visible reality.
- Public feeds (`/events/explore/public`) hard-filter `is_qa = false`; they have no authenticated viewer to grant bypass to.
- `GET /communities/:id/events` exposes `isQa` on each row so super-admin surfaces can render the QA indicator. Do not surface this field in a way that would let a normal user infer QA plans exist.

**Community detail tab deep-links:** `/communities/[slug]` accepts an optional `?tab=` query param on initial load. Recognized values: `requests` (owner of private community only; silently falls back to Plans for other viewers) and `members`. Any other value or an absent param keeps the default of Plans. The param is read **once on mount** via a ref guard so manual tab clicks are not overridden on subsequent renders. On manual tab clicks the URL is synced via `router.replace({ scroll: false })` so a refresh preserves the active tab and copy-pasted links reflect what the sharer was viewing; the Plans tab clears the param instead of adding `?tab=plans`. The join-request owner email uses `?tab=requests` so reviewers land on the right surface; approved/declined emails intentionally link to the default tab.

**Community avatar upload:**
Uses the shared media upload pipeline (`POST /media/init` → `PUT /upload/:token` → `POST /media/finalize`) with purpose `community_avatar`. Object key pattern: `community_avatars/{userId}/{timestamp}.{ext}`. Finalize requires community ownership or super admin. Served via `GET /communities/:communityId/avatar`.

**Community banner (Community Pro only):**
Same shared media pipeline with purpose `community_banner`. Object key pattern: `community_banners/{userId}/{timestamp}.{ext}`. Output size target: 1600×400 WebP, max 600KB (`MAX_COMMUNITY_BANNER_BYTES`). Served via `GET /communities/:communityId/banner` (public, no auth, cache-control `public, max-age=86400`). **Pro gate**: `POST /media/finalize` checks the **community owner's** `subscription_plan` (via `hasCommunityProAccess()`) and returns `403 PRO_REQUIRED` when the owner is not on Community Pro. Super admins bypass the gate so they can manage on behalf of an owner, same pattern as the community avatar. Non-Pro owners see no upload UI at all (no locked controls or upgrade nags) in Create Community and Edit Community. `viewerHasProBannerAccess` is returned on the full `GET /communities/:slug` response (owner/admin only) so the Edit form can hide the uploader cleanly. The banner key can be **cleared** via `PATCH /communities/:slug` with `{ banner_key: null }`; setting a key is only accepted through `/media/finalize` so the gate can't be bypassed via a raw PATCH. The banner renders on every community detail surface, **public**, **logged-in**, and **restricted private-community landing**, because it's a visual element that carries no plan/member information and doesn't change the privacy contract.

**Community operating hours (free for all plans, optional):**
Stored as a single JSONB column `newchums.communities.operating_hours` (migration 087). Shape: `{ mon: { open: "09:00", close: "17:00" } | { closed: true }, tue: ..., ... }` keyed by three-letter weekday code (`mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`). A day without an entry is "no hours published" (the UI renders nothing for it), **not** "closed"; a day rendered as closed requires an explicit `{ closed: true }` entry. Times are zero-padded 24-hour `HH:MM` strings. `close` is allowed to be earlier than `open` (overnight venues). API validation (`parseOperatingHours` in `api/src/index.ts`) rejects unknown day codes, rejects malformed `HH:MM`, and normalizes an empty object to `null` so the DB stores one canonical "no hours" shape. Sent on both `POST /communities` and `PATCH /communities/:slug`. **Privacy**: omitted from the restricted (private-community non-member) response so private operational details don't leak via the public slug URL. Rendered on the full detail view for all other viewers via the shared `OperatingHoursDisplay` component. Intentionally minimal: no split shifts, no multiple windows per day, no activity-specific hours, no holiday overrides, see the feature scope notes in `AGENTS.md`.

**Email templates (Postmark template IDs pending):**

| Email | Env var | Trigger |
|-------|---------|---------|
| Community join request (to owner) | `POSTMARK_TEMPLATE_COMMUNITY_JOIN_REQUEST` | User requests to join an approval_required community |
| Community join approved (to requester) | `POSTMARK_TEMPLATE_COMMUNITY_JOIN_APPROVED` | Owner approves a join request |
| Community join declined (to requester) | `POSTMARK_TEMPLATE_COMMUNITY_JOIN_DECLINED` | Owner declines a join request |
| Community member removed (to removed user) | `POSTMARK_TEMPLATE_COMMUNITY_MEMBER_REMOVED` | Owner/super admin removes a member via the Members tab. The action is a remove-and-block: the user's `community_members` row flips to `status='removed'`, which blocks any rejoin attempt server-side. Optional `removalReason` is included when provided. |
| Community member unblocked (to unblocked user) | `POSTMARK_TEMPLATE_COMMUNITY_MEMBER_UNBLOCKED` | Owner/super admin lifts the block via the Members tab's "Blocked" list. The `community_members` row is **deleted**; the user becomes a plain non-member and can request to join again on their own. No automatic re-add. |
| Community join-request reopened (to previously-denied user) | `POSTMARK_TEMPLATE_COMMUNITY_JOIN_REQUEST_REOPENED` | Owner/super admin clicks **Undo denial** on the Requests tab's "Previously denied" list (declines within the 30-day cooldown). The declined `community_join_requests` row is **deleted**, lifting the cooldown. The user is notified but **not** added; they must submit a fresh request. |

Template source files: `api/src/email/templates/communityJoinRequest.*`, `communityJoinApproved.*`, `communityJoinDeclined.*`, `communityMemberRemoved.*`, `communityMemberUnblocked.*`, `communityJoinRequestReopened.*`.

**Canonical community URL (public & shareable):**

The slug URL is the canonical public / shareable destination for a community. It has the form:

```
https://<host>/communities/{slug}
```

This is the URL that posters, QR codes, social shares, and external write-ups should point at. The same URL works for everyone:

- **Public communities**, any viewer (logged in or not) sees the full detail page: header, hobbies, location / online badge, member count, website, Discord link, community plan feed, and member roster. Logged-out viewers see a **"Join this community"** CTA (or **"Request to join"** when the community's `join_mode` is `approval_required`) that routes through `/login?next=<slug URL>`; the copy is account-agnostic so cold / QR traffic reads it as an invitation rather than assuming an existing account. The page additionally renders a **public member-preview strip** above the tabs whenever the roster is non-empty, the first five avatars + up to three handles + remaining count so the slug URL feels inhabited on arrival. Copy under the CTA is intentionally minimal, no sales line, the button stands on its own.
- **Private communities**, any viewer who is not an active member sees the same restricted preview: header, hobbies, location / online badge, member count, `upcoming_plan_count` (non-QA, upcoming, published), description, and a locked-preview card listing what membership unlocks. The server omits `website`, `discord_url`, plan detail, and member detail from this response. The public member-preview strip is **not** rendered on this response (no member data is exposed). Logged-out viewers see a **"Request to join this community"** card routed through `/login?next=<slug URL>`; the request flow itself still requires authentication.
- **Closed communities**, any viewer sees the minimal closed-community response; the `/communities/[slug]` page renders a **"This community has been closed"** card. Super admins still see the full detail view.
- **Members / owners / super admins**, unchanged: full detail, members, plans, and owner-only tabs (Requests for private-community owners).

The route `/communities/[slug]` is carved out as a public route in the `(app)` layout (alongside `/events/[id]`), which is what allows it to render to logged-out visitors without an auth redirect. Manual subpaths like `/communities/[slug]/edit` remain authenticated-only.

**Public discovery index (`/communities`):** the index page itself is also allowlisted as a public route in the `(app)` layout. `(app)/communities/page.tsx` checks the session server-side and renders `PublicCommunitiesExplore` for logged-out viewers or `CommunitiesListClient` for logged-in viewers, so the logged-out visitor never sees the authenticated client flash on the way to the right view. The public variant calls `GET /public/communities` (see the Communities API table), which is the sole discovery surface that filters to `visibility = 'public'`; the authenticated `GET /communities` intentionally continues to include private communities so logged-in users can discover and request to join them. Logged-out viewers also gain a "Communities" entry in the public header nav (`publicHeaderNavLinks` in `web/src/config/nav.ts`); logged-in users don't get that entry since Communities is already in their left sidebar. The shared community card (`CommunityListCard` in `web/src/app/(app)/communities/CommunityListCard.tsx`) is the single render target for both clients, so visual drift between the two surfaces can't happen. The card accepts a `layout` prop (`"list" | "grid"`): the authenticated feed uses the default `list` (single column, compact, 2-line description clamp, avatar spans both internal content rows). The public feed passes `grid`, which restyles the card into three zones: a **header** (logo + name + hobby chips) separated from the body by a hairline divider, a **body** (body-2 description at 0.875 rem with a 3-line clamp and 1.65 line-height, `flex: 1` so the band absorbs slack when sibling cards are taller), and a **grey.50 footer** with a 1 px top divider (member count, upcoming plans, location). The header surface is plain white, an earlier revision wore a repeated warm-peach gradient wash which read as striped across a dense grid and was pulled out in favour of letting hierarchy and the logo treatment carry the character. The grid variant caps hobby chips at 3 (vs 5 on list), bumps the name typography to 1.1875 / 1.25 rem with tight letter-spacing, and lifts the logo avatar to 52 – 56 px with a white 2 px ring + soft drop shadow (Participant-hero avatar convention in `docs/UI_Patterns.md`). The avatar's background is neutral `grey.100` when an uploaded logo is present so PNG transparent corners don't bleed orange through the rounded-square frame, and solid `primary.main` when rendering the fallback letter so the initial stays legible. Each card carries a faint resting shadow plus a warm-tinted hover lift (`0 10px 28px rgba(234, 88, 12, 0.10)`) and a `primary.light` border on hover so the grid feels browseable without needing a tint on the resting state. The public feed itself is a responsive MUI Grid, 1 column on `xs`, 2 columns at `md` and above, so desktop reads as a browseable discovery board rather than a long single-column scroll.

**Auth-required tabs on the slug route:** the layout inspects the `tab` query param on logged-out visits and short-circuits to `/login?next=...` when the tab is owner-only. This is how the community-join-request email's "Review request" CTA (`/communities/{slug}?tab=requests`) works for logged-out recipients: they go through login first, then land directly on the Requests tab once authenticated. The auth-required-tab set lives in `AUTH_REQUIRED_COMMUNITY_TABS` in `web/src/app/(app)/layout.tsx` and currently contains only `requests`; the public Plans and Members tabs are unaffected. This mirrors the `AUTH_REQUIRED_EVENT_SECTIONS` pattern used for event-detail email CTAs.

QR codes and posters should be generated from this URL directly, do not invent a parallel "preview" or marketing-only route.

**Share tokens (private communities, legacy):**

A share token (JWT, purpose `community_share`) is still computed server-side and included in `GET /communities/:slug` responses for private-community owners / super admins. It has no current consumer: the canonical slug URL above already grants any viewer access to the restricted preview, so the token is not appended to the URL copied by the Share button. Retained for back-compat; safe to remove in a future pass.

**Community chat:** The schema includes a `chat_enabled` column on `communities`, but community-level chat is **deferred** to a later pass. No chat implementation exists for communities.

**Web pages:**

| Route | Component | Description |
|-------|-----------|-------------|
| `/communities` | `CommunitiesListClient` | Community discovery feed with search, All/Yours scope, distance filtering, hobby filtering, personalization toggle, location nudge, load-more pagination. Distance filtering hides offline communities outside travel radius; online communities bypass distance. Yours ignores distance. |
| `/communities/create` | `CreateCommunityClient` | Create a new community. Rich text description (Tiptap), required hobbies (HobbyPickerField), online/offline toggle, location (required for offline, PlacesAutocompleteInput), website, join link (online), visibility, join mode. Validation with scroll-to-first-error. Matches plan form structure. |
| `/communities/[slug]` | `CommunityDetailClient` | Community detail with hobby chips, online/offline badge, website link, Discord link, rich text description, members, community plans feed, join/leave, join-request management (owner). The member-facing **Leave** action lives in a three-dot overflow menu next to Edit / Share link (non-owner members only) and is gated behind a confirmation dialog that explains what happens on leave and, for private communities, notes that rejoining requires a new request. **Public / shareable route**, the `(app)` layout whitelists this path so logged-out visitors reach the page directly. Public communities render the full view with a **public member-preview strip** above the tabs (usernames only for logged-out viewers) and a calm empty-plans card (title **"No plans posted yet"**, body **"Upcoming plans from this community will appear here."**) when no plans are posted; private communities render the same restricted preview the API serves to non-members (no plan detail, no member detail, no member-preview strip, no website / Discord leak). The join / request-to-join affordance uses welcoming copy (**"Join this community"** / **"Request to join"**) that routes via `/login?next=...` for logged-out viewers and calls `POST /communities/:id/join` directly for logged-in non-members. |
| `/communities/[slug]/edit` | `EditCommunityClient` | Edit community settings (owner). Same form structure as create, pre-populated. Includes close community action. |
| `/admin/communities` | `AdminCommunitiesClient` | Super admin community management, list, search, remove |

### QR Redirects

Internal redirect layer so printed QR codes (posters, cards) stay useful when their destination changes. Super admins manage records in `/admin/qr-redirects`; the public surface is `https://newchums.com/qr/{code}`. The admin surface is positioned as a **lightweight QR inventory tool**: which codes exist, which store each one was given to, what kind of printed asset it is (card vs. poster), whether it has ever been scanned, and how the scan-count rules keep counts trustworthy.

**Schema (migration 085 + 088 + 089):**

| Table | Purpose |
|-------|---------|
| `newchums.qr_redirects` | One row per printed code. Columns: `id`, `code` (UNIQUE, `CHECK code ~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'`), `title`, `destination_url`, `notes`, `is_active`, `media_type` (NULL or `'card'`/`'poster'`, constrained by `qr_redirects_media_type_known` CHECK), `assigned_store` (free-form string, NULL = unassigned), `campaign_variant` (free-form tag for the creative/ad design), `created_by` (FK users), `created_at`, `updated_at`. Codes are stored UPPERCASE so posters scanned or typed lowercase still resolve. Filter indexes on `media_type` and `assigned_store`. |
| `newchums.qr_redirect_scans` | Lightweight scan log. Columns: `id`, `qr_redirect_id` (FK CASCADE), `scanned_at`, `user_agent` (≤500 chars, used for server-side dedupe; no longer surfaced in the admin UI because modern browsers ship a reduced UA string that carries almost no device info), `referer` (≤500 chars, stored but not surfaced; mobile-camera scans never set a referer), `country` (CF-IPCountry, ≤8 chars), `city`, `region`, `latitude` / `longitude` (NUMERIC(8,5)), `timezone` (all CF-resolved via migration 089). **No raw IP stored**; the city-level geo is the Cloudflare-resolved approximation, not the client IP. |

`media_type` is intentionally a small CHECK-constrained vocabulary so the admin filter can list options without a separate lookup query. Extend the CHECK in a follow-up migration when adding a new media type (don't add freeform values).

**Public route** (`web/src/app/qr/[code]/route.ts`, Next.js route handler):

- `GET /qr/{code}`, server-side. Extracts `user-agent`, `referer`, and `CF-IPCountry` from the incoming request, calls `POST /public/qr/:code/scan` on the API worker for resolution + scan log, then issues a 302 to the resolved destination. Sends `Cache-Control: no-store` so an upstream cache cannot replay the redirect or mask future real scans. Unknown or inactive codes (or any upstream failure) 302 to `/` as a graceful fallback so posters never dead-end on a raw error. No auth, QR codes are designed to be scanned by anyone. Outside both `(app)` and `(public)` route groups so no layout wraps the redirect.
- `HEAD /qr/{code}`, server-side. Same resolution path but passes `skipLog: true` to the API so the scan endpoint does not insert a log row. Browsers, link-preview tools, and the macOS QuickLook QR preview routinely issue HEAD before GET; without an explicit handler Next.js routes HEAD to the GET handler, which would double-count every real scan. The 302 still tells the caller where the URL points.

**API endpoints (auth required unless noted):**

| Route | Description |
|-------|-------------|
| `GET /admin/qr-redirects` | Super admin. List all records with per-row `scan_count`, `last_scanned_at`, `media_type`, `assigned_store`, `campaign_variant`. Supports `q` search (matches code, title, or `assigned_store`, case-insensitive). Result set capped at 500 rows; filtering, sorting, and pagination are done client-side off the same payload. |
| `POST /admin/qr-redirects` | Super admin. Create a record. Validates code shape, title length, and `destination_url` (must parse as URL with `http`/`https` scheme). Accepts `media_type` (must be one of the known values, empty/null clears), `assigned_store` (≤200 chars, empty/null = unassigned), `campaign_variant` (≤64 chars). `409 CODE_TAKEN` on duplicate code. |
| `GET /admin/qr-redirects/:id` | Super admin. Single record + totals (`scan_count`, `last_scanned_at`) and the 50 most recent scans. |
| `PATCH /admin/qr-redirects/:id` | Super admin. Partial update. Any field can be omitted; changing the code uniqueness-checks against other rows. The three operational metadata fields (`media_type`, `assigned_store`, `campaign_variant`) follow the same convention as `notes`: explicit `null` (or empty string after trim) clears the value, an absent key leaves it untouched. |
| `DELETE /admin/qr-redirects/:id` | Super admin. Hard delete. Scans cascade. Posters using that code now redirect to `/`. |
| `DELETE /admin/qr-redirects/:id/scans/:scanId` | Super admin. Hard delete a single scan row, used to keep the scan table tidy during testing. |
| `DELETE /admin/qr-redirect-scans` | Super admin. Bulk wipe of every scan row across every QR code. QR codes, destinations, and store assignments are unaffected, only the scan log is cleared. Intended for pre-launch testing when the inventory is being validated poster-by-poster. Uses a flat sibling resource path (not `/admin/qr-redirects/scans`) so it can never be mis-routed through the `:id` parameter match on `DELETE /admin/qr-redirects/:id`. Returns `{ ok: true, deleted: number }`. The admin UI gates this behind a confirmation dialog. |
| `POST /public/qr/:code/scan` | **No auth.** Called by the `/qr/[code]` route handler. Returns `{ ok: true, destinationUrl }` for active records, `{ ok: false, error: "NOT_FOUND" }` (404) for missing codes, `{ ok: false, error: "INACTIVE" }` (410) for inactive. Logs a scan row opportunistically subject to the dedupe rules below; a log write failure never blocks the redirect. |

**Scan-count trustworthiness (dedupe contract)**

A naive 1:1 "every request is a scan" model triple-counted real scans in practice (browser HEAD pre-flight + GET, share previews, double-tap). The scan endpoint applies three layers, in order, before inserting a row:

1. **`skipLog` opt-out from the caller.** The Next.js HEAD handler always sets `skipLog: true`. The destination still resolves, no row is written.
2. **Bot / preview UA filter.** If the inbound `userAgent` matches any known link-preview / unfurler / generic crawler substring (Slackbot, Discordbot, TelegramBot, Twitterbot, FacebookExternalHit, LinkedInBot, WhatsApp, Skype, Googlebot, Bingbot, Embedly, RedditBot, Pinterest, Ahrefs, SEMrush, headless Chrome, curl, wget, Python-requests, node-fetch, etc.), the redirect resolves but no row is logged. Real Chrome / Safari / Firefox / iOS / Android UAs do not match any of these substrings.
3. **Short-window dedupe.** If a row from the same `(qr_redirect_id, user_agent, country)` was inserted within the last `QR_SCAN_DEDUPE_WINDOW_SECONDS` (currently 30s), the new request collapses into the prior row and no new row is written. Chosen to absorb HEAD-then-GET, double-taps, and immediate share-preview retries while still counting a legitimate "user revisits the poster a minute later" as a fresh scan.

These rules are documented inside `POST /public/qr/:code/scan` in `api/src/index.ts` and surfaced as a one-line caveat above the recent-scans table on the admin detail page so operators understand what is and isn't being counted. The redirect itself is never affected by any of these rules; only the scan log is.

**Security**

- `destination_url` is parsed with the WHATWG `URL` constructor and must use scheme `http` or `https`; anything else (`javascript:`, `data:`, etc.) is rejected with `INVALID_DESTINATION`. The same validation applies on both create and update.
- The public scan endpoint accepts scan metadata from the caller but is only reached via the Next.js `/qr/[code]` route, which derives the values from inbound request headers. No user-session state is touched.
- Codes are normalized to UPPERCASE on write and resolve, and constrained to `[A-Z0-9][A-Z0-9_-]{1,63}` by both a runtime regex and a Postgres `CHECK` constraint.
- `media_type` is constrained to the known set (`'card'`, `'poster'`) by both a runtime check and a DB `CHECK` constraint; `assigned_store` and `campaign_variant` are free-form but length-capped (200 / 64 chars).

**Web pages:**

| Route | Component | Description |
|-------|-----------|-------------|
| `/admin/qr-redirects` | `AdminQrRedirectsClient` | Super-admin inventory table. Sortable headers (Code, Title, Media, Store, Scans, Last scan, Status). Server search across code / title / store. Client-side filter dropdowns: media (Card / Poster), store (Unassigned + every known value), usage (Used / Unused), status (Active / Inactive). Per-row inline Edit (opens the same `QrFormDialog` used for Create), Copy public URL, Open public URL. Summary pills above the table show Total / Used / Unused / Unassigned / Active / Inactive counts. Destination URL is intentionally **not** a column; it remains visible and editable on the detail page and in the inline Edit dialog. |
| `/admin/qr-redirects/[id]` | `AdminQrRedirectDetailClient` | Single-code detail. Header chip strip (Active, Media, Scans summary), live toggle, Edit / Delete buttons. Field grid covers Public QR URL, Destination URL, Media type, Assigned store, Variant, Notes, Total scans, Last scan, Created, Last updated. Recent-scan table (up to 50) with per-row delete; one-line caveat above explains the dedupe rules. |
| `QrFormDialog` (`web/src/app/(app)/admin/qr-redirects/QrFormDialog.tsx`) | Shared between list-row inline Edit and detail-page Edit, also used for Create. Single source of truth for the QR form fields (Code, Title, Media type, Variant, Assigned store with Autocomplete suggestions from existing values, Destination URL, Notes, Active toggle). |

**Operational workflow**

1. Super admin creates a record in `/admin/qr-redirects` with a code they want to print (e.g. `C001-01` for a card, `S001-02` for a poster), picks the media type, optionally tags the campaign variant, and sets an initial destination (can be the homepage if the final target isn't picked yet).
2. The admin copies the public URL (`https://newchums.com/qr/C001-01`) and generates a QR image from that URL using their preferred tool.
3. Posters / proxy cards ship with the QR code.
4. When a code is handed out, the admin opens the row's inline Edit and sets `assigned_store` to the receiving store. The list view's Store filter and Unassigned summary then make it obvious which codes are still available for future use.
5. If the destination needs to change (store closes, campaign pivots, community slug changes), the admin opens the row's inline Edit (or the detail page) and updates `destination_url`; no reprint required.
6. To retire a poster without reprinting, toggle `is_active` off; the code falls back to the homepage until reactivated.
7. The list view answers "which codes are unused?" (Used filter = Unused) and "how is each store / each variant performing?" (sort by Scans, group by Store / Variant). The detail page's scan log answers "has this poster been scanned, roughly from where, and when?" without reaching into full analytics.

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
- `newchums.event_rsvps` guest columns (migration 035, **superseded by 084**). Originally made `user_id` nullable and added `guest_email TEXT NULL`, `guest_name TEXT NULL` + partial unique index for guest rows. Migration 084 dropped those columns, deleted orphan guest rows, and restored `user_id NOT NULL`.
- `newchums.user_profile.chat_digest_sent_at` (migration 037), `TIMESTAMPTZ NULL`; tracks when the daily unread-chat digest email was last sent to each user, enforcing once-per-day sending
- `newchums.events` attendance assurance columns (migration 039), `min_confirmed_attendees INT NULL`, `confirmation_window_hours INT NOT NULL DEFAULT 24`, `confirmation_cutoff_hours INT NOT NULL DEFAULT 2`, `fallback_policy TEXT NOT NULL DEFAULT 'proceed'`, `confirmation_sent_at TIMESTAMPTZ NULL`, `cutoff_processed_at TIMESTAMPTZ NULL`
- `newchums.event_confirmations` (migration 039), final attendance confirmation records; columns: `id` (UUID PK), `event_id` (FK), `user_id` (FK), `status` (pending/confirmed/declined/expired), `responded_at`, `reminder_count`, `last_reminder_at`, `created_at`, `updated_at`; unique constraint on `(event_id, user_id)`
- `newchums.users` legal acceptance columns (migration 040), `accepted_terms_version TEXT NULL`, `accepted_privacy_version TEXT NULL`, `accepted_legal_at TIMESTAMPTZ NULL`
- `newchums.event_rsvps.committed_at` (migration 041), `TIMESTAMPTZ NULL`; records when a user first committed (RSVP'd going) for accurate follow-through tracking; backfilled from `created_at` for existing going RSVPs; indexed on `(user_id, committed_at)` where not null
- `newchums.events.allow_attendee_invites` (migration 042), `BOOLEAN NOT NULL DEFAULT true`; when true, Going attendees can invite others to the plan; host can toggle at any time via `POST /events/:id/toggle-attendee-invites`
- `newchums.event_alt_times` guest support (migration 043, **superseded by 084**). Originally mirrored the 035 guest pattern. Migration 084 dropped `guest_email`, deleted orphan rows, and restored `user_id NOT NULL`.
- `newchums.plan_feedback` (migration 049), per-attendee feedback responses. Columns: `id` (UUID PK), `plan_id` (FK), `reviewer_user_id` (FK), `reviewee_user_id` (FK), `prompt` (reliability/sociability/presentation/match_quality/hosting_skills), `response` (agree/maybe/disagree), `created_at`. Unique on `(plan_id, reviewer_user_id, reviewee_user_id, prompt)`.
- `newchums.attendance_issues` (migration 049), structured attendance problem reports. Columns: `id` (UUID PK), `plan_id` (FK), `reporter_user_id` (FK), `reported_user_id` (FK), `issue_type` (no_show/late_cancel/very_late), `created_at`. Unique on `(plan_id, reporter_user_id, reported_user_id, issue_type)`.
- `newchums.conduct_reports` (migration 049, extended 053), safety/behavioral concern reports. Columns: `id` (UUID PK), `plan_id` (FK), `reporter_user_id` (FK), `reported_user_id` (FK), `reason`, `details` (TEXT NULL), `status` (new/reviewed/closed, migration 053), `created_at`.
- `newchums.user_metrics` (migration 049), aggregated hidden quality scores. Composite PK `(user_id, metric)`. Columns: `score` (NUMERIC(5,2), default 50.00), `signal_count` (INT, default 0), `updated_at`.
- `newchums.events.feedback_email_sent_at` (migration 049), `TIMESTAMPTZ NULL`; tracks when feedback reminder email was sent for a plan.
- `newchums.user_objective_completions` (migration 054), tracks per-user objective completion. Columns: `id` (UUID PK), `user_id` (FK), `objective_key` (TEXT), `completed_at` (TIMESTAMPTZ). Unique constraint on `(user_id, objective_key)`.
- `newchums.users.tutorial_nudges_off` (migration 054), `BOOLEAN NOT NULL DEFAULT false`; when true, tutorial nudges are permanently suppressed for the user.
- `newchums.communities` (migration 055, extended 059, 078, 082), community entity. Columns: `id` (UUID PK), `slug` (TEXT UNIQUE), `name`, `description`, `avatar_key`, `banner_key`, `visibility` (public/private), `join_mode` (open/approval_required), `chat_enabled` (boolean, default true, deferred), `is_online` (boolean, default false, migration 078), `website` (text, max 500, migration 078), `discord_url` (text, max 500, migration 082), `join_link` (text, max 500, migration 078; **deprecated**, no longer read or written by the UI/API since migration 082, kept for back-compat of historical rows), `location_name`, `location_address`, `location_lat`, `location_lng`, `owner_user_id` (FK), `status` (active/closed, default active, migration 059), `created_at`, `updated_at`. Indexed on `slug` (unique) and `owner_user_id`. **Visibility rule for external links:** `website` and `discord_url` are returned only to active community members (or super admins) for private communities. Non-members, pending requesters, and removed users get a response that omits both fields entirely.
- `newchums.community_members` (migration 055, extended 081), membership records. Columns: `id` (UUID PK), `community_id` (FK, CASCADE), `user_id` (FK, CASCADE), `role` (owner/member), `status` (active/pending/removed), `created_at`, `removal_reason` (text, nullable, max 500 chars, migration 081), `removed_at` (TIMESTAMPTZ, nullable, migration 081), `removed_by_user_id` (FK users.id, nullable, migration 081). Unique on `(community_id, user_id)`. Indexed on `user_id`. Remove-and-block sets `status='removed'` (row survives; the Members tab "Blocked" section and the POST /join guard both read it). Unblock **deletes the row outright**; the user becomes a plain non-member and may request to join again on their own.
- `newchums.community_join_requests` (migration 055, extended 079), join request records. Columns: `id` (UUID PK), `community_id` (FK, CASCADE), `user_id` (FK, CASCADE), `status` (pending/approved/declined/withdrawn), `reviewed_by_user_id` (FK), `message` (text, nullable, max 500 chars, migration 079), `created_at`, `reviewed_at`. Unique partial index on `(community_id, user_id) WHERE status = 'pending'`.
- `newchums.community_interests` (migration 078), hobby/interest tagging for communities. Columns: `community_id` (FK, CASCADE), `interest_id` (FK, CASCADE). Composite PK. Indexed on `interest_id`.
- `newchums.events.community_id` (migration 055), `UUID NULL` FK → `communities(id)` ON DELETE SET NULL. Associates a plan with 0 or 1 community. Indexed where not null.
- `newchums.events.hide_from_explore` (migration 055), `BOOLEAN NOT NULL DEFAULT false`. When true, the plan is hidden from the general Explore feed for non-members / non-RSVP'd viewers. Does not affect the community's plan feed, which applies the base `visibility` rule instead. See the **Plan Feeds, Community Linkage, and "Only show this plan to community members" Toggle** subsection under Communities.
- `newchums.roadmap_items.attachment_key` (migration 056), `TEXT NULL`. Stores R2 object key for optional roadmap item attachments.
- `newchums.events.alt_times_mode` (migration 057), `TEXT NOT NULL DEFAULT 'suggest'`. Host-controlled presentation mode for the alternate times feature: `'suggest'` (default, current behavior) or `'availability'` (collaborative scheduling framing). Same underlying `event_alt_times` engine; only attendee-facing copy differs.
- `newchums.users.share_link_modal_dismissed` (migration 062), `BOOLEAN NOT NULL DEFAULT false`; when true, the share-link first-use info modal is permanently dismissed for the user.
- `newchums.events.availability_deadline_at` (migration 063), `TIMESTAMPTZ NULL`. Optional deadline by which attendees should submit their availability when the plan uses "Request availability" mode (`alt_times_mode = 'availability'`). Must be before `starts_at`. Automatically cleared when the plan's mode changes away from availability.
- `newchums.events.is_qa` (migration 065), `BOOLEAN NOT NULL DEFAULT false`. Marks a plan as a QA/testing plan. QA plans are invisible to normal users but fully functional for super admins. Normal users see 404 on direct access, and QA plans are excluded from all feeds, emails, notifications, and cron processing for non-admins. Super admins see QA plans in feeds and receive cron-driven emails/notifications normally. QA plans are excluded from KPI metrics and the public explore feed. **Exception**: valid tokenized access (share_token or invite_token) bypasses the QA gate so that intentionally shared QA plans can be previewed by non-admins for testing, and email-only invites are allowed on QA plans (the invited recipient still completes the lightweight signup flow to RSVP). Partial index `idx_events_is_qa` for efficient filtering.
- `newchums.roadmap_items.status` CHECK constraint updated (migration 066) to add `'planned'` status. Valid values are now: `'received'`, `'needs_clarification'`, `'in_progress'`, `'planned'`, `'completed'`, `'not_planned'`. Items with `received` status are only visible to the author and super admins on the public roadmap endpoints (`GET /roadmap`, `GET /roadmap/:id`, `GET /roadmap/:id/attachment`); once a super admin changes the status to any other value the item becomes publicly visible (unless `is_private` is also set, see migration 072).
- `newchums.roadmap_items.is_private` (migration 072), `BOOLEAN NOT NULL DEFAULT false`. Privacy gate that is independent of `status`. When true, the item (and its attachment) is only visible to the author and super admins, regardless of status. Lets a super admin advance an item through the workflow (e.g. set to `'planned'`) while keeping items containing personal information out of public view. Toggled via the admin Edit dialog (`POST /admin/roadmap/:id/edit` accepts `is_private`). The two visibility gates are OR'd: an item is hidden from non-author non-admin viewers iff `(status = 'received' OR is_private = true)`. The public roadmap list and item detail pages display a "Private" chip next to the status badge for the author so they understand the item is restricted.
- `newchums.roadmap_items.is_anonymous` (migration 067), `BOOLEAN NOT NULL DEFAULT false`. When true, public API responses (`GET /roadmap`, `GET /roadmap/:id`) replace the author username with `"anonymous"` and omit `author_user_id`. Admin endpoints (`GET /admin/roadmap`) always return the real author. The submit form (`POST /roadmap`) accepts an `is_anonymous` boolean. The admin table shows an "Anon" badge next to the real author for anonymous submissions.
- `newchums.event_rsvps.hide_name` (migration 068), `BOOLEAN NOT NULL DEFAULT false`. Per-plan privacy toggle. When true, the attendee's real name is replaced with their @handle in the `GET /events/:id` RSVP response; the handle and avatar remain visible. Toggled via `POST /events/:id/hide-name` (authenticated, toggles the viewer's own RSVP). The `hideName` field is only returned to the viewer for their own RSVP entry. Admin user diagnostics still show the real name via the users table.
- Backfill `committed_at` for going RSVPs (migration 069). The join-request approval path (`POST /events/:id/join-request/:requestId/approve`) was inserting RSVPs without setting `committed_at`, causing those attendees' Chum Stats to show `0 of 0` for "Going follow-through" and "Shows up." The API code path was fixed and existing rows backfilled. All code paths that create a `'going'` RSVP must set `committed_at`; see migration 041 for the original design intent.
- `newchums.shoutouts` (migration 073), moderated post-plan positive notes between participants. Columns: `id` (UUID PK), `plan_id` (FK, CASCADE), `sender_user_id` (FK, CASCADE), `recipient_user_id` (FK, CASCADE), `message` (TEXT, capped 280 chars in API), `status` (`pending`/`approved`/`rejected`, default `pending`), `created_at`, `updated_at`, `reviewed_at`, `reviewed_by_user_id` (FK SET NULL). Constraints: `shoutouts_no_self`, `shoutouts_status_valid`, and `shoutouts_unique_per_slot UNIQUE (plan_id, sender_user_id, recipient_user_id)`. Partial indexes for the moderation queue (`status = 'pending'`) and recipient profile section (`status = 'approved'`). API endpoints: `POST /events/:id/shoutout` (sender, upsert via `ON CONFLICT … WHERE shoutouts.status = 'pending'` so the slot locks after moderation), `GET /public/users/:handle/shoutouts` (recipient's approved shout-outs on the public profile; auth optional, owner sees their own items even when the section is hidden), `GET /admin/shoutouts` (super admin queue with status filter), `POST /admin/shoutouts/:id/status` (approve/reject; on approval inserts a `shoutout_received` notification with metadata `{ planTitle, planId }` for the recipient, no email). The moderation queue is gated by the standard `requireSuperAdmin` helper and badge-counted via the existing `admin_view_timestamps` table under section key `shoutouts`. The recipient bell notification deep-links to `/u/<handle>#shoutouts`. Approved shout-outs render in a "Shout-outs" section on the recipient's public profile (`/u/<handle>`); the section is intentionally section-level only with no per-shout-out curation.
- `newchums.users.is_hidden_shoutouts` (migration 074), `BOOLEAN NOT NULL DEFAULT false`. **Section-level** visibility toggle for the public-profile shout-outs section. When true, the Shout-outs section is hidden from non-owner viewers on `/u/<handle>`; the owner still sees the section here in a dimmed preview with a "Section hidden from visitors (Settings → Privacy)" caption. **Settable only from Settings → Privacy ("Hide shout-outs from my public profile"),** which writes through `PUT /profile`. There is intentionally no inline control for this flag on the public profile; the inline control on the public profile is per-card (see migration 076). Replaces the previous private "Shout-outs received" section on `/profile` and the `GET /profile/shoutouts` endpoint, both of which were removed when this column shipped.
- `newchums.shoutouts.hidden_by_recipient` (migration 076), `BOOLEAN NOT NULL DEFAULT false`. **Per-card** visibility toggle the recipient can flip from the inline icon button on each shout-out card on their public profile. Independent from the section-level `users.is_hidden_shoutouts` flag (migration 074); both dimensions are respected. When true, `GET /public/users/:handle/shoutouts` excludes the row for non-owner viewers entirely, while the owner still receives it with `hiddenByRecipient: true` so the card can render in a dimmed preview state alongside the "Show this shout-out" icon. Togglable via `PATCH /shoutouts/:id` with body `{ hidden: boolean }`, recipient-only (auth required, 403 otherwise). The inline UI is a subtle eye / eye-off `IconButton` at the top-right of each card with tooltips "Hide this shout-out" / "Show this shout-out", visible only when the viewer is the profile owner.
- `newchums.event_invites` single-identity cleanup (migration 075). Adds `CHECK ((user_id IS NULL) <> (email IS NULL))` as `event_invites_single_identity` so every row has exactly one recipient identity column populated. Migration first normalizes any legacy rows that had both columns set (clearing `email` and keeping `user_id`), then deletes email-only rows whose address matches an existing user who already has a user_id-keyed invite on the same event (to prevent a duplicate under the `(event_id, user_id)` unique index), then resolves the remaining email-only rows to `user_id` when the email matches a user account. Mirrors the same email -> user_id normalization the application performs on new inserts (POST `/events`, POST `/events/:id/invite`). The constraint is added via a DO block keyed on `pg_constraint.conname` so the migration is idempotent. Partial unique indexes from migration 024 are preserved as-is; the cross-key case still requires the application-side SELECT-before-INSERT check.
- `newchums.event_confirmations` guest support (migration 077, **superseded by 084**). Originally made `user_id` nullable and added `guest_email TEXT NULL` with dual partial unique indexes (one for registered users, one for guests). Migration 084 dropped the guest column, deleted orphan rows, and restored `user_id NOT NULL`.
- `newchums.users.subscription_plan` + `newchums.subscription_plan_history` (migration 083). See §5 "Organizer subscription plans" for the full access-resolution model.
- **Guest participation removal (migration 084).** Destructive consolidation that drops the guest participation model entirely: deletes any orphan guest rows from `event_rsvps`, `event_confirmations`, `event_alt_times`; drops the `guest_email` / `guest_name` columns and the guest-specific partial indexes; restores `user_id NOT NULL` on all three tables. Migration includes a pre-flight count that aborts if more than ~100 guest rows exist. From this point on, every attendee/confirmation/alt-time row belongs to an authenticated user; unauthenticated visitors become real accounts via the lightweight signup flow (see §8 "Lightweight plan signup").

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
- The attendance-record endpoint reads badges with a simple `SELECT ... WHERE user_id = ?`; no per-request aggregation.
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
