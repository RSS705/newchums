# NewChums Growth Experiment: the $200 ad test and the loop measurement

**Written 6 August 2026. Status: pre-registered.** The thresholds in section 4 and the decision
rules in section 5 were set down *before* any money was spent, so the results can be read honestly
instead of rationalized after the fact. Changing them mid-test defeats the point; if one turns out
to be badly calibrated, note it, finish the read anyway, and recalibrate for the next round.

This document is self-contained and supersedes any earlier ad-test sketches elsewhere. If you are
Claude Code: the build work is in section 6, the ground rules are in section 3, and the rest is
context you should read first — the build only makes sense against the theory it exists to measure.

---

## 1. The theory being tested

NewChums helps hosts organize real-world gatherings. The growth theory has always been:

1. A host creates a plan and invites their group — often 6-10 people, but any plan counts.
2. The guests meet the product by opening the invite and RSVPing.
3. Some of those guests, weeks or months later, have their own thing to organize — a birthday, a
   game night, a potluck — and remember the tool.
4. They host, invite *their* group, and the cycle repeats.

If each host eventually produces more than one new host, the system grows on its own. That is the
bet the product was built on, and this experiment is the first structured attempt to observe it
with strangers — people with no social connection to the founder.

**What ~$200 can and cannot tell us.** The budget buys roughly 150-600 site visits, which becomes
roughly 8-25 accounts, which becomes roughly 2-8 people who publish a real plan, which exposes
roughly 15-60 guests. Step 3 — a guest becoming a host — takes weeks and happens to only a fraction
of guests, so within this test's window it will produce somewhere between zero and three people.
**Zero second-generation hosts is the expected result even if the theory is true.** The test is
therefore designed to measure the early links of the chain tightly and to capture *leading
indicators* of the later links, not to pretend $200 can measure the full loop. The full loop gets
measured by the mechanism in section 2, which runs on every user forever, not just this cohort.

This is deliberately a pattern-detector, not a growth engine: a small spend that either produces a
verifiable pattern worth funding properly, or a specific, named reason it didn't.

**One piece of arithmetic that shapes everything below.** For self-sustaining growth,
(guests exposed per host) × (fraction of guests who ever host) must exceed 1. At 8 guests per
gathering, that needs ~12.5% of guests to eventually host — a high bar for a single exposure, a
plausible one across many, because the same book club sees the product monthly until someone's
occasion arrives. So the loop compounds through *repeated* exposure, which makes two things as
load-bearing as guest conversion: hosts hosting again (each repeat re-exposes the group), and plans
actually happening (a plan that fizzles exposes no one to anything worth copying). The funnel below
watches all three.

## 2. Two experiments, running at once

**Experiment A — can strangers be bought and activated?** The ads. Does the pitch make a stranger
click, does the site turn them into an account, and do they publish a real plan? This tests whether
a top of funnel exists at all, and what it costs.

**Experiment B — does the loop propagate?** This one does not care where hosts came from. It needs
no ad money — it needs *generation attribution* (section 6) and time. Every account is tagged with
how it arrived and, if it arrived through an invitation, which plan and host brought it in, chained
indefinitely. Then every gathering that happens, from any source, forever, is a data point on
guest→host conversion.

Experiment B starts paying immediately: the existing users — the MTG cube group, the family
gathering group — are hosts whose guests are already flowing through the product. The moment
attribution exists (including backfill from historical invite records, which are already in the
database), their lineage becomes data. For free, before the first ad runs.

Keeping A and B separate matters because they fail differently. If A fails, acquisition is the
problem — the pitch, the audience, or the price. If B fails, the product's growth engine is the
problem regardless of how cheaply hosts can be bought. Run them as one blended experiment and a
failure can't be assigned to either.

## 3. Definitions and ground rules

- **Activated host:** anyone who publishes a plan. Deliberately no minimum invitee count — any plan
  is a good outcome for the host who made it. But **invitees-per-plan is tracked as a
  distribution**, because a plan with zero invitees, however satisfying to its creator, adds no
  fuel to the loop. The two numbers answer different questions; keep both visible.
- **Generation:** gen-0 arrived via a named acquisition source (paid ad, community post, organic).
  Gen-1 arrived through a gen-0 host's invite or share link. Gen-2 through a gen-1 host's. And so
  on.
- **Source:** every account carries its origin — which ad creative (via UTM), which community post,
  which invite — alongside its generation.
- **Host-signal:** a guest account doing anything host-shaped: visiting the create page, starting a
  draft, publishing. The leading indicator for the conversion that takes months to complete.
- **QA-flagged plans stay excluded from every research metric**, exactly as they already are from
  the existing KPIs. They are feature-testing artifacts, invisible to everyone but super-admins,
  and nothing about this experiment changes their treatment.
- **Founder accounts are excluded as subjects but kept as sources.** The founder's own accounts
  never count as signups, activated hosts, or retention data — the founder hosting proves nothing.
  But plans those accounts host are real exposure events with real guests, and those guests'
  lineage is the purest Experiment-B data available. Exclude the account from every numerator; keep
  its downstream tree intact. Implemented as a super-admin-settable flag on the user, **not** an
  email list in this document — this repo is public, and personal addresses do not belong in it.
- **Historical test accounts are deleted, not pattern-excluded**, before the experiment starts.
  Deletion is preferred because address-pattern exclusions could someday catch a legitimate user,
  and a smaller honest dataset needs no ongoing carve-outs. Deletion is preceded by the read-only
  audit in section 6, since a test account may hold RSVPs on real plans.
- Observation window: 8 weeks from first spend. Plans are typically scheduled 1-3 weeks out and
  guest behavior lags the gathering, so early reads on late-funnel stages are structurally
  meaningless — see the timeline in section 9 for when each stage becomes readable.

## 4. The funnel, step by step

Each stage: what is being counted, what it actually tests, the healthy range, and what a miss
means. The healthy numbers are informed priors, not physics — but they were written down before
launch, which is what makes them useful.

**Stage 1 — Of everyone who sees the ad, how many click it?**
Tests whether the message stops the right person mid-scroll. Nothing about the product; purely the
pitch and the audience.
*Healthy:* 0.8% or better (about 1 click per 125 views). *Alarm:* below 0.4% after ~$50 — pause and
rewrite the ad rather than spending through it. This is the cheapest possible failure: it costs
$50 and teaches you the wording, not the product, is wrong.

**Stage 2 — Of everyone who lands on the site, how many create an account?**
Tests the landing experience: does what they see match what the ad promised, can they feel what the
product does before being asked for anything, and is the ask reasonable?
*Healthy:* 4% or better (1 in 25). *A miss means:* the page, not the product — the ad's promise and
the page's first screen disagree, or the account ask arrives before the visitor has seen value.
Fixable by iteration; fix and resume.

**Stage 3 — Of everyone who creates an account, how many publish a plan within 7 days?**
**This is the test.** It asks: did the ads reach people who actually have a gathering to organize,
and does the product let them organize it? An account that never plans anything is worth almost
nothing to the growth theory.
*Healthy:* 15% or better. *A miss means* one of two very different things: the wrong people clicked
(curious, but nothing to plan) or the right people clicked and something stopped them. The funnel
cannot distinguish these — only the interviews in section 8 can. This is the stage where the
interview layer is not optional.

**Stage 4 — Of the people a host invites, how many respond?**
Tests the guest side: do invitation emails land in inboxes (deliverability), does the invite link
make sense to someone who has never heard of NewChums, and is saying "yes" easy? These are friends
being invited by friends, so response should be *high* — a low number here means something
mechanical is broken, not that the idea is wrong.
*Healthy:* 50%+ of invite emails opened; 40%+ of invited people respond (any RSVP counts).

**Stage 5 — Of published plans, how many gatherings actually happen?**
Tests the product's core promise: plans that actually happen. The attendance-check and wrap-up data
answer this directly — a thing almost no other tool can measure about itself.
*Healthy:* 70% or better of plans whose date has passed. *A miss means* the product is generating
plans but not gatherings, and a gathering that never happens shows no guest anything worth copying.

**Stage 6 — Of guests who made accounts, how many show any host-curiosity within 30 days?**
Tests the loop's engine in miniature: does being a guest plant the seed? Full guest→host conversion
takes months; this watches for the first visible twitch of it — a visit to the create page, a
draft, a published plan.
*Healthy:* 10% or better showing any signal. This is the closest thing to the loop the $200 window
can see.

**Stage 7 — Of activated hosts, how many publish a second plan within 60 days?**
Tests retention, which the arithmetic in section 1 says is as load-bearing as anything else. A
host who plans once and leaves exposes their group once; a host who plans monthly is a standing
advertisement to the same 8 people until one of them converts.
*Healthy:* 30% or better.

**What $200 actually produces when everything is healthy** — written down now so a passing grade
is not misread as a failing one:

| | Expected range |
|---|---|
| Ad views | 20,000-50,000 |
| Clicks | 150-600 |
| Accounts | 8-25 |
| Activated hosts | 2-8 |
| Guests invited | 15-60 |
| Guests who RSVP | 8-35 |
| Guests showing host-curiosity | 1-5 |
| Second-generation published plans | 0-3 |

Yes, full success looks like a dozen signups and three hosts. That is the shape of a well-run small
test, not a verdict on the product.

## 5. Reading the result

**Green — fund the next round.** Within 8 weeks: **3 or more ad-sourced activated hosts, their
invitees responding at 40%+, and cost per activated host at $75 or less.** That is the "verifiable
pattern": strangers can be bought at a knowable price, and their groups engage. The next tranche
($1,000-2,000) buys the 50-100-host cohort that can finally measure guest→host conversion as a
rate instead of an anecdote. Do not wait for gen-2 statistics from this round; they cannot come at
this sample size.

**Yellow — fix and re-run.** Stage 1, 2, or 4 misses with the later stages untested or healthy.
These are execution problems (wording, landing page, email plumbing), not theory problems. Patch
the broken stage and re-run the remaining budget. Money spent while a yellow condition is known
and unfixed is wasted.

**Red — the honest abandon signals.** Only two results in this test genuinely threaten the thesis:

1. **Stage 3 near zero across two different ad creatives**, *and* the interviews show no pull —
   people understood the product and had no use for it ("neat, but my group chat is fine").
2. **Stage 4 fails mechanically sound** — invitations land, the link works, and invited friends
   still won't respond. The core mechanic rejected by the people it's for.

Either of these, confirmed by conversations and not just counts, is a real answer. Anything else —
including zero second-generation hosts — is a pivot or a patch, not a verdict.

## 6. Build before a dollar moves (the Claude Code work)

Order matters for the first two: cleanup happens before the attribution backfill, so deleted test
accounts never enter the lineage tree.

1. **Account cleanup and the internal flag.** (a) A read-only audit of the known test accounts
   (list supplied out-of-band, not in this document): for each, report plans hosted, RSVPs held —
   flagging any on non-QA plans — and chat messages, so deletion holds no surprises. Then
   hard-delete them; hard delete is the established path for pre-existing test data. (b) An
   internal flag on users, settable from super-admin, that removes the account from every research
   numerator while preserving its hosted plans as exposure sources, per the ground rule in
   section 3. Rob applies it to his own two accounts.
2. **Source and generation attribution.** UTM parameters captured at landing and stamped onto the
   account at creation; every invite-originated account linked to the inviting plan and its host;
   lineage chained so any account's generation is computable. **Backfill from existing invite
   records** wherever the data allows, so current users seed Experiment B on day one. This is the
   single hard prerequisite: without the chain, the question this whole experiment exists to answer
   is unanswerable no matter how the ads perform.
3. **A research view for this experiment.** There is an existing KPI/funnel page in the super-admin
   area — adapt it, rework it, or add a new super-admin tab, whichever is cleanest. It must show:
   the section-4 funnel by source cohort with the healthy thresholds visible beside the actuals;
   the invitees-per-plan distribution; a generation table (accounts and activated hosts per
   generation, with lineage drill-down); repeat-host counts; and guest host-signal counts. QA
   exclusion everywhere.
4. **Host-signal events for guest accounts**, if not already tracked: create-page visits and draft
   starts, attributable to accounts that originated as invitees.
5. **Email deliverability confirmed before spend** — SPF, DKIM, DMARC in order on the sending
   domain. The entire loop rides on invitation emails reaching inboxes, and a silent deliverability
   problem doesn't present as failure; it presents as *uninterpretable* failure.

### Build status (added 7 August 2026; thresholds above unchanged)

Recorded here per this document's own rule: changes get noted, never silently made.

1. **Cleanup and internal flag — done.** Rob removed all test accounts by hand (6 Aug); the
   candidate scan found zero remaining pattern matches. `users.research_excluded` exists with a
   super-admin toggle on /admin/chums (audited), and both founder accounts are flagged in
   production. The read-only audit tool is `scripts/research_account_audit.sh`.
2. **Attribution — live (migration 115, 6 Aug).** Invite/share arrivals stamp server-side in
   GET /events/:id; ad/organic arrivals stamp via first-touch capture + POST /me/attribution.
   Generation is computed by walking `origin_host_user_id`, never stored. **Backfill ran against
   production 7 Aug** (migration 116, after the cleanup confirmation, per the ordering rule):
   9 existing accounts gained invite lineage, seeding Experiment B before any spend.
3. **Research view — live** at /admin/growth: all seven stages framed as the §4 questions with
   the frozen thresholds beside actuals, invitees-per-plan distribution, generation table with
   lineage, QA and founder exclusions applied everywhere.
4. **Host-signal — live.** `create_page_visited` records once per session; drafts and publishes
   were already derivable.
5. **Deliverability — verified in order (6 Aug):** DKIM present for the Resend selector, SPF
   correct on the send subdomain with bounce MX, DMARC published (p=none, monitoring mode).

**Measurement note (stage 4):** email open tracking is not enabled this round (free Resend plan;
pixel opens are inflated by mail prefetching anyway). Stage 4 is judged on the 40% response-rate
threshold alone; the 50% open threshold is recorded as unmeasured, not failed. Revisit if a
future round adds Resend webhooks.

**Still human work before spend:** ad creatives (3-4 variants) with UTM-tagged links
(`?utm_source=facebook&utm_medium=paid&utm_campaign=aug-test&utm_content=<variant>`; each
`utm_content` becomes its own funnel row), Meta campaign setup per §7, and the §8 interview
emails during the run.

## 7. The campaign

- **One platform: Meta (Facebook feed + Instagram).** No split across platforms — at this budget
  every split halves the signal.
- **Staged: ~$50, then ~$150.** Run 3-4 ad variants for 4-5 days, pick the winner by cost per
  account, put the remaining budget behind it for ~10 days.
- **The variant test is the value proposition, not the landing page.** One creative leads with
  coordination pain ("Herding ten people into one plan shouldn't take 47 messages"). One leads with
  the turnout promise ("Everyone confirms the day before — no ghost RSVPs"). Which one pulls is
  knowledge that outlives this test: it says what the brand should lead with everywhere.
- **Audience: broad occasion-interest targeting** — board games, D&D, book clubs, potluck, dinner
  party, poker night, family reunion — Ontario or Canada-wide, English, 25-55. No premium for
  hyper-local: the product is a link tool, so the loop travels through relationships, not
  proximity. Let the ad's wording do the selecting.
- **Optimize delivery for account creation; judge the campaign on activated hosts.** The platform
  needs a conversion event with some volume to aim at; the experiment's real KPI has too little.
- **Landing: wherever a stranger can touch a real-feeling plan fastest** and start making their own
  with the fewest steps.
- **On click volume:** the same $200 can buy 2-3× the clicks if the campaign is optimized for
  cheap clicks instead of conversions. Resist it. Cheap clicks are accidental thumbs; they inflate
  stage 1 and crater stage 2, and the only number that compounds is cost per *person who does
  something*.
- **Optional free supplement:** honest posts in relevant hobby communities, tagged as their own
  source so they never blend into the paid cohort. They test a different population (self-selected
  enthusiasts vs. interrupted scrollers) and cost nothing but time.

## 8. The interview layer

At this sample size, five conversations outweigh any dashboard. The funnel says *where* people
stopped; only people say *why*.

- **Every ad-sourced account with no published plan by day 4** gets a personal, one-line email from
  Rob — not a template blast: *"Hi — I make NewChums. You signed up a few days ago; what were you
  hoping to plan?"* The replies to this one question are the difference between "wrong audience"
  and "product gap" at stage 3.
- **Every activated host** gets a short thank-you and an offer of a 5-minute call. What almost
  stopped them is the sharpest product feedback available anywhere.
- Keep a running log of replies next to the funnel numbers. The verdict in section 5 is rendered on
  both together.

## 9. Timeline

- **Week 0:** build (section 6), deliverability check, ad creatives written, this document's
  thresholds frozen.
- **Weeks 1-2:** spend. Day ~5: pick the winning creative. Day ~14: spend complete; stages 1-2
  readable.
- **Weeks 3-4:** first gatherings happen. Stages 3-5 become readable. Non-activator interviews
  underway.
- **Weeks 5-8:** guest behavior accrues. Stages 6-7 become readable.
- **End of week 8:** verdict against section 5. Not before — a day-10 judgment on a funnel whose
  back half physically cannot have data yet is the most likely way this experiment gets misread.

## 10. Where each failure points

| If this breaks | It most likely means | The move |
|---|---|---|
| Stage 1 (clicks) | Pitch or audience wrong | New wording/audience; $50 lesson |
| Stage 2 (accounts) | Landing page mismatch or premature ask | Iterate the page; consider letting visitors build before signing up |
| Stage 3 (plans) | Wrong people, or right people blocked | Interviews decide which; then creative pivot or product fix |
| Stage 4 (RSVPs) | Deliverability or guest friction | Mechanical fix; re-run |
| Stage 5 (happened) | Product not delivering turnout | Core product work before any more spend |
| Stage 6 (host-curiosity) | No moment invites a guest to become a host | Guest-side product work: the post-RSVP and post-gathering moments |
| Stage 7 (repeat hosting) | Retention leak | Re-engagement work; the loop cannot compound through a leaky bucket |

The experiment is a success if it ends with exactly one of these rows circled — or none, and a
green light. The only failed outcome is an ambiguous one, and every design choice above exists to
prevent that.
