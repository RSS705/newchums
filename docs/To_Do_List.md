# To-Do List

Product backlog agreed with Rob, 2026-08-28, from a full-app review. Items are
worked one at a time on request; statuses updated as things ship. Effort is a
rough size (S/M/L). The app's goal frames priorities: help people make plans
that actually happen, with discovery of nearby plans and friend-making as the
side effect.

## Core loop: plans that actually happen

| # | Item | Effort | Status |
|---|------|--------|--------|
| 1 | Recurring plans / series. Hosts running weekly or monthly events (MTG cubes, book clubs) recreate plans by hand every time. A series, or one-tap "create next occurrence" from a community schedule block (which today is display-only), pre-filled from the previous plan. | M-L | Open |
| 2 | Auto-invite the previous crowd on Run it again. `?copy_from=` prefills the plan but not the people; re-inviting last time's Going list makes repeat hosting nearly free. | S | Open |
| 3 | Waitlist when a plan fills. Auto-promote on cancellation / freed seat; pairs with the attendance-check system (declined confirmation frees a seat). | M | Open |
| 4 | Host share-link guidance on invite-only plans. Real hosts paste the bare address-bar URL and recipients hit the invite-only wall (happened twice). A host-only hint strip, or keep the tokenized URL in the host's address bar. | S | Open |
| 5 | Chat message reactions, Discord style: tap an emoji chip on a message, counts aggregate, your own reaction is highlighted, silent (no notifications). | S-M | Shipped 2026-08-28 |
| 6 | Unified day-of reminder. Plans without the attendance check get no "this is tomorrow" touch at all. One reminder email for every Going attendee, with the location reveal where applicable. Optionally a Google Calendar link (a URL, not the removed .ics machinery). | M | Open |

## Discovery and friend-making

| # | Item | Effort | Status |
|---|------|--------|--------|
| 7 | Community membership should imply plan notifications. Verify what members receive on a new community plan today (suspected: nothing dedicated); if so, notify members regardless of hobby/radius. Gives online communities a working discovery loop. | S-M | Open |
| 8 | Track location + hobby completion as a KPI and nudge harder. The nearby-plans digest silently skips users missing home location or hobbies; completion rate belongs on the KPI page. | S | Open |
| 9 | Include online public plans in the nearby digest (hobby match without the distance check). Chill and Cruise reached nobody because the digest is in-person only. | S | Open |
| 10 | Post-plan "people you met" follow-through: chum suggestions with shared-plan context ("you have been to 2 plans with Priya"). | S | Open |

## Infrastructure and risk

| # | Item | Effort | Status |
|---|------|--------|--------|
| 11 | Resend free-plan ceiling (~100 emails/day) covers all transactional mail; overflow fails silently. Upgrade pre-emptively or alert on rejected sends. | S | Open |
| 12 | Web push / PWA install. Email is the only off-site channel; day-of logistics want push. Park until after the growth experiment reads out. | L | Open |
| 13 | Growth experiment debrief: read the Growth tab cohorts against the pre-registered questions (creative winner, cost per attributed signup, share-loop depth) and decide round 2. | S | Open |

## Documentation

| # | Item | Effort | Status |
|---|------|--------|--------|
| 14 | Docs accuracy audit. Known drift: an API comment references a "Community field visibility rules" section of AGENTS.md that does not exist; Technical_Specs.md (1,600+ lines) is updated piecemeal and sections untouched since the matching / .ics / share-dialog removals likely describe the old world; System_Map's cron inventory predates recent cron changes. Sweep read-only, fix, delete dead sections. | M | Open |
