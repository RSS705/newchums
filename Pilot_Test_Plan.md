# NewChums Pilot Readiness, Solo Test Plan

Scope: desktop-only, single tester juggling multiple accounts and an email client. Goal is real-user usability, not exhaustive QA. Run on production (`https://newchums.com`) using disposable emails (Gmail `+aliases` or a service like mailinator) and at least two browsers / browser profiles so multiple sessions stay logged in side-by-side.

---

## 1. Test Accounts

Aim to keep a tab open per role. "Browser slot" means a separate browser profile or incognito window.

| # | Identifier | Role | Key traits | Why it matters |
|---|------------|------|------------|----------------|
| A1 | **Olivia Organizer** (`@olivia`) | Community owner + plan host | Has avatar, banner, location set, ~2 hobbies. Owns one community. | Pilot's primary user archetype. Drives most flows. |
| A2 | **Henry Host** (`@henry`) | Plan host only, no community | Has chums (links to A4 + A5). Mid-filled profile. | Tests organizer flow without the community layer. |
| A3 | **Marcus Member** (`@marcus`) | Active joiner | Member of Olivia's community. Has 1 chum (A1). | Tests the "joining things others made" flow. |
| A4 | **Nina NewUser** (no handle yet) | Brand-new signup | No account at start of test. Receives an invite email. | Tests cold entry: invite → signup → first plan. |
| A5 | **Sam Sharelink** (no account at start) | Brand-new signup via share link | No account at start. Comes in via Copy Link, not invite email. | Validates lightweight signup path is distinct from invite path. |
| A6 | **Polly Public** (`@polly`) | Logged-in browser | Has profile, no chums, no communities, no plans. | Tests "logged-in but unaffiliated" Explore experience. |
| A7 | **Logged-out visitor** | Anonymous | No account, never signs in during this slot. | Tests public Explore, public community page, public plan preview. |
| A8 | **Reggie Returning** (`@reggie`) | Existing user clicking a fresh invite | Already has an account; receives invite email and share link to plans they're not part of. | Tests the "existing user clicks invite link" branch (shouldn't go through magic-link signup). |

> Keep A1, A2, A3 logged in across the whole week. A4 and A5 start signed-out. A7 stays signed out throughout.

---

## 2. Plans & Communities to Create

Create these up front (Day 1) so there is a realistic spread to test against.

### Communities

| # | Name | Owner | Visibility | Settings | Tests |
|---|------|-------|------------|----------|-------|
| C1 | **Wellington Boardgamers** | A1 Olivia | Public | Hobbies set, location set, join-approval ON | Public discovery, join-request approval flow, members list |
| C2 | **Inner Circle** | A1 Olivia | Private | Members-only, no approval needed (or approval ON, your call) | Private community visibility — non-members shouldn't see it in `/communities`, page should respect privacy |

### Plans

| # | Title | Host | Visibility | Community | Notable settings | Tests |
|---|-------|------|------------|-----------|------------------|-------|
| P1 | **Saturday Boardgame Night** | A1 | Public | C1 (community-linked) | Approval OFF, alt-times ON, "only show to community members" OFF | Public Explore, community feed, RSVP, alt-time |
| P2 | **MTG Draft, Members Only** | A1 | Public | C1 | "Only show to community members" ON (`hide_from_explore`) | Verifies toggle hides plan from non-member Explore but keeps it in community feed |
| P3 | **Coffee with Chums** | A2 Henry | Chums-only | None | No community | Chums-only visibility — A3 (not Henry's chum) should not see it; A4 (added as chum mid-test) should |
| P4 | **Dinner, Invite Only** | A2 Henry | Invite-only | None (cannot link) | A2 invites A4 via email and A6 via username | Invite email flow, invite-token URL, lightweight signup path for A4 |
| P5 | **Approval-required Hike** | A1 | Public | C1 | Join approval ON | Request-to-join → host approves/declines flow |
| P6 | **Tomorrow's Quick Catch-up** | A2 Henry | Public | None | Schedule for ~26h from "now" so the 24h confirmation prompt fires during the test week | Confirmation lifecycle |

> If feasible, also create one plan in the past for A1 with A3 and A6 attended, so the post-plan feedback flow can be exercised without waiting.

---

## 3. Test Execution Checklist

Work through top-to-bottom. Tick items as you go. For each item, the implicit question is *"would a first-time community organizer get this without help?"*

### A. Entry & Signup Flows

**A.1 Logged-out homepage (A7)**
- [ ] Visit `https://newchums.com` in a clean session — public Explore loads with real plans (P1 visible, P2/P3/P4 not visible)
- [ ] Search + time filter + pagination on the public feed all behave
- [ ] "How it works", "Science of Friendship", "Safety Center", "Contact" pages reachable from nav and don't 404
- [ ] Click P1 → public plan preview shows: title, description, host, approximate location, anonymized "Who's in" — but **no RSVP button**, only a sign-in / create-account CTA
- [ ] Try direct URL `/events/<P3 id>` (chums-only) and `/events/<P4 id>` (invite-only) without tokens — should 404 / not-found, not leak details

**A.2 Public community page (A7)**
- [ ] `/communities` loads for logged-out — C1 visible, C2 (private) not visible
- [ ] Open C1 — read-only view, no Join button taking action without prompting login
- [ ] Direct URL `/communities/<C2 slug>` while logged out — should not expose private community contents

**A.3 Lightweight signup via share link (A5)**
- [ ] As A1, on P1, click **Copy Link** — URL contains `?share_token=...`
- [ ] Open that link in A5's signed-out browser — full plan preview loads, lightweight-signup card visible (email + DOB + legal)
- [ ] Submit — magic-link email arrives within ~1 min
- [ ] Click magic link → completes account creation, lands back on P1 as a logged-in user, can RSVP
- [ ] After RSVP, `/plans` shows P1 in upcoming

**A.4 Invite email flow (A4)**
- [ ] As A2, on P4 (invite-only), invite A4 by email
- [ ] Email arrives at A4's address with an invite link (`?invite_token=...`)
- [ ] Click in signed-out browser → full P4 detail visible + lightweight signup with email pre-filled
- [ ] Complete magic-link → lands on P4 as authenticated, with the invite already adopted onto the account (no second "request to join" needed)
- [ ] A4 can RSVP yes; appears in P4 attendee list for A2

**A.5 Existing user clicks invite (A6 / A8 Reggie)**
- [ ] While A8 is already logged in, click the invite link from A2 to a different plan — should NOT trigger lightweight signup; should just open the plan with RSVP available
- [ ] Click a Copy Link (`share_token`) while logged in — opens plan as authenticated, no signup prompt

**A.6 Standard signup paths**
- [ ] Run a normal credentials signup (fresh email) → email verification → onboarding (username, DOB, hobbies, location) → dashboard. Confirm no dead screens between steps.
- [ ] Run a Google OAuth signup with a different fresh Google account → legal acceptance → onboarding → dashboard. (Skip if no spare Google account; flag as untested.)

**A.7 Login redirect behavior**
- [ ] Sign out of A1. Click a logged-out link to P1. Sign in. Confirm you land back on P1, not the dashboard.
- [ ] Sign out, hit `/plans` (auth-required). Sign in. Should land on `/plans`.
- [ ] After sign-in, no flicker of the logged-out layout (per the auth-router-cache rule — should be a hard navigation).

### B. Community Interaction

**B.1 Public community (C1)**
- [ ] A6 (logged-in, not a member) opens C1 — sees description, hobbies, member count, plan feed
- [ ] Plan feed for non-member shows P1 (public, toggle off) but NOT P2 (toggle on) — verify this matches the contract
- [ ] Click "Join" — because approval is ON, request is submitted, button changes state to "Requested"

**B.2 Approval flow**
- [ ] A1 sees a join request notification / badge in community management
- [ ] A1 approves A6 → A6 sees they are now a member (refresh)
- [ ] A6 now sees P2 in the community feed
- [ ] Repeat with A4: this time A1 **declines** — A4's button returns to "Join" state, no membership created

**B.3 Members-only / private community (C2)**
- [ ] A3 (non-member) cannot see C2 in `/communities`
- [ ] A1 invites A3 to C2 (via whatever join mechanism C2 uses — open invite, manual add, etc.)
- [ ] A3 can now see C2; A6 still cannot

**B.4 Leaving a community**
- [ ] A6 leaves C1 → P2 disappears from their Explore + community feed view
- [ ] A6 rejoins (or re-requests) — state transitions cleanly, no stuck "Requested" button

### C. Plan Interaction

**C.1 Plan visibility matrix sanity**
- [ ] As A7 (logged out): P1 ✓ in Explore, P2 ✗, P3 ✗, P4 ✗
- [ ] As A6 (logged in, not member of C1, not chum of A2): P1 ✓, P2 ✗ (toggle), P3 ✗ (chums-only), P4 ✗ (invite-only)
- [ ] As A3 (member of C1, not chum of A2): P1 ✓, P2 ✓ (community member bypass), P3 ✗, P4 ✗
- [ ] As A4 after being invited to P4: P4 ✓ even though invite-only

**C.2 RSVP**
- [ ] A3 RSVPs Yes to P1 → appears in attendee list, gets confirmation UI feedback, plan shows in `/plans` upcoming
- [ ] A3 changes RSVP / leaves the plan → removed cleanly, no orphan state
- [ ] A6 RSVPs to P1 → host A1 gets a notification / sees in attendee list

**C.3 Suggest alternate time (P1, alt-times ON)**
- [ ] A3 suggests an alt time — appears for host and attendees
- [ ] A1 (host) edits and then promotes the alt time → plan time updates, all attendees see the new time, notifications fire
- [ ] A1 can also delete an alt time

**C.4 Request to join (P5, approval ON)**
- [ ] A6 requests to join P5 — sees "Requested" state
- [ ] A1 approves → A6 is now an attendee, gets notified, plan in `/plans`
- [ ] A3 requests, A1 declines → A3 sees declined state, can't auto-rejoin in a confusing loop
- [ ] A6 (still pending elsewhere) can withdraw their own request

**C.5 Hide name on attendee list (privacy)**
- [ ] A6 toggles `hide_name` on a plan they've RSVP'd to → other attendees see masked real name, handle and avatar still visible
- [ ] Toggle off restores name

### D. Organizer / Host Flow (the most pilot-critical section)

**D.1 Create plan — happy path (A1 creates P1 fresh-feeling)**
- [ ] "Start a plan" CTA is obvious from dashboard
- [ ] Form: title, description, hobby, date/time, location, visibility, community link, approval, alt-times, "only show to members" toggle — all clear, no jargon
- [ ] Toggle changes are reflected immediately (e.g. "only show to members" only appears when a community is selected and visibility ≠ invite-only)
- [ ] Selecting `invite_only` disables / hides the community selector (server-enforced; UI should match)
- [ ] Publish → lands on the plan detail or `/plans` with the new plan visible

**D.2 Edit plan (Add/Edit parity rule)**
- [ ] Edit P1 from plan detail — form looks essentially identical to create form
- [ ] Change time, save → attendees notified, displayed time updates everywhere
- [ ] Change visibility from public → chums-only on a plan with non-chum attendees (if the system allows it) — observe what happens to existing RSVPs; flag if confusing

**D.3 Manage attendees**
- [ ] A1 removes A6 from P1 → A6 sees they're removed, plan no longer in `/plans` upcoming
- [ ] A1 reserves seats / sets capacity — if capacity is hit, further RSVPs blocked with a clear message
- [ ] Toggle "attendees can invite" on/off — confirm A3 only sees an invite UI when toggle is on

**D.4 Inviting users**
- [ ] A1 invites by email (a non-user address) — invite email sends, recipient flow already covered in A.4
- [ ] A1 invites by `@handle` (existing user A6) — A6 gets in-app notification; clicking it opens the plan
- [ ] Remove invite (before acceptance) → invitee no longer sees the plan, no error if they try the original link

**D.5 Locking & cancelling**
- [ ] A1 locks P1 → no further RSVPs accepted, lock state visible to attendees
- [ ] A1 cancels P6 → all attendees notified, plan moves out of upcoming, post-cancel view is clear (not a 404)

### E. Communication & Engagement

**E.1 Plan chat**
- [ ] A1, A3, A6 (all RSVP'd to P1) open the plan in three slots
- [ ] A1 sends a message → appears in real time for A3 and A6 (WebSocket relay working)
- [ ] A3 navigates away then back → message history loads
- [ ] A6 has unread badge in nav / on `/plans` when there are unread messages
- [ ] Mark-as-read clears the badge
- [ ] A non-attendee (A2) cannot access P1 chat

**E.2 Notifications (sanity, not exhaustive)**
- [ ] Bell icon shows a count when: someone RSVPs to your plan, someone requests to join your community, your join request is approved, someone invites you, alt time suggested
- [ ] Clicking a notification deep-links to the right place (plan, community, profile)
- [ ] Mark-all-read works
- [ ] Email notifications: at least one transactional email lands per category during the test week (invite, approval, magic link, plan change). Spot-check sender, subject, body, links.

### F. Confirmation & Lifecycle

**F.1 24h confirmation (use P6, scheduled ~26h out)**
- [ ] At ~24h before P6, attendees receive a confirmation prompt (in-app + email)
- [ ] A3 confirms → state visible to host
- [ ] A6 ignores / does not confirm → host sees unconfirmed state; if cron logic auto-cancels under-attended plans, verify behaviour matches expectation (do not test by waiting hours; just verify the data state and the host-facing UI is unambiguous)

**F.2 Auto-cancel sanity**
- [ ] Create a throwaway public plan with no attendees other than the host and a start time ~30min in the past. Within 2h the auto-cancel cron should mark it cancelled. (Optional — only if you can leave it running.)

**F.3 Post-plan feedback**
- [ ] On the past plan you seeded for A1, open the plan detail → feedback section visible
- [ ] Submit feedback for one attendee, dismiss feedback for another — both work, confirmation visible
- [ ] Try the conduct-report / attendance-issue paths once each; confirm submit succeeds and gives a clear acknowledgment (no need to verify admin handling here)

**F.4 Plan completion / past view**
- [ ] Past plan moves out of `/plans` upcoming into past tab cleanly
- [ ] Chat is still readable (or appropriately archived) on a past plan
- [ ] Cancelled vs completed states are visually distinguishable

---

## 4. Final System Sanity Pass

Do this after sections A–F are complete, in one quick top-to-bottom pass.

**Flow integrity**
- [ ] No flow ends on a blank screen, raw error, or unexplained redirect
- [ ] Every "submit" action gives feedback within ~2 seconds (toast, page change, or inline state)
- [ ] Back button never lands on a stale or broken page after a key action (signup, RSVP, plan create)

**Logged-out ↔ logged-in transitions**
- [ ] No flash of logged-in chrome on logged-out pages, or vice versa
- [ ] After any sign-in/sign-up, the page is a fresh hard-load, not a cached client view (per the `window.location.assign` rule)
- [ ] Signing out from any page returns to a sensible logged-out home, not a 401 wall

**Invitee experience (most pilot-critical)**
- [ ] An invited user with zero prior context can: receive email → open link → understand what NewChums is → sign up → see the plan → RSVP, in under ~5 minutes, with no help
- [ ] The same is true via a Copy Link share, not just an invite email

**Organizer experience**
- [ ] A community organizer can, end-to-end: create a community → create a plan in it → invite people → manage join requests → chat → confirm → see it through to completion, without needing to ask "what do I do next?"

**Cross-feature consistency**
- [ ] Plan visibility behaves identically in Explore, community feed, and direct URL (no plan that "leaks" into a feed it shouldn't, no plan that's hidden where it should be visible)
- [ ] Any account that should be able to see a plan/community can also act on it (RSVP, chat, request) — no read-only ghost states

**Trust & polish smell-tests**
- [ ] No placeholder copy, lorem ipsum, or "TODO" strings visible to a real user
- [ ] No console errors in the browser devtools during the main flows (open devtools for one full pass of organizer + invitee)
- [ ] Email senders, subjects, and links all look like a real product, not a dev environment

---

### Recommended execution order (one possible week)

1. **Day 1** — Set up A1–A8, create C1/C2 and P1–P6. Section A (entry & signup) end-to-end.
2. **Day 2** — Sections B (community) and C (plans).
3. **Day 3** — Section D (organizer).
4. **Day 4** — Sections E (chat & notifications) and F (lifecycle, including waiting on P6 confirmation window).
5. **Day 5** — Section 4 sanity pass + log issues + retest blockers.

Keep a running list of friction points as you go (one line each: "where, what happened, what felt wrong"). That list is the actual deliverable for pilot-readiness, not the ticked checkboxes.
