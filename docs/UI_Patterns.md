# UI Patterns

Last Updated: 2026-04-08

A living catalog of reusable UI patterns extracted from real surfaces in the
NewChums codebase. Use this as a reference when building new screens — pick a
pattern that fits and adapt it, rather than re-deriving the same shapes from
scratch each time.

This is **not** a component library. Most patterns here are layouts and
conventions, not exported components. Each entry tells you:

1. **What it is** — the recipe in one paragraph
2. **When to use it** — and when not to
3. **Where it lives** — link to the canonical implementation
4. **Key conventions** — props, tokens, gotchas worth preserving

When in doubt, read the linked source: it's the source of truth, this doc just
points you at it.

---

## Index

- [Guided card-flow pattern](#guided-card-flow-pattern)
- [Participant hero card](#participant-hero-card)
- [Pill response modules](#pill-response-modules)
- ["Submit & next" CTA semantics](#submit--next-cta-semantics)
- [Dialog success state](#dialog-success-state)
- ["Something unusual?" footer pattern](#something-unusual-footer-pattern)
- [Lazy chum-status pattern](#lazy-chum-status-pattern)
- [How to add a new pattern](#how-to-add-a-new-pattern)

---

## Guided card-flow pattern

**What it is.** A vertical sequence of stacked cards that walks a user through
a queue of items one at a time: progress card → hero card → content modules →
primary CTA → quieter "secondary actions" footer. Each step is its own
outlined `Paper` with generous radii (24–32px), separated by `gap` rather than
dividers. A `Fade` keyed on a `stepNonce` counter cross-fades between items so
advancing feels guided rather than form-flat.

**When to use it.**
- The user has to walk through 1..N similar items in sequence (post-plan
  feedback attendees, batch approvals, onboarding interview questions).
- You want it to feel like a focused flow, not a long form.
- One item at a time is better than showing all of them at once.

**When NOT to use it.**
- You only have one item — drop the progress card and use a single hero +
  content layout instead.
- The items have wildly different shapes per step — that's a wizard, not a
  card flow. Use a stepper or its own routes.
- You need to compare items side by side.

**Where it lives.**
Canonical implementation: [web/src/components/events/PlanFeedback.tsx:494-988](../web/src/components/events/PlanFeedback.tsx#L494-L988)

**Key conventions.**
- The wrapper is a `<Box>` with `display: flex; flex-direction: column;
  gap: { xs: 2, sm: 2.5 }` — **never use Dividers between cards**, the gap is
  the separator.
- Use `<Paper variant="outlined">` with `borderRadius: 3` (modules) or `4`
  (heroes) — not the default MUI 2.
- The cross-fade is one `<Fade key={stepNonce} timeout={220}>` wrapping the
  whole step body. Bump `stepNonce` on every advance/back/jump.
- Keep state outside the Fade so React preserves it across the transition.
- Always lift early-return guards (`if (loading) return null`) **below** any
  `useEffect` that depends on the current step — Rules of Hooks bites here.

---

## Participant hero card

**What it is.** A stronger-than-usual page header that makes a single person
the focal point: large avatar (60–68px) with a white ring + soft drop-shadow,
display name in 1.1875–1.3125rem bold (linked to the public profile when a
username exists), an optional Host chip in solid primary, a small contextual
reminder line ("From your plan "X" on Mar 12"), and a person-level action
button on the right side (e.g. Save to Chums). Wrapped in an outlined `Paper`
with a soft warm gradient (`linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)`)
and a `primary.light` border.

**When to use it.**
- The screen is about reviewing, rating, or acting on one specific person.
- You want a person-level action (Save to Chums, Block, Connect) at the same
  level of prominence as the person's name.

**When NOT to use it.**
- You're showing a list of people — use compact rows instead.
- The screen is about an event, plan, or thing — those get their own hero
  treatments (see EventCard, AppCard usage in event detail).

**Where it lives.**
Canonical implementation: [web/src/components/events/PlanFeedback.tsx:579-707](../web/src/components/events/PlanFeedback.tsx#L579-L707)

**Key conventions.**
- Avatar: `width/height: { xs: 60, sm: 68 }`, `border: 3px solid #fff`,
  `boxShadow: 0 2px 10px rgba(0,0,0,0.08)`.
- Name: `Typography component={Link}` so the name itself is the affordance to
  the public profile. Color `primary.dark` when linked.
- Host chip: solid `primary.main` background, white text, height 20, fontSize
  0.6875rem. Don't use the default MUI Chip styling — too noisy.
- Person-level action lives on the right on desktop, stretches across the
  bottom on mobile (`alignSelf: { xs: "stretch", sm: "center" }`).
- The contextual reminder line uses `-webkit-line-clamp: 2` so long plan
  titles don't blow out the hero on narrow screens.
- The gradient hex values are intentional — they're the warm wash that makes
  the hero feel different from other cards on the same page. Don't replace
  with a flat `bgcolor` token; you'll lose the lift.

---

## Pill response modules

**What it is.** Each prompt or question is its own outlined `Paper` (radius 24px)
containing a question label and a row of full-width rounded **pills**
(`borderRadius: 999`) for the response options. Selected pills get a
semantic-color background (green for affirm, amber for partial, neutral for
decline), a subtle drop shadow, and weight 700. The module's border lifts to
`primary.light` once any answer is selected so completed modules visually
"settle."

**When to use it.**
- A small set of independent questions, each with a fixed set of choices.
- You want answering to feel tactile and quick rather than form-fielded.
- The number of choices per question is small (2–4). Five is the upper bound
  before it gets cramped.

**When NOT to use it.**
- The choices are long text — use a Select or Radio list.
- Many questions in a row — group them under one `Paper` instead, or this
  becomes a scroll-fest.
- Free-text answers — use a TextField.

**Where it lives.**
Canonical implementation: [web/src/components/events/PlanFeedback.tsx:709-791](../web/src/components/events/PlanFeedback.tsx#L709-L791)

**Key conventions.**
- Each pill is a `Box role="button" tabIndex={0}` with explicit
  `onKeyDown` for Enter/Space — don't use a real `<button>` because the visual
  weight has to be controlled by `Box` styling.
- **Always include a `&:focus-visible` style** with a 2px primary outline
  offset by 2 — keyboard users need this and it's easy to forget.
- Selected state uses semantic color tokens that have been used elsewhere for
  the same meaning. Yes/Somewhat/No → green/amber/grey. Don't invent new
  semantic colors per surface; pick from the existing palette.
- The module border lifting on first answer is a quiet but important signal
  that the module is "done." Keep this.
- Click target is the whole pill, not just the text — `flex: 1` and centered
  contents make the touch area big and forgiving.

---

## "Submit & next" CTA semantics

**What it is.** When the user is walking a queue of items, the primary CTA
**actually saves the current item to the API** and then advances. It's not a
"buffer everything and submit at the end" pattern — each item is committed
individually. The button label adapts to the state: `Submit & next`,
`Skip & next`, `Submit & finish`, `Skip & finish`. The button never disables —
empty answers become "Skip" so the user always has a clear way forward.

**When to use it.**
- The flow has independent items where each can be saved on its own.
- The API supports per-item upserts (POST with `ON CONFLICT DO UPDATE`, or
  similar) so re-submitting is idempotent.
- Losing the user mid-flow shouldn't lose work for items they've already
  acted on.

**When NOT to use it.**
- The submission is transactional — all items must succeed together. Use a
  single end-of-flow Submit instead.
- Each item is expensive on the backend (e.g. triggers email sends). Batch
  it.

**Where it lives.**
Canonical implementation: [web/src/components/events/PlanFeedback.tsx:221-262](../web/src/components/events/PlanFeedback.tsx#L221-L262)
(handler) and [web/src/components/events/PlanFeedback.tsx:793-848](../web/src/components/events/PlanFeedback.tsx#L793-L848) (button).

**Key conventions.**
- Track a `submittedSet: Set<string>` of completed item IDs, hydrated from
  the initial GET so reloads pick up where the user left off.
- Skip = no API call. Don't POST an empty entries array — most APIs reject
  it and you lose nothing by skipping client-side.
- Label morphs based on `(currentHasResponse, isLast)`:
  - `(true, false)` → "Submit & next"
  - `(false, false)` → "Skip & next"
  - `(true, true)` → "Submit & finish"
  - `(false, true)` → "Skip & finish"
- The button itself never disables on the response state — only on
  `submitting`. A disabled primary CTA in the middle of a flow is a dead end.
- The Back button sits opposite. On mobile use `direction="column-reverse"`
  so the primary CTA is on top — thumb lands there first.
- Bump `stepNonce` on advance so the cross-fade plays.

---

## Dialog success state

**What it is.** When a dialog reaches a terminal success state, replace the
entire title + content + actions tree with a single compact, vertically
balanced confirmation: 64px solid-`success.main` circular badge with a soft
glow shadow, bold heading, one-sentence reassurance, and a single primary
"Done" button. Manual-close only.

**When to use it.**
- A dialog has a clear "I just did the thing" state and the next user action
  is just to dismiss.
- The previous form is no longer relevant once the action succeeds.

**When NOT to use it.**
- The success state has follow-up actions (e.g. "View it" + "Share"). Use a
  normal DialogContent + DialogActions for that.
- The dialog needs to keep multiple things visible at once (e.g. submission
  receipt). Render a more structured DialogContent instead.

**Where it lives.**
Canonical implementation: [web/src/components/events/PlanFeedback.tsx:1212-1284](../web/src/components/events/PlanFeedback.tsx#L1212-L1284)
(component definition) and [web/src/components/events/PlanFeedback.tsx:998-1006](../web/src/components/events/PlanFeedback.tsx#L998-L1006)
(call site).

**Key conventions.**
- **Hide the `DialogTitle` and `DialogActions` when in the success state.**
  Don't keep "Report attendance issue" hovering above a green check — the
  whole point is that the form is gone. Render only `<DialogContent sx={{ p: 0
  }}>` containing the success component, and let the component own its own
  padding.
- Badge → heading → message → button, in that order, all centered. Spacing:
  badge mb 2, heading mb 0.75, message mb 2.5.
- Manual-close only. **No auto-dismiss timers** — they feel rushed,
  especially for safety-related confirmations, and can trigger before the
  user has finished reading.
- Heading is direct ("Issue reported"), message is reassuring without being
  dramatic ("Thanks — this helps keep plans reliable for everyone.").
- The Done button is `variant="contained" color="primary"` — same primary
  brand, not green. The badge already carries the success semantic.
- This pattern is currently a local helper inside `PlanFeedback.tsx`. **If a
  third surface needs it, lift it to `@/components/ui/DialogSuccessState`**
  rather than copy-pasting.

---

## "Something unusual?" footer pattern

**What it is.** Destructive, escalation, or moderation actions that don't
belong in the main flow live in a clearly separated bottom section, introduced
by an eyebrow divider ("SOMETHING UNUSUAL?" in 0.6875rem uppercase
`text.disabled`). Inside the section, two equal-weight cards sit side-by-side
on desktop and stack on mobile, each with an icon + title + one-line
description. Below the cards, a quiet centered "I don't want to…" text link
opens a confirm dialog for the most destructive action.

**When to use it.**
- A surface has a primary happy-path flow plus a small set of less-common
  but important escalation actions (report, dispute, dismiss, block).
- You want the escalation actions to be **discoverable but not competing**
  with the primary flow.

**When NOT to use it.**
- The escalation is a normal part of the flow (e.g. canceling an event from
  the host's own event-detail view). That goes in the main action area.
- There's only one escalation action — use a single quiet text button
  instead of building the whole section.

**Where it lives.**
Canonical implementation: [web/src/components/events/PlanFeedback.tsx:850-985](../web/src/components/events/PlanFeedback.tsx#L850-L985)

**Key conventions.**
- The eyebrow divider is `<Stack direction="row">` with two flex-grow `Box`
  rules and the label between them. It reads as a section break without
  introducing a heavy `<Divider>`.
- The two cards are equal-flex `Paper` elements, **each clickable as a
  whole** (not just the title). This makes them feel like buttons even though
  they're not.
- Different escalation types get different border colors so they don't blend
  together: warning amber for attendance/reliability concerns, neutral
  greying-to-error-on-hover for safety/conduct.
- Once an action has been taken, the matching card flips to a calm green
  confirmed state (icon swaps, copy adapts) instead of disappearing — the
  user keeps spatial continuity and can see what they've done.
- The "I don't want to…" link goes underneath the cards, centered, in
  `text.disabled`. It's the lowest-weight action on the page on purpose.

---

## Lazy chum-status pattern

**What it is.** When a screen needs to show "is this person already in the
viewer's Chums?" for one user at a time, fetch the status lazily on first
render of that user, cache the result in a `Record<string, boolean | null |
undefined>` keyed by userId, and toggle optimistically with revert-on-error.
Hide the action entirely if the check fails (network error, 401, etc.).

**When to use it.**
- A screen shows attendees / participants / search results one at a time and
  each needs an "Add to Chums" / "Saved as Chum" button.
- You don't want to batch-fetch chum statuses up front (slow first paint, or
  the list is large).

**When NOT to use it.**
- You're showing a long static list — batch-fetch the statuses once and
  render synchronously.
- The action is the primary CTA on the screen — fetch eagerly so it's ready
  by first paint.

**Where it lives.**
Canonical implementation: [web/src/components/events/PlanFeedback.tsx:169-205](../web/src/components/events/PlanFeedback.tsx#L169-L205)
(handlers) and [web/src/components/events/PlanFeedback.tsx:329-333](../web/src/components/events/PlanFeedback.tsx#L329-L333)
(lazy-load effect).

**Key conventions.**
- API endpoints used: `GET /chums/check/:userId`, `POST /chums/:userId`,
  `DELETE /chums/:userId`. Same surface used by the public profile chum
  action — **do not invent new endpoints for this**.
- Cache state shape: `Record<string, boolean | null | undefined>`.
  - `undefined` = not yet fetched / in flight
  - `null` = fetch failed; hide the action permanently for this user
  - `boolean` = current is-saved state
- Toggle does an **optimistic flip first**, then POSTs/DELETEs, and reverts
  on `!data.ok` or thrown error. The user sees instant feedback on the
  common case.
- The lazy-fetch `useEffect` MUST be placed **above** any early-return
  guards in the component, otherwise the hook order changes when the
  component first mounts vs. when data arrives. Rules of Hooks bites here.
- The button itself follows the same shape as the public-profile Chum action:
  `PersonAddRoundedIcon` for unsaved, `HowToRegRoundedIcon` for saved, with
  a `Tooltip` for the verb ("Add to your Chums" / "Remove from your Chums").
- **Never show the action when the viewer is reviewing themselves.** In
  practice the API surfaces (`/events/:id/feedback` etc.) already filter the
  viewer out of attendee lists, so this is enforced server-side — but if
  you're building a new surface, double-check.

---

## How to add a new pattern

This doc only stays useful if it grows with the system. Add a pattern here
when:

1. You've shipped a UI shape that you (or another agent) will probably want
   to reuse.
2. The shape isn't already a standalone component in `@/components/ui` —
   that's its own surface and doesn't need a doc entry.
3. There are conventions or gotchas a future reader would have to re-derive
   from the code.

### Format

Each entry should have these sections, in order:

```markdown
## Pattern name

**What it is.** One-paragraph recipe.

**When to use it.** Bulleted list, 2–4 cases.

**When NOT to use it.** Bulleted list, 2–4 cases. This part matters more
than you think — patterns get misused when only the "when to use" half is
documented.

**Where it lives.**
Canonical implementation: [path/to/file.tsx:LINE-LINE](../path/to/file.tsx#LLINE-LLINE)

**Key conventions.**
- Bullet list of the conventions worth preserving: prop shapes, token
  choices, accessibility notes, gotchas, things not to change.
```

### Linking to source

Always link to a **specific line range** in the canonical implementation, not
just the file. Use the relative path from `docs/` (i.e. start with `../`) so
the links work both in GitHub and in local previews. Example:

```markdown
[web/src/components/events/PlanFeedback.tsx:579-707](../web/src/components/events/PlanFeedback.tsx#L579-L707)
```

### When line numbers drift

Source line numbers will drift as the file changes. That's OK — the link
still lands on the right file, and the section comment in the source code
(e.g. `{/* ── 2. Participant hero card ───── */}`) helps you find the new
range. **When you make a substantial edit to a file referenced here, take
30 seconds to update the line numbers in this doc.** It's the small tax that
keeps the doc useful.

### Promoting patterns to real components

If a pattern starts being used in 3+ places, that's a strong signal it should
become a real exported component in `@/components/ui` (or
`@/components/events`, etc.). When you promote one:

1. Move the implementation into `web/src/components/ui/<name>.tsx`.
2. Update this doc entry to point at the new component file (and remove the
   line range — components are stable enough to link to the file).
3. Replace the old call sites with the new component.

The goal of this doc is **not** to grow forever. It's to capture patterns
that are too small or too contextual to deserve their own component, and to
document the conventions when they finally get promoted.
