# NewChums Agent Governance

Last Updated: July 24, 2026

This document defines how agents (AI or human) should operate within the NewChums repository.

The repository itself is the source of truth.
Agents are encouraged to inspect the full codebase and make architectural improvements when justified.

Architecture clarity > rigidity.

---

## Product Context (Read This First)

NewChums helps people organize gatherings more easily around hobbies and shared interests.

**Current product positioning:**
- Primary pitch: making it easier to plan and coordinate real-world gatherings, board game nights, coffee walks, study sessions, pottery, sports, etc.
- Secondary pitch: reducing follow-through friction, one place for invites, RSVPs, and updates, so plans actually happen.
- Tertiary / contextual: meeting new people naturally through shared interests and proximity.
- Broader mission: reducing loneliness and helping people build real-world social connections. This is still true and still core to why the product exists, but it is not always the front-facing message.

**Note on group chat framing:** Each plan has a built-in participant group chat (real-time via WebSockets, backed by Cloudflare Durable Objects). Marketing copy should not position NewChums as "without group chats" or "no group chat needed." The pitch is about clarity and follow-through, not about replacing chat tools.

**Why this matters for agents:**
- Do not frame user-facing copy as primarily about "meeting strangers" or "finding friends." The product should feel like a practical tool for organizing real-life plans.
- Loneliness / friendship framing is appropriate on the Science of Friendship page, in mission-oriented contexts, and in internal docs, but it should not dominate product surfaces.

### Terminology

| Term | Usage |
|------|-------|
| **plan** | Preferred user-facing term for an event/gathering. "Start a plan," "Your Plans." |
| **gathering** | Alternative to "event." Used in descriptions and copy where "plan" feels too rigid. |
| **event** | Acceptable in technical/internal contexts and in API naming. Avoid as the primary user-facing word in new UI copy. |
| **hobby** | User-facing term for interests. Aligned with the profile interests system. |
| **chum** | NewChums term for a saved person. Now part of a two-part connection model: **On NewChums** (on-platform users) and **Private Contacts** (off-platform people tracked for planning). One-way, no mutual indicator, no approval flow. Adding does not notify the other person. Private Contacts auto-promote to On NewChums when the contact creates an account with a matching email. |

Internal code may use `event`, `PlanEvent`, `EventCard`, etc., this is fine. The distinction is between code identifiers and user-visible strings.

### Design and UX Tone

When building or modifying UI:
- Prefer "none" textTransform over "capitalize" or "uppercase" on buttons
- Keep empty states helpful and encouraging, not dead or embarrassing
- Keep helper text human and concise, not mechanical
- Use the theme's design language (rounded corners, consistent spacing)

**Copy rule: no em dashes.** Do not use the em dash character (Unicode codepoint `U+2014`, whether typed literally, written as a backslash-u escape, or encoded as the HTML named entity for the em dash) in any user-facing text, marketing copy, tooltips, helper text, email templates, or documentation. Use commas, periods, or semicolons instead. This applies to both code strings and `.md` files in this repository.

---

## Strategic Context and Guardrails (Do Not Re-Litigate Without the Owner's Explicit Request)

The decisions in this section are settled. Treat them as constraints, not open questions; propose changes only when the owner explicitly reopens a topic.

### Positioning (locked 21 July 2026)

NewChums is a **coordination tool for the person who makes the plan**. Internal north-star sentence: "the easiest way to get your group to actually show up." The owner-approved public rendering of that promise is the positive phrasing ("Make plans that actually happen"); the literal "get your group to actually show up" wording was reviewed and rejected for public copy as reading negatively, so do not resurrect it in user-facing surfaces.

- **Public copy leads with:** post the plan, share one link, see who is really coming, the 24-hour attendance check, and waitlist top-up. (Waitlist top-up is not yet implemented; per the honest-claims rule it stays out of public copy until it ships.)
- **Banned as framing in public copy:** "meet new friends", "make friends", "friendship", "loneliness", discovery-first leads ("find plans near you") as the headline, and "community" / "organizer" as identity words. "Community" may still appear as the literal feature name in the logged-in product.
- Discovery, hobbies, and XP remain product features but are never the public pitch. (Preference matching was removed in July 2026; see Motions.)
- No em dashes in user-facing copy (see the copy rule above).

### Motions Tried and Ruled Out (Do Not Re-Suggest)

- **Store / community / poster pilot.** Five London, Ontario game-store outreaches in May 2026, plus community pages and QR posters, did not convert. This motion is ruled out, not merely unfinished.
- **MTG cube skin or cube-specific features.** Wizards EventLink and the MTG Companion Home Tournament Organizer own the event layer (registration, pods, pairings, timers, standings). NewChums' only cube job is pre-event headcount, which is hobby-agnostic. The only allowed cube touch is an optional "paste your CubeCobra link" field on a plan.
- **Reputation scoring and chum-preference matching.** Removed end to end in July 2026 (migration 107; commits "Remove the chum-preferences matching system" and "Post-plan rebuild"). The system hard-filtered Explore and the digest on hidden metric scores that sat at 50.00 for essentially every account, so its only real behaviors were a "Required" setting silently hiding the whole userbase and a single no-show report silently dropping someone below "Important" thresholds. Do not re-suggest per-person rating forms, hidden metric scores, compatibility filtering, or plan-level preference overrides. The public attendance record and the hobby+radius match digest survived deliberately; git history is the archive of the rest.
- **Host-authored post-plan questions.** Proposed and declined (July 2026): it adds a field to an already-long create form, asks the host for work at their busiest moment, presumes the host has a question, and would not lift response rates (people skip surveys for being surveys). A host who wants to ask the group something has plan chat.
- **Anonymous guest RSVP.** Tried and removed (migration 084): guests could not return to edit their RSVPs, bots could join via share links, and identity was unknown. The current model, a light verified account created from the plan link (`PlanSignupCard`: intent-first Going/Maybe choice, then email + DOB + captcha, passwordless 6-digit code with a magic-link fallback), is deliberate. Do not propose reintroducing anonymous (accountless) participation.

### Legal consent model (changed 28 July 2026)

Consent is **implicit**: every surface that can create an account states "By
continuing, you agree to the Terms of Use and acknowledge the Privacy Policy"
next to the control, via the shared `LegalConsentNotice` component. There is
no "I agree" checkbox anywhere, and there must not be a new one.

The checkbox was removed because it produced a recurring support issue: on the
signup page the Google button sits above it, so an unticked box made the
button look broken, and on tall viewports the validation message appeared
outside where the user was looking. Users reported "Google sign up does not
work".

**Acceptance is still recorded per user and this must not be dropped.**
`users.accepted_terms_version` / `accepted_privacy_version` /
`accepted_legal_at` (migration 040) are written at the moment the account row
is created, with versions pinned server-side so a client can never claim a
version that does not exist:

| Path | Where the record is written |
|---|---|
| Email + password signup | `POST /auth/signup` pins `CURRENT_TERMS_VERSION` / `CURRENT_PRIVACY_VERSION` |
| Plan-signup (invitee card) | `POST /auth/plan-signup/request` pins the same constants |
| Google OAuth first sign-in | `getOrCreateAppUser` (`web/src/lib/user.ts`) writes them on INSERT |

With no checkbox artifact, that server record is the only evidence a user
agreed, which is precisely why it stays. Version constants live in
`web/src/lib/legalVersions.ts` and `api/src/index.ts`; keep them in sync.
`POST /auth/record-legal-acceptance` and the `/onboarding/accept-legal`
interstitial remain as a catch-up for legacy accounts whose `accepted_legal_at`
is still NULL.

---

### Deliberate Choices That Look Like Accidents

- **18+ DOB gate.** A considered legal/safety posture for an in-person meetup product, not UX debt. Any change requires an owner decision with legal review. The recorded candidate, if ever revisited: under-18 participation via private invite links only, 18+ for discovery and hosting.
- **No OG image on plan pages.** An explicit choice driven by OpenNext font-runtime constraints, not an oversight. A generated share card is on the roadmap; treat the empty-`images` override in the plan page metadata as temporary.
- **No recurring events.** Intentional. The approved intermediate step is a post-plan "run it again" duplicate nudge, not a recurrence engine.

### Growth Model

The growth loop is: host -> share link -> invitee RSVP -> some invitees become hosts. Public discovery is secondary until density exists. When reviewing UX, weight the share-link invitee path and the host's post-publish share moment above discovery surfaces.

### Naming Status

A rename away from "NewChums" is under active consideration; the name implies friend-finding, which conflicts with the locked positioning. Do not hardcode new instances of the brand name in ways that are hard to swap (prefer a single brand constant where practical), and flag any such hardcoding you encounter.

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
- Durable Objects are used for real-time plan chat (WebSocket relay per plan).
- R2 is used for media storage (avatars, banners).
- Cron Triggers are active (hourly at `0 * * * *` UTC, 24-hour attendance check processing, and daily unread-chat digest at 2 PM UTC within the same handler).
- Queues are planned but not yet implemented.

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

### `docs/UI_Patterns.md`

- Living catalogue of reusable UI recipes (hero cards, empty states, pill modules, success dialogs, escalation footers, lazy chum-status flows, and more).
- **Agents must skim this file before any UI work.** Pick a pattern that fits the surface and adopt its conventions (radii, spacing, gradients, hover/motion) rather than re-deriving from scratch. See **Agent Workflow for UI Work** under *UI Governance Principles* below.
- If you ship a reusable UI shape that isn't in the catalogue yet, add an entry in the same change set using the documented format at the bottom of the file. The doc stays useful only if it grows with the system.

If architectural invariants change, update both:

- Technical_Specs.md
- System_Map.md

in the same change set.

### Governance-Doc Review Cadence (Cross-Cutting Rule)

Several repeated regressions (QA isolation, the "Only show this plan to community members" toggle, Add/Edit plan parity) trace back to an edit that updated **one** source of truth and left the others stale. To prevent this, treat the following as a single **governance surface**: if your change touches any one of them, review all of them in the same change set and update whichever need to change.

| Governance surface | Docs / files that describe it |
|---|---|
| Plan visibility, Explore / community feeds, "Only show this plan to community members" toggle | `AGENTS.md` → Plan Feed and Community Visibility Contract; `docs/Technical_Specs.md` → Communities → Plan Feeds subsection; `docs/System_Map.md` → Plan feeds subsection |
| QA plan isolation | `AGENTS.md` → Incomplete Areas (QA plans row); `docs/System_Map.md` → QA plan isolation; any SQL filter added/changed |
| Add Plan / Edit Plan form parity | `AGENTS.md` → Add Plan / Edit Plan Parity Rule; both form files (`CreateEventClient.tsx`, `EditEventClient.tsx`); shared section components under `web/src/components/events/planForm/` |
| Notifications, emails, RSVP, digests (user-visible behavior changes) | `docs/Technical_Specs.md` relevant section (notification preferences, email templates, attendance assurance, communities) and `AGENTS.md` Incomplete Areas table where relevant |
| Subscription plans, premium access, Community Pro inheritance | `AGENTS.md` → Organizer Plans, Community Pro, and Module Gating; `docs/Technical_Specs.md` → section 5 (Organizer subscription plans); `docs/System_Map.md` → section 3 + Community premium direction; `api/src/lib/subscriptionAccess.ts` |

The rule: **if a commit touches one row, open the other files in that row and check them.** Tightening docs for a change you're already making is in scope; doing so is cheaper than the next regression.

### Where durable behavior lives

Durable, user-visible product behavior should be documented in the repo docs, especially `AGENTS.md`, `docs/Technical_Specs.md`, and `docs/System_Map.md`. There is no separate in-app operator-facing system-logic page. When user-visible flows change (notifications, emails, RSVP, visibility, digests, subscription gating, etc.), update the relevant repo doc in the same change set so the next agent or the maintainer can read the current rules from the repo alone.


### Organizer Plans, Community Pro, and Module Gating

NewChums has an organizer-facing subscription/access framework **implemented before** billing exists. The goal is to define durable product boundaries now, wire future features to those boundaries, and continue assigning access manually while the product is still in validation.

**Current product plans (implemented):**
- **Free** (`free`), baseline user and community functionality. Default for all users.
- **Super Host** (`super_host`), advanced **plan / event-level** functionality for a user wherever they host.
- **Community Pro** (`community_pro`), advanced **community-level** functionality for communities owned by that user, and it **includes Super Host benefits**.

**Schema:** `users.subscription_plan TEXT NOT NULL DEFAULT 'free'` (migration 083). Access helpers in `api/src/lib/subscriptionAccess.ts`.

**Current access model:**
- Plans are assigned at the **user level**, not sold through billing yet.
- A user with **Community Pro** grants Community Pro functionality to the communities they own (resolved via `communityInheritsProAccess()`).
- `hasSuperHostAccess()` returns true for both `super_host` and `community_pro`.
- **All users** are limited to **5 active owned communities**, enforced in `POST /communities` via `countOwnedCommunities()` against `MAX_OWNED_COMMUNITIES`. The Create Community UI surfaces a simple dialog when the cap is reached; closing a community frees a slot. Community Pro therefore covers all 5 slots a user could ever use.
- There is **no separate Founding Access system** right now. Early pilots are handled by manually assigning **Super Host** or **Community Pro** through the admin Users tab.
- Unfinished premium work can continue to use **super-admin-only** or **QA-only** gating until it is ready for broader rollout.
- Admin endpoint: `PATCH /admin/users/:id/subscription-plan`. Changes logged to `subscription_plan_history`.
- User-facing surface: **Your Plan** page at `/your-plan` (`web/src/app/(app)/your-plan/`) reads the signed-in user's `subscription_plan` from `GET /profile` and renders the three tiers with real implemented bullets only. **Linked from the top-right account menu for super admins only** during the pilot. The page itself is still reachable by direct URL for any signed-in user (it does not enforce role at the page level), but it is not surfaced in normal-user navigation because plans are not user-actionable yet (no billing, no self-serve upgrade). Drop the menu-item gate in `AppShell.tsx` once the plan surface develops further. No pricing, upgrade CTAs, or billing affordances. Keep this page in sync as new plan-gated features land; a feature that is not actually gated at runtime does not belong in its tier's bullet list.

**Modules / feature gating:**
- Features may still be built internally as individually checkable capabilities or modules.
- Product-facing plans bundle those capabilities together.
- The backend resolves effective access from the user's assigned plan and any temporary internal overrides.
- When a premium module is unavailable, **hide it** from normal community UI rather than showing a locked tab or upgrade nag inside the core workflow.

**Community strategy guardrail:**
- Communities should first become the **smallest organizer operating system that creates obvious value**: a public-facing hub, membership, plans, communication, legitimacy, and easy sharing.
- Do not overbuild communities into a full ERP, league platform, or vertical-specific operating system unless user demand clearly justifies that step.
- Avoid rigid community "types" for now. Prefer a broad community core with optional modules over time.

---

## Incomplete Areas (Do Not Overbuild)

The following areas are partially implemented. Agents should polish and improve them incrementally, but should not speculatively build out the full vision without being asked:

| Area | Status | Guidance |
|------|--------|----------|
| **Explore page** (`/`, logged in) | Functional with personalized feed (hobby-based ranking, sort options, localStorage state persistence). Local-signal footer shows nearby active-user counts for relevant hobbies when count ≥ 5 (exact hobby → category fallback → viewer profile hobbies). `GET /explore/local-signal`. | Improve polish, fix bugs, refine empty states. Do not invent the final discovery experience. |
| **Public Explore feed** (`/`, logged out) | Implemented. Embedded in landing page, fetches from `GET /events/explore/public` (no auth). Shows public-visibility plans with privacy-safe data (approximate location, no exact addresses, no user-specific fields). Search, time filtering, pagination, signup CTAs. Links into public plan details view. | Improve polish, add hobby filtering if needed. |
| **Event Details** (`/events/[id]`) | Detail view with four formal access states (`public`, `invite`, `authenticated`, `attending`). Public preview shows limited info + sign-in CTA; invite/auth/attending states provide full detail. Context-aware RSVP, cancel, invite, banner, edit (host), participant chat (real-time via WebSocket), host lock, request-to-join, and plan-change notifications. | Fix issues, improve UI. |
| **Event email templates** | Live in-repo and sent via Resend (invite, join, maybe, leave, attendee removed, plan changed, date-change reconfirm request, join request received/approved/declined, unread chat digest, confirmation request, plan at risk). Bundled at build time from `api/src/email/templates/` and rendered in-process with `mustache`. | A standalone event reminder template is still on the todo list. |
| **24-hour attendance check** | Fully implemented. User-facing name: "24-hour attendance check". Host-configurable confirmation window, reminders, cutoff processing, fallback policies (proceed/notify host/auto-cancel), in-app and email confirmation flows. Migrations 028, 039. Cron-based lifecycle. Internal field: `require_reconfirmation`. All attendees are authenticated NewChums users. Migration 084 removed anonymous (accountless) guest participation, not the light invitee path: unauthenticated visitors on a plan share/invite link get `PlanSignupCard` (intent-first Going/Maybe choice, then email + DOB + captcha, passwordless 6-digit code with a magic-link fallback, no password or username up front) and become real accounts before RSVPing (see Technical_Specs.md, "Lightweight plan signup"). Confirmation rows are keyed by `user_id` only. Plan-detail API exposes `confirmationsIssued` (true once Phase 1 has fired / `confirmation_sent_at IS NOT NULL`); the UI uses it, **not** `confirmationWindowOpen`, to gate per-attendee confirmation badges so the "Going & Confirmed" vs. "Going - Didn't confirm" breakdown survives `status !== 'published'` (the moment the window flag flips false). Auto-cancellation for `min_attendees_not_met` additionally surfaces the final confirmed/minimum counts in the cancellation banner. `POST /events/:id/remove-attendee` deletes the attendee's `event_confirmations` row alongside their `event_rsvps` row so a stale `confirmed` status doesn't keep contributing to `min_confirmed_attendees`. RSVP changes sync into `event_confirmations`: Going→Can't make it writes `declined`, Going→Maybe rolls a prior `confirmed` back to `pending` (Maybe is not commitment), Going creates a `pending` row if none exists. The host-initiated date-change reconfirmation reset (`PATCH /events/:id` with `reconfirm_rsvps = true`) applies the same Going→Maybe rollback in bulk for the flipped attendees, and clears `committed_at` on those rows so the reset never counts against attendees' Going follow-through metric. The `/events/:id/confirm` endpoint keeps its `status = 'published'` guard so confirmations cannot land after cancellation. **Minimum attendees required** (migration 094) is a separate, simpler RSVP-based threshold (`events.min_attendees_required`); the cron (Phase 4 of `processAttendanceAssurance`) auto-cancels a published plan 2 hours before start when fewer than the configured number of "going" RSVPs exist (host counts toward the total, matching the rest of the product). It does NOT depend on `require_reconfirmation`. Cancellation reason is `min_attendees_required_not_met` (distinct from `min_attendees_not_met`). Phase 4 only acts on `status = 'published'`, so a plan already cancelled in the same tick by Phase 3 is skipped, **one cancellation email per recipient** is the contract; preserve this gate when adding any future auto-cancel reason. The new reason is excluded from host-completion / host-follow-through metric denominators alongside `no_attendees`. | Operational. Use "24-hour attendance check" in all user-facing copy. Polish and enhance as needed. Use `IS DISTINCT FROM` on `user_id` as defensive NULL-safety in attendee-counting SQL even though `user_id` is now NOT NULL. When changing confirmation-lifecycle display logic, prefer `confirmationsIssued` as the gate for post-window state and only use `confirmationWindowOpen` for "actively open right now" affordances (e.g. the confirm/decline buttons). When adding a new auto-cancel reason, gate the cancel `UPDATE` on `status = 'published'` so concurrent or co-running cron phases cannot double-cancel and the email batch only sends once per recipient. |
| **Attendance record / reliability** | Implemented. Public profile section showing Going follow-through, Shows up, Attendance checks answered, Plans attended, Plans hosted, Host follow-through. Migration 041. "Shows up" numerator subtracts non-dismissed no_show / very_late `attendance_issues` rows; denominator is plans the user stayed committed to (`committed_at` set, still `status='going'`). Collection is **host-only and binary** since July 2026: the host's private post-plan check-in writes `no_show` rows (`is_host_report=true`, retractable by the host); attendee-to-attendee reporting was removed with the matching system. The reported person can dispute from the plan page (status `active` -> `disputed`); a super admin resolves via `PUT /admin/attendance-issues/:id/status`, and `dismissed` is the only status that restores public credit. No notifications or emails anywhere in report/dispute/resolution, by design. | Do not add scoring on top of the record; that was tried and removed (see Motions). Keep the record's shape stable: the public endpoint and the badges cron read only `plan_id`, `reported_user_id`, `issue_type`, `status`. |
| **Post-plan wrap-up** | Implemented (July 2026 rebuild; replaced the rating-grid feedback form). `PlanWrapUp` (`web/src/components/events/PlanWrapUp.tsx`) mounts on past attended plans (`?section=feedback` deep-link key kept for old emails). Attendees get "Say thanks": per-person shout-out composer (pending until super-admin approval), Save to Chums, Message, no submit gate, 7-day window. Hosts additionally get a private check-in ("How did {plan} go?"): binary Came/No-show list of committed attendees writing host-only `attendance_issues` rows, plus a prominent "Run it again" into `?copy_from=`. API: `GET /events/:id/wrap-up`, `POST /events/:id/wrap-up/dismiss` (historical `plan_feedback_dismissals` table), `POST`/`DELETE /events/:id/attendance-issue`. Role-varied wrap-up email (`planWrapUp_host` / `planWrapUp_attendee` subjects) on the hourly cron, ~3h after start, deduped on the historical `events.feedback_email_sent_at` column; pref key stays `feedback_requests` (stored-JSON name, renaming would reset saved choices). Server analytics: `plan_copied` product event when a create was hydrated from a previous plan. | Nothing in the host check-in may notify anyone. Keep the attendee half gratitude-shaped: no rating grids, no per-person questions (see Motions). |
| **Direct messages (Inbox)** | Implemented (migration 102). 1:1 async messaging framed as an email-like Inbox at `/inbox` (no websockets; request/response + light polling). Reachability: `users.dm_privacy` (`everyone` default / `chums_and_plans` / `no_one`) gates **new conversations only**; replies in an existing conversation always allowed; per-user blocks (`user_blocks`) silence both directions, beat every setting, and are never disclosed to the blocked side (generic NOT_ALLOWED). Shared-plan check for `chums_and_plans` excludes QA plans outright. Email model: at most one `dmMessageNotify` email per conversation until the recipient reads the thread (`dm_participant_state.notified_at` claim, cleared on read), gated by the `direct_message` pref. New-conversation rate limit: 10/day per sender, enforced in Postgres via `dm_conversations.created_by`. Conduct reports from a conversation snapshot the latest 20 messages into `conduct_reports.dm_evidence` (JSONB); **this snapshot is the only path by which message content reaches admins**, there is deliberately no admin browse view over messages. Entry points: profile Message button (server-computed `viewerCanMessage`), post-plan "Keep the connection going" rows, Your Chums rows, and a "New message" picker in the Inbox itself (`NewMessageDialog` over `GET /inbox/contacts`: chums + people from recent shared plans). See Technical_Specs.md → Direct messages (Inbox). | Preserve the reachability invariants (new-conversation gate vs. always-allowed replies, undisclosed blocks, QA exclusion) and the once-per-conversation email throttle. Do not add an admin message-browse surface without an explicit privacy decision. Moderation posture (July 2026): plan GROUP chat is admin-readable, read-only, for moderation via the audited transcript endpoint (`GET /admin/events/:id/chat-transcript`, logged to `admin_audit`, no read-state or presence side effects); DMs remain not browsable, snapshot-on-report only. The privacy policy's investigate/enforce language covers this access. v1 deliberately omits read receipts, typing, attachments, group threads, edit/delete, and message requests; do not add them unasked. |
| **Recurring events** | Not implemented. Schema supports single-time events only. | Do not add recurring event logic. |
| **Event chat** | Implemented. Per-plan group chat with real-time WebSocket delivery (Durable Objects), host lock, unread indicators in bell and plan cards, daily digest email. | Improve polish, add features (reactions, threads, attachments) only when asked. |
| **Communities** | Implemented. Community pages with create, browse/discover, join/leave, member management, community plan feeds, share tokens for private communities, community avatar upload (rounded-square logo with crop dialog), community banner image (free for all plans), optional weekly operating hours (JSONB on `communities`, migration 087), soft-close flow (migration 059: `status` column), community announcements tab (migration 095) with optional member email notifications (migration 096) and per-community email mute toggle, and a community Schedule tab (migration 097, location fields in 098) for recurring weekly time blocks with optional per-block image and a "Start a plan during this time" deeplink. Owner / super admin manage announcements and schedule blocks (post, pin, edit, soft-delete); visibility follows community page rules. Schema: migrations 055, 059, 078, 082, 087, 095-098. Migration 078 adds `is_online`, `website`, `join_link` columns and `community_interests` junction table; migration 082 adds `discord_url` and retires the Add/Edit Community UI's use of `join_link` (old column retained for history, no longer read or written). Discovery feed (`/communities`) supports distance filtering (offline communities hidden outside travel radius; online communities bypass distance), hobby filtering and personalization (matching viewer's hobbies, ranked by hobby_match_count), search, All/Yours scope (Yours ignores distance), location nudge, load-more pagination. **Public (logged-out) discovery** lives at the same `/communities` path, branched server-side in `(app)/communities/page.tsx`: the logged-out render is `PublicCommunitiesExplore`, which talks to a dedicated `GET /public/communities` endpoint that enforces a stricter contract than `GET /communities`, only `visibility = 'public'` communities are returned, never viewer-scoped fields (no `viewer_role`, no `hobby_match_count`). The public page supports text search, manual Places-picker location (no browser geolocation prompt), hobby filter, distance select (only appears once the viewer picks a location, online communities always bypass), and load-more. The `(app)/layout.tsx` allowlists `/communities` alongside `/communities/[slug]` so the logged-out shell renders without a login redirect. The header nav contains a "Communities" link only on logged-out layouts (`publicHeaderNavLinks` in `config/nav.ts`); authenticated users reach the same page via the left sidebar. Create/edit forms match plan form quality: rich text description (Tiptap), required hobbies (HobbyPickerField), online/offline toggle, required location for offline, Website and Discord Server fields (the latter replacing the old Join link at the community level), scroll-to-first-error validation. Detail view shows hobby chips, online badge, Website + Discord Server links, rich-text description. **External links visibility:** `website` and `discord_url` are gated to active members (or super admins) of private communities; the API omits both fields from the restricted response for non-members, pending requesters, and removed users. The restricted response is also what logged-out viewers of private communities receive, so these fields do not leak via the public slug URL either. Community plans are governed by a per-plan `hide_from_explore` toggle (labeled "Only show this plan to community members"); community privacy gates the community page itself, not plan-level Explore visibility, see the **Plan Feed and Community Visibility Contract** section below. **Private-community preview** for non-members renders a locked-preview card alongside the detail header, surfacing real `upcoming_plan_count` and `member_count` figures (no plan or member details leaked) so the page doesn't feel empty. The same preview is served to **logged-out visitors**, the `/communities/[slug]` route is a public / shareable URL (see the Canonical Community URL section below) so posters and QR codes can point at it directly. Logged-out visitors on public communities see a **Join this community** CTA (or **Request to join** when `join_mode = approval_required`); both route through `/login?next=<slug URL>` so the existing auth flow is unchanged. The page also renders a **member-preview strip** above the tabs on non-restricted views (first five avatars + up to three handles + remaining count) so the slug URL feels inhabited on arrival; logged-out viewers in the preview only ever see `@username`, never real names. The preview is **not** rendered on the restricted (private-community, non-member) response. **Join-request lifecycle** (migration 055 + 079): one active pending row per `(community, user)` enforced by a partial unique index; requesters see a full status card with "Sent N days ago" + email reassurance; if a pending request has aged past `COMMUNITY_JOIN_REQUEST_COOLDOWN_DAYS` (default 7), the same POST endpoint refreshes the row in place and re-notifies the owner (returns `status: "refreshed"`), otherwise returns `already_pending` with `daysRemaining`. Closed communities hidden from listings; linked events have `community_id` nullified. Email templates for join request/approved/declined ship in-repo (`communityJoinRequest`, `communityJoinApproved`, `communityJoinDeclined`); the join-request template uses an explicit `hasMessage` boolean to gate the optional requester-message block, and its "Review request" CTA links to `/communities/:slug?tab=requests` so owners land on the Requests tab. Super admin moderation. **Subscription/access framework is implemented** (migration 083, `api/src/lib/subscriptionAccess.ts`): community chat is intended to be the first **Community Pro** feature. Premium modules should be hidden when unavailable. User-assigned plans (not billing) are the current rollout mechanism; communities inherit `community_pro` from their owner's plan. | Polish UI, fix bugs. Do not build community chat without being asked. Preserve the subscription/module gating rules above when it is added. |
| **QR redirects** | Implemented (migrations 085 + 088 + 089). Internal super-admin redirect layer at `https://newchums.com/qr/{code}` so printed QR posters and proxy cards can be remapped to new destinations without reprinting, and tracked as a lightweight inventory (which code is where, what kind of asset, used vs. unused). Two tables: `qr_redirects` (code UNIQUE, title, destination_url, notes, is_active, **media_type** `'card'`/`'poster'`/null, **assigned_store** free-form/null, **campaign_variant** free-form/null, created_by, timestamps) and `qr_redirect_scans` (user_agent, referer, country, **city**, **region**, **latitude**, **longitude**, **timezone**; still no raw IPs). Codes are normalized UPPERCASE and constrained to `[A-Z0-9][A-Z0-9_-]{1,63}` at both API + DB. `destination_url` is validated with the WHATWG `URL` constructor and must be `http`/`https`. `media_type` is constrained to a known set by both runtime check and DB CHECK. Public surface is a Next.js route handler (`web/src/app/qr/[code]/route.ts`) with explicit `GET` + `HEAD` exports; HEAD passes `skipLog: true` so link-preview / browser pre-flight does not double-count, and the response carries `Cache-Control: no-store` so an upstream cache cannot replay the redirect. The route reads geo from `request.cf` via `getCloudflareContext` (falling back to `cf-ip*` managed-transform headers) and forwards it to the API; dev / non-CF traffic just logs nulls for the geo fields. Scan-count trustworthiness comes from three layers in `POST /public/qr/:code/scan`: caller-set `skipLog`, a known-bot UA filter (Slackbot, Discordbot, Twitterbot, FacebookExternalHit, WhatsApp, Googlebot, etc.), and a 30-second `(code, UA, country)` short-window dedupe. The redirect itself is never affected by these rules; only the scan log is. Super-admin UI at `/admin/qr-redirects` is a sortable, filterable inventory table with inline Edit (the shared `QrFormDialog` is used for Create, list-row Edit, and detail-page Edit), and at `/admin/qr-redirects/[id]` (detail + edit + delete + recent scans). The Recent Scans table shows precise local timestamps (to the second) and a Location column (city / region / country + clickable lat-lng); user-agent and referer are no longer displayed (reduced-UA strings carry almost no device info, and the mobile-camera referer is always blank), but both are still stored and used for server-side dedupe. The scan log is paginated via `GET /admin/qr-redirects/:id/scans?offset=&limit=` with a Load-more button (25 per page, 200 cap). The Destination column is intentionally not in the list view; it remains editable from the inline Edit and visible/editable on the detail page. See **Technical_Specs.md → QR Redirects** for the full contract, including security invariants around destination-URL validation and the dedupe contract. | Preserve destination-URL validation (scheme + parseability), UPPERCASE code normalization, and the `media_type` CHECK vocabulary. Do not loosen the bot-UA filter or the dedupe window without a deliberate decision; both have specific real-world reasons. Do not add raw IP logging without a privacy review (the city-level geo added in 089 is the CF-resolved approximation, not the raw IP). |
| **QA plans** | Implemented (migration 065). Plans with `is_qa = true` are isolated from normal users but fully functional for super admins. Only super admins can create, view, join, or interact with QA plans. QA plans appear in feeds, notifications, and emails for super admin users. Cron jobs (attendance assurance, digests, feedback) process QA plans but only send emails/notifications to super admin recipients. QA plans are excluded from KPI metrics and the public (unauthenticated) explore feed. | **Critical invariant**: any new feature touching events must preserve QA-plan isolation. Use `AND (COALESCE(e.is_qa, false) = false OR <viewer_is_super_admin>)` in event queries. For cron/email paths, check recipient role before sending. Single-event access must check `is_qa` and verify super_admin role. |

---

## Plan Feed and Community Visibility Contract

This contract governs what users see in the **Explore feed** versus a **community plan feed**, how the **"Only show this plan to community members"** toggle (internally `hide_from_explore`) changes visibility, and how these rules interact with QA plans. Regressions in this area have happened before. Treat it as load-bearing; do not modify the underlying filters or toggle semantics without updating this section in the same change set.

### The two feeds are distinct

- **Explore feed** (`/`, logged in; `/` landing, logged out). Discoverability surface. Sourced from `GET /events/explore` (auth) and `GET /events/explore/public` (anonymous). Filters by plan visibility (`public` / `chums_only` / `invite_only`), distance, hobby personalization, and the per-plan `hide_from_explore` toggle. **A plan being linked to a community does not by itself remove it from Explore.**
- **Community plan feed** (`/communities/[slug]`). The community's own list of its upcoming plans. Sourced from `GET /communities/:id/events`. Returns plans attached to that community that also satisfy the per-plan `visibility` gate (see the matrix below). Access to the feed itself follows community privacy: public communities' feeds are readable by anyone, private communities' feeds require active membership (or super admin). `hide_from_explore` is **not** applied in the community feed; it only affects Explore. The endpoint also redacts location data for logged-out viewers: a server-derived `locationDisplay` (approximate area or "Online") is always returned, while `locationName`, `locationAddress`, `locationLat`, `locationLng`, and `onlineLink` are nulled out so a public community page never leaks an exact venue or meeting link. Authenticated viewers see the full location set as before.

### Core principle: community linkage is organizational context, not audience expansion

Linking a plan to a community groups it with the community on surfaces, but it **never broadens the plan's audience beyond what the base `visibility` setting allows**. Community members who would not otherwise satisfy `visibility` still do not see the plan.

### Visibility × community-linkage matrix

This is the authoritative rule for what appears where. All three columns are enforced in the same place on the server (see "Where the rule is enforced" below).

| Plan `visibility` | Can be linked to a community? | Community feed | Explore feed |
|---|---|---|---|
| `public` | Yes | Shown, subject to community-privacy access (private communities require membership to view the feed). | Shown; the per-plan `hide_from_explore` toggle governs whether non-members see it. |
| `chums_only` | Yes | Shown **only to the host, the host's on-NewChums chums, and viewers already RSVP'd**. Regular community members who are not chums still do not see the plan, even though it's linked. | Same `chums_only` rule as elsewhere; `hide_from_explore` layers on top. |
| `invite_only` | **No.** Forms hide the Community section and forms/server both clear `community_ids` to an empty array. | Never shown. Invitees reach the plan via their invite link; the host can find it in Your Plans. | Never shown (except to viewers already RSVP'd, per the standing Explore rule). |

### "Only show this plan to community members" toggle (per-plan, stored as `hide_from_explore`)

The toggle is shown on Add Plan and Edit Plan **only when a community is selected**. `hide_from_explore` defaults to `false` (toggle OFF). It only affects **Explore**; the community feed applies the base `visibility` rule from the matrix above regardless.

| State | `hide_from_explore` | Community feed | Explore feed (non-member, non-RSVP) | Explore feed (community member or RSVP'd) |
|---|---|---|---|---|
| **OFF (default)** | `false` | Per visibility matrix | Per visibility matrix | Per visibility matrix |
| **ON** | `true` | Per visibility matrix (unchanged) | Hidden | Shown if the visibility matrix already shows it (community-member or RSVP branch of the Explore filter) |

Unchanging rules regardless of the toggle:

- Community privacy (`public` / `private`) gates the community **page and plan feed**, not individual-plan Explore visibility. A public plan hosted in a private community can still appear in Explore for non-members when its host leaves the toggle off.
- Plan-level `visibility` (`public` / `chums_only` / `invite_only`) still applies in Explore and in the community feed on top of the toggle. (The chum-preference filter that used to sit beside it was removed with the matching system in July 2026.)
- Blocked pairs (July 2026): Explore, the community feed, and both digest branches additionally exclude plans hosted by someone in a `user_blocks` pair with the viewer/recipient. Undisclosed by design; the anonymous feeds (`GET /events/explore/public`, `GET /events/recently-happened/public`) have no viewer identity and deliberately do not apply it.
- Plan-level `visibility` governs Explore discoverability; it does not restrict direct URL access to a published plan (which is governed by the plan's access-state rules). One deliberate exception since July 2026: an authenticated viewer in a blocked pair with the host gets the same existence-hiding `NOT_FOUND` the QA and draft gates use, on plan detail, RSVP, and join-request alike.
- The UI label, the helper text, the stored boolean, the API payload field, and both the Explore filter and the community-feed filter must all agree. If one is changed, change the others in the same commit.

### "Recently happened" social-proof feeds

Three surfaces show a small section of **past public plans that already ran** as social proof: the logged-out landing page (below the public Explore feed), the logged-in Explore page (below the upcoming feed), and each community detail page (below the upcoming list). The intent is to make the app feel inhabited for visitors, store owners, and community organizers; it is **not** a personal history view.

These feeds layer on top of the same visibility contract above. They never broaden audience; everything that's hidden from a viewer in upcoming Explore stays hidden in past Explore.

| Surface | Endpoint | Visibility filter | QA | `hide_from_explore` |
|---|---|---|---|---|
| Logged-out landing + logged-in Explore | `GET /events/recently-happened/public` (auth-optional) | `visibility = 'public'` only | Always excluded (no super-admin bypass) | Excluded |
| Community detail page | `GET /communities/:id/events?past=true` | Same visibility matrix as upcoming community feed (`public` always; `chums_only` only to host/on-NewChums chums/RSVP'd; `invite_only` never) | Excluded for normal users; super admin sees QA | Not applied (matches upcoming community feed) |

Additional invariants for both:
- `status = 'published'` (so cancellations, which flip status to `canceled`, are excluded)
- `starts_at` strictly in the past, within a recency window (30 days for the public Explore feed, 90 days for the community feed)
- **Participation signal**: `EXISTS (event_rsvps WHERE event_id = e.id AND user_id IS DISTINCT FROM e.host_user_id AND status = 'going')`. Plans that ran with only the host RSVP'd are not surfaced as social proof. This is the safest currently-available signal of "the plan actually happened"; the schema does not have a separate "ran" flag.
- Past cards are visually distinct: `EventCard` rendered with `isPast` and `hideRsvp`. The date label reads "Happened today / yesterday / Apr 28" instead of upcoming language so a past card never looks joinable.
- Past public plan cards link to `/events/:id`. The plan detail page's existing public-preview state handles past plans without modification.

If the success signal needs to change (e.g. add a "did at least N people show up" filter once the schema supports it), update the predicate in both `GET /events/recently-happened/public` and the past branch of `GET /communities/:id/events` in the same change set, and update this section.

### Where the rule is enforced (update together if touching)

- Stored fields: `newchums.events.hide_from_explore BOOLEAN NOT NULL DEFAULT false` (migration 055); plan-to-community linkage lives in `newchums.event_communities` (composite PK `(event_id, community_id)`, migrations 092 + 093); plan `visibility` (`public` / `chums_only` / `invite_only`) on `newchums.events`. Plans can be linked to many communities (cap 10 per plan).
- Request / response wire names: `hide_from_explore` / `community_ids` (array of UUIDs, possibly empty) / `visibility` (snake) in/out on `POST /events` and `PATCH /events/:id`; `hideFromExplore` and a populated `communities[]` array on `GET /events/:id` (host only sees the editor surface; viewers see attribution chips).
- **Invite-only invariant, server-side.** Both `POST /events` and `PATCH /events/:id` force `community_ids = []` (and `hide_from_explore = false`) when `visibility === 'invite_only'`, regardless of what the client sends. This is the last line of defense for the rule; the forms hide the Community section so this is rarely triggered in practice, but any client bypassing the UI still cannot create or save an invite_only plan with linked communities.
- **Explore filter** (`GET /events/explore`). The `hide_from_explore` gate: `COALESCE(e.hide_from_explore, false) = false OR member OR RSVP'd`. The `visibility` gate: `invite_only` hidden unless RSVP'd; `chums_only` shown to host + on-NewChums chums + RSVP'd. The blocked-pairs gate: `NOT EXISTS` on `user_blocks` between viewer and host, applied after the visibility matrix.
- **Event match digest** (`processEventMatchDigest`, daily). Same `hide_from_explore` members-only gate as Explore, applied inside **both** UNION branches (public and chums_only). Predicate: `COALESCE(e.hide_from_explore, false) = false OR EXISTS (event_communities ec JOIN community_members cm ON cm.community_id = ec.community_id WHERE ec.event_id = e.id AND cm.user_id = recipient AND cm.status = 'active')`. The RSVP-bypass branch present in the Explore query is omitted because the digest already suppresses plans the recipient has any RSVP on; the digest is a "new plans you're not yet involved with" channel, not a second outreach. The community gate is **additive**: hobby, distance, visibility, QA-isolation, and suppression filters still apply. Community linkage never broadens digest eligibility; the toggle only narrows it.
- **Community feed** (`GET /communities/:id/events`). Joins through `event_communities` to scope to plans linked to this community, then applies the same `visibility` gate as Explore **minus the RSVP bypass for invite_only**: `invite_only` rows are always excluded; `chums_only` shown to host + on-NewChums chums + RSVP'd; `public` always shown (subject to community privacy on the endpoint itself). No `hide_from_explore` filter.
- Form state: `hideFromExplore`, `selectedCommunityIds[]`, and `visibility` in `CreateEventClient.tsx` and `EditEventClient.tsx` (see the parity rule below). A `useEffect` on `visibility` auto-clears community linkage when `visibility === 'invite_only'` so the form state matches the server invariant.
- Shared UI: `CommunityLinkSection` (`web/src/components/events/planForm/CommunityLinkSection.tsx`) takes a `visibility` prop, returns `null` for `invite_only`, renders a multi-select Autocomplete (`multiple`) over the host's communities, and shows a "Chums only" reminder when `visibility === 'chums_only'` so authors don't assume community members will see a chums-only plan.
- Label / helper text: Add Plan and Edit Plan forms must display the same label and helper text. Current wording: **"Only show this plan to community members"** (label) and **"When on, this plan only appears in the community feed and to members in their Explore. Others won't see it."** (helper, Edit form).

### QA plans within community functionality

QA plans (`is_qa = true`) follow all of the rules above **plus** the system-wide QA-isolation invariant (see the Incomplete Areas table row for QA plans). Specifically:

- QA plans may be linked to a community exactly like non-QA plans. Membership is still validated at `POST /events`.
- QA plans appear in the community plan feed, Explore, digests, and notifications **for super admins only**. Normal users never see them anywhere.
- Every community / events query that returns plan rows must use `AND (COALESCE(e.is_qa, false) = false OR <viewer_is_super_admin>)`. Counts that surface to super admins (e.g. a community card's `upcoming_plan_count`) must bypass the filter for super admin viewers so the number matches what they'll actually see.
- Response payloads for community plan feeds should expose `isQa` so the QA badge surfaces on super-admin-visible cards; never expose `isQa` in a way that would let a normal user discover QA plans exist.

### Plan card invariants

The shared `EventCard` (`web/src/components/events/EventCard.tsx`) is the single plan-card component used by every plan-listing surface (Explore, Your Plans, community detail, public landing, "Recently happened", admin views). Two invariants apply across **all** of those surfaces:

1. **No community attribution on cards.** Plan cards must not render a "this plan belongs to community X" line, chip, pill, or icon row. Community context belongs on the plan **detail page header** (where it already renders as a community chip row), not duplicated on every card. The `event.communities` field is still passed through API responses for future use, but the card does not display it. If a new card variant is introduced, hold to this rule rather than re-adding the attribution line.
2. **Privacy-safe location, server-enforced.** The card reads `event.locationDisplay` first and falls back to `locationName / locationAddress / locationArea`. Endpoints that serve **logged-out viewers** (`GET /events/explore/public`, `GET /events/recently-happened/public`, `GET /communities/:id/events` when the caller has no auth payload) must compute a privacy-safe `locationDisplay` server-side and null out the exact-location fields (`locationName`, `locationAddress`, `locationLat`, `locationLng`, `onlineLink`). Authenticated viewers continue to receive the full set; the plan-detail page applies its own visibility-aware redaction once they open a plan. **Don't move this redaction into the frontend.** Server-side enforcement means a client bug or a stale build can't accidentally leak a venue or meeting link.

### Docs that must stay aligned

If you change anything in this contract, update all of the following in the same change set:

1. This section in `AGENTS.md`.
2. The Communities / plan-feed sections in `docs/Technical_Specs.md`.
3. The System Map's QA-isolation and feed flow notes in `docs/System_Map.md`.

---

## Community Operating Hours and Banner

Two optional community-detail surfaces added alongside the avatar and core metadata. Both live on the same `newchums.communities` row as everything else, there is no broader "community modules" system implied by these fields.

**Operating hours.** Free for all plans. Stored as a JSONB column `operating_hours` (migration 087) keyed by weekday code (`mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`). Each day is either `{ closed: true }` or `{ open: "HH:MM", close: "HH:MM" }`; a missing day means "no hours published" (the UI renders nothing, it is **not** the same as closed). Intentionally minimal: no split shifts, no multiple windows per day, no activity-specific hours, no holiday overrides. Any future expansion should extend this JSON shape rather than add new columns.

- **Privacy**: `operating_hours` is **omitted** from the restricted (private-community non-member) response, same class of data as `website` / `discord_url`. The public and member detail views render it via the shared `OperatingHoursDisplay` component. Validated on POST/PATCH by `parseOperatingHours()` in `api/src/index.ts`, which normalizes an empty object to `null` so the DB stores one canonical "no hours" shape.

**Banner.** Free for all plans. Uses the shared media upload pipeline with purpose `community_banner`; object key `community_banners/{userId}/{timestamp}.{ext}`, 1600x400 WebP target, max 600KB. `POST /media/finalize` only checks community ownership (super admins bypass so they can manage on behalf of an owner); the previous `hasCommunityProAccess()` gate was removed when banner upload moved to Free. Both Create Community and Edit Community render the uploader unconditionally for owners / super admins. `GET /communities/:slug` exposes `viewerCanEditBanner` (true for owner / super admin) for the Edit form to gate the uploader; the legacy `viewerHasProBannerAccess` field is still emitted for older clients and is identical to `viewerCanEditBanner`. The banner can be cleared via `PATCH /communities/:slug` with `{ banner_key: null }`; setting a key is only accepted through `/media/finalize` so the ownership check can't be bypassed.

- **Visibility**: Unlike hours, the banner **is** rendered on the restricted private-community landing because it carries no plan/member content, just visual polish. It is also shown on the public detail view and every logged-in detail view, one image for every viewer.

Doc sync: this section and `docs/Technical_Specs.md` → Communities → "Community banner" and "Community operating hours" subsections must stay aligned with the code. The private-community field-visibility matrix is the same list of omitted fields in both places: `website`, `discord_url`, `operating_hours`, plan detail, member detail. The banner is **not** on that list.

---

## Canonical Community URL

The slug URL is the canonical public / shareable destination for a community:

```
https://<host>/communities/{slug}
```

Use this URL, not a side route, for posters, QR codes, external write-ups, and social shares. It is carved out as a public route in `web/src/app/(app)/layout.tsx` alongside `/events/[id]`, so logged-out visitors reach it directly without an auth redirect. `GET /communities/:slug` treats auth as optional and mirrors the existing privacy contract:

- **Public community**: full detail (header, hobbies, location / online badge, member count, website, Discord link, plans, members). Logged-out viewers see a **Join this community** (or **Request to join** when `join_mode = approval_required`) CTA that routes through `/login?next=<slug URL>`; the button is account-agnostic copy so cold / QR traffic reads it as an invitation rather than an assumption they already have an account. The CTA stands on its own, no sales line beneath it. The page also renders a **member-preview strip** above the tabs (first five avatars + up to three handles + remaining count) so the slug URL feels inhabited to a first-time visitor. Logged-out viewers in the preview only ever see `@username`; real names are gated behind a logged-in session and matched to the Members-tab rule.
- **Private community**: the same restricted preview that a logged-in non-member receives (header, hobbies, location / online badge, member count, `upcoming_plan_count`, description, locked-preview card, optional banner hero). Plan detail, member detail, `website`, `discord_url`, and `operating_hours` are not included. The member-preview strip is **not** rendered on the restricted response since the API doesn't expose members there. The community **banner** *is* rendered on the restricted landing when set, it's a visual element with no plan/member content and the privacy contract stays intact. Logged-out viewers see a **Request to join this community** card (same `/login?next=...` routing).
- **Closed community**: minimal closed response + "This community has been closed" card. Super admins still see the full view.
- **Members / owners / super admins**: unchanged full access.

Manual subpaths (`/communities/[slug]/edit`, Requests tab mutations, etc.) remain authenticated-only. Do not re-introduce an auth gate to the bare slug route, and do not invent a parallel preview route; one canonical URL is what makes this durable.

---

## Add Plan / Edit Plan Parity Rule

`web/src/app/(app)/events/create/CreateEventClient.tsx` and `web/src/app/(app)/events/[id]/edit/EditEventClient.tsx` are **one plan form system**, intentionally presented as such to the user. They are not currently extracted into a shared component.

### Current implementation reality

- Both files implement the same top-level sections in the same order: **Banner, Basic details, Date & time, Location, Visibility, Extra options, Community, QA plan, Submit.** (The Matching preferences section between Community and QA plan was removed with the matching system, July 2026.)
- The three historically drift-prone sections are **already extracted** into shared components under `web/src/components/events/planForm/`: `ExtraOptionsSection`, `CommunityLinkSection`, and `QAPlanSection`. Both forms import and render the same components; the sections cannot drift visually. `CommunityLinkSection` is a single unified render: multi-select Autocomplete + members-only toggle. Add and Edit pass the same prop shape (`myCommunities`, `selectedCommunityIds`, `hideFromExplore` + change handlers). Re-parenting a plan on edit is supported; server-side membership validation fires for any newly added community linkage, but is skipped when only existing linkages are reused.
- The remaining six sections (Banner crop, Basic details, Date & time, Location, Visibility, Submit) are still duplicated between the two files. They have been stable in practice, so the extraction cost has not been spent yet. Extract them when and if they drift, or as part of a dedicated scope.
- Shared UI primitives (`AppCard`, `AppTextField`, `AppButton`, `HobbyPickerField`, `PlacesAutocompleteInput`, `RichTextEditor`) are shared across both forms as building blocks.

### The rule (for future agents)

**Treat changes to one file as changes to both** unless the prompt explicitly says otherwise, or the change is demonstrably edit-only (e.g. touching initial-value hydration from the event payload, or the "Notify attendees about these changes" toggle that only exists in Edit).

When making UI or behavior changes:

1. If the change lands in one of the three extracted sections (`ExtraOptionsSection`, `CommunityLinkSection`, `QAPlanSection`), edit the shared component; both forms pick it up automatically. Do not fork back into the form files.
2. If the change lands in one of the still-duplicated sections (Banner, Basic details, Date & time, Location, Visibility, Submit), read the matching section in the other file before editing and mirror the change: same labels, helper text, spacing, control sizes, section order, shared-primitive usage, and validation semantics.
3. Keep the parity delta contained to intentionally divergent fields (initial state loading, edit-only toggles, submit endpoint/method). Everything else should read identically.
4. If you must diverge visually for a good reason, document it with a code comment so the next agent doesn't revert the difference.

### Sections that are deliberately allowed to differ

| Section | Add vs Edit difference | Why |
|---|---|---|
| Extra options, "Notify attendees about these changes" toggle | Edit only | Only meaningful when editing an existing plan with attendees. |
| Date & time, "Ask attendees to reconfirm for the new time" toggle | Edit only | Rendered inside the When? card only when the pickers diverge from the saved start time AND the plan has non-host going/maybe attendees. Sends `reconfirm_rsvps: true` on PATCH; the server resets Going RSVPs to Maybe (clearing `committed_at`) and emails attendees to reconfirm. See Technical_Specs.md, PATCH /events/:id. |
| Submit wiring | `POST /events` vs `PATCH /events/:id`; different success redirects | Inherent to create vs edit. |
| Banner / hobby / community initial state | Edit hydrates from `GET /events/:id`; Add starts empty (or pre-selects from `?community_id=` on Create, which seeds a single entry into `selectedCommunityIds[]`) | Inherent to edit-vs-create. |
| Copy-a-plan hydration (`?copy_from=<planId>`) | Add only | `/events/create?copy_from=` pre-fills the Add form from a plan the viewer hosted (host-gated: hydration requires `isHost` on `GET /events/:id`, otherwise falls back to a blank form with a toast). Date/time advance to the next future occurrence of the source weekday; the availability deadline and attendees are not copied; community linkage is intersected with the viewer's current memberships (`hide_from_explore` carries only when linkage survives, since it would otherwise hide the plan from everyone in Explore); the banner image is fetched and re-staged through the normal media pipeline; the hobby-based preset auto-suggest is suppressed so the copy keeps the source's banner state. Hydration resets the form before applying, so copying over a half-filled form (or re-copying a different source) stays faithful. Two entry points: "Copy plan" in the plan detail host actions (upcoming, past, and canceled hosted plans), and a quiet "Copy a previous plan" action in the Add form's header that opens `CopyPlanDialog` (picker over `GET /events/mine`, hosted plans only) and hydrates in place via the same path. Since July 2026 the create POST carries `copied_from`, and the server records a `plan_copied` product event (validated against source ownership, QA-excluded), so repeat planning is measurable in the admin funnel (`plansCopied`). |
| Community PATCH diff semantics | Edit only omits `community_ids` / `hide_from_explore` from the PATCH body when unchanged | Prevents the server's "must be a member" validation from re-firing on a no-op save for a host who has since left the linked community. |

Anything outside that list should render and behave identically in both forms.

### If you're extracting more sections

The four drift-prone sections are already extracted under `web/src/components/events/planForm/`. Extract additional sections only when they start drifting or as part of a dedicated scope; per-section extraction without observed drift adds surface area for little payoff. If you do extract another section, follow the pattern: a controlled "dumb" component that takes state + change handlers as props, add it to `planForm/index.ts`, and swap both form files in the same commit.

---

## UI Governance Principles

NewChums has moved past its original purchased template (`template_reference/`). New UI work should reuse existing NewChums patterns, the shared component library, and the theme; do not try to restore or copy the old template.

### Form Inputs (Label-Above Style)

- **Always prefer labels above fields.** Match the Date of birth / NCDatePicker pattern: a static Typography label above the input, not a floating or in-field label.
- **Use the right component:**
  - `AppTextField`, for text fields, selects, and any field with a label (renders label above automatically).
  - `AuthField`, for auth flows (login, signup, forgot-password); same label-above pattern with optional `noTopMargin`.
  - `NCDatePicker`, for date fields (e.g. date of birth).
- **Do not use** raw MUI `TextField` with `label` prop for new form fields. Use `AppTextField` instead.
- **For Autocomplete or custom inputs:** render a Typography label above (subtitle1, fontWeight 600, mb: 0.625), then the input with `label={undefined}`.
- Floating / in-field labels are not permitted. Do not reintroduce them.

### Pattern Reuse Rules

- **New views:** Start by skimming `docs/UI_Patterns.md` and the closest live page in `web/src/app/`. Copy the structure of an existing surface that already does what you need rather than inventing new structure.
- **Styling:** Prefer theme overrides and shared components over per-page `sx` patches.
- **Mobile:** Avoid mobile-only CSS edits that diverge from desktop. Keep responsive behavior consistent with the rest of the app.
- **Done means:** Matches an existing live page or pattern entry, uses shared components, no ad-hoc styling drift.

### Where to Look First (Agent Checklist)

| Task                                          | Look first                                                 | Then                                                             |
| --------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| **Any UI work**                                | [`docs/UI_Patterns.md`](docs/UI_Patterns.md), check for a matching pattern (hero cards, empty states, pill modules, success dialogs, footer escalations, chum-status flows, etc.) | Adopt the pattern's spacing, radii, gradients, and motion rather than re-deriving them |
| View/page change                              | The closest existing page under `web/src/app/`             | Mirror structure and shared components in your new page          |
| Auth views (login, register, forgot-password) | The current login/signup/forgot-password pages and `web/src/components/auth/` | Reuse `AuthSplitLayout`, `AuthField`, and the existing layout shells |
| Form fields (text, select, date)              | `web/src/components/ui/AppTextField.tsx`                  | AppTextField (label above), AuthField, NCDatePicker              |
| Global styling                                | `web/src/theme/`                                           | Theme overrides, not per-page hacks                              |
| Component pattern                             | `web/src/components/` (especially `ui/`, `events/`, `community/`) | Reuse or extend existing shared components                       |

### Agent Workflow for UI Work

1. **Preflight:** Ensure gitignored assets are restored (env files). See [`docs/Gitignored_Assets_and_Restore.md`](docs/Gitignored_Assets_and_Restore.md).
2. **Read [`docs/UI_Patterns.md`](docs/UI_Patterns.md) before writing any UI.** Skim the index for a matching recipe (hero card, pill response, success dialog, escalation footer, lazy chum-status, etc.) and adopt its conventions (radii, spacing tokens, gradients, hover/motion) rather than re-deriving them. If you ship a reusable UI shape that isn't in the catalogue, add an entry, the doc stays useful only if it grows with the system.
3. Prefer modifying shared components (`web/src/components/`), layouts, and theme over per-page `sx` patches.
4. Keep changes minimal and consistent with the closest existing surface.
5. When in doubt: copy the pattern from a live page that already does something similar and adapt it.

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

## Product Analytics (GA + First-Party Funnel Events)

- Client events go through `trackEvent()` (`web/src/lib/analytics.ts`), a gtag wrapper that is production-only and swallows all failures. Naming convention: snake_case verbs scoped by surface (`rsvp_form_submitted`, `share_link_copied`), flat params (string | number | boolean). **Never send email addresses or other PII as GA params.** Analytics must never block or break UX.
- Server-detectable funnel steps are mirrored first-party into the append-only `newchums.product_events` table (migration 103) by `api/src/lib/productEvents.ts`, because GA is production-only and partially eaten by ad blockers. Writes are fire-and-forget (`runAfterResponse` / `executionCtx.waitUntil`); a failed event insert must never fail the parent request. Application logic never updates rows, and the ONLY deletion path is the super-admin hard delete (test-data hygiene, `api/src/lib/adminHardDelete.ts`), which removes the subject's rows inside the audited cascade so cleaned funnels reflect reality. First-party rows may reference internal user ids.
- QA plans (`is_qa = true`) never produce product events, matching the standing QA-out-of-KPI-metrics invariant.
- The full event catalogue (name, where it fires, params, GA vs first-party vs both) lives in `docs/Technical_Specs.md`, section 12, "Product analytics events". When adding, renaming, or removing an event, update that table in the same change set.
- Admin surface: the "Funnel" section of `/admin/kpis`, backed by `GET /admin/kpis/funnel`. Client-only steps render a "see GA" chip; there is intentionally no GA API integration.

---

## Deployment & Runtime Notes

- Web Worker runs on Cloudflare Workers (OpenNext).
- Do NOT add `export const runtime = "edge"` to **page or route handlers**. OpenNext CF shims the edge runtime to an empty module on those, causing 500 Internal Server Error. Workers already run at the edge.
- The **middleware file** at [`web/src/middleware.ts`](web/src/middleware.ts) is the one exception: it MUST declare `export const runtime = "experimental-edge"`. Without that, Next.js 16 defaults middleware to the Node runtime (and the newer `proxy.ts` convention forces Node runtime; `proxy.ts` is therefore unusable here until OpenNext-Cloudflare adds Node-runtime middleware support). OpenNext's Cloudflare adapter only knows how to bundle Edge middleware, so a Node-runtime build silently ships a Worker with no middleware wired at all. The user-visible symptom in production was: every logged-out visit to a public `(app)` route (`/communities`, `/events/[id]`, etc.) redirected to `/login?next=%2F` because `x-request-path` was never set and the layout's `getRequestedPathFromHeaders` fell back to `/`. [`web/scripts/patch-functions-config.js`](web/scripts/patch-functions-config.js) runs as a defensive deploy guard that fails the deploy if the middleware regresses to Node-runtime.

- Validate builds before deploy:

  `cd web && npm run build`

- API deploys via Wrangler.

### Post-sign-in navigation

After `signIn(..., { redirect: false })` succeeds, use a full browser navigation (`window.location.assign(target)`), **never** `router.replace` / `router.push`. Next.js App Router caches the `(app)/layout.tsx` RSC per route segment; a client-side navigation reuses the layout output that was rendered pre-login (session null, unauthed shell) because the segment is "unchanged" from the client's perspective. The user ends up on their destination page with fresh authed page content rendered inside a stale unauthed `(app)` shell until the next hard refresh, which presents as a silent logout ("I clicked Start a plan and got logged out" / "opened Profile and saw Sign in in the header"). Google OAuth and the magic-link handler are safe because they go through a full-page redirect (`redirect: true` or `window.location.href`); only the credentials path needed an explicit fix. This rule applies to any future post-auth transition: credential sign-in, lightweight signup, email-change confirmation, new magic link, etc. If session identity changes, hard-navigate.

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

---

NewChums prioritizes maintainability, clarity, and architectural integrity over short-term velocity.
