# NewChums — Comprehensive Manual QA Checklist

Generated from full codebase inspection. Covers every user-facing flow, admin tool, email, permission boundary, and edge case identified in the current implementation.

---

## 1. Recommended Test Setup

### Accounts needed

| Persona | Requirements | Purpose |
|---------|-------------|---------|
| **Admin (A)** | `super_admin` role set in DB | Admin tools, moderation, diagnostics, KPIs |
| **Host User (H)** | Completed onboarding, profile photo, bio, hobbies, location set | Plan creation, hosting, invites, chat, feedback |
| **Regular User (R1)** | Completed onboarding, different hobbies from H | Attending, RSVP, feedback, chum preferences |
| **Regular User (R2)** | Completed onboarding, some overlapping hobbies with H | Multi-attendee scenarios, cross-user interactions |
| **Fresh User (F)** | Email registered but NOT onboarded (no username/DOB) | Onboarding flow, objective nudges |
| **Google OAuth User (G)** | Google-linked account | OAuth-specific flows, email verification bypass |
| **Logged-out Visitor** | Incognito / no session | Public access, logged-out restrictions |

### Seed conditions

- At least 2–3 published plans (mix of public, chums-only, invite-only visibility)
- At least 1 plan with past start time (for feedback/post-plan testing)
- At least 1 community (public, open join) and 1 community (private, approval required)
- Interests/hobbies catalog should be seeded (migration 008)
- At least 1 roadmap item

### Environment notes

- Postmark templates must be configured (or use test mode)
- Turnstile: use Cloudflare test keys for local (`1x00000000000000000000AA`)
- Verify `.dev.vars` has all `POSTMARK_TEMPLATE_*` IDs set
- Google Maps API key configured for location autocomplete

---

## 2. Recommended Execution Order

1. **Auth & onboarding** — establish test accounts
2. **Profile & settings** — configure accounts for subsequent tests
3. **Plans (create/edit)** — create test data for downstream flows
4. **Plan interactions (RSVP, invites, join requests)** — multi-user
5. **Plan chat** — real-time, requires attending status
6. **Post-plan feedback & attendance** — requires past plan
7. **Chum preferences** — requires feedback data
8. **Connections (chums)** — add/remove/invite
9. **Communities** — create, join, membership, plan integration
10. **Explore & discovery** — logged-in and logged-out
11. **Public profile** — logged-in vs logged-out viewer
12. **Notifications & emails** — verify delivery and preferences
13. **Settings & privacy** — toggles, account actions
14. **Objectives & nudges** — progression system
15. **Roadmap** — public and admin
16. **Admin tools** — all super_admin surfaces
17. **Public/marketing pages** — logged-out experience
18. **Responsive/mobile** — key screens at mobile width
19. **Edge cases & destructive actions** — cancellations, deletions, suspensions

---

## 3. Full Manual QA Checklist

---

### 3.1 Authentication & Account Creation

#### TC-AUTH-01: Credentials signup (happy path)
- **Purpose:** Verify full credentials-based registration
- **Preconditions:** No existing account with test email
- **Steps:**
  1. Navigate to `/signup`
  2. Fill in name, email, password, date of birth, accept terms/privacy
  3. Select at least one hobby
  4. Submit
- **Expected:** Account created, verification email sent, redirected to `/auth/verify/pending`
- **Verify:** Email received with verification link; link works and marks email as verified; user cannot access app routes until verified (if enforced); user redirected to onboarding after verification

#### TC-AUTH-02: Credentials signup — underage rejection
- **Purpose:** Verify 18+ requirement
- **Preconditions:** None
- **Steps:** Attempt signup with DOB making user under 18
- **Expected:** Registration rejected with appropriate message

#### TC-AUTH-03: Credentials signup — duplicate email
- **Purpose:** Verify duplicate prevention
- **Steps:** Attempt signup with an already-registered email
- **Expected:** Error message (should not reveal whether email exists for security — verify wording)

#### TC-AUTH-04: Google OAuth signup
- **Purpose:** Verify OAuth registration flow
- **Steps:**
  1. Navigate to `/signup` or `/login`
  2. Click "Sign in with Google"
  3. Complete Google OAuth
- **Expected:** Account created, email auto-verified (`mark-oauth`), redirected to onboarding if profile incomplete
- **Verify:** No verification email sent for OAuth users; legal acceptance recorded

#### TC-AUTH-05: Credentials login
- **Purpose:** Verify password login
- **Steps:** Navigate to `/login`, enter valid credentials
- **Expected:** Logged in, redirected to `/` (Explore) or `next` param destination

#### TC-AUTH-06: Login — invalid credentials
- **Purpose:** Verify error handling
- **Steps:** Enter wrong password
- **Expected:** Generic error (should not confirm whether email exists)

#### TC-AUTH-07: Forgot password flow
- **Purpose:** Verify password reset end-to-end
- **Steps:**
  1. Navigate to `/forgot-password`
  2. Enter registered email
  3. Submit
- **Expected:** Reset email sent (ambiguous success message regardless of email existence)
- **Verify:** Email contains reset link; link navigates to `/reset-password`; new password can be set; old password no longer works; token is single-use

#### TC-AUTH-08: Session persistence
- **Purpose:** Verify session survives page refresh
- **Steps:** Log in, refresh page, navigate between routes
- **Expected:** Session maintained, no re-login required

#### TC-AUTH-09: Logout
- **Purpose:** Verify clean logout
- **Steps:** Log out from any authenticated page
- **Expected:** Session cleared, redirected to login or landing, protected routes no longer accessible

#### TC-AUTH-10: Onboarding — username
- **Purpose:** Verify username onboarding step
- **Preconditions:** Fresh account without username
- **Steps:**
  1. Log in — should redirect to `/onboarding/username`
  2. Enter a valid username
  3. Submit
- **Expected:** Username saved, proceed to next onboarding step or app
- **Verify:** Username uniqueness enforced; availability check works; invalid characters rejected

#### TC-AUTH-11: Onboarding — date of birth
- **Purpose:** Verify DOB collection
- **Steps:** Complete DOB step during onboarding
- **Expected:** DOB saved, proceed to app
- **Verify:** Under-18 rejection if applicable

#### TC-AUTH-12: Onboarding redirect behavior
- **Purpose:** Verify incomplete profiles are redirected
- **Steps:** Try to access `/plans`, `/profile`, `/communities` without completing onboarding
- **Expected:** Redirected to `/onboarding/username?returnTo=...`; after completion, returned to original destination

#### TC-AUTH-13: Email verification flow
- **Purpose:** Verify email verification for credentials users
- **Steps:**
  1. Register with credentials
  2. Open verification email
  3. Click verification link
- **Expected:** Email marked verified, can proceed to app
- **Verify:** Expired tokens handled gracefully; re-request verification works

#### TC-AUTH-14: Legal acceptance (OAuth users)
- **Purpose:** Verify terms/privacy acceptance for OAuth
- **Steps:** Sign up via Google, verify legal acceptance is recorded
- **Expected:** `accepted_terms_version`, `accepted_privacy_version`, `accepted_legal_at` populated

---

### 3.2 Profile Management

#### TC-PROF-01: View own profile
- **Purpose:** Verify profile page loads with all sections
- **Steps:** Navigate to `/profile`
- **Expected:** Displays: about (name, username, avatar, gender, DOB, bio), location, hobbies, chum preferences, attendance stats

#### TC-PROF-02: Edit display name
- **Purpose:** Verify name update
- **Steps:** Change display name, save
- **Expected:** Name updated, reflected in profile and public profile

#### TC-PROF-03: Edit username/handle
- **Purpose:** Verify handle change
- **Steps:** Change username
- **Expected:** Username updated; old handle no longer resolves; availability check works during edit

#### TC-PROF-04: Upload profile avatar
- **Purpose:** Verify avatar upload flow
- **Steps:** Upload a profile photo (try various sizes/formats)
- **Expected:** Photo uploaded to R2, displayed on profile and public profile
- **Verify:** Crop interface works; old avatar replaced; avatar appears in plan cards, chat, member lists

#### TC-PROF-05: Remove profile avatar
- **Purpose:** Verify avatar removal
- **Steps:** Remove existing avatar
- **Expected:** Avatar cleared, default placeholder shown

#### TC-PROF-06: Edit bio
- **Purpose:** Verify bio field
- **Steps:** Add/edit bio text (test 500 char limit)
- **Expected:** Bio saved, displayed on profile and public profile

#### TC-PROF-07: Set/change location
- **Purpose:** Verify location autocomplete and save
- **Steps:** Use Google Places autocomplete to set home location; set travel radius
- **Expected:** Location saved (lat/lng stored); radius persists; used in Explore distance calculations

#### TC-PROF-08: Manage hobbies/interests
- **Purpose:** Verify hobby selection
- **Steps:** Add hobbies from catalog; remove hobbies; search for hobbies; create a new custom hobby
- **Expected:** Hobbies saved; appear on profile; affect Explore personalization and digest matching

#### TC-PROF-09: Set gender
- **Purpose:** Verify gender field
- **Steps:** Select gender option
- **Expected:** Saved, shown on public profile for logged-in viewers (not logged-out)

#### TC-PROF-10: Set profile theme
- **Purpose:** Verify profile theme setting
- **Steps:** Change profile theme if available
- **Expected:** Theme saved and applied

#### TC-PROF-11: Date of birth display
- **Purpose:** Verify DOB/age display rules
- **Steps:** Check age on own profile; check on public profile as logged-in viewer; check as logged-out
- **Expected:** Age shown to logged-in viewers (unless hidden); hidden from logged-out viewers always

---

### 3.3 Chum Preferences

#### TC-PREF-01: View chum preferences section
- **Purpose:** Verify preferences UI renders correctly
- **Steps:** Navigate to `/profile`, scroll to "Your chum preferences"
- **Expected:** Section shows master toggle, four metric rows (Reliability, Sociability, Personal care, Hosting quality), each with level selector

#### TC-PREF-02: Toggle master switch
- **Purpose:** Verify enable/disable
- **Steps:** Toggle "Use chum preferences" on/off
- **Expected:** Toggle saves without flicker or UI jump; explanation text present at bottom

#### TC-PREF-03: Set individual metric levels
- **Purpose:** Verify each level saves correctly
- **Steps:** Set each metric to each level (Open/Preferred/Important/Required)
- **Expected:** Each selection persists after page reload; no "saving..." flicker

#### TC-PREF-04: "Required" level warning
- **Purpose:** Verify warning text about Required level
- **Steps:** Set any metric to "Required"
- **Expected:** Explanation text visible warning about reduced matches and neutral-score exclusion

#### TC-PREF-05: Preferences affect Explore
- **Purpose:** Verify filtering behavior
- **Preconditions:** User R1 has "Required" reliability; User H hosts a plan; H has neutral reliability score
- **Steps:** R1 browses Explore
- **Expected:** H's plan may show compatibility note or be filtered based on preference settings
- **Verify:** User can still manually browse to the plan via direct URL

---

### 3.4 Plan/Event Creation

#### TC-PLAN-01: Create a public plan (happy path)
- **Purpose:** Verify basic plan creation
- **Steps:**
  1. Navigate to `/events/create`
  2. Fill title, description, hobby, date/time, location (in-person)
  3. Set visibility to "Public"
  4. Set status to "Published"
  5. Submit
- **Expected:** Plan created, redirected to plan detail page; plan appears in Explore for other users
- **Verify:** All fields saved correctly; plan card shows in Your Plans

#### TC-PLAN-02: Create a chums-only plan
- **Purpose:** Verify chums-only visibility
- **Steps:** Create plan with "Chums only" visibility
- **Expected:** Plan visible in Explore only to users who are chums of the host; not visible to non-chums; not visible in public explore

#### TC-PLAN-03: Create an invite-only plan
- **Purpose:** Verify invite-only visibility
- **Steps:** Create plan with "Invite only" visibility, add invitees
- **Expected:** Plan not visible in Explore or digest; only accessible via invite link/token; invitees receive email
- **Verify:** Invite emails sent to selected users

#### TC-PLAN-04: Create a draft plan
- **Purpose:** Verify draft status
- **Steps:** Create plan with status "Draft"
- **Expected:** Plan saved but not visible in Explore or to others; appears in host's Your Plans

#### TC-PLAN-05: Create an online plan
- **Purpose:** Verify online location type
- **Steps:** Create plan with "Online" location, provide online link
- **Expected:** Online link shown to attending users; not shown in public preview

#### TC-PLAN-06: Upload plan banner
- **Purpose:** Verify banner upload
- **Steps:** Upload a banner image during plan creation
- **Expected:** Banner uploaded to R2, displayed on plan detail and cards

#### TC-PLAN-07: Create plan with attendance assurance
- **Purpose:** Verify reconfirmation settings
- **Steps:** Create plan with "Require reconfirmation" enabled; set min confirmed attendees, fallback policy
- **Expected:** Settings saved; confirmation emails sent by cron at appropriate times

#### TC-PLAN-08: Create plan with approval required
- **Purpose:** Verify join request mode
- **Steps:** Create plan with "Require approval" enabled
- **Expected:** Non-invited users see "Request to join" instead of direct RSVP; host receives join request notification

#### TC-PLAN-09: Create plan with max seats
- **Purpose:** Verify seat limits
- **Steps:** Create plan with max seats = 3; have 3 users RSVP
- **Expected:** 4th user cannot RSVP (seat limit reached); reserve seats toggle behavior works correctly

#### TC-PLAN-10: Create plan with alt times enabled
- **Purpose:** Verify alternative time suggestions
- **Steps:** Create plan with "Allow alternative times" enabled
- **Expected:** Attendees can suggest alt times; host sees alt time suggestions; host can promote an alt time

#### TC-PLAN-11: Create plan linked to community
- **Purpose:** Verify community association
- **Preconditions:** User is a member of at least one community
- **Steps:** Create plan from community page or with community_id
- **Expected:** Plan linked to community; appears in community's plan feed; `hide_from_explore` toggle available
- **Verify:** If `hide_from_explore` is on, plan does not appear in general Explore

#### TC-PLAN-12: Create plan with chum preference overrides
- **Purpose:** Verify plan-level preference overrides
- **Steps:** Expand "Chum preference overrides" section; disable all or select specific metrics
- **Expected:** Overrides saved; matching behavior for this plan relaxed accordingly
- **Verify:** Override does not change host's profile-level preferences

#### TC-PLAN-13: Create plan with timezone
- **Purpose:** Verify timezone handling
- **Steps:** Create plan in a non-UTC timezone
- **Expected:** Times displayed correctly in the plan's timezone

---

### 3.5 Plan Editing

#### TC-EDIT-01: Edit plan — basic fields
- **Purpose:** Verify edit page loads and saves
- **Preconditions:** Published plan hosted by current user
- **Steps:** Navigate to `/events/[id]/edit`; change title, description, date
- **Expected:** Changes saved; attendees notified of material changes (email if plan_changed pref enabled)

#### TC-EDIT-02: Edit plan — after start time
- **Purpose:** Verify edit lock after 1 hour past start
- **Preconditions:** Plan with start time > 1 hour ago
- **Steps:** Try to access edit page
- **Expected:** Edit controls disabled/locked

#### TC-EDIT-03: Edit plan — community association
- **Purpose:** Verify community can be changed/removed on edit
- **Steps:** Edit a plan's community association
- **Expected:** Association updated; plan appears/disappears from community feed accordingly

#### TC-EDIT-04: Edit plan — chum preference overrides
- **Purpose:** Verify overrides persist and can be modified
- **Steps:** Edit existing overrides on a plan
- **Expected:** Changes saved and reflected in matching behavior

#### TC-EDIT-05: Edit plan — non-host cannot edit
- **Purpose:** Verify authorization
- **Steps:** As R1 (non-host), try to navigate to `/events/[id]/edit` for H's plan
- **Expected:** Access denied (not found or redirect)

---

### 3.6 Plan Detail & Access States

#### TC-DET-01: Public access — logged-out, plain URL
- **Purpose:** Verify public preview
- **Steps:** Open a published public plan URL in incognito
- **Expected:** Limited preview: title, description, date, approximate location, hobby, attendee count (no individual RSVPs); no RSVP controls; no online link; no exact address; CTA to sign up/login
- **Verify:** No email RSVP flow visible; no chat

#### TC-DET-02: Invite access — logged-out with share_token
- **Purpose:** Verify share link access
- **Steps:** Open plan URL with `?share_token=...` in incognito
- **Expected:** Full plan detail visible; guest RSVP flow available (email verification → participation token)

#### TC-DET-03: Invite access — logged-out with invite_token
- **Purpose:** Verify invite link access
- **Steps:** Click invite link from email in incognito
- **Expected:** Full plan detail; can RSVP as guest via email flow

#### TC-DET-04: Authenticated access — logged in, not attending
- **Purpose:** Verify authenticated non-attendee view
- **Steps:** Log in as R1, view H's public plan
- **Expected:** Full detail visible; RSVP button available (or "Request to join" if approval required); no chat access; compatibility notes if chum preferences don't match

#### TC-DET-05: Attending access — logged in, RSVP'd going
- **Purpose:** Verify full attendee experience
- **Steps:** RSVP "Going" to a plan, then view detail
- **Expected:** Full detail; chat visible and functional; exact location per visibility rules; can suggest alt time; can cancel attendance

#### TC-DET-06: Past plan — visual indicators
- **Purpose:** Verify past plan presentation
- **Steps:** View a plan whose start time has passed
- **Expected:** Clear visual indicator that plan has happened; "You hosted this" shows as "You hosted this" (past tense); edit/lock/cancel buttons grayed out; "Find a better time" and "Invite people" sections hidden

#### TC-DET-07: Plan detail — host view
- **Purpose:** Verify host-specific controls
- **Steps:** View own plan as host
- **Expected:** Edit button, lock button, cancel button, invite controls, attendee management, join request management (if approval mode) all visible

#### TC-DET-08: Chum preference compatibility note
- **Purpose:** Verify compatibility warnings
- **Preconditions:** Viewer has chum preferences enabled; host or attendee doesn't meet a threshold
- **Steps:** View plan where someone doesn't meet preferences
- **Expected:** Compatibility note shown explaining which metric is not met; user can still choose to join

---

### 3.7 RSVP & Participation

#### TC-RSVP-01: RSVP Going
- **Purpose:** Verify going RSVP
- **Steps:** Click "Going" on a plan
- **Expected:** RSVP recorded; host notified (email if `host_join` pref on); attendee appears in list; chat access granted

#### TC-RSVP-02: RSVP Maybe
- **Purpose:** Verify maybe RSVP
- **Steps:** Click "Maybe" on a plan
- **Expected:** RSVP recorded; host notified (email if `host_maybe` pref on); user does NOT get chat access (going only)

#### TC-RSVP-03: RSVP Can't Make It / Leave
- **Purpose:** Verify leaving a plan
- **Steps:** Change RSVP from Going to Can't Make It
- **Expected:** RSVP updated; host notified (email if `host_leave` pref on); chat access revoked; seat freed

#### TC-RSVP-04: RSVP — seat limit reached
- **Purpose:** Verify seat enforcement
- **Preconditions:** Plan at max capacity
- **Steps:** Additional user tries to RSVP
- **Expected:** RSVP rejected with "full" message

#### TC-RSVP-05: RSVP — locked plan
- **Purpose:** Verify lock prevents new joins
- **Preconditions:** Host has locked the plan
- **Steps:** New user tries to RSVP
- **Expected:** RSVP blocked with locked message; existing attendees unaffected

#### TC-RSVP-06: Guest email RSVP (share link)
- **Purpose:** Verify guest RSVP flow end-to-end
- **Steps:**
  1. Open plan with share_token in incognito
  2. Enter email for guest RSVP
  3. Receive verification code email
  4. Enter code
  5. Complete RSVP
- **Expected:** Guest RSVP recorded; participation token issued; guest can return and see plan
- **Verify:** Guest verify code email received; code is correct; expired codes rejected

#### TC-RSVP-07: Join request flow (approval required)
- **Purpose:** Verify request-to-join end-to-end
- **Steps:**
  1. R1 requests to join H's plan (approval required)
  2. H receives notification/email
  3. H approves the request
- **Expected:** R1 receives approval email/notification; R1 can now access plan as attendee
- **Verify:** Also test decline path — R1 receives decline email; R1 cannot access plan

#### TC-RSVP-08: Join request — withdraw
- **Purpose:** Verify user can withdraw pending request
- **Steps:** Submit join request, then withdraw before host decides
- **Expected:** Request removed; host no longer sees it

#### TC-RSVP-09: Guest RSVP — account adoption
- **Purpose:** Verify guest rows link to account on signup
- **Steps:** Guest RSVPs via email, then creates an account with that same email
- **Expected:** Guest RSVP and participation data linked to the new account

---

### 3.8 Plan Host Actions

#### TC-HOST-01: Lock plan
- **Purpose:** Verify plan locking
- **Steps:** As host, lock the plan
- **Expected:** Lock indicator shown; new users cannot RSVP; existing attendees keep access; lock email sent to attendees (if pref on)
- **Verify:** Unlock reverses the state

#### TC-HOST-02: Cancel plan
- **Purpose:** Verify plan cancellation
- **Steps:** As host, cancel the plan
- **Expected:** Plan marked canceled; cancel emails sent to going/maybe attendees; plan no longer appears in Explore; chat no longer available

#### TC-HOST-03: Remove attendee
- **Purpose:** Verify attendee removal
- **Steps:** As host, remove an attendee from the plan
- **Expected:** Attendee removed; removal email sent; attendee loses access and chat; seat freed

#### TC-HOST-04: Remove invited user
- **Purpose:** Verify invite removal
- **Steps:** As host, remove a pending invite
- **Expected:** Invite removed; removal email sent

#### TC-HOST-05: Invite users to existing plan
- **Purpose:** Verify adding invites after creation
- **Steps:** As host, invite new users to a published plan
- **Expected:** Invite emails sent; invitees can access the plan

#### TC-HOST-06: Toggle attendee invites
- **Purpose:** Verify attendee invite permission
- **Steps:** Toggle "Allow attendee invites" on/off
- **Expected:** When off, non-host attendees cannot send invites; when on, they can

#### TC-HOST-07: Reserve seats toggle
- **Purpose:** Verify seat reservation behavior
- **Steps:** Toggle reserve seats
- **Expected:** Setting persists; affects seat counting logic

#### TC-HOST-08: Promote alt time
- **Purpose:** Verify alt time promotion
- **Preconditions:** Attendee has suggested an alt time
- **Steps:** As host, promote the alt time
- **Expected:** Plan start time updated; attendees notified of time change

---

### 3.9 Plan Chat

#### TC-CHAT-01: Chat — basic messaging
- **Purpose:** Verify real-time chat
- **Preconditions:** Two users both RSVP'd going to the same plan
- **Steps:** Open plan detail in both browsers; send message from one
- **Expected:** Message appears in real-time in the other browser via WebSocket; message persisted in DB

#### TC-CHAT-02: Chat — access control
- **Purpose:** Verify chat access restrictions
- **Steps:** Try to access chat as: (a) non-attendee, (b) "maybe" RSVP, (c) logged-out
- **Expected:** Chat not visible or 403 on chat endpoints; only host and "going" can chat

#### TC-CHAT-03: Chat — host lock does NOT disable chat
- **Purpose:** Verify chat continues when plan is locked
- **Steps:** Lock plan, verify existing going attendees can still chat
- **Expected:** Chat functional for existing attendees

#### TC-CHAT-04: Chat — unread indicator (bell)
- **Purpose:** Verify bell notification
- **Steps:** Send chat message; check other user's notification bell
- **Expected:** Unread chat count appears in bell

#### TC-CHAT-05: Chat — unread indicator (plan card)
- **Purpose:** Verify card dot
- **Steps:** Send chat message; check other user's Your Plans list
- **Expected:** Unread dot appears on the plan card

#### TC-CHAT-06: Chat — mark as read
- **Purpose:** Verify read state
- **Steps:** Open chat and view messages
- **Expected:** Unread indicators clear after viewing

#### TC-CHAT-07: Chat — WebSocket reconnection
- **Purpose:** Verify fallback behavior
- **Steps:** Simulate connection drop (close laptop briefly, switch tabs for 60+ seconds)
- **Expected:** Chat reconnects; missed messages appear via polling fallback

#### TC-CHAT-08: Chat — canceled plan
- **Purpose:** Verify chat disabled after cancellation
- **Steps:** Cancel a plan, try to access chat
- **Expected:** Chat no longer available

---

### 3.10 Post-Plan Feedback

#### TC-FB-01: Feedback UI appears
- **Purpose:** Verify feedback section shown after plan ends
- **Preconditions:** Plan start time is in the past (3+ hours ago); user attended
- **Steps:** View the plan detail page
- **Expected:** Feedback section appears prominently (near top); shows carousel/stepper with one card per attendee

#### TC-FB-02: Leave feedback for attendee
- **Purpose:** Verify feedback submission
- **Steps:** Rate an attendee on: Reliability, Sociability, Personal care, Match quality (Agree/Maybe/Disagree)
- **Expected:** Feedback saved; can move to next attendee; all prompts optional

#### TC-FB-03: Leave feedback for host
- **Purpose:** Verify host-specific prompt
- **Steps:** Rate the host — should include the additional "Hosting quality" prompt
- **Expected:** Five prompts shown (four standard + hosting); all saved correctly

#### TC-FB-04: Skip attendee
- **Purpose:** Verify skip functionality
- **Steps:** Skip an attendee without leaving feedback
- **Expected:** Moved to next attendee; no feedback recorded for skipped person

#### TC-FB-05: Update existing feedback
- **Purpose:** Verify re-selection
- **Steps:** Submit feedback, then return and change a response
- **Expected:** Updated feedback saved; buttons re-selectable

#### TC-FB-06: Report attendance issue
- **Purpose:** Verify attendance issue reporting
- **Steps:** Report an attendee as no-show / late cancel / very late
- **Expected:** Issue recorded; reliability penalty applied per trust model (host report = 1.0 confidence, non-host = 0.75)
- **Verify:** No-show has strongest penalty; cannot self-report

#### TC-FB-07: Report a concern
- **Purpose:** Verify conduct/safety reporting
- **Steps:** Submit a concern report with structured reason + details
- **Expected:** Report recorded; admin notification email sent to contact@newchums.com; report appears in admin Safety tab

#### TC-FB-08: Dispute an attendance issue
- **Purpose:** Verify dispute flow
- **Preconditions:** User has an attendance issue reported against them
- **Steps:** User disputes the issue
- **Expected:** Issue status changes to "disputed"; confidence reduced to 0.5; admin can review

#### TC-FB-09: Feedback email trigger
- **Purpose:** Verify post-plan feedback email
- **Preconditions:** Plan ended 3+ hours ago; feedback email not yet sent
- **Steps:** Wait for cron (or trigger manually)
- **Expected:** Feedback reminder email sent to all going attendees + host
- **Verify:** Email links back to plan; respects `feedback_requests` notification preference

---

### 3.11 Connections (Chums)

#### TC-CHUM-01: Add on-platform chum
- **Purpose:** Verify adding an existing user
- **Steps:** Search for a user, click add
- **Expected:** User added to chum list; one-way (no notification to the other user)

#### TC-CHUM-02: Add private contact
- **Purpose:** Verify off-platform contact
- **Steps:** Use "Add a private contact" with name + email
- **Expected:** Contact added; search dropdown clears after submission

#### TC-CHUM-03: Private contact auto-promotion
- **Purpose:** Verify auto-linking when contact creates account
- **Steps:** Add private contact with email; that person creates a NewChums account with that email
- **Expected:** Private contact auto-promoted to "On NewChums" type

#### TC-CHUM-04: Send chum invite
- **Purpose:** Verify invite email
- **Steps:** Invite someone by email who isn't on NewChums
- **Expected:** Invite email sent; rate limit of 10/24h enforced
- **Verify:** Invite link works; accepting creates chum connection

#### TC-CHUM-05: Remove chum connection
- **Purpose:** Verify removal
- **Steps:** Click "Remove Chum Connection" on a chum's public profile
- **Expected:** Connection removed; chum removed from list

#### TC-CHUM-06: Add note to chum
- **Purpose:** Verify private notes
- **Steps:** Add/edit a private note on a contact
- **Expected:** Note saved and visible only to the note author

#### TC-CHUM-07: Search chums
- **Purpose:** Verify chum search
- **Steps:** Use the search/filter on Your Chums page
- **Expected:** Results filtered by name/username; On NewChums and Private contacts both searchable

#### TC-CHUM-08: Chum list privacy
- **Purpose:** Verify privacy settings
- **Preconditions:** User has "hide connections on your public profile" enabled
- **Steps:** View that user's public profile
- **Expected:** Chum list not visible

---

### 3.12 Communities

#### TC-COM-01: Create public community (open join)
- **Purpose:** Verify community creation
- **Steps:** Navigate to `/communities/create`; fill name, slug, description; set public + open join
- **Expected:** Community created; creator is owner; appears in communities list; slug URL works

#### TC-COM-02: Create private community (approval required)
- **Purpose:** Verify private community
- **Steps:** Create community with private visibility + approval required
- **Expected:** Community not visible in public browse; only accessible to members and super admins

#### TC-COM-03: Slug availability check
- **Purpose:** Verify slug uniqueness
- **Steps:** Try creating community with an existing slug
- **Expected:** Slug marked unavailable; submission blocked

#### TC-COM-04: Join open community
- **Purpose:** Verify instant join
- **Steps:** As R1, join an open public community
- **Expected:** Immediately added as member; can see plans and members

#### TC-COM-05: Request to join (approval required)
- **Purpose:** Verify join request flow
- **Steps:**
  1. R1 requests to join a community requiring approval
  2. Owner receives email notification
  3. Owner approves the request
- **Expected:** R1 receives approval email; R1 is now a member
- **Verify:** Also test decline — R1 receives decline email; R1 still cannot access

#### TC-COM-06: Withdraw join request
- **Purpose:** Verify request withdrawal
- **Steps:** Submit request, then withdraw before owner decides
- **Expected:** Request removed; owner no longer sees it

#### TC-COM-07: Leave community
- **Purpose:** Verify leaving
- **Steps:** As member, leave the community
- **Expected:** Membership removed; no longer appears in "Yours" tab

#### TC-COM-08: Owner removes member
- **Purpose:** Verify member removal
- **Steps:** As owner, remove a member
- **Expected:** Member removed from community; loses access to community content

#### TC-COM-09: Edit community
- **Purpose:** Verify edit page
- **Steps:** As owner, navigate to `/communities/[slug]/edit`; change name, description, visibility, join mode
- **Expected:** Changes saved; reflected on community page

#### TC-COM-10: Delete community
- **Purpose:** Verify community deletion
- **Steps:** As owner, delete the community
- **Expected:** Community removed; members lose access; linked plans' community_id set to null

#### TC-COM-11: Community plan feed
- **Purpose:** Verify community-specific plan list
- **Steps:** View a community page
- **Expected:** Only plans linked to this community shown; future published plans only

#### TC-COM-12: Create plan from community
- **Purpose:** Verify plan creation with community context
- **Steps:** Click "Create a plan" from within a community page
- **Expected:** Create form pre-filled with community; `hide_from_explore` toggle available

#### TC-COM-13: Community sharing
- **Purpose:** Verify share link
- **Steps:** As owner, copy community share link
- **Expected:** Link contains share_token for private communities; URL navigates correctly

#### TC-COM-14: Private community — non-member access
- **Purpose:** Verify access restriction
- **Steps:** As non-member, try to access a private community page
- **Expected:** Restricted view with minimal info; cannot see plans or members; join request option available if applicable

#### TC-COM-15: Community in Explore
- **Purpose:** Verify hide_from_explore behavior
- **Steps:** Create a community plan with `hide_from_explore` on
- **Expected:** Plan does not appear in general Explore; still appears in community feed

#### TC-COM-16: Browse communities
- **Purpose:** Verify communities list page
- **Steps:** Navigate to `/communities`; toggle between "All" and "Yours"; search
- **Expected:** Public communities visible to all; private communities hidden from non-members; search works

---

### 3.13 Explore & Discovery

#### TC-EXP-01: Logged-in Explore — personalized feed
- **Purpose:** Verify personalized plan discovery
- **Steps:** Navigate to `/` while logged in
- **Expected:** Shows plans matching user's hobbies; sort options work; no flicker/double-load
- **Verify:** Plans with `hide_from_explore` do not appear; canceled plans do not appear

#### TC-EXP-02: Logged-in Explore — filters and sort
- **Purpose:** Verify filter/sort controls
- **Steps:** Change sort order; filter by hobby; use localStorage state persistence
- **Expected:** Results update correctly; state persists across navigation and page loads

#### TC-EXP-03: Logged-out Explore — public feed
- **Purpose:** Verify public Explore for visitors
- **Steps:** Visit `/` in incognito
- **Expected:** Public plans visible with safe information; signup/login CTAs present; clicking a plan shows public preview
- **Verify:** No chums-only or invite-only plans visible; no sensitive data exposed

#### TC-EXP-04: Explore — chum preference filtering
- **Purpose:** Verify preference-based filtering
- **Preconditions:** User has chum preferences set
- **Steps:** Browse Explore
- **Expected:** Plans filtered based on host's metric scores vs user's thresholds; compatibility notes shown where applicable

#### TC-EXP-05: Explore — plan-level overrides
- **Purpose:** Verify plan overrides affect Explore visibility
- **Steps:** Host creates plan with all chum preferences disabled; user with strict preferences browses
- **Expected:** Plan visible despite host's low scores (overrides active)

#### TC-EXP-06: Explore — no flicker
- **Purpose:** Verify clean loading
- **Steps:** Navigate to Explore tab
- **Expected:** Plans load once without disappearing and reloading

---

### 3.14 Public Profile

#### TC-PUB-01: View public profile — logged in
- **Purpose:** Verify full profile for authenticated viewers
- **Steps:** Navigate to `/u/[handle]` while logged in
- **Expected:** Shows display name, username, avatar, bio, age (if not hidden), gender, hobbies, stats (activity + reliability), chum add/remove button

#### TC-PUB-02: View public profile — logged out
- **Purpose:** Verify privacy-protective view
- **Steps:** Navigate to `/u/[handle]` in incognito
- **Expected:** Shows username only (NOT display name/real name); NO age; NO reliability stats; activity stats visible; CTA to sign in/sign up to view full profiles

#### TC-PUB-03: Profile privacy — hidden from search
- **Purpose:** Verify search hiding
- **Preconditions:** User has "hide from search/discovery" enabled
- **Steps:** Search for that user via chum search
- **Expected:** User does not appear in search results

#### TC-PUB-04: Profile privacy — hidden from indexing
- **Purpose:** Verify robots noindex
- **Preconditions:** User has "hide from search engines" enabled
- **Steps:** Check profile page meta tags
- **Expected:** `robots: noindex` meta tag present

#### TC-PUB-05: Profile — "Remove Chum Connection" button
- **Purpose:** Verify remove button text and behavior
- **Steps:** View a chum's public profile
- **Expected:** Button says "Remove Chum Connection" (not just "Remove")

#### TC-PUB-06: Attendance record on public profile
- **Purpose:** Verify stats display
- **Steps:** View public profile of user with plan history
- **Expected:** Logged-in: shows full stats including follow-through rate, confirmation rate, hosted/attended counts; Logged-out: activity only, no reliability

---

### 3.15 Settings

#### TC-SET-01: Change email
- **Purpose:** Verify email change flow
- **Steps:**
  1. Navigate to `/settings`
  2. Request email change
  3. Check new email for confirmation
  4. Confirm change
- **Expected:** Confirmation email to new address; notification to old address; email updated after confirmation; rate limit of 3/hour enforced
- **Verify:** Success email sent after change

#### TC-SET-02: Change password
- **Purpose:** Verify password change
- **Steps:** Enter current password + new password
- **Expected:** Password updated; old password no longer works; session maintained

#### TC-SET-03: Change password — OAuth user
- **Purpose:** Verify OAuth users see appropriate UI
- **Steps:** Navigate to settings as Google OAuth user
- **Expected:** Password change section shows note about OAuth; no password change form (or appropriate alternative)

#### TC-SET-04: Notification preferences — all toggles
- **Purpose:** Verify each notification toggle works
- **Steps:** Toggle each of the 15 notification preferences on/off
- **Expected:** Each toggle persists; affects corresponding email delivery
- **Verify toggling OFF suppresses:** event_match (digest), event_invite, join_request_received, join_request_accepted, join_request_declined, host_join, host_maybe, host_leave, feedback_requests, event_changed_canceled, attendee_removed, product_announcements, unread_chat_digest, attendance_confirmation, roadmap_updates

#### TC-SET-05: Notification preference — verify suppression
- **Purpose:** Verify a specific toggle actually suppresses email
- **Steps:** Turn off `host_join`; have someone RSVP to host's plan
- **Expected:** Host does NOT receive join email

#### TC-SET-06: Privacy settings
- **Purpose:** Verify all privacy toggles
- **Steps:** Toggle each privacy setting: hide from search, hide from search engines, hide age, hide chum list, hide from others' chum lists
- **Expected:** Each persists; affects public profile and search behavior as documented

#### TC-SET-07: Tips & guidance toggle
- **Purpose:** Verify tutorial nudge opt-out
- **Steps:** Toggle "Tips & guidance" off
- **Expected:** Objective nudges no longer appear; setting persists

#### TC-SET-08: Delete account
- **Purpose:** Verify account deletion
- **Steps:** Click delete account; confirm
- **Expected:** Account and all associated data deleted; session cleared; redirected to login/landing
- **Verify:** Profile no longer accessible; plans hosted by user handled appropriately

#### TC-SET-09: Unsubscribe via email link
- **Purpose:** Verify one-click email unsubscribe
- **Steps:** Click unsubscribe link in any notification email
- **Expected:** Navigates to `/unsubscribe`; specific notification preference disabled; confirmation shown

---

### 3.16 Objectives & Nudges

#### TC-OBJ-01: Fresh user sees first objective
- **Purpose:** Verify nudge appears
- **Preconditions:** New account, no objectives completed
- **Steps:** Log in, navigate through app
- **Expected:** NextStepNudge component visible with first objective (e.g., "Set your username")

#### TC-OBJ-02: Objective progression
- **Purpose:** Verify completing objectives advances the nudge
- **Steps:** Complete the current objective (e.g., write a bio), refresh
- **Expected:** Next objective appears; completed one no longer shown

#### TC-OBJ-03: Session-level dismissal
- **Purpose:** Verify dismiss hides nudge for session
- **Steps:** Dismiss the nudge
- **Expected:** Nudge hidden for rest of session; reappears on new session (new tab/login)

#### TC-OBJ-04: Permanent opt-out
- **Purpose:** Verify tutorial_nudges_off
- **Steps:** Toggle off tips & guidance in settings
- **Expected:** Nudges permanently hidden; `tutorial_nudges_off` set in DB

#### TC-OBJ-05: Admin — objectives KPI
- **Purpose:** Verify admin can see objective funnel
- **Steps:** As admin, check KPIs page
- **Expected:** Objectives section shows completion rates for each objective; shows funnel data

#### TC-OBJ-06: Objective ordering
- **Purpose:** Verify correct sequence
- **Steps:** Review that objectives appear in order: profile completion → plan engagement → social features
- **Expected:** "Write a short bio" before "Upload a profile photo"; logical progression

---

### 3.17 Notifications

#### TC-NOT-01: In-app notification list
- **Purpose:** Verify notification display
- **Steps:** Trigger a notification (e.g., RSVP to someone's plan); check bell
- **Expected:** Notification appears in list; unread count on bell; clicking marks as read

#### TC-NOT-02: Notification bell — badge count
- **Purpose:** Verify unread count accuracy
- **Steps:** Generate multiple notifications; check count; mark some as read
- **Expected:** Count accurate; updates when read

#### TC-NOT-03: Mark all as read
- **Purpose:** Verify bulk read
- **Steps:** Click "mark all as read" (if available)
- **Expected:** All notifications marked read; badge clears

---

### 3.18 Email Flows (Comprehensive)

#### TC-EMAIL-01: Verification email
- **Trigger:** Credentials signup or re-request
- **Verify:** Email received; link works; token single-use; expired token handled

#### TC-EMAIL-02: Password reset email
- **Trigger:** Forgot password request
- **Verify:** Email received; reset link works; token expiry

#### TC-EMAIL-03: Email change emails
- **Trigger:** Email change request
- **Verify:** Confirmation to new email; notification to old email; success email after confirm

#### TC-EMAIL-04: Chum invite email
- **Trigger:** Send chum invite
- **Verify:** Email received by invitee; accept link works; creates chum connection

#### TC-EMAIL-05: Plan invite email
- **Trigger:** Invite user to plan
- **Verify:** Email received; link opens plan with invite access; can RSVP

#### TC-EMAIL-06: Host RSVP emails (join/maybe/leave)
- **Trigger:** Attendee RSVPs to plan
- **Verify:** Host receives appropriate email; respects notification preferences

#### TC-EMAIL-07: Plan changed email
- **Trigger:** Host edits plan (material change), locks plan, or cancels
- **Verify:** Going/maybe attendees receive email; respects preferences

#### TC-EMAIL-08: Attendee removed email
- **Trigger:** Host removes attendee
- **Verify:** Removed user receives email

#### TC-EMAIL-09: Join request emails (to host, approved, declined)
- **Trigger:** Join request submitted, approved, or declined
- **Verify:** Correct recipient receives each email

#### TC-EMAIL-10: Guest verify code email
- **Trigger:** Guest RSVP verification
- **Verify:** Code received; correct; time-limited

#### TC-EMAIL-11: Confirmation request email (attendance assurance)
- **Trigger:** Cron — plan with reconfirmation enabled, window opens
- **Verify:** Email received; confirm/decline links work; reminders sent at intervals

#### TC-EMAIL-12: Plan at risk / auto-cancelled emails
- **Trigger:** Cron — cutoff reached, below min confirmed
- **Verify:** Host receives at-risk or auto-cancel email per fallback policy

#### TC-EMAIL-13: Unread chat digest email
- **Trigger:** Cron — user has unread chat messages
- **Verify:** Digest received; respects preference; not sent more than once per ~23h

#### TC-EMAIL-14: Event match digest email
- **Trigger:** Cron — new plans matching user's hobbies/radius
- **Verify:** Digest received; plans shown are relevant; respects preferences and chum preference filtering

#### TC-EMAIL-15: Plan feedback email
- **Trigger:** Cron — plan ended 3+ hours ago
- **Verify:** Email received by attendees; link opens plan; respects `feedback_requests` pref

#### TC-EMAIL-16: Concern report alert
- **Trigger:** User submits concern report
- **Verify:** Email sent to contact@newchums.com with report details

#### TC-EMAIL-17: Community join request / approved / declined emails
- **Trigger:** Community join request flow
- **Verify:** Owner receives request email; requester receives approved/declined email

#### TC-EMAIL-18: Plan removed by admin email
- **Trigger:** Admin removes a plan
- **Verify:** Host receives removal notification email

#### TC-EMAIL-19: Roadmap update email
- **Trigger:** Admin changes roadmap item status
- **Verify:** Followers receive update email; respects `roadmap_updates` pref

#### TC-EMAIL-20: Contact form email
- **Trigger:** Contact form submission
- **Verify:** Email received at contact@newchums.com; Turnstile verified for logged-out; honeypot blocks bots

---

### 3.19 Admin — Super Admin Tools

#### TC-ADM-01: Admin access control
- **Purpose:** Verify non-admins cannot access admin routes
- **Steps:** As regular user, navigate to `/admin/kpis`, `/admin/chums`, etc.
- **Expected:** 404 (notFound) — no "forbidden" message, just not found

#### TC-ADM-02: Admin — Users list
- **Purpose:** Verify user management
- **Steps:** Navigate to `/admin/chums`; search users
- **Expected:** All users listed with search; can click through to diagnostics

#### TC-ADM-03: Admin — Suspend user
- **Purpose:** Verify user suspension
- **Steps:** Suspend a user
- **Expected:** User marked suspended; suspended user gets `AccountSuspended` error on login; session invalidated

#### TC-ADM-04: Admin — Unsuspend user
- **Purpose:** Verify unsuspension
- **Steps:** Unsuspend a previously suspended user
- **Expected:** User can log in again

#### TC-ADM-05: Admin — User diagnostics
- **Purpose:** Verify diagnostics view
- **Steps:** Navigate to user diagnostics page
- **Expected:** Shows: hidden metric scores, chum preferences, attendance issue history, conduct summary, feedback timeline (with reporter identity), plan stats, objectives state

#### TC-ADM-06: Admin — Edit metric scores
- **Purpose:** Verify manual score adjustment
- **Steps:** Edit a user's hidden metric score in diagnostics
- **Expected:** Score updated; reflected in matching behavior

#### TC-ADM-07: Admin — Moderate attendance issue
- **Purpose:** Verify dismiss/confirm
- **Steps:** Dismiss or confirm an attendance issue
- **Expected:** Status updated; confidence and penalty recalculated

#### TC-ADM-08: Admin — Safety / concern reports
- **Purpose:** Verify concern report management
- **Steps:** Navigate to `/admin/safety`; view reports; change status (new → reviewed → closed)
- **Expected:** Reports listed; status updates persist; filter by status works

#### TC-ADM-09: Admin — Interests management
- **Purpose:** Verify interest CRUD
- **Steps:** Edit an interest name; soft-delete an interest; restore; merge two interests
- **Expected:** All operations succeed; merged interests redirect properly

#### TC-ADM-10: Admin — Plans management
- **Purpose:** Verify plan moderation
- **Steps:** View plan list; remove a plan
- **Expected:** Plan removed; host receives removal email

#### TC-ADM-11: Admin — Communities management
- **Purpose:** Verify community moderation
- **Steps:** View community list; access private community; remove a community
- **Expected:** All communities visible regardless of privacy; removal works

#### TC-ADM-12: Admin — KPIs
- **Purpose:** Verify analytics dashboard
- **Steps:** Navigate to `/admin/kpis`; change time range
- **Expected:** Growth charts, participation metrics, activity metrics, objectives funnel displayed

#### TC-ADM-13: Admin — Roadmap management
- **Purpose:** Verify roadmap moderation
- **Steps:** Change item status; merge items; edit; remove/restore; delete comments
- **Expected:** All operations succeed; affected users notified where applicable

#### TC-ADM-14: Admin — System Logic page
- **Purpose:** Verify documentation accuracy
- **Steps:** Review each section against actual system behavior
- **Expected:** All descriptions match current implementation

#### TC-ADM-15: Admin — Badge counts
- **Purpose:** Verify admin notification badges
- **Steps:** Create new data (users, interests, reports); check admin nav badges
- **Expected:** Badge counts update to reflect new/unviewed items

---

### 3.20 Roadmap (Public)

#### TC-ROAD-01: Browse roadmap — logged out
- **Purpose:** Verify public access
- **Steps:** Navigate to `/roadmap` in incognito
- **Expected:** Roadmap items visible; cannot vote/comment

#### TC-ROAD-02: Browse roadmap — logged in
- **Purpose:** Verify authenticated features
- **Steps:** Navigate to `/roadmap` while logged in
- **Expected:** Can vote, follow, comment on items

#### TC-ROAD-03: Submit roadmap item
- **Purpose:** Verify item creation
- **Steps:** Submit a new feature request / bug / feedback
- **Expected:** Item created; appears in list

#### TC-ROAD-04: Vote on item
- **Purpose:** Verify voting
- **Steps:** Vote; toggle vote off
- **Expected:** Vote count updates; toggle works

#### TC-ROAD-05: Follow item
- **Purpose:** Verify following
- **Steps:** Follow an item
- **Expected:** Receive email when status changes (if `roadmap_updates` pref on)

#### TC-ROAD-06: Comment on item
- **Purpose:** Verify commenting
- **Steps:** Add a comment
- **Expected:** Comment appears on item detail

---

### 3.21 Public / Marketing Pages

#### TC-PUB-PAGE-01: Landing page (logged out)
- **Purpose:** Verify public landing
- **Steps:** Visit `/` in incognito
- **Expected:** Marketing landing page with public Explore feed; signup/login CTAs

#### TC-PUB-PAGE-02: How It Works
- **Steps:** Visit `/how-it-works`
- **Expected:** Page renders correctly; navigation works

#### TC-PUB-PAGE-03: Science of Friendship
- **Steps:** Visit `/science-of-friendship`
- **Expected:** Page renders correctly

#### TC-PUB-PAGE-04: Safety Center
- **Steps:** Visit `/safety-center`
- **Expected:** Page renders correctly

#### TC-PUB-PAGE-05: Privacy Policy
- **Steps:** Visit `/privacy`
- **Expected:** Page renders correctly

#### TC-PUB-PAGE-06: Terms of Service
- **Steps:** Visit `/terms`
- **Expected:** Page renders correctly

#### TC-PUB-PAGE-07: Contact form (logged out)
- **Purpose:** Verify Turnstile + form
- **Steps:** Fill out contact form as logged-out user
- **Expected:** Turnstile challenge appears; form submits; email sent to contact@newchums.com; rate limiting works

#### TC-PUB-PAGE-08: Contact form (logged in)
- **Purpose:** Verify authenticated contact
- **Steps:** Fill out contact form as logged-in user
- **Expected:** No Turnstile; name/email prefilled; form submits

---

### 3.22 Responsive / Mobile

#### TC-MOB-01: Navigation — mobile drawer
- **Purpose:** Verify mobile navigation
- **Steps:** View app at mobile width (< 600px)
- **Expected:** Hamburger menu / drawer opens; all nav items accessible

#### TC-MOB-02: Plan creation — mobile
- **Steps:** Create a plan on mobile width
- **Expected:** Form usable; all fields accessible; submit works

#### TC-MOB-03: Plan detail — mobile
- **Steps:** View plan detail on mobile
- **Expected:** All sections readable; chat usable; RSVP controls accessible

#### TC-MOB-04: Feedback carousel — mobile
- **Steps:** Leave feedback on mobile
- **Expected:** Carousel/stepper works; buttons large enough to tap; navigation between attendees works

#### TC-MOB-05: Profile — mobile
- **Steps:** View/edit profile on mobile
- **Expected:** All sections accessible; chum preferences toggles usable

#### TC-MOB-06: Communities — mobile
- **Steps:** Browse/create/view communities on mobile
- **Expected:** Layout adapts cleanly; all actions accessible

#### TC-MOB-07: Explore — mobile
- **Steps:** Browse Explore on mobile
- **Expected:** Cards readable; sort/filter controls accessible

---

### 3.23 Edge Cases & Destructive Actions

#### TC-EDGE-01: Concurrent RSVP at seat limit
- **Purpose:** Verify race condition handling
- **Steps:** Two users RSVP simultaneously when 1 seat remains
- **Expected:** Only one succeeds; the other gets seat limit error

#### TC-EDGE-02: Delete account with active plans
- **Purpose:** Verify cascade behavior
- **Steps:** Delete an account that hosts active plans and is attending others' plans
- **Expected:** Hosted plans cascade-deleted; RSVPs removed from others' plans; no orphan data

#### TC-EDGE-03: Cancel plan with pending join requests
- **Purpose:** Verify cleanup
- **Steps:** Cancel a plan that has pending join requests
- **Expected:** Plan canceled; join requests handled gracefully (no dangling UI)

#### TC-EDGE-04: Remove community owner
- **Purpose:** Verify ownership protection
- **Steps:** Try to remove the owner from their own community
- **Expected:** Operation blocked or ownership transferred

#### TC-EDGE-05: Suspended user's existing data
- **Purpose:** Verify suspension impact
- **Steps:** Suspend a user who has active plans, RSVPs, community memberships
- **Expected:** User cannot log in; their content remains but they cannot interact; examine what happens to their hosted plans

#### TC-EDGE-06: Email RSVP with expired token
- **Steps:** Use an expired invite_token or participation_token
- **Expected:** Graceful error; user directed to sign up or request new invite

#### TC-EDGE-07: Duplicate RSVP attempts
- **Steps:** Try to RSVP twice for the same plan
- **Expected:** Second attempt updates existing RSVP or is rejected cleanly

#### TC-EDGE-08: XSS/injection in text fields
- **Purpose:** Verify input sanitization
- **Steps:** Enter `<script>alert('xss')</script>` in plan title, bio, chat message, community description
- **Expected:** HTML escaped in display; no script execution

#### TC-EDGE-09: Very long inputs
- **Steps:** Test maximum length inputs on all text fields (names, descriptions, messages)
- **Expected:** Length limits enforced; no UI breakage

#### TC-EDGE-10: Rapid-fire actions
- **Steps:** Quickly click RSVP/submit/save buttons multiple times
- **Expected:** No duplicate submissions; UI disabled during submission

#### TC-EDGE-11: Plan with 0 attendees (host only)
- **Steps:** Create and publish a plan; no one RSVPs
- **Expected:** Plan displays correctly; attendance assurance handles correctly; feedback email still sent to host

---

### 3.24 Cron / Scheduled Jobs

#### TC-CRON-01: Attendance assurance — initial confirmation
- **Preconditions:** Plan with `require_reconfirmation`, starts in ~24h
- **Verify:** Confirmation email sent; confirm/decline links work

#### TC-CRON-02: Attendance assurance — reminders
- **Verify:** Reminder emails at ~12h and ~3h before start

#### TC-CRON-03: Attendance assurance — cutoff processing
- **Preconditions:** Cutoff reached, some attendees haven't confirmed
- **Verify:** Pending confirmations expired; fallback policy triggered (proceed/notify_host/auto_cancel)

#### TC-CRON-04: Event match digest
- **Verify:** Users receive digest with plans matching their hobbies + radius; chum preference filtering applied; plan-level overrides respected

#### TC-CRON-05: Unread chat digest
- **Verify:** Users with unread chat receive digest; respects preference; ~23h cooldown

#### TC-CRON-06: Plan feedback email
- **Verify:** Sent ~3h after plan starts; only once per plan; respects preference

---

### 3.25 Location & Maps

#### TC-LOC-01: Location autocomplete
- **Purpose:** Verify Google Places integration
- **Steps:** Use location field in profile, plan creation, community creation
- **Expected:** Autocomplete suggestions appear; selection populates lat/lng

#### TC-LOC-02: Location visibility (plan)
- **Purpose:** Verify location access by state
- **Steps:** Check location display for: public viewer (approximate only), authenticated viewer, attending viewer
- **Expected:** Public sees approximate area; attending sees exact address per `location_visibility` setting

---

## 4. Top-Priority Subset (Top 20)

If time is limited, run these first:

1. **TC-AUTH-01** — Credentials signup end-to-end
2. **TC-AUTH-04** — Google OAuth signup
3. **TC-AUTH-12** — Onboarding redirect behavior
4. **TC-PLAN-01** — Create a public plan
5. **TC-RSVP-01** — RSVP Going
6. **TC-RSVP-07** — Join request flow (approval required)
7. **TC-CHAT-01** — Chat basic messaging
8. **TC-CHAT-02** — Chat access control
9. **TC-DET-01** — Public access (logged-out plain URL)
10. **TC-DET-02** — Invite access (share_token)
11. **TC-EXP-01** — Logged-in Explore personalized feed
12. **TC-EXP-03** — Logged-out Explore public feed
13. **TC-COM-04** — Join open community
14. **TC-COM-05** — Request to join (approval required)
15. **TC-PUB-02** — Public profile (logged out privacy)
16. **TC-SET-04** — Notification preferences all toggles
17. **TC-FB-01** — Feedback UI appears after plan
18. **TC-FB-06** — Report attendance issue
19. **TC-ADM-01** — Admin access control
20. **TC-HOST-02** — Cancel plan

---

## 5. Risk / Ambiguity Notes

### High-risk areas

| Area | Risk | Why |
|------|------|-----|
| **Plan access states** | Privacy leak | Four states (public/invite/authenticated/attending) with token-based access. Mismatched frontend/backend checks could expose data to wrong access level |
| **Chat access control** | UI vs API mismatch | UI shows `chatEligible` for "maybe" RSVPs but API blocks them. Could confuse users |
| **Cron jobs** | Silent failures | Attendance assurance, digests, feedback emails all run hourly. Failures are logged but have no retry mechanism |
| **Chum preference filtering** | Over/under-filtering | Complex threshold logic could block legitimate users or fail to filter appropriately |
| **Community private access** | Share token not fully wired | `share_token` for private communities is generated but the GET endpoint doesn't consume it for non-member access |
| **Guest RSVP → account adoption** | Data migration edge cases | Guest rows need to merge cleanly when guest creates account with same email |
| **Account deletion** | Cascade completeness | Many FK relationships; ensure no orphan data or broken references post-deletion |
| **Explore flicker** | Past regression | Has been reported and attempted fixed multiple times |

### Areas with ambiguous behavior

| Area | Ambiguity |
|------|-----------|
| **`/events/create` and `/events/[id]/edit` accessible without auth** | Layout regex allows unauthenticated access to these routes. `/events/create` without auth would likely fail at API level, but the page renders |
| **Dead email imports** | `sendEventCanceledEmail` and `sendEventRsvpUpdateEmail` imported but never called — legacy or missing functionality? |
| **`sendEventReminderEmail`** | Defined but never invoked — planned feature or dead code |
| **Chat "new messages" divider** | Logic bug noted in codebase (conflicting conditions) — divider may never appear |
| **Community chat** | `chat_enabled` column exists and is settable, but no chat implementation exists yet. Users may see a toggle with no effect |

### Documentation gaps for QA

- `Development_Setup_Guide.md` does not list all active Postmark templates (missing community, feedback, concern report templates)
- No documented test accounts or seed data procedure
- Migration list in dev guide stops at 043 (current is 055)
- No documented behavior for what happens to hosted plans when account is deleted
