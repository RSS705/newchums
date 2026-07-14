# UI Patterns

Last Updated: 2026-07-14

A living catalog of reusable UI patterns extracted from real surfaces in the
NewChums codebase. Use this as a reference when building new screens; pick a
pattern that fits and adapt it, rather than re-deriving the same shapes from
scratch each time.

This is **not** a component library. Most patterns here are layouts and
conventions, not exported components. Each entry tells you:

1. **What it is**: the recipe in one paragraph
2. **When to use it**: and when not to
3. **Where it lives**: link to the canonical implementation
4. **Key conventions**: props, tokens, gotchas worth preserving

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
- [Discovery page header](#discovery-page-header)
- [Discovery filter shell](#discovery-filter-shell)
- [Single-line meta row](#single-line-meta-row)
- [Three-zone discovery card](#three-zone-discovery-card)
- [Entity picker dialog](#entity-picker-dialog)
- [How to add a new pattern](#how-to-add-a-new-pattern)

---

## Guided card-flow pattern

**What it is.** A vertical sequence of stacked cards that walks a user through
a queue of items one at a time: progress card → hero card → content modules →
primary CTA → quieter "secondary actions" footer. Each step is its own
outlined `Paper` with generous radii (24-32px), separated by `gap` rather than
dividers. A `Fade` keyed on a `stepNonce` counter cross-fades between items so
advancing feels guided rather than form-flat.

**When to use it.**
- The user has to walk through 1..N similar items in sequence (post-plan
  feedback attendees, batch approvals, onboarding interview questions).
- You want it to feel like a focused flow, not a long form.
- One item at a time is better than showing all of them at once.

**When NOT to use it.**
- You only have one item; drop the progress card and use a single hero +
  content layout instead.
- The items have wildly different shapes per step. That's a wizard, not a
  card flow. Use a stepper or its own routes.
- You need to compare items side by side.

**Where it lives.**
No live canonical implementation right now. The original implementation
(post-plan feedback) was consolidated to a single-screen batch form in July
2026 because the per-item walk was hurting completion. The pattern remains
valid guidance for future queue-style flows (batch approvals, onboarding
interviews); check this file's git history for the reference implementation.

**Key conventions.**
- The wrapper is a `<Box>` with `display: flex; flex-direction: column;
  gap: { xs: 2, sm: 2.5 }`. **Never use Dividers between cards**, the gap is
  the separator.
- Use `<Paper variant="outlined">` with `borderRadius: 3` (modules) or `4`
  (heroes), not the default MUI 2.
- The cross-fade is one `<Fade key={stepNonce} timeout={220}>` wrapping the
  whole step body. Bump `stepNonce` on every advance/back/jump.
- Keep state outside the Fade so React preserves it across the transition.
- Always lift early-return guards (`if (loading) return null`) **below** any
  `useEffect` that depends on the current step. Rules of Hooks bites here.

---

## Participant hero card

**What it is.** A stronger-than-usual page header that makes a single person
the focal point: large avatar (60-68px) with a white ring + soft drop-shadow,
display name in 1.1875-1.3125rem bold (linked to the public profile when a
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
- You're showing a list of people; use compact rows instead.
- The screen is about an event, plan, or thing. Those get their own hero
  treatments (see EventCard, AppCard usage in event detail).

**Where it lives.**
No live canonical implementation right now: the post-plan feedback flow that
introduced this hero moved to a single-screen layout with compact per-person
header rows (July 2026). The recipe below still applies when a future screen
is genuinely about one person; check this file's git history for the
reference implementation.

**Key conventions.**
- Avatar: `width/height: { xs: 60, sm: 68 }`, `border: 3px solid #fff`,
  `boxShadow: 0 2px 10px rgba(0,0,0,0.08)`.
- Name: `Typography component={Link}` so the name itself is the affordance to
  the public profile. Color `primary.dark` when linked.
- Host chip: solid `primary.main` background, white text, height 20, fontSize
  0.6875rem. Don't use the default MUI Chip styling, too noisy.
- Person-level action lives on the right on desktop, stretches across the
  bottom on mobile (`alignSelf: { xs: "stretch", sm: "center" }`).
- The contextual reminder line uses `-webkit-line-clamp: 2` so long plan
  titles don't blow out the hero on narrow screens.
- The gradient hex values are intentional. They're the warm wash that makes
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
- The number of choices per question is small (2-4). Five is the upper bound
  before it gets cramped.

**When NOT to use it.**
- The choices are long text; use a Select or Radio list.
- Many questions in a row; group them under one `Paper` instead, or this
  becomes a scroll-fest.
- Free-text answers; use a TextField.

**Where it lives.**
Canonical implementation: [web/src/components/events/PlanFeedback.tsx:1005-1095](../web/src/components/events/PlanFeedback.tsx#L1005-L1095)
(now rendered as compact label + pill-row lines inside one card per person,
rather than one outlined Paper per question; the pill styling conventions
below are unchanged).

**Key conventions.**
- Each pill is a `Box role="button" tabIndex={0}` with explicit
  `onKeyDown` for Enter/Space. Don't use a real `<button>` because the visual
  weight has to be controlled by `Box` styling.
- **Always include a `&:focus-visible` style** with a 2px primary outline
  offset by 2; keyboard users need this and it's easy to forget.
- Selected state uses semantic color tokens that have been used elsewhere for
  the same meaning. Yes/Somewhat/No → green/amber/grey. Don't invent new
  semantic colors per surface; pick from the existing palette.
- The module border lifting on first answer is a quiet but important signal
  that the module is "done." Keep this.
- Click target is the whole pill, not just the text; `flex: 1` and centered
  contents make the touch area big and forgiving.

---

## "Submit & next" CTA semantics

**What it is.** When the user is walking a queue of items, the primary CTA
**actually saves the current item to the API** and then advances. It's not a
"buffer everything and submit at the end" pattern; each item is committed
individually. The button label adapts to the state: `Submit & next`,
`Skip & next`, `Submit & finish`, `Skip & finish`. The button never disables;
empty answers become "Skip" so the user always has a clear way forward.

**When to use it.**
- The flow has independent items where each can be saved on its own.
- The API supports per-item upserts (POST with `ON CONFLICT DO UPDATE`, or
  similar) so re-submitting is idempotent.
- Losing the user mid-flow shouldn't lose work for items they've already
  acted on.

**When NOT to use it.**
- The submission is transactional; all items must succeed together. Use a
  single end-of-flow Submit instead.
- Each item is expensive on the backend (e.g. triggers email sends). Batch
  it.

**Where it lives.**
No live canonical implementation right now: the post-plan feedback flow that
used this moved to a single batched submit (July 2026), which better fits
its "short form, one commit" shape. The recipe below still applies to future
flows where items are genuinely walked one at a time; check this file's git
history for the reference implementation.

**Key conventions.**
- Track a `submittedSet: Set<string>` of completed item IDs, hydrated from
  the initial GET so reloads pick up where the user left off.
- Skip = no API call. Don't POST an empty entries array; most APIs reject
  it and you lose nothing by skipping client-side.
- Label morphs based on `(currentHasResponse, isLast)`:
  - `(true, false)` → "Submit & next"
  - `(false, false)` → "Skip & next"
  - `(true, true)` → "Submit & finish"
  - `(false, true)` → "Skip & finish"
- The button itself never disables on the response state, only on
  `submitting`. A disabled primary CTA in the middle of a flow is a dead end.
- The Back button sits opposite. On mobile use `direction="column-reverse"`
  so the primary CTA is on top; thumb lands there first.
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
Canonical implementation: [web/src/components/events/PlanFeedback.tsx:1380-1460](../web/src/components/events/PlanFeedback.tsx#L1380-L1460)
(component definition) and the two dialog call sites around lines 1210 and 1290
of the same file.

**Key conventions.**
- **Hide the `DialogTitle` and `DialogActions` when in the success state.**
  Don't keep "Report attendance issue" hovering above a green check; the
  whole point is that the form is gone. Render only `<DialogContent sx={{ p: 0
  }}>` containing the success component, and let the component own its own
  padding.
- Badge → heading → message → button, in that order, all centered. Spacing:
  badge mb 2, heading mb 0.75, message mb 2.5.
- Manual-close only. **No auto-dismiss timers**, they feel rushed,
  especially for safety-related confirmations, and can trigger before the
  user has finished reading.
- Heading is direct ("Issue reported"), message is reassuring without being
  dramatic ("Thanks, this helps keep plans reliable for everyone.").
- The Done button is `variant="contained" color="primary"`, same primary
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
- There's only one escalation action; use a single quiet text button
  instead of building the whole section.

**Where it lives.**
No live canonical implementation right now: the post-plan feedback flow
replaced its two escalation cards with a single quiet text-link row
([web/src/components/events/PlanFeedback.tsx:1131-1190](../web/src/components/events/PlanFeedback.tsx#L1131-L1190))
when the flow collapsed to one screen (July 2026), because the two-card
section repeated on every carousel step outweighed the primary flow. The
recipe below still applies to surfaces with a heavier escalation story;
check this file's git history for the reference implementation.

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
  confirmed state (icon swaps, copy adapts) instead of disappearing; the
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
- You're showing a long static list; batch-fetch the statuses once and
  render synchronously.
- The action is the primary CTA on the screen; fetch eagerly so it's ready
  by first paint.

**Where it lives.**
Canonical implementation: [web/src/components/events/PlanFeedback.tsx:297-343](../web/src/components/events/PlanFeedback.tsx#L297-L343)
(handlers + the lazy-load effect that fetches statuses for the post-submit
follow-up panel).

**Key conventions.**
- API endpoints used: `GET /chums/check/:userId`, `POST /chums/:userId`,
  `DELETE /chums/:userId`. Same surface used by the public profile chum
  action. **Do not invent new endpoints for this**.
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
  viewer out of attendee lists, so this is enforced server-side, but if
  you're building a new surface, double-check.

---

## Discovery page header

**What it is.** The top of a discovery / directory / browse surface is an
outlined `Paper` hero card with a soft warm wash, an eyebrow row (a small
solid-`primary.main` icon orb + an uppercase letter-spaced label), a large
H1, and a body subtitle capped at a comfortable reading width. The warm wash
makes the page read as a curated thing to browse rather than a database
listing, while staying calm enough that the controls below it can be the
loudest thing on the page.

**When to use it.**
- The page is a discovery / directory / browse index (e.g. `/communities`,
  `/events` discovery, `/explore`).
- You want a warmer entry point than a plain `<h1>` block without spending
  design budget on a per-page hero.
- The page has filter controls below: the warm hero gives them something
  quieter to sit against.

**When NOT to use it.**
- Internal / admin / settings pages. Those should feel utilitarian, not
  curated.
- Pages that already have their own custom hero (a community detail banner,
  an event banner). Don't stack two heroes.
- Modal / dialog headers; this treatment is too heavy for a sub-surface.

**Where it lives.**
Canonical implementation: [web/src/app/(app)/communities/PublicCommunitiesExplore.tsx:200-266](../web/src/app/(app)/communities/PublicCommunitiesExplore.tsx#L200-L266)

**Key conventions.**
- Same warm gradient as the participant hero card:
  `linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)`. Don't recolor with
  brand tokens; the hex values are the pattern.
- Outlined `Paper`, `borderRadius: 4`, `borderColor: "primary.light"`,
  padding `{ xs: 2.5, sm: 4 }`.
- Eyebrow icon orb is `28x28`, solid `primary.main`, with a
  `primary.contrastText` icon at `fontSize: 18`. Eyebrow text is
  `0.6875rem`, weight 700, `letterSpacing: 0.12em`, uppercase, colored
  `primary.dark`.
- H1 sits below the eyebrow at `{ xs: "2rem", sm: "2.5rem" }`, weight 700,
  `letterSpacing: -0.025em`, lineHeight 1.15.
- Subtitle uses `body1`, `text.secondary`, `maxWidth: 640` so long copy
  doesn't sprawl on wide viewports.
- Depth accent: the hero `Paper` carries `position: relative; overflow:
  hidden` and an `&::after` corner radial
  (`radial-gradient(circle, rgba(230,91,19,0.07) 0%, transparent 70%)`,
  280px circle offset to the top-right, `pointerEvents: "none"`). It's a
  quiet decorative lift shared by Explore, Your Plans, and both
  Communities discovery headers; keep the alpha at 0.07, stronger tints
  start competing with the content.
- Pair with a matching warm-wash CTA card at the bottom of the page so the
  surface reads as one curated shell from top to bottom rather than a list
  with a banner pinned underneath. See `PublicCommunitiesExplore.tsx`'s
  bottom CTA for the matching footer.

---

## Discovery filter shell

**What it is.** A discovery page's search/filter row that reads as a primary
tool, not a plain input. An outlined `Paper` (radius 3) wraps a single
content column. Row 1 is a more present search field (`borderRadius: 2.5`,
`bgcolor: "background.default"`, 1rem font, generous padding) plus a clearly
labeled "Filters" `Button` (not a bare `IconButton`) that shows a small
primary-pill count badge when filters are active. Row 2 is a tray-style
expandable panel separated by a hairline `borderTop: 1px solid grey.100`
that holds the actual filter inputs.

**When to use it.**
- A discovery page has more than just a search field (location, distance,
  hobby/tag, sort, etc.).
- You want the filter affordance discoverable but collapsed by default so
  the page hierarchy stays calm.
- The active-filter state matters; people often forget filters are set when
  the panel is collapsed.

**When NOT to use it.**
- Search-only pages; a plain TextField is fine.
- Forms with required fields shown inline. Those aren't optional discovery
  controls.
- Filter UIs that are persistent (always visible). The point of this
  pattern is the open/closed tray.

**Where it lives.**
Canonical implementation: [web/src/app/(app)/communities/PublicCommunitiesExplore.tsx:268-454](../web/src/app/(app)/communities/PublicCommunitiesExplore.tsx#L268-L454)

**Key conventions.**
- Search field is **medium height**, not `size="small"`. The whole point of
  the pattern is presence.
- The Filters control is a **labeled `Button`** with a `TuneRoundedIcon`
  startIcon, not an `IconButton`. Bare icon buttons read as utility chrome
  and undersell the affordance.
- Active state: when `activeFilterCount > 0` OR the panel is open, the
  button gets a `primary.main` border + `primary.main` text. When the panel
  is open it also gets a `primary.light` background fill so the open vs.
  closed states are unambiguous.
- Active-count pill: `minWidth: 18`, `height: 18`, `borderRadius: 999px`,
  `bgcolor: primary.main`, `primary.contrastText`, weight 700, `0.6875rem`.
  Sits inline next to the "Filters" label.
- Active-count math counts every filter that changes the result set
  (location, distance, hobby, etc.). Don't count the search field itself
  since it's always visible on row 1.
- The expandable panel uses `id` + the toggle button uses `aria-expanded` +
  `aria-controls`. Don't skip this; it's the only screen-reader cue that
  the button toggles a tray.
- Tray separator is `borderTop: 1px solid grey.100` with `pt: 1.75`. No
  bottom border or background tint inside the tray; the surrounding
  outlined `Paper` is the visual container.

---

## Single-line meta row

**What it is.** A row of small meta items at the bottom of a card (member
count, location, distance, last-updated, etc.) that stays on one line at
every breakpoint, even when one of the items is variable-length. Outer
`Stack` is `flexWrap: "nowrap"` + `minWidth: 0` + `overflow: "hidden"`;
every fixed-width sub-stack is `flexShrink: 0`; the one variable item gets
`flex: 1` + `minWidth: 0` with a `noWrap` Typography inside that ellipses
gracefully when the text would otherwise wrap the row.

**When to use it.**
- A card's meta footer has 2-4 items and one of them can be long (a full
  street address, a long event title, a user handle).
- You want predictable card heights in a grid; cards can't randomly wrap to
  two-row footers depending on data.

**When NOT to use it.**
- The meta row is genuinely long (5+ items). Wrap it deliberately, or move
  some pieces to a second row instead of forcing one line.
- The variable item is critical and shouldn't ever be truncated. Move it
  out of the meta row entirely (e.g. its own line above the row).

**Where it lives.**
Canonical implementation: [web/src/app/(app)/communities/CommunityListCard.tsx:211-265](../web/src/app/(app)/communities/CommunityListCard.tsx#L211-L265)

**Key conventions.**
- Outer Stack: `direction="row"`, `useFlexGap`, `flexWrap: "nowrap"`,
  `minWidth: 0`, `overflow: "hidden"`. All four matter; missing any one
  defeats the constraint.
- Each fixed-width sub-stack: `sx={{ flexShrink: 0 }}`. Always set this,
  even on items you "know" are short. A future content change (longer
  copy, an extra item) breaks the layout silently otherwise.
- The flexible item: parent stack is `flex: 1`, `minWidth: 0`,
  `overflow: "hidden"`; the Typography inside gets `noWrap` (which sets
  whiteSpace, overflow, and textOverflow correctly in one shot).
- Dot separators (`·`) inside fixed sub-stacks should also be
  `flexShrink: 0` so they're never the first thing to disappear.
- Trailing fixed items (chips, distance pills, status chips) keep
  `flexShrink: 0` and stay pinned to the right of the truncated text. They
  should never compete with the variable item for shrink space.

---

## Three-zone discovery card

**What it is.** A card for a discovery feed/grid where each item gets three
vertically banded zones. The **header** (logo + title + tags) sits on a
plain white surface and is separated from the body by a hairline divider.
The **body** (description excerpt with a 3-line clamp) flexes to absorb
height differences across the row. The **footer** (single-line meta row) sits
on a `grey.50` wash with its own top divider so it reads as a footer band,
not trailing body text. A 1px `grey.200` resting border + a soft two-layer
resting shadow give each card a crisp edge against the page background; on
hover the card lifts (`translateY(-2px)`), the shadow swaps to a
warm-tinted lift, and the border shifts to `primary.light`.

**When to use it.**
- A grid of browseable items where each has clear identity (logo, name,
  tags) plus supplementary metadata.
- Cards need to share rows and visually align (use `height: 100%` on the
  card so equal-height rows actually equalize).
- You want the resting state calm (so a grid of many cards isn't
  overstimulating) and the hover state warm (so the affordance is obvious).

**When NOT to use it.**
- Single-column lists where description should sit inline with metadata.
  Use a flatter list-style card instead.
- Cards with no description; the body zone collapses awkwardly. Drop to a
  two-zone variant or use a simpler card shape.
- Surfaces where the card needs custom internal layout (split panes, side
  imagery, etc.). The three-zone shape is opinionated.

**Where it lives.**
Canonical implementation: [web/src/app/(app)/communities/CommunityListCard.tsx:266-345](../web/src/app/(app)/communities/CommunityListCard.tsx#L266-L345)

**Key conventions.**
- Card-level: `height: 100%`, `display: flex`, `flexDirection: column`,
  `overflow: hidden` so each zone's background extends to the rounded
  corners.
- Override `& > .MuiCardContent-root` to `p: 0` so each zone owns its own
  padding rather than inheriting CardContent's defaults.
- Resting border: `1px solid grey.200`. Resting shadow: two layers,
  `0 1px 2px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.05)`. Single-layer
  shadows look flat; two layers feel material.
- Hover state: `boxShadow: "0 10px 28px rgba(234, 88, 12, 0.10), 0 4px 10px
  rgba(0, 0, 0, 0.04)"`, `borderColor: "primary.light"`,
  `transform: "translateY(-2px)"`. The primary-tinted lift is the moment
  of warmth; resting state stays calm so a grid of many cards isn't
  overstimulating.
- Header zone: `borderBottom: 1px solid divider`, padding
  `{ xs: 2-2.25, sm: 2.5 }`. No background tint; character comes from the
  avatar treatment + the card's resting shadow, not from a repeated
  background wash on every card.
- Body zone: `flex: 1` so taller siblings in the same row pull this card's
  body to match. Description gets a 3-line clamp via `-webkit-line-clamp`.
- Footer zone: `bgcolor: grey.50`, `borderTop: 1px solid divider`,
  `py: 1.5`. The grey wash is what marks it as a footer rather than
  trailing body content. Use the [Single-line meta row](#single-line-meta-row)
  pattern for the contents.

---

## Entity picker dialog

**What it is.** A dialog for choosing one existing entity to act on (a plan,
a community, a chum) from the viewer's own items. `AppDialog` shell with a
two-line title (bold heading + one-sentence body-2 explainer), lazily fetched
content on first open, and a scrollable list of full-width `ButtonBase` rows:
64x44 rounded thumbnail (image with deterministic gradient fallback), bold
single-line primary text with optional status `Chip`s, and a one-line
`text.secondary` meta row. Selecting a row IS the action; there is no
confirm step and no `DialogActions`. A search field appears only once the
list is long enough to need it (7+ items).

**When to use it.**
- The user needs to pick one of *their own* existing things to seed or link
  something new (e.g. "Copy a previous plan" on the Start a plan form).
- The list is modest (up to ~100 rows) and fetchable in one or two requests.
- Selection is safe/reversible, so a single tap can commit it.

**When NOT to use it.**
- Choosing multiple items, use a multi-select Autocomplete inline in the
  form instead (see `CommunityLinkSection`).
- The choice is destructive or hard to undo, use a confirm dialog after the
  pick.
- The list needs server-side search or pagination at real scale; this
  pattern filters client-side only.

**Where it lives.**
Canonical implementation: [web/src/components/events/CopyPlanDialog.tsx](../web/src/components/events/CopyPlanDialog.tsx)
(consumed by `CreateEventClient`'s "Copy a previous plan" header action).

**Key conventions.**
- Fetch lazily on first open (`status: "idle" | "loading" | "loaded" |
  "error"` state machine), keep results for the dialog's lifetime, and give
  Retry a one-click path back to `idle`.
- Loading state is 3-4 skeleton rows shaped like the real rows, not a
  centered spinner, so the dialog doesn't jump when content lands.
- Rows are `ButtonBase` with `borderRadius: 2`, `px: 1`, `py: 0.875`,
  `action.hover` on hover and on `Mui-focusVisible`; thumbnail
  64x44 `borderRadius: 1.5` with `getGradientForEventId`-style fallback
  behind the image.
- Section labels are the 0.6875rem uppercase `text.disabled` eyebrow style;
  omit a section entirely when empty rather than showing a dead header.
- Empty state follows the app's encouraging tone with a 56px `primary.light`
  icon orb, bold one-liner, and a short body-2 explainer.
- Keep the dialog dumb: it fires `onSelect(id)` and the parent owns closing,
  loading treatment, and whatever the selection actually does.
- Mobile: `PaperProps` margins `m: { xs: 2, sm: 3 }` and `maxHeight:
  calc(100dvh - 32px)` per the app's dialog convention; rows are 60px+ touch
  targets.

---

## How to add a new pattern

This doc only stays useful if it grows with the system. Add a pattern here
when:

1. You've shipped a UI shape that you (or another agent) will probably want
   to reuse.
2. The shape isn't already a standalone component in `@/components/ui`.
   That's its own surface and doesn't need a doc entry.
3. There are conventions or gotchas a future reader would have to re-derive
   from the code.

### Format

Each entry should have these sections, in order:

```markdown
## Pattern name

**What it is.** One-paragraph recipe.

**When to use it.** Bulleted list, 2-4 cases.

**When NOT to use it.** Bulleted list, 2-4 cases. This part matters more
than you think; patterns get misused when only the "when to use" half is
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

Source line numbers will drift as the file changes. That's OK, the link
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
   line range; components are stable enough to link to the file).
3. Replace the old call sites with the new component.

The goal of this doc is **not** to grow forever. It's to capture patterns
that are too small or too contextual to deserve their own component, and to
document the conventions when they finally get promoted.
