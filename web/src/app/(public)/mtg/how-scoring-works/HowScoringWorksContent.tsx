"use client";

import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AppCard } from "@/components/ui";
import SeasonTimeline from "@/components/mtg/SeasonTimeline";
import { MTG_ATTRIBUTION, SLOT_MULTIPLIERS, type MtgSetPayload } from "@/components/mtg/mtgTypes";

const EASTERN = "America/New_York";

function easternLong(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-US", { timeZone: EASTERN, weekday: "long", month: "long", day: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: EASTERN, hour: "numeric", minute: "2-digit" }).format(d);
  return `${date} at ${time} ET`;
}

function easternDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: EASTERN, weekday: "long", month: "long", day: "numeric" }).format(new Date(iso));
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box component="section">
      <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: "1.125rem", sm: "1.25rem" }, lineHeight: 1.3, mb: 0.75 }}>{title}</Typography>
      <Typography component="div" variant="body1" color="text.secondary" sx={{ lineHeight: 1.7, "& strong": { color: "text.primary" } }}>{children}</Typography>
    </Box>
  );
}

/** The How Scoring Works copy from the spec (10.9), with the season dates
 *  filled in from the current set when there is one. */
export default function HowScoringWorksContent({ set }: { set: MtgSetPayload | null }) {
  const firstStandings = set?.timeline.find((t) => t.key === "first_standings")?.at ?? null;
  return (
    <Box sx={{ bgcolor: "background.default", py: { xs: 4, sm: 7 } }}>
      <Container maxWidth="md">
        <Stack spacing={{ xs: 3, sm: 4 }}>
          <Box>
            <Typography variant="overline" sx={{ fontWeight: 800, color: "primary.main", letterSpacing: "0.08em" }}>MTG Prediction Challenge</Typography>
            <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: "2rem", sm: "2.75rem" }, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
              How scoring works
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1.25, lineHeight: 1.7, maxWidth: 640 }}>
              Before each new Magic set launches on MTG Arena, you pick the 5 cards you think will perform best at each rarity, commons, uncommons, rares and mythics, in order. Once the set is being played, we check how every card is actually doing and score your picks.
            </Typography>
          </Box>

          <AppCard>
            <Stack spacing={3}>
              <Section title="Where the data comes from">
                Card performance comes from 17Lands.com, a community project that collects anonymized game data from MTG Arena players who use its tracker. We use Premier Draft data from all 17Lands users and update once a day, around 9 AM ET. Card images and details come from Scryfall.
              </Section>
              <Section title="The stat: GIH WR">
                &ldquo;Games in Hand Win Rate&rdquo; is how often decks win in games where the card was in the opening hand or drawn. It&apos;s the stat Limited players quote when they argue about cards. Across 17Lands players an average card sits in the mid-50s; standouts are 60% and up.
              </Section>
              <Section title="Card Score, from 0 to 100">
                Every day we rank each card against the other cards of the same rarity. The best common scores 100, the worst common scores 0, and everything in between is spread evenly. A Card Score of 87 means the card is doing better than 87% of the other cards at its rarity.
              </Section>
              <Section title="Your order matters">
                <Box component="span" sx={{ display: "block", mb: 1.5 }}>Put the card you&apos;re most sure about at #1.</Box>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: { xs: 0.75, sm: 1.25 } }}>
                  {SLOT_MULTIPLIERS.map((m, i) => (
                    <Box key={m} sx={{ textAlign: "center", py: { xs: 1, sm: 1.5 }, borderRadius: 2, border: "1px solid", borderColor: i === 0 ? "primary.main" : "divider", bgcolor: i === 0 ? "primary.light" : "transparent" }}>
                      <Typography sx={{ fontWeight: 800, color: "text.primary", fontSize: { xs: "0.9375rem", sm: "1.0625rem" } }}>#{i + 1}</Typography>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>×{m}</Typography>
                    </Box>
                  ))}
                </Box>
              </Section>
              <Section title="Your score">
                <strong>Card Score × multiplier,</strong> added up across all 20 picks. Random picks average about 1,000 points; a perfect, hindsight-is-20/20 entry scores about 1,940.
              </Section>
              <Section title="Small samples">
                In the first few days some cards have only a handful of games. Until 17Lands publishes a win rate for a card, it scores a neutral 50. After that, we blend its win rate toward its rarity&apos;s average until it&apos;s been played a lot, so one lucky day can&apos;t make a card look like a bomb.
              </Section>
              <Section title="Standings change every day">
                Your score is recalculated from all the data so far, so it can go down as well as up. Your card&apos;s win rate can rise while its rank falls if other cards rise faster. The first few days swing a lot; things usually settle by week two.
              </Section>
              <Section title="Season dates">
                {set ? (
                  <>
                    Picks lock <strong>{easternLong(set.dates.lockAt)}</strong>
                    {set.dates.arenaReleaseAt ? `, just before ${set.name} hits Arena` : ""}.
                    {firstStandings ? ` Standings update daily from ${easternDate(firstStandings)}.` : ""}
                    {` The season ends ${easternDate(set.dates.finalAt)}; the standings that morning are final, and badges are awarded.`}
                  </>
                ) : (
                  "Picks lock the night before the set launches on Arena. Standings update daily from the next morning, and the season ends about four weeks later, when the standings that morning are final and badges are awarded."
                )}
              </Section>
              <Section title="Badges">
                Earn badges for great calls, and a few for glorious misses. Some are awarded when picks lock and the rest on the final day, and everyone can see them.
              </Section>
              <Section title="Ties">
                Ties go to the higher total from your four #1 picks, then to whoever finalized their picks first.
              </Section>
              <Section title="Fine print">
                Only cards from the main set count, at their printed rarity: no Special Guests, Commander cards or basic lands. Empty slots score 0. If a card never shows up in Arena draft, that pick scores a neutral 50.
              </Section>
            </Stack>
          </AppCard>

          {set && set.timeline.length > 0 && <SeasonTimeline entries={set.timeline} setName={set.name} setCode={set.code} />}

          <Typography variant="caption" color="text.disabled" sx={{ display: "block", lineHeight: 1.6 }}>{MTG_ATTRIBUTION}</Typography>
        </Stack>
      </Container>
    </Box>
  );
}
