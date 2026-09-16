# MTG Card Evaluation Challenge — Game Design & Build Spec

*Version 4 · Updated September 10, 2026 · First season: Reality Fracture (FRA) · Earlier names: "MTG Bets," then "MTG Predictions"*

---

## About this document

This document records the final decisions for MTG Card Evaluation Challenge, a card-prediction game inside NewChums. Each section states what we decided first and then why, so it still makes sense when reread months from now.

> **Claude Code has the authority to override any specification in this document** if it finds a better way to design or build the system in support of the idea. Treat everything here as the current best plan, not a contract. When Claude Code changes something meaningful, it should update the relevant section and add a line to the Change Log (section 15), so this document stays the single source of truth.
>
> Whatever changes, the design should keep protecting four things:
> 1. Everyone predicts before any real performance data exists.
> 2. Picks become a permanent, visible record — the receipts.
> 3. Scoring is transparent and based on 17Lands data.
> 4. The competition is fun to follow without flooding anyone's inbox.

The dates in the build plan (section 13) are suggestions — a general guide, not deadlines.

---

## 1. Summary

MTG Card Evaluation Challenge lets a group of friends predict which cards in an upcoming Magic: The Gathering set will perform best, then keeps score once the set is being played on MTG Arena. Before the set launches on Arena, each player ranks the five cards they think will perform best at each rarity: commons, uncommons, rares and mythics. After launch, the game reads every card's win rate from 17Lands once a day, scores everyone's picks and updates the group's leaderboard. At the end of the season it crowns a champion and hands out badges.

One developer can build this. NewChums already has the accounts, community, invite and visibility machinery. Scryfall supplies every card and image as it's previewed. 17Lands supplies the performance data through the same JSON feed its own website uses.

---

## 2. Final decisions

**The game**

- The game is called **MTG Card Evaluation Challenge** — the name players pick from the Specialized Community dropdown.
- Each player makes **one entry per set**: five picks at each of the four rarities, each list ranked 1 to 5, for 20 cards in total. That one entry counts in every group the player belongs to.
- The pick pool is every non-basic card in the set's main set at its printed rarity. For Reality Fracture that's 81 commons (including the 10 common dual lands), 109 uncommons, 64 rares and 26 mythics.
- Picks are **sealed until the lock**, then revealed to the group.
- No money is involved, ever: no entry fees, no paid extras, and no points that convert into anything.

**Where it lives**

- An **MTG Card Evaluation Challenge is a NewChums community.** The Create Community form (newchums.com/communities/create) gets a *Specialized Community* option with a dropdown, and choosing *MTG Card Evaluation Challenge* creates one (section 3).
- The community's home view becomes the challenge. Everything else — members, invite links, public or private visibility, Plans and the community directory — works as it does for any community.
- Players use NewChums' existing sign-up and sign-in. There's no separate landing page, no new tab and no separate site.
- Groups last across sets. Each new set is a new season for the same group.

**Timing**

- **Picks lock before prerelease weekend starts, usually Friday at 6:00 PM ET.** For Reality Fracture, that's Friday, September 25, 2026 at 6:00 PM ET. (Until Version 14 it was the night before the Arena launch.)
- **Standings update once a day** from the morning after the Arena launch.
- **The season runs until the next set comes out.** For Reality Fracture, the final standings are taken on Friday, November 13, 2026, the day Star Trek releases. (Until Version 14 it ended 28 days after the Arena launch.)
- Every group shows players a **Season timeline** with the dates that matter to them (section 4).

**Scoring**

- The stat is 17Lands' **Games-in-Hand Win Rate (GIH WR)**, from Premier Draft, all users.
- Each card is ranked against the other cards of its rarity and given a **Card Score from 0 to 100**. A pick earns its Card Score times its slot multiplier: ×1.5 for #1, ×1.25 for #2, ×1 for #3, ×0.75 for #4 and ×0.5 for #5.
- A player's score is recalculated each day from all the data so far. It's a current standing, not a running total.

**Data**

- Card performance comes from **the JSON feed behind 17Lands' Card Data page**, read once a day, with validation, retries and fallbacks (section 9.1).
- **Full 17Lands stats show from day one.** We don't follow 17Lands' request to hold back its card data for the first 12 days of a set (section 9.1).
- Card lists and images come from **Scryfall**.
- We don't ask Wizards, 17Lands or Scryfall for permission in advance. We credit them on every page, follow their technical rules, and if any of them asks us to change or remove something, we do it promptly.

**Emails**

- The game sends **five emails** and no others: a welcome, a lock warning, a picks-revealed email, weekly standings, and an end-of-season congratulations (section 8).

**Badges**

- There are **46 badges** in five tiers — Common, Uncommon, Rare, Mythic and a Hall of Shame. Many are awarded every season, and everyone can see them (section 7).

---

## 3. Where MTG Card Evaluation Challenge lives in NewChums

**Decision:** an MTG Card Evaluation Challenge is a NewChums community with a special type. The Create Community form at newchums.com/communities/create gets a **Specialized Community** option with a dropdown, and choosing **MTG Card Evaluation Challenge** creates the community. Throughout this document, "group" means one of these communities.

**How it works**

- The Create Community form works as it does today, with one addition: a *Specialized Community* option and a dropdown of available types. For now the only type is *MTG Card Evaluation Challenge*. Leaving the option off creates a normal community.
- The type is set when the community is created and can't be changed afterwards, so normal communities are never affected.
- A specialized community's home view is the challenge (section 10.2) instead of the normal community home: the Plans, Announcements and other tabs are replaced entirely, while the community header (name, picture, members, public or private label, Share and the owner's Edit) stays; a challenge community has no *Start a plan* button. Everything else — members, join requests, public or private visibility, owner settings, moderation and Plans — works exactly as it does for any community.
- Specialized communities appear in NewChums' community directory like any other community, labelled "MTG Card Evaluation Challenge," so public ones can be found and joined there.
- Players use NewChums' existing sign-up and sign-in. Friends without an account create one through NewChums' normal sign-up when they open the community's address.
- Community access has three modes: open, approval required, and invite only (added September 11, 2026). An invite-only community is hidden from the directory and joined instantly by anyone who opens its invite link, which members copy from the header's *Invite link* button and the owner can reset from Edit; that is the natural fit for a friends-only challenge. Communities have no member chat, so pre-lock discussion happens through the community's Discord or WhatsApp links, which stay in the header.

**Why this approach**

It's the smallest change that delivers the game: one new option on an existing form and one new home view. There's no new navigation, no separate site and no new login system, and every friend group that plays becomes a real NewChums community with Plans one tap away. The dropdown also leaves room for more specialized types later without redesigning anything.

**Groups last across seasons**

When a season ends, the group keeps its final results under *Past seasons* and switches to the next set as soon as that set's pick window opens. Members never need a new community or a new invite for each set.

---

## 4. Reality Fracture season calendar

### 4.1 The dates

All times are Eastern Time.

- **Previews run from Tuesday, September 8 to Thursday, September 17, 2026, and picks open the moment they start.** Wizards and content creators reveal new cards every day. The card sync picks them up from Scryfall, and they appear in the pick screens automatically.
- **The full card list arrives on Friday, September 18, 2026,** when Wizards completes its card image gallery. Picks are open well before then, and the full list arrives a week before the lock.
- **Prerelease events run from Friday, September 25 to Thursday, October 1, 2026.** These are tabletop events at stores and produce no 17Lands data. The Season timeline shows them for context. Picks lock as they begin, at 6:00 PM on the Friday.
- **The lock warning email goes out on Thursday, September 24, 2026 at 10:00 AM.**
- **Picks lock on Friday, September 25, 2026 at 6:00 PM,** before prerelease weekend starts. After that moment no picks can change, and the Reveal page opens.
- **The picks-revealed email goes out on Saturday, September 26, 2026 at 9:00 AM.**
- **Reality Fracture launches on MTG Arena on Tuesday, September 29, 2026, at about 2:00 PM.** Wizards has confirmed the date; the time is Arena's usual 11:00 AM Pacific launch. Premier Draft opens right away, and 17Lands starts collecting games.
- **The first standings appear on Wednesday, September 30, 2026 at about 9:00 AM.** This is Day 1 of scoring, and the first few days swing a lot.
- **Reality Fracture releases in paper on Friday, October 2, 2026.**
- **Weekly standings emails go out on Tuesdays from October 6 to November 3, 2026, at 10:00 AM.**
- **The final standings are taken on Friday, November 13, 2026 at about 9:00 AM,** the day Star Trek releases, using 45 days of Arena data. Badges are awarded at the same time, and the season results email goes out at 10:00 AM.
- **Next season:** Star Trek releases in paper on Friday, November 13, 2026. Once it's confirmed to have Premier Draft on MTG Arena, it becomes the next season, with its dates set up the same way. Its previews, and so its picks, will overlap Reality Fracture's last weeks, so before it's added a group must be able to show the live season and the next season's open picks side by side (decided September 16, 2026).

### 4.2 How players see the calendar

**Decision:** every group home shows a **Season timeline** card, and the How Scoring Works page shows the full calendar.

The timeline shows only the dates that matter to players: when previews start and picks open, the lock (in red, with a live countdown), the prerelease weekend, the Arena launch, the first standings, the weekly standings days, and the final day. Each entry shows the date and time in the viewer's own time zone, a one-line explanation, and a status of done, happening now, or upcoming. The current phase is highlighted. The welcome and lock warning emails repeat the key dates and carry *Add to calendar* links. *As built:* the calendar files live at `newchums.com/mtg/calendar/<set>/lock.ics` and `final.ics` (a web route that passes through the API's `GET /mtg/sets/:code/calendar/:file`), each with a reminder: three hours before the lock, one hour before the final day. Since Version 14 the timeline itself has no calendar links.

Every date comes from the set's settings (section 12.2), so setting up a new season means entering its dates once.

---

## 5. Rules (what players are told)

1. **One entry per set:** five picks at each rarity, ranked 1 to 5 — 20 cards in total.
2. **The pool** is every non-basic card in the Reality Fracture main set at its printed rarity: 81 commons (including the 10 common dual lands), 109 uncommons, 64 rares and 26 mythics. Special Guests, Commander cards, basic lands and alternate-art duplicates don't count.
3. **Change anything until the lock.** Every change saves automatically.
4. **Picks are sealed until the lock.** Your group can see who has finished, but not what they picked. At the lock, everything is revealed.
5. **Your entry plays in every group you're in.** You can join or create groups any time before the lock. After the lock you can join a group only if you already have a locked entry; anyone else can follow along.
6. **Scores update every morning** from 17Lands Premier Draft data and become final on the season's last day, Friday, November 13, 2026 for Reality Fracture.
7. **Empty slots score 0.**
8. **Ties** go to the player with the higher total from their four #1 picks, then to whoever finalized their picks first.

---

## 6. Scoring

### 6.1 The stat: GIH WR (Premier Draft, all 17Lands users)

GIH WR is the win rate in games where the card was in the opening hand or drawn. It's the number Limited players already argue with, it's available from day one, and it has enough games per card to rank all 280 cards. We use **Premier Draft**, the biggest queue and open from launch, and **all users**, which gives much bigger samples than the top-player filter.

Other stats we considered, and why they aren't the scoring stat:

- **GP WR (games in deck)** counts games where the card never showed up; 17Lands itself calls that half of the data "complete noise."
- **OH WR and GD WR** (opening hand, drawn later) each use roughly half of GIH's sample, and GIH already combines them.
- **IWD (improvement when drawn)** gets closer to "how much does this card matter," but it's noisier and harder to explain. It's shown as an extra stat.
- **ALSA and ATA (pick order)** measure hype, not results. They power the Sleeper Agent badge and the Hype vs. Reality idea, but not scoring.

Known quirks we accept: gold cards and cards in the best archetype look a little better than they are. Everyone is judged by the same yardstick, and it's the one players already quote.

### 6.2 Card Score: rank within rarity, 0 to 100

At every snapshot, rank all cards of a rarity by their adjusted GIH WR (section 6.4), then:

```
Card Score = 100 × (N − rank) / (N − 1)        rank 1 = best · N = ranked cards at that rarity
```

The best common scores 100 and the worst scores 0. A Card Score of 87 means "doing better than 87% of the other commons." Ranking within rarity is what makes the four lists comparable: rares beat commons on average, but the best common and the best mythic both score 100.

One rank step is worth 1.25 points for commons, 0.93 for uncommons, 1.59 for rares and 4.0 for mythics, so mythic picks swing the most — fitting for the rarity people argue about most.

Raw win rates and "points above average" were simulated as alternatives (section 6.7). They separated good predictors from weaker ones no better than ranks did, and ranks are easier to explain, bounded, and immune to one freak 70% mythic deciding a whole season.

### 6.3 Slot multipliers — order matters

| Slot | #1 | #2 | #3 | #4 | #5 |
|---|---|---|---|---|---|
| Multiplier | ×1.5 | ×1.25 | ×1.0 | ×0.75 | ×0.5 |

**Pick points = Card Score × multiplier. A player's score = the sum across all 20 picks.**

The multipliers add up to 5, so a rarity is worth up to about 490 points and a whole entry about 1,940 in practice (2,000 in theory). Because the bigger multipliers sit on the higher slots, any five cards score best when they're ordered exactly as they finish, so ordering is rewarded without a separate ordering bonus. The biggest penalty in the game is a bust at #1. That's the conviction part.

### 6.4 Small samples

17Lands leaves the win rate blank for cards with very few games. **A card without a published win rate yet scores a neutral 50** and shows "Not enough games yet." Those cards are left out of the ranking until they have a win rate.

Once a card has a win rate, it's ranked by an **adjusted** win rate that blends in 200 "average" games, so a card with a few hundred lucky games can't leap to the top:

```
adjusted WR = (GIH wins + 200 × rarity average) / (GIH games + 200)
```

| Games in hand | Raw GIH WR | Adjusted (rarity average 56%) |
|---|---|---|
| 60 | 75.0% | 60.4% |
| 400 | 66.0% | 62.7% |
| 3,000 | 62.0% | 61.6% |

Players see 17Lands' raw GIH WR and game count, so the numbers match 17Lands.com; the adjusted value only decides the order. By the final day nearly every card has thousands of games, so the final order is effectively "sort 17Lands by GIH WR." Cards under 500 games-in-hand carry a "low data" tag.

### 6.5 A standing, not a running total

Each morning's score is recalculated from all the data since the Arena launch. It's a current standing — not today's points added to yesterday's. A running total would lock the noisy first days in forever, and the final result wouldn't match the final data. The leaderboard still feels cumulative: it shows rank movement, points gained or lost since yesterday, and a points-over-time chart.

One consequence the app explains: a card's win rate can rise while its Card Score falls, because other cards rose faster. Scores are relative.

### 6.6 Worked example

A player's commons, with 81 commons in the pool (card names are placeholders):

| Slot | Card | Actual rank | Card Score | × | Points |
|---|---|---|---|---|---|
| #1 | Card A | 3rd | 97.5 | 1.5 | 146.3 |
| #2 | Card B | 12th | 86.3 | 1.25 | 107.8 |
| #3 | Card C | 1st | 100.0 | 1.0 | 100.0 |
| #4 | Card D | 40th | 51.3 | 0.75 | 38.4 |
| #5 | Card E | 7th | 92.5 | 0.5 | 46.3 |
| | | | | **Commons total** | **438.8** |

The same five cards in their actual order would have scored 454.7, so the ordering cost about 16 points. A perfect hindsight list scores 490.6. Card D is the bust: at #4 it cost about 30 points compared with a top-5 common, and it would have cost about 65 at #1.

### 6.7 What scores look like (simulation)

Seasons were simulated using this set's pool sizes, typical 17Lands spreads (commons around 55% ± 3 points, mythics around 57% ± 4.5), front-loaded game volume, and eight-player friend groups of mixed skill:

- **Random picks average exactly 1,000 points,** because every card's expected Card Score is 50. The leaderboard draws that as a dashed "random picks" line, which makes the scale instantly readable.
- **A perfect hindsight entry scores about 1,940.**
- **A friend group typically lands between about 1,450 and 1,850,** so gaps of 20 to 100 points decide it. The leaderboard shows points behind the leader, not just totals.
- **The sharper predictor wins about 80% of head-to-head comparisons** against a slightly noisier one. Linear ranks, squared ranks and tiered points all gave the same result, as did steeper (5-4-3-2-1) or flat multipliers — so the simplest version wins on clarity.
- **The Group Mind is hard to beat.** A group's consensus picks outscored about 99% of individual players in the simulation. Real friends share more blind spots than simulated ones, so it will be beatable, but rarely — which is why Beat the Crowd is a Mythic badge.
- **Stability:** the Day 1 leader ends up champion about 60–65% of the time; by Day 7, about 85%. Expect drama in week one and a settled race by week two, which is why the race is settled long before the season ends.

These are modeled numbers, not 17Lands data. Check them against Reality Fracture's real numbers after week one, and recalibrate badge tiers after the first season.

### 6.8 Edge cases

- **A card never shows up in Arena draft data** (it isn't on Arena, or never gets a win rate): the pick scores a neutral 50.
- **Name or ID mismatches** between 17Lands and Scryfall: match on Arena ID first (17Lands `mtga_id` = Scryfall `arena_id`), then on normalized name. Anything unmatched goes to an admin queue. This matters most for Universes Beyond sets, where Arena names can differ from paper.
- **17Lands is down or late:** skip that day. The leaderboard shows "Last updated" and nobody is penalized.
- **The sources disagree on a card's rarity:** Scryfall's printed rarity wins.
- **A card is added to the pool after the lock:** it's ranked with everything else; nobody could pick it.
- **Incomplete entries** still count, with empty slots at 0. Members with no picks show as "No entry" at the bottom.
- **Deleted accounts** disappear from every board.
- **Rule changes between sets:** rules are versioned per set (`scoring_version`), so a tweak for the next set never rewrites a finished season.

*As built (Batch 5, September 15, 2026):* scoring follows 12.4 exactly, in `api/src/lib/mtgScoring.ts`. Ties in adjusted win rate go to more games, then collector order. 17Lands itself leaves the win rate blank under about 500 games in hand, so the first days have plenty of neutral 50s. A locked pick of a card that is later voided scores a neutral 50. Entry points are rounded to four decimals so identical picks tie exactly, and standings break ties on the four #1 picks' points, then on who completed their picks first. After the lock the card sync may add cards to the pool but never drops one or changes a rarity, so a locked pick can't quietly turn into a neutral 50.

---

## 7. Badges

### 7.1 How badges work

- **Tiers.** Badges come in five tiers styled after Magic's rarity symbols: **Common** (black), **Uncommon** (silver), **Rare** (gold) and **Mythic** (orange-red), plus the **Hall of Shame** — a cracked grey badge, worn with pride.
- **When they're awarded.** Entry badges and Early Bird are awarded at the lock and shown on the Reveal page. During the season, the player page shows "on track" badges as outlines, refreshed after each day's scoring. Everything else is awarded on the final day, and the season results page and email present every badge from the season together, including the ones earned at the lock.
- **Who can see them.** Everyone. Badges appear on leaderboard rows (the three highest-tier icons plus a "+N" count), in full on each player's page with the reason ("Called It ×2 — Card X finished #1 among mythics; Card Y finished #1 among commons"), on the group's season results page, in the season results email, and in the player's trophy case on their NewChums profile. In the trophy case, badges earned in private groups don't name the group to people who aren't members.
- **Group size.** Group honors need at least three players with entries. Contrarian, Hive Mind, Photo Finish, Rollercoaster and Beat the Crowd need at least four. Oracle and Sharp Eye need at least 20 entries on the Everyone board.
- **Ties.** Players tied for a group honor all receive it.
- **Repeats.** Some badges can be earned more than once in a season; they stack, as in "Called It ×2."
- **Cosmetic only.** Badges never change points or standings.

"Finished" below always means the card's rank at its rarity in the final-day standings. The odds in parentheses come from the simulation in section 6.7.

### 7.2 Group honors — one per group, every season

1. **Champion** (Mythic). Finish first in your group.
2. **Runner-Up** (Rare). Finish second.
3. **Third Place** (Uncommon). Finish third.
4. **Common Sense** (Rare). Have the highest commons subtotal in the group.
5. **Uncommon Knowledge** (Rare). Have the highest uncommons subtotal in the group.
6. **Rare Insight** (Rare). Have the highest rares subtotal in the group.
7. **Mythic Vision** (Rare). Have the highest mythics subtotal in the group.
8. **Pick of the Season** (Rare). Own the single pick that earned the most points of any pick in the group.
9. **Comeback Kid** (Uncommon). Make the biggest climb in the group from the first standings to the final standings — at least two places.
10. **King of the Hill** (Uncommon). Spend the most days in first place.
11. **Contrarian** (Uncommon). Have the picks that overlap least with the Group Mind.
12. **Hive Mind** (Common). Have the picks that overlap most with the Group Mind.
13. **Photo Finish** (Uncommon). Finish with the smallest points gap between two neighbouring players in the group; both players earn it.
14. **Rollercoaster** (Common). Move the most places across all the daily updates, counting moves up and down.
15. **Early Bird** (Common). Be the first in the group to complete all 20 picks. Awarded at the lock.

The two Hall of Shame group honors, Wooden Spoon and Whiff of the Season, are in section 7.5.

### 7.3 Prediction achievements — anyone can earn these

**Mythic**

16. **Clean Sweep.** Your five picks at a rarity were exactly that rarity's top five, in any order. (About 1 in 50 players.)
17. **Beat the Crowd.** You finished above your group's Group Mind. (About 1 in 100.)
18. **Wire to Wire.** You were first in your group on every daily update of the season. (About 1 in 20.)

**Rare**

19. **Perfect Order.** Your five picks at a rarity finished in exactly the order you ranked them, wherever they landed. (About 1 in 12.)
20. **Oracle.** You finished in the top 5% of the Everyone board.
21. **Sleeper Agent.** You picked a card that finished in its rarity's top 10 even though drafters took it late — its ALSA was in the later half for its rarity.
22. **Told You So.** A pick you wrote a Receipts note on, and that wasn't in your group's Group Mind, finished in the top five at its rarity.

**Uncommon**

23. **Called It.** Your #1 pick at a rarity finished #1 at that rarity. Stacks up to ×4. (More than half of players earn it at least once.)
24. **Sniper.** All five of your picks at a rarity finished in its top 10. (About 1 in 3.)
25. **Grand Slam.** At every rarity, at least one of your picks finished in the top five. (About 6 in 10.)
26. **Bomb Squad.** You picked both the #1 rare and the #1 mythic, in any slot. (About 4 in 10.)
27. **Common Denominator.** You picked the #1 common, in any slot. (About 4 in 10.)
28. **Lone Wolf.** You were the only player in your group to pick a card that finished in the top five at its rarity. (About 1 in 3.)
29. **Sharp Eye.** You finished in the top 25% of the Everyone board.

**Common**

30. **Bullseye.** One of your picks finished at exactly the rank you gave it — for example, your #3 common finished 3rd among commons. (More than 8 in 10.)
31. **Well-Rounded.** At every rarity, at least one of your picks finished in the top 10. (More than 8 in 10.)
32. **Bomb Detector.** You picked the #1 rare or the #1 mythic, in any slot. (More than 8 in 10.)

### 7.4 Entry badges — awarded at the lock

33. **On the Record** (Common). You made all 20 picks before the lock.
34. **Locked and Loaded** (Common). Your entry was complete at least seven days before the lock.
35. **Buzzer Beater** (Common). You made your last change in the final hour before the lock.
36. **Receipts on File** (Common). You wrote a Receipts note on at least five picks.
37. **Rainbow** (Common). Your 20 picks include at least one card of each of the five colors.
38. **Loyalist** (Common). At least 10 of your 20 picks share a color; the badge names it, as in "Blue Loyalist."
39. **Gold Rush** (Uncommon). At least five of your picks are multicolored.
40. **Artificer** (Uncommon). At least three of your picks are colorless.

*As built (Batch 4, September 15, 2026):* the lock job awards these eight and Early Bird. A multicolored card counts toward each of its colors, so a white-blue card helps both Rainbow and a White or Blue Loyalist; when two colors tie for Loyalist, the first in WUBRG order names the badge. Buzzer Beater reads the entry's last real change (`updated_at`, which a save that changes nothing never moves). Locked and Loaded and Early Bird read `completed_at`, when the entry most recently reached twenty picks. Early Bird needs three members with picks when the lock job runs, and ties share it; a group formed after that has no Early Bird. Rainbow and Loyalist need all 20 picks. Before any of this, the lock drops picks whose card left the pool, was voided or changed rarity, moving the rest up as the player's next visit would have, so badges and the Group Mind count only valid picks. Badge names, tiers and descriptions live in `MTG_BADGES` in `api/src/lib/mtg.ts`, and awards in `mtg_badge_awards`, with `community_id` set only for group honors.

### 7.5 Hall of Shame — worn with pride

41. **Wooden Spoon** (group honor). You finished last in your group.
42. **Whiff of the Season** (group honor). Your #1 pick had the lowest final Card Score of every #1 pick in the group.
43. **Bust.** Your #1 pick at a rarity finished in the bottom quarter of that rarity. (About 1 in 20.)
44. **Rock Bottom.** One of your picks finished dead last at its rarity. (About 1 in 100.)
45. **Eats Words.** A pick you wrote a Receipts note on finished in the bottom quarter of its rarity.
46. **Monkey Business.** You finished below 1,000 points, so random picks would have beaten you. (Almost never.)

### 7.6 How many to expect

A group of four or more players hands out 17 group honors every season, so no one leaves empty-handed. In the simulated eight-player seasons, a typical player earned somewhere around 8 to 12 badges: a handful of Commons, two or three Uncommons and about two group honors, with a Rare for roughly one player in ten and a Mythic for roughly one in twenty. Recalibrate the tiers after the first real season if any badge turns out far easier or harder than its tier suggests.

---

## 8. Emails

**Decision:** MTG Card Evaluation Challenge sends five kinds of email and no others. All of them go through Resend.

Rules that apply to every email:

- A player in several groups gets **one combined email per event,** with a section for each group — never one email per group.
- These five are the only emails the challenge adds. Otherwise, specialized communities get whatever notifications NewChums already sends for any community. If NewChums already emails people when they join a community, the challenge's welcome details go into that email instead of a separate one.
- The email log (section 12.2) guarantees nobody gets the same email twice.
- Every email ends with a one-click link to turn off MTG Card Evaluation Challenge emails.
- There are **no** preview-season card alerts, **no** incomplete-entry reminders and **no** lead-change alerts. Players who want daily news can check the group home.

The five emails:

*As built (Batch 3, September 15, 2026):* welcome and lock warning are live. They share one preference, **MTG Card Evaluation Challenge** (`mtg_challenge`), whose one-click unsubscribe link ends every challenge email, and `mtg_email_log` records each send. The welcome goes out straight away from the create, join and join-request approval flows, and only before the lock; for a challenge group it replaces NewChums' generic "request approved" email, so an approved player gets one email. A creator of an invite-only group gets the invite link; a creator of an open or approval-required group gets the group's address with a line saying how people get in. The lock warning is queued by the hourly job from 10:00 AM ET on the day before the lock until the lock, so a missed hour catches up, and is delivered through NewChums' email outbox with its retries. Its per-group line shows how many members have finished. Both emails link to How Scoring Works and to the lock's calendar file, and show times in Eastern time.

*As built (Batch 4, September 15, 2026):* picks revealed is live. Once the lock job has run, the hourly job queues it for 36 hours from the first 9:00 AM ET at least an hour after the lock (the morning after an 11:59 PM or a midnight lock), to every active member of a challenge group, players and people following along alike, so someone who joins a group inside that window gets it on the next hourly run. Players with an entry but no group get nothing, since there is no Reveal to show them. Badges, the pick count and the fun facts are read when it is sent, and group honors such as Early Bird name their group. Each group's fun fact is its most-picked mythic when at least two players share one, otherwise its boldest #1 (a #1 pick nobody else in the group made, mythics first). The email names the date of the first standings instead of saying "the next morning," so a late send stays true. The subject is "The picks are in for Reality Fracture," and a member without picks is told they're following along.

1. **Welcome.** Sent right after a player creates or joins their first group for a set; joining more groups for the same set is confirmed in the app only. It confirms the group, gives the creator the invite link to share, states the lock date and time, lists the season's key dates, and has a *Make your picks* button. If the player already has an entry for the set, it tells them their picks already count in this group.
2. **Lock warning.** Sent at 10:00 AM ET on the day before the lock (Thursday, September 24, 2026 for Reality Fracture) to every player who has an entry or belongs to a group for the set, finished or not. The subject is "Picks lock tomorrow." It states the exact lock time, shows the player's progress ("You've made 17 of 20 picks") and links straight to their picks.
3. **Picks revealed.** Sent at 9:00 AM ET the morning after the lock — Tuesday, September 29, 2026. It announces that picks are sealed and links to the Reveal page. It highlights one fun fact from each group, such as the most-picked mythic or the boldest #1 pick, lists the entry badges the player earned, and says the first standings arrive the next morning.
4. **Weekly standings.** Sent every Tuesday at 10:00 AM ET during the season — October 6, 13 and 20, 2026 for Reality Fracture. If that day's standings are late, it waits for them, and if they still aren't in by 8:00 PM ET it goes out with the latest standings available. It shows the top of each of the player's group leaderboards, the player's rank and movement since last week, their best and worst pick so far, the badges they're on track for, and the countdown to the final day. There's no standings email in the last week; the season results email replaces it.
5. **Season results and congratulations.** Sent at 10:00 AM ET on the final day (Friday, November 13, 2026) once the final standings are in. Every player gets their final rank and points, every badge they earned during the season, their group's champion and top badge moments, and a shareable results image. The champion gets a "Congratulations, champion" version. It ends with when the next season's picks open, if that's known.

---

## 9. Data sources

### 9.1 Card performance — 17Lands

**Decision:** 17Lands is the data source. The game reads the JSON feed behind 17Lands' Card Data page once a day:

```
https://www.17lands.com/api/card_data?expansion=FRA&event_type=PremierDraft&time_period=ALL_TIME
```

**No official API, but an open JSON feed.** 17Lands has no official, documented public API — no keys, no documentation, no guarantees. But its website runs on JSON feeds, and the Card Data feed works as a free, open API. It returns one record per card with named fields, including `ever_drawn_win_rate` (GIH WR), `ever_drawn_game_count` (games in hand), `drawn_improvement_win_rate` (IWD), `avg_seen` (ALSA), `avg_pick` (ATA), `mtga_id` (Arena ID), `rarity`, and a Scryfall image link. When tested on September 10, 2026 against The Hobbit, it returned full-season numbers — about 110,000 games-in-hand for a single popular common.

**Shape and terms (verified September 10, 2026).** The feed returns an object, not a bare list: `{ copyright, notes, data: [...] }`, with one record per card in `data`. Its `notes` field says the data is only for use on 17Lands.com and that only the Public Datasets are permitted for outside use. **Decision (Rob, September 10, 2026): use the feed anyway.** The game is for a group of friends; if 17Lands blocks the server or asks us to stop, the fallbacks below take over or the season simply ends. Ingest validation accepts the wrapper and reads `data`.

**This isn't page scraping.** Scraping means downloading a web page and digging numbers out of its HTML, and it breaks whenever the page's layout changes. 17Lands' Card Data page is a JavaScript app with no numbers in its HTML at all: the browser fetches this same JSON feed and draws the table from it. The game skips the page and reads the feed directly, the way community tools such as the MTGA Draft Tool have worked for years.

**Reliability.** The feed is reliable enough to build on, with the safeguards below:

- It's the feed that powers 17Lands' own Card Data page (confirm this once on the browser's Network tab during Phase 3), so it has to keep working for their site to work.
- The game needs one request a day, and 17Lands refreshes its card data about once a day anyway.
- **A missed day costs nothing.** Scores are recalculated from the full season-to-date data every time, so the next successful pull catches everything up. Only the final day's pull decides the champion, and it can be retried until it succeeds.
- **The real risk is that the feed changes without notice** — and that has already happened once. The older feed at `card_ratings/data`, which the MTGA Draft Tool originally used, still answers but now returns only a small slice of the games: about 1,500 games-in-hand for the same common that shows about 110,000 in the current feed. The validation checks below exist to catch exactly that kind of silent change.

**Ingest safeguards**

- **Schedule.** The first attempt runs at 9:00 AM ET every day, from the day after the Arena launch through the final day. If an attempt fails, fails validation, or returns data that isn't newer than yesterday's, it retries at 11:00 AM, 1:00 PM, 4:00 PM and 8:00 PM ET. If every attempt fails, the previous standings stay up, the leaderboard shows "Last updated" with the date, and the admin gets an email.
- **Validation before publishing.** The response must be the `{ copyright, notes, data }` object (or a bare list, should the wrapper ever go away) whose records have the expected fields. At least 95% of the set's pool must match by Arena ID or name. The total games-in-hand across the pool must be no lower than the previous snapshot's, because season-to-date totals only grow, and no more than a handful of cards may lose games compared with yesterday. If any check fails, the snapshot isn't published and the admin gets an email with the reason.
- **Settings, not code.** The feed address and its parameters live in the set's settings, so if 17Lands moves the feed, the fix is a settings change. To find a new feed, open 17Lands' Card Data page, open the browser's developer tools, and look for the JSON request on the Network tab.
- **Archive.** Every raw response is saved to Cloudflare R2, so any day can be re-scored or audited.
- **Politeness.** Requests send a descriptive User-Agent (for example, `NewChums/1.0 (MTG Card Evaluation Challenge)`), and there's never more than one successful pull per day.

*As built (Batch 5, September 15, 2026):* the hourly job tries at 9 and 11 AM, 1, 4 and 8 PM ET from the day after the Arena launch through the final day, and stops once the day is published. The checks: the response must parse as the wrapper or a bare list, with the expected fields and win rates between 0 and 1 (17Lands serves the JSON as `text/html`, so the content type is ignored); at least 95% of the pool must match; total games in hand must not fall; no more than five cards may lose games; and data identical to the last standings, or with no games at all, counts as not newer. Every response is archived to R2 under `mtg/17lands/<set>/`, and a published day also keeps its response in the database so it can be re-scored. A failed check emails the admin inbox straight away, and a day that ends without new standings emails after the 8 PM attempt, at most once a day, with a Sentry warning. *MTG Seasons* can fetch now, paste a response copied from a browser, publish past the checks, re-score a day, match a pool card to a differently named 17Lands record, and void or restore a card; an admin's fetch or paste replaces the day's standings when its data is newer. *MTG Seasons* can also name a day other than today, so the final day can be retried after it has ended, and can rehearse a fetch as a dry run: everything is fetched, matched, checked and archived, and the attempt logged, but nothing is published — so card matching can be sorted out before the season's first morning. A bad day sends at most two emails, one for the first failed check and one after the last attempt. The Public Datasets fallback isn't built.

*Review fixes before shipping:* a feed whose win-rate field is renamed or dropped now fails the checks instead of scoring every card a neutral 50, and so does a day where more than a tenth of the cards with 2,000 or more games in hand have no win rate; an empty feed waits instead of failing; growth is compared only over cards in both days, so a card joining or leaving the pool can't trip it; nothing publishes outside the season window or over a final day; an admin's publish-anyway applies to that one attempt instead of staying switched on; the admin's unmatched lists come from the newest response, a failed one included, so a first day that fails its checks can still be matched and fetched again; and an attempt that throws is recorded, reported to Sentry and alerted on the day's last attempt.

**Fallbacks, in order**

1. **Admin paste.** If 17Lands starts blocking our server but the feed still opens in a browser, the admin opens the feed address, copies the response and pastes it into an admin page. The same validation runs. Because scoring is cumulative, even one paste a week keeps a season alive.
2. **17Lands Public Datasets.** 17Lands publishes game-level data files for each set (named like `game_data_public.FRA.PremierDraft.csv.gz`) under a Creative Commons Attribution (CC BY 4.0) license. A script can compute GIH WR from them. They're published less often than daily, so standings would update whenever a new file lands.
3. **If neither works,** the season pauses on its last standings, and the final standings are declared when data returns.

**Why not another source**

- Untapped.gg collects Arena statistics through its own companion app, but offers no public API.
- Draftsim, set-review grades and tier lists are opinions, not performance data.
- Wizards publishes no card-level performance data for Arena.
- Scraping 17Lands' web pages would be slower and more fragile than reading the feed those pages use.

17Lands is the only credible, public source of card-level Limited win rates, and it's the one the community trusts, so the game is built on it.

**The 17Lands embargo**

17Lands' usage guidelines ask other sites and tools not to show its Card Data or Deck Color Data as complete lists or visualizations for about 12 days after each set's Arena release, so that players come to 17Lands during the busiest weeks of a format. **Decision: we ignore that request and show everything from day one** — win rates, game counts and full card rankings. If 17Lands ever asks us to stop, the fix is to hide raw numbers and full rankings for the first 12 days of each season; that isn't built up front.

### 9.2 Card pool and images — Scryfall

- **Sync.** `GET https://api.scryfall.com/cards/search?q=e%3Afra+-t%3Abasic&unique=prints&order=set` returns 175 cards per page; follow `next_page`. Group the results by `oracle_id` and keep the lowest collector number (the regular printing), so showcase and borderless versions don't double up. Keep cards with `booster = true` and a rarity of common, uncommon, rare or mythic. *As built:* during previews Scryfall's `booster` flag and `arena_id` are unreliable (146 printings on September 10 collapsed to 100 oracle cards), so until the full-gallery date every non-digital card of the four rarities counts as in the pool; from that date on, only `booster = true` cards stay in. A card the sync no longer sees leaves the pool, but only before the lock, when the pool is still allowed to move: a retracted or renumbered preview would otherwise stay pickable and spend the ingest's 5% unmatched budget for the rest of the season. The sync lives in `api/src/lib/mtg.ts` (`syncScryfallSet`).
- **Cadence.** NewChums' hourly cron runs the sync at even Eastern hours from the first preview day until the lock, then once a day at 6:00 AM ET until the final day; a super admin can also run it from the *MTG Seasons* admin page (*Sync cards now*). Every response page is archived to R2 under `mtg/scryfall/<set>/<timestamp>-p<n>.json`, and each run is recorded in `mtg_card_syncs`. When a card first appears, stamp its `first_seen_at`; that drives the NEW badges in the pick screens. Refresh images when `image_status` improves from `lowres` to `highres_scan`.
- **Fields used.** name, rarity, collector_number, oracle_id, arena_id, layout, colors, mana_cost, cmc, type_line, oracle_text, `image_uris` (or `card_faces[].image_uris` for double-faced cards), and `preview.previewed_at`, `preview.source` and `preview.source_uri` for "Previewed by X on Sept 12."
- **Images.** The grid uses `normal` images (488×680) and the card viewer uses `large` (672×936), loaded straight from Scryfall's image host (`*.scryfall.io`), which isn't rate-limited.
- **Technical rules.** Scryfall rejects API requests that don't send a `User-Agent` naming the app (for example, `NewChums/1.0`) and an `Accept` header. Wait 50–100 ms between API calls, cache results for at least 24 hours, and show card images whole — never cropped, covered or watermarked. *As built:* Scryfall rate-limits in bursts, so a 429 or a 5xx waits and retries twice before the run gives up, and a run that still fails goes to Sentry as well as to the red line on *MTG Seasons* — a silent failure would freeze the pool until the next sync hours later.

### 9.3 Attribution

This footer appears on every leaderboard, player page and card page:

> Card performance data from 17Lands.com (Premier Draft, all users). Card images and data via Scryfall. MTG Card Evaluation Challenge is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC. Not affiliated with 17Lands or Scryfall.

### 9.4 Permissions

**Decision:** we don't ask Wizards, 17Lands or Scryfall for permission in advance. We credit them on every page, follow their technical rules (Scryfall's headers and rate limits, one 17Lands pull a day), and if any of them asks us to change or remove something, we do it promptly.

---

## 10. Screens and flows

### 10.1 Creating and joining

- **Creating.** On newchums.com/communities/create, the organizer fills in the usual community fields, turns on *Specialized Community* and picks *MTG Card Evaluation Challenge* from the dropdown. The new community opens straight to the challenge view; the header's Share button copies the community's address, or the invite link for an invite-only community.
- **Joining.** Opening the community's address (or invite link) shows the community, its members and the lock countdown, with a big *Make your picks* button. Anyone without a NewChums account signs up through the normal flow and lands back on the community.
- **Finding public challenges.** Public MTG Card Evaluation Challenge communities appear in NewChums' community directory with their label.
- **First-time explainer.** Three swipeable cards — *Pick 5 per rarity*, *Put your best at #1*, *17Lands decides after the Arena launch* — link to the How Scoring Works page, which is also linked from every challenge's home view.

### 10.2 The group home (the game view)

The community's usual header stays in every phase — name, picture, members, public or private label, Share and owner settings — with a season switcher added for past seasons. The tabs below the header (Plans, Announcements and the rest) are replaced by the challenge. Below the header, the page changes with the season:

- **During previews** (built), it shows the phase card with the lock countdown, the pool count by rarity as cards are revealed, a read-only card grid with rarity tabs, the Season timeline and the attribution footer. The *Make your picks* button appears, disabled, with the date picks open.
- **Between seasons,** it shows the last season's podium and badges, plus a *Next season* card with the next set's dates once they're known.
- **While picks are open,** it shows the lock countdown, a *Make your picks* or *Edit your picks* button with progress ("14 of 20"), the member list showing who has finished (but not what they picked), the Season timeline, and the community's Discord or WhatsApp links for discussion.
- **After the lock,** it shows the Reveal. From the first standings onward, it shows the leaderboard with a "Last updated" line and "Day 6 of 28," the Season timeline, and the Reveal one tap away.
- **From the final day on,** it shows the podium, the final leaderboard, every badge awarded in the group, the share image, and the next season.

*As built (Batch 4):* after the lock, members see a **The Reveal** card in place of *Pick status*, with their lock badges, the Group Mind's five mythics and a *See everyone's picks* button that opens the full Reveal at `/communities/<slug>/reveal`. The phase card keeps *View your picks*, which opens the wizard read-only with a *See the Reveal* link. Non-members see a line saying the picks are revealed to the group's members. The card pool's grid folds away behind *Browse the cards* after the lock, so the Reveal leads. From the first published standings (Batch 5) the leaderboard comes first, with the Reveal summary right below it.

*As built (Version 14, September 16, 2026):* until the season goes live, the phase card also holds a blank leaderboard: column headers, three placeholder rows, the random-picks line and when the first standings arrive, replaced by the real leaderboard at the Arena launch. The card's label reads "Current Set: Reality Fracture", *How scoring works* is an outlined button beside the picks button, and *Pick status* lists every member with Done, their pick count or Not started. The card pool loads every rarity once, and tapping a card opens it large in the card viewer.

### 10.3 The pick wizard

- **Stepper:** Commons → Uncommons → Rares → Mythics → Review. Each step shows progress ("3 of 5") and how many cards are new ("12 new").
- **Step header:** "Pick the 5 commons you think will post the highest GIH WR on 17Lands. Your #1 counts 1.5×." During previews it adds a counter: "64 of 81 commons revealed so far."
- **Card grid:** every revealed card at that rarity — three columns on phones, five or six on tablets, seven or eight on desktop — with images loading as you scroll. Picked cards wear their slot badge (#2). Cards first seen since your last visit wear a **NEW** ribbon.
- **Filters:** color (W, U, B, R, G, multicolor, colorless), card type and mana value; toggles for *New only* and *Hide picked*; search on name and rules text; sort by collector number, color or mana value.
- **Card viewer (tap a card):** a large image, a flip button for double-faced cards, the rules text, "Previewed by X on Sept 12" linking to the reveal, swipe or arrow keys for the previous and next card at that rarity, and one big button — **Add as #3** or **Remove**. If all five slots are full, a "Replace which pick?" sheet opens.
- **Pick tray:** a sticky bar at the bottom on phones and a right-hand rail on desktop, with five numbered slots. Drag to reorder (dnd-kit handles touch), with ↑ and ↓ buttons as a fallback. Every change saves automatically ("Saved ✓"), and the lock countdown lives here ("Locks in 3d 4h").
- **Review:** all 20 picks in order, with reordering and swapping, then optional **Receipts** — a note of up to 140 characters per pick ("this common is a house"). Receipts stay sealed until the lock and then sit beside that card's results all season. They're the accountability-and-trash-talk feature in one text field.

**As built (Batch 2, September 15, 2026).** The wizard lives at `/communities/<slug>/picks` (sign-in and membership required; the entry itself belongs to the player and counts in every group). Picks open when previews start rather than on the full-gallery date, so a group can start as cards are revealed; a pick whose card later leaves the pool is removed on the player's next visit, the remaining picks at that rarity move up, and a notice names the card once. Each rarity is an ordered list with no gaps, so removing #2 moves #3 up. The grid is three columns on phones and fills the available width with tiles of at least 112 pixels elsewhere, since the pick tray takes the right-hand side on desktop. Every change saves about 0.7 seconds later as a full replace, one request at a time so an older save can never land after a newer one; a refused save reloads what is actually stored. `completed_at` records when the entry most recently reached twenty picks and clears if it drops below, so it cannot be claimed early and then changed.

**How NEW works.** The card sync stamps each card's `first_seen_at`. For each player, set and rarity, the app stores `last_reviewed_at`. When a step opens, cards with `first_seen_at` later than `last_reviewed_at` are marked NEW, and `last_reviewed_at` updates to now — so badges stay visible for that visit and clear on the next. For Reality Fracture the full card list lands on September 18, about when picks open, so NEW badges pay off mostly from the next set onward. A player's first visit to a rarity marks nothing as new, since otherwise every card would be.

### 10.4 Lock and reveal

At the lock, entries freeze (enforced by the server), entry badges are awarded, and the **Reveal** opens to the group:

- everyone's picks side by side, per rarity;
- the most-picked cards with counts, and *Only you* tags on picks nobody else made;
- each player's entry badges;
- the **Group Mind** — the group's consensus top five per rarity, worked out by giving each #1 pick 5 votes down to 1 vote for a #5. It plays on the leaderboard as a ghost entry all season.

*As built (Batch 4, September 15, 2026):* the Reveal is its own page, `/communities/<slug>/reveal`, open to the group's members and super admins whatever the group's visibility (section 11). Rarity tabs start with Mythics. Each tab shows the Group Mind's five cards with their votes and how many players picked each, up to three most-picked cards (picked by at least two players), then one card per player: the viewer first, with five thumbnails in slot order, *Only you* under the viewer's solo picks and *Solo* under other players' (card images are never covered), their Receipts notes and their lock badges; a player with no picks at that rarity gets one short line instead of empty slots. The first Reveal a viewer opens each season starts with a short burst of confetti, skipped for anyone who prefers reduced motion. Members without picks are listed last as following along. Tapping a card opens the card viewer without pick buttons. The Group Mind needs picks from at least two members; ties go to more #1 votes, then more players, then collector order. For groups that exist when the lock job runs it is stored then and does not change as members join or leave; a group formed later, or with fewer than two entries at the lock, shows one worked out from its current members' locked entries, which updates as players join. Before the lock the page says picks are sealed, and the API answers 403 `SEALED` with no card data.

### 10.5 Leaderboard

- **Header:** "Updated Wed 9:04 AM ET · Day 2 of 28 · 17Lands Premier Draft."
- **Rows:** rank, movement (▲2, ▼1 or –), name, the player's top three badges plus a "+N" count, points, change since yesterday, and points behind the leader.
- **Ghost rows:** the **Group Mind** (can anyone beat the crowd?) and a dashed **Random picks ≈ 1,000** line.
- **Tabs:** *This group* and *Everyone* — the global board, which players can opt out of. The Everyone board shows handle, rank and points only; picks and player pages are visible inside groups.
- **Final day:** a podium, the badge ceremony, and a shareable results image for the group chat — a real PNG, rendered in the browser with a canvas, since the platform avoids server-side image generation.

*As built (Batch 5, September 15, 2026):* the group home's *Standings* card shows "Updated Wed 9:04 AM ET · Day 4 of 28 · 17Lands Premier Draft", or "Last updated" with the date when today's data still hasn't arrived by 10 AM ET, an hour after the first attempt. Each player's row has rank with movement, name, points gained today and points behind the leader, the top three badges (names on wide screens, tier dots on phones, and a count) and points; a row opens to its points by rarity and its badges. The Group Mind ghost and the dashed *Random picks ≈ 1,000* line sit where their points fall, and members without picks are listed as following along. Standings are for the group's members and super admins, with `?date=` for a past day. Day 1 is the first morning after the Arena launch. The final-day podium comes in a later batch. The card appears from the Arena launch, saying when the first standings arrive, and it reloads when the tab comes back into view and every half hour, so a page left open doesn't show yesterday all day; a refresh that fails while the board is up says so and offers to try again. *Batch 6 (September 16, 2026):* the card has *This group* and *Everyone* tabs. *Everyone* ranks every entry for the season on the latest day by handle, rank and points: the top 100, plus your own row if you're further down, with a player who has no handle shown as "Anonymous player". Anyone with an entry gets a *Show me on this board* switch there. An opened row now links to that player's page.

### 10.6 Player page (tap a name)

- **Header:** rank, points, movement and a points-over-time chart.
- **Four rarity blocks,** each with a subtotal and five rows: slot, thumbnail, name, GIH WR and game count, rank ("3rd of 81 commons"), Card Score, multiplier, points, trend arrow and the player's Receipt note.
- **Badges:** everything earned so far, plus outlined "on track" badges during the season.
- Under each rarity block, a collapsible **Actual top 5 right now**, and a **Compare with me** toggle.

*As built (Batch 6, September 16, 2026):* the player page is `/communities/<slug>/players/<userId>`, reached from an opened leaderboard row or a card's *Picked by* list. Three tiles show rank with movement, points with the change since the day before, and points behind the leader, computed exactly as the leaderboard computes them. A points-over-time line follows, with the random-picks line for reference and each day ranked as the group was that day, then the player's badges, then a block per rarity: each slot's card, win rate in hand and games, rank ("3rd of 81 commons"), Card Score with its change since the day before, multiplier, points and Receipt. A card without a win rate yet says so and scores 50, as does a voided card. *Actual top 5 right now* folds out under each block and marks the cards the player picked; *Compare with me* adds the viewer's own pick under each slot. Another player's page opens at the lock; your own opens before it, with your picks and no numbers. "On track" badges come with Batch 7.

### 10.7 Card page

A large image; GIH WR, games-in-hand and ALSA; Card Score and rank; a rank-over-time chart; *Picked by* (group members and their slots); and links to the card on Scryfall and to 17Lands.

*As built (Batch 6, September 16, 2026):* the card page is `/communities/<slug>/cards/<cardId>`, linked from every card on a player page. It shows the card whole, with a flip for double-faced cards; tiles for rank, Card Score, GIH WR, games in hand and ALSA on the latest day; a rank-over-time line with first place at the top; *Picked by*, with each member's slot and Receipt, sealed until the lock; and links to the card on Scryfall and to 17Lands' card data for the set. It's for the group's members and super admins, because *Picked by* belongs to the group. Both pages' charts have a *Show the numbers* table, so no value lives only in a tooltip.

### 10.8 Past seasons and trophy case

- **Past seasons:** each group keeps every finished season — final standings, champion, badges and everyone's picks — behind the season switcher.
- **Trophy case:** every player's NewChums profile gets an MTG Card Evaluation Challenge section listing their badges across all seasons, grouped by set. It's visible to anyone who can see the profile; badges from private groups don't name the group to non-members.

### 10.9 How Scoring Works page — ready-to-use copy

*As built (Batch 3):* a public page at `newchums.com/mtg/how-scoring-works`, readable without an account and linked from every challenge home, the pick wizard and both emails. The season dates paragraph and the full Season timeline, with its calendar links, come from the current set; the copy below is otherwise used as written.

> **The idea.** Before each new Magic set launches on MTG Arena, you pick the 5 cards you think will perform best at each rarity — commons, uncommons, rares and mythics — in order. Once the set is being played, we check how every card is actually doing and score your picks.
>
> **Where the data comes from.** Card performance comes from 17Lands.com, a community project that collects anonymized game data from MTG Arena players who use its tracker. We use Premier Draft data from all 17Lands users and update once a day, around 9 AM ET. Card images and details come from Scryfall.
>
> **The stat: GIH WR.** "Games in Hand Win Rate" is how often decks win in games where the card was in the opening hand or drawn. It's the stat Limited players quote when they argue about cards. Across 17Lands players an average card sits in the mid-50s; standouts are 60% and up.
>
> **Card Score (0–100).** Every day we rank each card against the other cards of the same rarity. The best common scores 100, the worst common scores 0, and everything in between is spread evenly. A Card Score of 87 means the card is doing better than 87% of the other cards at its rarity.
>
> **Your order matters.** Your #1 pick counts 1.5×, #2 counts 1.25×, #3 1×, #4 0.75× and #5 0.5×. Put the card you're most sure about at #1.
>
> **Your score** is Card Score × multiplier, added up across all 20 picks. Random picks average about 1,000 points; a perfect, hindsight-is-20/20 entry scores about 1,940.
>
> **Small samples.** In the first few days some cards have only a handful of games. Until 17Lands publishes a win rate for a card, it scores a neutral 50. After that, we blend its win rate toward its rarity's average until it's been played a lot, so one lucky day can't make a card look like a bomb.
>
> **Standings change every day.** Your score is recalculated from all the data so far, so it can go down as well as up — your card's win rate can rise while its rank falls if other cards rise faster. The first few days swing a lot; things usually settle by week two.
>
> **Season dates.** Picks lock Friday, September 25 at 6:00 PM ET, before prerelease weekend starts. Standings update daily from September 30. The season ends Friday, November 13; the standings that morning are final, and badges are awarded.
>
> **Badges.** Earn badges for great calls — and a few for glorious misses. Some are awarded when picks lock and the rest on the final day, and everyone can see them.
>
> **Ties** go to the higher total from your four #1 picks, then to whoever finalized their picks first.
>
> **Fine print.** Only cards from the main Reality Fracture set count, at their printed rarity — no Special Guests, Commander cards or basic lands. Empty slots score 0. If a card never shows up in Arena draft, that pick scores a neutral 50.

---

## 11. Groups — rules

- **Public groups** appear in NewChums' community directory with an "MTG Card Evaluation Challenge" label. Anyone who can view a public community can see its standings; its picks are shown to its members after the lock. Anyone with a NewChums account can join.
- **Approval-required groups** are discoverable; outsiders see a restricted preview and can request to join (the owner approves), and only members see the standings and picks. **Invite-only groups** are hidden from the directory; anyone with the invite link joins instantly, and only members see the standings and picks.
- **Joining a public group** shows a one-line heads-up: "Your picks will be visible to everyone in the group once picks lock."
- **Sharing.** The header's Share button copies the community's address; for invite-only groups it becomes *Invite link* and copies the link with its code. The owner can reset the link from Edit (old links stop working) and controls entry through the access mode (open, approval required, invite only).
- **Joining after the lock** requires a locked entry for that set; anyone else can follow along. Because entries belong to players rather than groups, a new group formed after the lock works immediately with everyone's existing picks.
- **Roles** are the community's owner and members. Once a season has started, "delete group" becomes "archive group," so the season's history survives.
- **Discussion:** communities have no member chat; the pre-lock arguing lives in the community's Discord or WhatsApp links.
- **Moderation:** group names and Receipts notes are user-written text, so they use the community's existing reporting tools.
- **Plans:** the *Plans* button creates real-world meetups from the group — a prerelease trip, a draft night, a final-day watch party.
- **Store leagues:** a game store can create a public group and put a QR code on the counter. If a store wants to award a prize, entry stays free and the prize is the store's own promotion (check contest rules first).
- **The Everyone board** includes every entry for the set, except players who opt out.

*As built (Batch 4):* the Reveal is shown to a group's members and super admins only, public groups included. Joining after the lock stays open to everyone: no entry can be created or changed after the lock (the save returns 423), so a new member without an entry is following along, and one with a locked entry brings those picks into the group's Reveal. Groups that exist when the lock job runs have their Group Mind and Early Bird fixed then, and they don't change as members come and go. A group formed after the lock has no Early Bird, and its Group Mind is worked out from its current members' locked entries, so it grows as players join. Once the lock has run, the season's lock time can't be changed. *Batch 6:* the Everyone board includes every entry with points on the latest day, players in no group included, and shows only handles, ranks and points. A player hides or shows themselves with the *Show me on this board* switch on the Everyone tab, at any time; hiding doesn't change their entry, so it can't affect a tie-break.

---

## 12. Architecture and data model

### 12.1 Components (NewChums' usual stack)

- **Front end:** React, inside NewChums' existing community pages, with dnd-kit for drag-to-reorder.
- **Create form:** one new *Specialized Community* option and dropdown on newchums.com/communities/create.
- **API:** the existing Hono API on Cloudflare Workers (`api/src/index.ts`), extended with the `/mtg/*` and `/admin/mtg/*` routes; shared helpers live in `api/src/lib/mtg.ts`.
- **Scheduled jobs:** the API's existing hourly Cloudflare Cron Trigger (`0 * * * *`), with each job gated by the hour in America/New_York.
- **Raw data archive:** Cloudflare R2, holding every Scryfall sync and every 17Lands response.
- **Email:** Resend.
- **Database:** Neon Postgres, schema `newchums`, with additive SQL migrations in `web/sql/`. Users are UUIDs, so every `references users(id)` below is a uuid rather than an integer. Migration 123 created `communities.specialization`, `mtg_sets`, `mtg_cards` and `mtg_card_syncs` with uuid keys and seeded Reality Fracture; the DDL below stays as the design reference for the rest.

### 12.2 Schema

Groups reuse NewChums' communities, with one new column that the Specialized Community dropdown sets. Specialized communities behave like any other community everywhere except their home view. Everything else below is new.

```sql
-- NewChums' existing communities table gets one column
alter table communities add column specialization text;  -- null = normal community; 'mtg_prediction_challenge' = MTG Card Evaluation Challenge

create table mtg_sets (
  id                  serial primary key,
  code                text unique not null,          -- 'FRA'
  name                text not null,                 -- 'Reality Fracture'
  previews_start_at   timestamptz,                   -- 2026-09-08
  gallery_complete_at timestamptz,                   -- 2026-09-18
  prerelease_start_at timestamptz,                   -- 2026-09-25
  prerelease_end_at   timestamptz,                   -- 2026-10-01
  picks_open_at       timestamptz,                   -- 2026-09-18 (target)
  lock_at             timestamptz not null,          -- 2026-09-25 22:00Z = Fri Sept 25, 6 PM ET, before prereleases
  arena_release_at    timestamptz,                   -- 2026-09-29 18:00Z
  tabletop_release_at timestamptz,                   -- 2026-10-02
  final_at            timestamptz not null,          -- 2026-11-13 14:00Z = Fri Nov 13, 9 AM ET, the next set's release
  feed_url            text not null,                 -- the 17Lands feed address for this set
  scoring_version     int  not null default 1,
  status              text not null default 'upcoming'  -- upcoming | open | locked | live | final
);

create table mtg_cards (
  id                 serial primary key,
  set_id             int  not null references mtg_sets(id),
  scryfall_id        uuid unique not null,
  oracle_id          uuid not null,
  arena_id           int,                            -- joins to 17Lands mtga_id
  name               text not null,
  rarity             text not null,                  -- common | uncommon | rare | mythic
  collector_number   text not null,
  layout             text,
  colors             text,                           -- 'WU'; '' = colorless
  mana_value         numeric,
  type_line          text,
  oracle_text        text,
  image_normal       text,
  image_large        text,
  image_back_normal  text,                           -- double-faced cards
  image_back_large   text,
  image_status       text,
  previewed_at       date,
  preview_source     text,
  preview_source_uri text,
  first_seen_at      timestamptz not null default now(),  -- drives NEW badges
  in_pool            boolean not null default true,
  unique (set_id, oracle_id)
);

create table mtg_entries (                           -- one per player per set
  id           serial primary key,
  user_id      int not null,                         -- NewChums user
  set_id       int not null references mtg_sets(id),
  updated_at   timestamptz not null default now(),   -- last change before the lock (tie-break)
  completed_at timestamptz,                          -- when all 20 slots were first filled
  hide_from_everyone_board boolean not null default false,
  unique (user_id, set_id)
);

create table mtg_picks (
  entry_id int      not null references mtg_entries(id) on delete cascade,
  rarity   text     not null,
  slot     smallint not null check (slot between 1 and 5),
  card_id  int      not null references mtg_cards(id),
  note     text     check (char_length(note) <= 140),  -- Receipts
  primary key (entry_id, rarity, slot),
  unique (entry_id, card_id)
);

create table mtg_rarity_reviews (                    -- NEW-badge bookkeeping
  user_id          int  not null,
  set_id           int  not null references mtg_sets(id),
  rarity           text not null,
  last_reviewed_at timestamptz not null,
  primary key (user_id, set_id, rarity)
);

create table mtg_snapshots (                         -- one per day of published standings
  id            serial primary key,
  set_id        int  not null references mtg_sets(id),
  snapshot_date date not null,
  taken_at      timestamptz not null,
  raw_key       text not null,                       -- R2 key of the raw 17Lands response
  is_final      boolean not null default false,
  unique (set_id, snapshot_date)
);

create table mtg_ingest_runs (                       -- every attempt, published or not
  id           serial primary key,
  set_id       int  not null references mtg_sets(id),
  attempted_at timestamptz not null,
  outcome      text not null,                        -- published | not_newer | fetch_failed | failed_validation
  notes        text,
  snapshot_id  int references mtg_snapshots(id)
);

create table mtg_card_stats (
  snapshot_id int references mtg_snapshots(id),
  card_id     int references mtg_cards(id),
  gih_games   int,
  gih_wr      numeric,                               -- null until 17Lands publishes one
  adj_wr      numeric,
  rarity_rank int,
  card_score  numeric,
  alsa        numeric,
  ata         numeric,
  iwd         numeric,
  primary key (snapshot_id, card_id)
);

create table mtg_entry_scores (
  snapshot_id  int references mtg_snapshots(id),
  entry_id     int references mtg_entries(id),
  total        numeric,
  common       numeric,
  uncommon     numeric,
  rare         numeric,
  mythic       numeric,
  slot1_points numeric,                              -- tie-break
  primary key (snapshot_id, entry_id)
);
-- As built (Batch 5, migration 129): uuid keys. mtg_snapshots also keeps source (feed | paste), raw_json,
-- total_games, matched, pool_size, scoring_version and scored_at; mtg_ingest_runs adds snapshot_date, trigger
-- (schedule | admin | paste), raw_key, total_games, matched and alerted; mtg_card_stats adds ranked (N);
-- mtg_cards gains stats_arena_id and stats_name, an admin's match overrides.

create table mtg_group_minds (                       -- consensus picks, computed at the lock
  community_id int      not null,
  set_id       int      not null references mtg_sets(id),
  rarity       text     not null,
  slot         smallint not null,
  card_id      int      not null references mtg_cards(id),
  votes        int      not null,                    -- 5 for each #1 pick down to 1 for a #5, summed
  pickers      int      not null,
  entries      int      not null,                    -- members with picks when computed
  primary key (community_id, set_id, rarity, slot)
);

create table mtg_group_locks (                       -- the group's Group Mind and Early Bird are done
  community_id int         not null,
  set_id       int         not null references mtg_sets(id),
  entries      int         not null,
  locked_at    timestamptz not null default now(),
  primary key (community_id, set_id)
);

create table mtg_badge_awards (
  id           serial primary key,
  set_id       int  not null references mtg_sets(id),
  user_id      int  not null,
  community_id int,                                  -- null for badges not tied to one group
  badge_code   text not null,                        -- e.g. 'called_it'
  award_key    text not null default '',             -- tells stacked awards apart, e.g. 'mythic' or 'u'
  detail       jsonb,                                -- e.g. {"rarity": "mythic", "card_id": 123}
  status       text not null default 'awarded',      -- on_track | awarded
  awarded_at   timestamptz not null default now()
);

create table mtg_email_log (                         -- guarantees one email per player per event
  user_id    int  not null,
  set_id     int  not null references mtg_sets(id),
  email_type text not null,                          -- welcome | lock_warning | revealed | weekly | results
  period     text not null default '',               -- ISO week for weekly emails
  sent_at    timestamptz not null default now(),
  primary key (user_id, set_id, email_type, period)
);
-- Group standings are computed on read (rank plus change since the previous snapshot).
-- Badge definitions (code, name, tier, rule) live in code as a constant list.
-- Batch 4 also added mtg_sets.locked_at (when the lock job finished), mtg_entries.locked_at and
-- locked_pick_count (the entry as frozen), and a unique index on mtg_badge_awards
-- (set_id, user_id, community_id, badge_code, award_key).
```

### 12.3 Scheduled jobs

- **Card sync** (built) runs from the hourly cron at even Eastern hours from the first preview day until the lock, then at 6:00 AM ET until the final day, skipping when a successful run happened in the last 100 minutes. It searches Scryfall for the set, keeps one row per oracle card, adds new cards with their first-seen time, refreshes images when better scans arrive, archives each response page to R2 and records the run in `mtg_card_syncs`.
- **Lock** (built in Batch 4 as `processMtgLock`) runs on the first hourly pass at least 30 seconds after the lock time (midnight ET for an 11:59 PM lock); the server refuses saves from the lock time itself. It first drops picks whose card left the pool, was voided or changed rarity, moving the rest up as a visit would have, then stamps each entry with `locked_at` and its pick count, awards entry badges to everyone with picks, locks every challenge group that exists (Group Mind, Early Bird and a `mtg_group_locks` row), and records `mtg_sets.locked_at`. A group that fails to lock is logged and retried on later passes without holding up the others or the reveal email, and super admins can run the job again from *MTG Seasons*. The Reveal opens at `lock_at`; until the job has run, and for groups formed later, it works the Group Mind out from the members' locked entries.
- **Stats ingest** (built in Batch 5 as `processMtgIngest`, right after the lock job in the hourly pass) runs every day at 9:00 AM ET from the day after the Arena launch through the final day, retrying at 11:00 AM, 1:00 PM, 4:00 PM and 8:00 PM ET when needed. It fetches the 17Lands feed, validates it, archives it and records the outcome in `mtg_ingest_runs` (section 9.1).
- **Scoring** (built in Batch 5) runs right after each successful ingest, in the same transaction that publishes the day. It computes adjusted win rates, ranks, Card Scores, entry scores and group standings, and refreshes "on track" badges. It can safely re-run for the same day.
- **Emails** (welcome and lock warning built in Batch 3, picks revealed in Batch 4; `processMtgLockWarnings` and `processMtgRevealedEmails` queue their rows after the lock job and before the challenge outbox pass in the same hourly run) follow section 8: the welcome goes out when a player creates or joins their first group for a set; the lock warning at 10:00 AM ET the day before the lock; picks revealed at 9:00 AM ET the morning after the lock; weekly standings on Tuesdays at 10:00 AM ET during the season, after that day's scoring; and season results at 10:00 AM ET on the final day. Each checks the email log before sending.
- **Finalize** runs on the final day after that morning's scoring. It marks the final snapshot, awards the final-day badges, freezes the season, and triggers the season results email.

### 12.4 Scoring — reference implementation

```js
const SLOT_WEIGHTS = [1.5, 1.25, 1.0, 0.75, 0.5];
const PRIOR_GAMES = 200; // "average" games blended into every card (section 6.4)

// pool:  [{ id, rarity }] — the set's scoring pool
// stats: Map(cardId -> { gihGames, gihWr }) — today's 17Lands numbers; gihWr may be null
function cardScores(pool, stats) {
  const scores = new Map();
  for (const rarity of ['common', 'uncommon', 'rare', 'mythic']) {
    const rows = pool
      .filter((c) => c.rarity === rarity)
      .map((c) => {
        const s = stats.get(c.id);
        const games = s && s.gihWr != null ? s.gihGames || 0 : 0; // no published win rate = no data yet
        return { id: c.id, games, wins: games ? s.gihWr * games : 0 };
      });
    rows.filter((r) => r.games === 0).forEach((r) => scores.set(r.id, 50)); // no data: neutral 50
    const played = rows.filter((r) => r.games > 0);
    if (played.length < 2) { played.forEach((r) => scores.set(r.id, 50)); continue; }

    const avg = played.reduce((a, r) => a + r.wins, 0) / played.reduce((a, r) => a + r.games, 0);
    played.forEach((r) => { r.adj = (r.wins + PRIOR_GAMES * avg) / (r.games + PRIOR_GAMES); });
    played.sort((a, b) => b.adj - a.adj || b.games - a.games);

    const n = played.length;
    played.forEach((r, i) => scores.set(r.id, (100 * (n - 1 - i)) / (n - 1)));
  }
  return scores;
}

// picks: [{ cardId, slot }] — one entry's (up to) 20 picks
const entryScore = (picks, scores) =>
  picks.reduce((sum, p) => sum + scores.get(p.cardId) * SLOT_WEIGHTS[p.slot - 1], 0);
```

### 12.5 API

- `GET  /mtg/sets/current` and `GET /mtg/sets/:code` (built) → the set with its phase, dates, timeline entries, pool counts, `picksOpen`, `revealOpen` and `lockedAt`
- `GET  /mtg/sets/:code/cards?rarity=common` (built) → cards, plus `isNew` for a signed-in caller
- `POST /mtg/sets/:code/reviewed` `{ rarity }` (built) → stamps `last_reviewed_at`
- `GET  /mtg/sets/:code/entry` and `PUT /mtg/sets/:code/entry` (built; full replace, validated by the server; 423 after the lock, 409 before picks open)
- `GET  /mtg/communities/:id/progress` (built) → who in the group has finished, counts only; members and super admins
- `GET  /mtg/sets/:code/calendar/lock.ics` and `final.ics` (built) → calendar files, public
- `GET  /mtg/communities/:id/reveal` (built) → everyone's picks by rarity with notes and *Only you* flags, lock badges, the most-picked cards and the Group Mind; members and super admins; 403 `SEALED` before the lock; `?view=summary` returns only the viewer's badges and the Group Mind's mythics
- Creating and joining use NewChums' existing community endpoints; the create form sends `specialization: 'mtg_prediction_challenge'`.
- `GET  /mtg/communities/:id/leaderboard?date=2026-10-05` (built) → the group's standings on the latest or given day, with the Group Mind and random-picks ghosts; members and super admins
- `GET  /mtg/communities/:id/players/:userId` (built) → the player's standing and points history, picks with each card's numbers, the actual top five, the viewer's own picks to compare, and badges; members and super admins; another player's page only after the lock
- `GET  /mtg/communities/:id/cards/:cardId` (built) → a card's latest numbers, its rank on every day, who in the group picked it (after the lock) and links; members and super admins. It replaces the planned `/mtg/sets/:code/cards/:id/history`, because *Picked by* belongs to a group
- `GET  /mtg/players/:userId/badges` → trophy case
- `GET  /mtg/sets/:code/everyone` (built) → the Everyone board by handle, rank and points, for signed-in players; `PUT /mtg/sets/:code/entry/everyone { hidden }` (built) hides or shows your entry at any time
- Admin (built so far): `GET /admin/mtg/sets`, `PUT /admin/mtg/sets/:code` (dates, feed address, status), `POST /admin/mtg/sets/:code/sync`, `POST /admin/mtg/sets/:code/lock`, `POST /admin/mtg/sets/:code/ingest` and `/ingest/paste` (fetch or paste stats, optionally past the checks), `POST /admin/mtg/sets/:code/snapshots/:date/rescore`, `GET /admin/mtg/sets/:code/stats`, `PUT /admin/mtg/cards/:id/stats-match` and `PUT /admin/mtg/cards/:id/voided`, all behind the *MTG Seasons* super-admin page

### 12.6 Integrity rules

- **The lock is enforced by the server clock,** never just the UI: `PUT /entry` returns 423 after `lock_at`.
- **Other players' picks never leave the server before the lock.** The API filters them; React never receives them. After the lock they go only to members of the player's groups and to super admins.
- **Entry validation:** at most five picks per rarity, slots 1 to 5 unique, each card's rarity matching its list, no duplicates, and every card in the set's pool.
- **Snapshots are immutable and reproducible** from the stored raw response, and scoring is idempotent per `snapshot_date`.
- **All times are stored in UTC** and displayed in the viewer's time zone, with ET as the default.

---

## 13. Build plan (suggested dates)

These dates are a general guide, not deadlines.

- **Phase 0 — Thursday, September 10 to Friday, September 11.** Map this spec onto NewChums' actual community model and enter Reality Fracture's dates in the set settings.
- **Phase 1 — about September 11 to 14: the shell and the data.** *Done September 11, 2026.* Add the *Specialized Community* option and dropdown to the Create Community form, the `specialization` column, and the challenge home view for that type; create the new tables; build the Scryfall sync for Reality Fracture; show a read-only card grid.
- **Phase 2 — about September 14 to 17: the pick flow.** *Done September 15, 2026 (the How Scoring Works page moves to Batch 3).* Build the pick wizard, card viewer, pick tray with reordering, autosave, NEW badges, the server-side lock, the Season timeline and the How Scoring Works page.
- **Target — Friday, September 18: open picks.** Invite the group the day the full card list is out.
- **Phase 3 — about September 18 to 28: before the lock.** Add the welcome and lock warning emails, the "who's finished" status, the Reveal page, the Group Mind and entry badges. *Done September 15, 2026 (batches 3 and 4), together with the picks-revealed email.* In the same window, build the 17Lands ingest, scoring and leaderboard against a live set's data — The Hobbit's feed worked in testing on September 10 — so they're proven before Reality Fracture data exists. *Built September 15, 2026 (Batch 5), tested against a stand-in feed shaped like The Hobbit's live response.*
- **Fixed: Friday, September 25 at 6:00 PM ET, the lock.**
- **Phase 4 — about September 29 to 30: go live.** Send the picks-revealed email, point the tested pipeline at Reality Fracture, and publish the first standings Wednesday morning.
- **Phase 5 — about October 1 to 26: during the season.** Add the weekly standings email, player and card pages with charts, "on track" badges, the Everyone board, past seasons and the trophy case.
- **Fixed: Friday, November 13, the final day.** Final standings, badge awards and the season results email.

**If the pick flow isn't ready by about September 24,** collect this season's picks with a simple form (20 ranked choices), import them before the lock, and run the scoring side for real. The group still gets its season, and the polished pick flow debuts with the next set.

---

## 14. Later ideas

- **Fade picks:** one "overrated" call per rarity, scored as 100 minus the Card Score. Half of every pre-release debate is "that card is overhyped" — this puts it on the record.
- **Archetype futures:** rank the 10 two-color pairs and score against 17Lands' color-pair win rates, which come from a separate 17Lands feed.
- **Hype vs. Reality board:** ALSA (how early drafters take a card) against GIH WR — the season's most overrated and underrated cards, and which players saw it coming.
- **Career rating:** a lifetime rating across seasons, next to the trophy case.
- **Rivals:** pick a rival and keep a head-to-head record across seasons.
- **Store leagues with Plans:** store-hosted public groups with a prerelease Plan attached.
- **Mid-season polls (unscored):** "Which of your picks falls furthest this week?"
- **Easier sign-up:** one-tap Google or Discord sign-in, and letting visitors start picking before they create an account. Worth adding if NewChums' normal sign-up puts invited friends off.
- **A standalone landing page:** a short link such as newchums.com/mtg that explains the challenge and lists public challenges. Worth adding if the challenge starts spreading beyond friend groups.

---

## 15. Change log

- **Version 1 — September 10, 2026.** First spec, under the working title "MTG Bets."
- **Version 2 — September 10, 2026.** Recorded the final decisions. Renamed the game MTG Predictions. Groups became NewChums game communities, with no main-navigation tab, and last across seasons. Added the player-facing Season timeline. Cut the emails to five: welcome, lock warning, picks revealed, weekly standings and season results. Expanded badges to 46. Switched the 17Lands feed to `/api/card_data` after finding that the older `card_ratings/data` feed now returns only partial data, and added ingest validation, retries, fallbacks and embargo mode. Dropped the advance-permission steps. Marked the build dates as suggestions. Gave Claude Code the authority to override any specification.
- **Version 3 — September 10, 2026.** Dropped embargo mode: full 17Lands stats show from day one, and 17Lands' 12-day embargo request is deliberately ignored. Settled where the game lives: inside the NewChums app and on NewChums accounts, with its own front door at newchums.com/mtg, a slim game header, one-step sign-in with Google, Discord or an emailed link, picking before sign-in, public pages that open without signing in, game communities hidden from the directory and exempt from regular community emails, and deliberate on-ramps into NewChums. Ruled out a main-navigation tab and a sister site.
- **Version 4 — September 10, 2026.** Simplified where the game lives: the Create Community form (newchums.com/communities/create) gets a *Specialized Community* option with a dropdown, and choosing *MTG Prediction Challenge* creates the community. Its home view becomes the challenge; otherwise it behaves like any community, including the community directory, notifications and NewChums' normal sign-up. Removed the separate front door, slim header, new sign-in options, picking before sign-in and home-page promo card; one-tap sign-in and a landing page moved to Later ideas. Renamed the game MTG Prediction Challenge to match the dropdown.
- **Version 5 — September 11, 2026.** Batch 1 built: migration 123, the *Specialized community* switch on the create form, the directory label, the *MTG Seasons* super-admin page, the Scryfall card sync on the hourly cron with R2 archives, and the challenge home shell (phase card, lock countdown, pool counts, read-only card grid, Season timeline, attribution). Recorded Rob's decisions of September 10: use the 17Lands `api/card_data` feed despite its `notes` field restricting use to 17Lands.com, accepting that it may be blocked; the challenge replaces the community body entirely while the header stays; the Everyone board shows handle, rank and points only; the results share image is a real PNG rendered in the browser; the full pick wizard is built as specified. Mapped the spec onto NewChums as it is: no invite links (the Share button copies the community's address and the join mode controls entry) and no member chat (Discord or WhatsApp links); the feed is an object `{ copyright, notes, data }`, not a list; users are UUIDs; jobs run from the existing hourly cron gated by Eastern time; the card pool counts every non-digital card until the full-gallery date because Scryfall's `booster` flag is unreliable during previews.
- **Version 6 — September 11, 2026.** Community access gained an *Invite only* mode (hidden from the directory, instant join through an invite link, no approval), and *Private* was relabelled *Approval required*. Sections 3, 10.1 and 11 now describe invite links instead of stating that none exist.
- **Version 7 — September 15, 2026.** Batch 2 built: entries, picks and NEW-badge bookkeeping (migration 126), the pick wizard with card grid, filters, card viewer, pick tray with drag and button reordering, autosave, Review with Receipts, and "who's finished" on the group home. Design changes: picks open when previews start instead of on the full-gallery date, with a card that leaves the pool dropped from entries on the player's next visit and the rest renumbered; each rarity's picks are a gapless ordered list; `completed_at` is when the entry most recently became complete rather than first; a first visit to a rarity marks nothing NEW.
- **Version 8 — September 15, 2026.** Batch 3 built: the welcome and lock warning emails with their own preference and one-click unsubscribe, the email log (migration 127), calendar files for the lock and the final day, and the public How Scoring Works page. Design changes: the welcome replaces NewChums' generic approval email for challenge groups instead of being merged into it; no welcome is sent after the lock; season emails reuse NewChums' email outbox, which now accepts rows about a season instead of a plan; calendar links point at newchums.com through a pass-through route.
- **Version 9 — September 15, 2026.** Review fixes for batches 2 and 3: a save now drops cards that left the pool or changed rarity instead of failing, and only players in a challenge group can hold an entry; leaving the pick wizard saves a pending change first; removing a pick can be undone; the lock warning reads each player's progress when it is sent, is skipped for anyone welcomed in the last 12 hours, and is never sent after the lock; a failed welcome can be retried by the next join.
- **Version 10 — September 15, 2026.** Batch 4 built, reviewed and fixed: the lock job, entry badges and Early Bird, the Group Mind, the Reveal page with a summary on the group home, and the picks-revealed email (migration 128). Design changes: the Reveal is shown to a group's members and super admins only, public groups included; joining after the lock stays open to everyone, because no entry can be created or changed after the lock, so a new member without picks follows along; the lock applies the pool rule before it freezes entries, so a pick whose card left the pool is dropped even if the player never came back; groups that exist when the lock job runs have their Group Mind and Early Bird fixed then, while a group formed later has no Early Bird and a Group Mind worked out from its current members; the Group Mind needs picks from two members, and its ties go to more #1 votes, then more players, then collector order; a multicolored card counts toward each of its colors, Rainbow and Loyalist need all 20 picks, and Loyalist ties go to WUBRG order; the lock time can't change once the lock has run; the picks-revealed email goes to every member of a challenge group, including those following along, for 36 hours from the first 9:00 AM ET at least an hour after the lock, names the date of the first standings, and names the group on group honors; *Only you* and *Solo* markers sit under card images rather than over them; the Season timeline's first standings are now exactly 9:00 AM ET the morning after the Arena launch.
- **Version 11 — September 15, 2026.** Batch 5 built: the daily 17Lands ingest with its checks, archive and admin alert, snapshots with Card Scores and entry points, re-scoring, card matching and voiding from *MTG Seasons*, and the group leaderboard with the Group Mind and random-picks ghosts (migration 129). Design changes: a published day keeps its raw response in the database as well as in R2, so re-scoring never depends on the archive; an admin's fetch or paste can replace the day's standings when its data is newer, and can publish past the match and growth checks; a locked pick of a card voided later scores a neutral 50; alerts go to the admin inbox with a Sentry warning, at most once a day; "Day N" counts Eastern days since the Arena launch, so the first standings are Day 1; the leaderboard ships without the Everyone tab and charts, which come with the player pages. Reviewed before shipping: the feed checks now catch a renamed win-rate field and a day of blank win rates, growth is compared only over cards in both days, nothing publishes outside the season window or over a final day, publish-anyway is offered per failed attempt instead of a standing switch, the admin's match queue reads the newest response even when it failed, the card sync stops changing the pool after the lock, and the leaderboard refreshes itself.
- **Version 12 — September 15, 2026.** Batch 5 reviewed after shipping (migration 130). Design changes: an admin can name any day of the season when fetching or pasting, so the final day can be retried once it has ended, as this section has always promised; a dry run rehearses a fetch without publishing, which fills the card-matching queue before the season starts; a bad day sends two emails at most, the first failed check and an end-of-day summary, rather than one; matching or voiding a card re-scores every published day, not just the newest, because a card's score changes on all of them; a card Scryfall stops listing leaves the pool before the lock; and the season timeline no longer promises the weekly and results emails, which arrive with later batches.
- **Version 13 — September 16, 2026.** Batch 6 built: player pages, card pages with charts, and the Everyone board with its opt-out (no migration). Design changes: the card page lives inside a group, `/communities/<slug>/cards/<id>`, because *Picked by* lists the group's members, instead of the set-level card history the API list planned; the Everyone board shows the top 100 plus your own row, calls a player without a handle "Anonymous player", and its *Show me on this board* switch sits on the Everyone tab and works at any time; each past day on a player's chart is ranked as the group was that day, so a late joiner isn't slotted into days before they joined; every chart has a *Show the numbers* table; and "on track" badges wait for Batch 7.
- **Version 14 — September 16, 2026.** Rob's edits to the challenge. The game is renamed **MTG Card Evaluation Challenge** in everything players see (the `mtg_prediction_challenge` specialization value is unchanged). Picks lock before prerelease weekend starts, usually Friday at 6:00 PM ET, and saving a season with a later lock is refused; picks open the moment previews start, so the timeline no longer lists a separate "Picks open" day; and a season runs until the next set comes out, so Reality Fracture now locks Friday, September 25 at 6:00 PM ET and ends Friday, November 13. The lock-warning email says "Picks lock tomorrow" or "today" rather than "tonight". The timeline loses its *Add to calendar* links (the emails keep theirs), shows *Picks lock* in red, and keeps weekly entries at 10:00 AM ET across the clock change. The group home merges the phase card with a blank leaderboard until the season goes live, turns *How scoring works* into a button beside the picks button (and drops it from the pick wizard), renames *Who's finished* to *Pick status*, opens pool cards large when tapped, and loads every rarity at once so tabs switch instantly. Challenge communities lose the header's *Start a plan* button. On any community page, the "people near you" line counts only the community's own hobbies. Decided the same day: before Star Trek is added, groups must be able to show the live season alongside the next season's open picks.
- *Claude Code: add a line here whenever you change the design.*

---

## 16. Sources

- Wizards — [Where to Find Reality Fracture Previews](https://magic.wizards.com/en/news/announcements/where-to-find-reality-fracture-previews) (previews September 8–17, full gallery September 18, release October 2)
- Wizards — [Collecting Reality Fracture](https://magic.wizards.com/en/news/feature/collecting-reality-fracture) (card counts, Play Booster contents, set codes)
- WPN — [Reality Fracture Dates & Details](https://wpn.wizards.com/en/news/reality-fracture-dates-and-details) (prerelease September 25 – October 1)
- Wizards — [MTG Arena Announcements, September 8, 2026](https://magic.wizards.com/en/news/mtg-arena/announcements-september-8-2026) (Arena launch September 29)
- CardGameBase — [When does Reality Fracture release on Arena?](https://cardgamebase.com/reality-fracture-release-time-arena/) (usual 11 AM PT launch; drafts open immediately)
- Playgroup.gg — [MTG release schedule](https://playgroup.gg/sets) (Star Trek, November 13, 2026)
- 17Lands — [Card Data feed](https://www.17lands.com/api/card_data?expansion=HOB&event_type=PremierDraft&time_period=ALL_TIME) (tested September 10, 2026), [usage guidelines](https://www.17lands.com/usage_guidelines), [Public Datasets](https://www.17lands.com/public_datasets), [Using Win Rate Data](https://blog.17lands.com/posts/using-win-rate-data/)
- [MTGA Draft Tool source code](https://github.com/bstaple1/MTGA_Draft_17Lands) (17Lands field names, the older `card_ratings/data` feed, once-a-day data refresh, rate-limit notes)
- [Embargo explainer (Japanese)](https://note.com/taaaaaax/n/n5bb23f1df355) (17Lands' 12-day embargo and what it covers)
- Scryfall — [API documentation](https://scryfall.com/docs/api), [Card objects](https://scryfall.com/docs/api/cards), [Card imagery](https://scryfall.com/docs/api/images), [User-Agent and Accept headers](https://scryfall.com/blog/user-agent-and-accept-header-now-required-on-the-api-225)
- Wizards — [Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy)
