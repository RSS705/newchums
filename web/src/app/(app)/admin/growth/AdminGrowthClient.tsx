"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { AppCard } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";

/**
 * The growth-experiment research view (docs/Growth_Experiment_Plan.md §6.3).
 *
 * Rewritten for legibility after Rob's review of the first version: it was
 * too compressed to read cold. This version mirrors the experiment doc's
 * own structure, all seven stages in order, each framed as the question it
 * answers, with a "what this tests" line, the plain numbers, and the
 * pre-registered healthy bar spelled out in words. Stages 1-2 appear as
 * explicit cards pointing at Meta/GA rather than being a footnote, so the
 * funnel reads whole.
 */

type Growth = {
  ok: boolean;
  windowDays: number;
  thresholds: Record<string, number>;
  cohorts: { cohort: string; accounts: number; activatedHosts: number; activationRate: number | null }[];
  inviteesPerPlan: { b0: number; b1_2: number; b3_5: number; b6_9: number; b10p: number; plans: number; mean: number };
  stage4: { invites: number; responded: number; responseRate: number | null; opensNote: string };
  stage5: { pastPlans: number; happened: number; happenedRate: number | null; definition: string };
  stage6: { guests: number; withSignal: number; signalRate: number | null };
  stage7: { hosts: number; repeatHosts: number; repeatRate: number | null };
  generations: { gen: number; accounts: number; activated_hosts: number }[];
  lineage: { username: string | null; createdAt: string; method: string; originPlan: string | null; originHost: string | null; activated: boolean }[];
};

function pct(v: number | null): string {
  return v === null ? "no data yet" : `${Math.round(v * 100)}%`;
}

/** Verdict chip in words, not code: Healthy / Below healthy / No data yet. */
function VerdictChip({ rate, threshold, n }: { rate: number | null; threshold: number; n: number }) {
  if (rate === null || n === 0) {
    return <Chip size="small" variant="outlined" label="No data yet" />;
  }
  return rate >= threshold ? (
    <Chip size="small" color="success" label="Healthy" sx={{ fontWeight: 600 }} />
  ) : (
    <Chip size="small" color="warning" label="Below healthy" sx={{ fontWeight: 600 }} />
  );
}

/** One stage of the funnel, framed exactly as the experiment doc frames it:
 *  the question, what a miss would mean, then the numbers. */
function Stage({
  n,
  question,
  tests,
  children,
}: {
  n: number;
  question: string;
  tests: string;
  children: React.ReactNode;
}) {
  return (
    <AppCard>
      <Stack direction="row" spacing={1.75} alignItems="flex-start">
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            bgcolor: "primary.main",
            color: "primary.contrastText",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            fontSize: "1rem",
            flexShrink: 0,
            mt: 0.25,
          }}
        >
          {n}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", lineHeight: 1.35 }}>
            {question}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5, lineHeight: 1.6 }}>
            {tests}
          </Typography>
          {children}
        </Box>
      </Stack>
    </AppCard>
  );
}

/** The big readable number line: "3 of 20 responded (15%)" + verdict. */
function NumberLine({
  numerator,
  denominator,
  noun,
  rate,
  threshold,
  healthyText,
}: {
  numerator: number;
  denominator: number;
  noun: string;
  rate: number | null;
  threshold: number;
  healthyText: string;
}) {
  return (
    <Stack spacing={0.75}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography sx={{ fontWeight: 800, fontSize: "1.5rem", lineHeight: 1 }}>
          {denominator === 0 ? "–" : `${numerator} of ${denominator}`}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {noun}
          {denominator > 0 && rate !== null ? ` (${pct(rate)})` : ""}
        </Typography>
        <VerdictChip rate={rate} threshold={threshold} n={denominator} />
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {healthyText}
      </Typography>
    </Stack>
  );
}

/** Plain-words name for a cohort key. */
function cohortLabel(key: string): { label: string; hint: string } {
  if (key === "organic") return { label: "Found us on their own", hint: "no ad, no invite; typed the address or searched" };
  if (key === "invited") return { label: "Invited to someone's plan", hint: "arrived through an invite or share link (gen-1+)" };
  if (key === "unattributed") return { label: "Before tracking existed", hint: "accounts that predate attribution (5 Aug 2026)" };
  if (key.startsWith("manual")) return { label: key, hint: "manually classified" };
  return { label: key, hint: "an ad: source/medium/creative from its link" };
}

export default function AdminGrowthClient() {
  const [data, setData] = useState<Growth | null>(null);
  // Starts true and only ever flips false, so the effect never sets state
  // synchronously on mount (the lint rule that catches cascading renders).
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/admin/research/growth", { auth: true });
      const d = (await res.json()) as Growth;
      if (d.ok) setData(d);
    } catch {
      /* surface stays on the loading/error state */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Deferred one microtask so no state write can land synchronously
    // inside the mount effect (the cascading-renders lint rule).
    void Promise.resolve().then(load);
  }, [load]);

  if (loading && !data) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }
  if (!data) {
    return (
      <Typography color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
        Could not load the research view.
      </Typography>
    );
  }

  const t = data.thresholds;
  const inv = data.inviteesPerPlan;
  const invBuckets = [
    { label: "0 invitees", value: inv.b0 },
    { label: "1–2", value: inv.b1_2 },
    { label: "3–5", value: inv.b3_5 },
    { label: "6–9", value: inv.b6_9 },
    { label: "10 or more", value: inv.b10p },
  ];
  const invMax = Math.max(1, ...invBuckets.map((b) => b.value));
  const totalAccounts = data.cohorts.reduce((a, c) => a + c.accounts, 0);

  return (
    <Stack spacing={3} sx={{ pb: 4, maxWidth: 900 }}>
      <Box>
        <Typography variant="h4" fontWeight={800} sx={{ fontSize: { xs: "1.5rem", sm: "1.75rem" } }}>
          Growth experiment
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Live numbers for the pre-registered ad test, covering the last {data.windowDays} days.
        </Typography>
      </Box>

      {/* How to read this page */}
      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2, sm: 2.5 },
          borderRadius: 3,
          borderColor: "primary.light",
          bgcolor: "#fff7ed",
        }}
      >
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.75 }}>
          How to read this page
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.7 }}>
          The experiment watches a chain: someone sees an ad, clicks it, makes an account,
          publishes a plan, their guests respond, the gathering happens, a guest gets curious about
          hosting, and hosts host again. Each numbered card below asks one link of that chain as a
          question and compares the real number against the &ldquo;healthy&rdquo; bar that was
          written down in the plan before any money was spent.{" "}
          <Box component="span" sx={{ fontWeight: 600 }}>
            Most cards will say &ldquo;no data yet&rdquo; until the ads run, and the later stages
            need weeks before they mean anything.
          </Box>{" "}
          That is the experiment working, not something broken: plans are scheduled 1&ndash;3 weeks
          out, and guest behaviour lags the gathering. Verdict is rendered at the end of week 8,
          not before.
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} flexWrap="wrap" useFlexGap>
          <Chip size="small" color="success" label="Healthy" sx={{ fontWeight: 600 }} />
          <Typography variant="caption" sx={{ alignSelf: "center", color: "text.secondary" }}>
            at or above the bar
          </Typography>
          <Chip size="small" color="warning" label="Below healthy" sx={{ fontWeight: 600 }} />
          <Typography variant="caption" sx={{ alignSelf: "center", color: "text.secondary" }}>
            under it
          </Typography>
          <Chip size="small" variant="outlined" label="No data yet" />
          <Typography variant="caption" sx={{ alignSelf: "center", color: "text.secondary" }}>
            nothing to count so far
          </Typography>
        </Stack>
      </Paper>

      {/* Stages 1-2 live off-site; say so as real cards so the funnel reads whole. */}
      <Stage
        n={1}
        question="Of everyone who sees the ad, how many click it?"
        tests="Purely the pitch and the audience; nothing about the product. Healthy is 0.8% or better, and below 0.4% after about $50 the plan says pause and rewrite the ad."
      >
        <Chip size="small" variant="outlined" label="Read this in Meta Ads Manager" />
      </Stage>

      <Stage
        n={2}
        question="Of everyone who lands on the site, how many create an account?"
        tests="The landing experience: does the page deliver what the ad promised? Healthy is 4% or better. Visits come from Meta and GA; the accounts they produced appear in stage 3 below."
      >
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip size="small" variant="outlined" label="Visits: Meta / GA" />
          <Typography variant="body2" color="text.secondary">
            Accounts created here in the window: <b>{totalAccounts}</b>
          </Typography>
        </Stack>
      </Stage>

      {/* Stage 3: the test */}
      <Stage
        n={3}
        question="Of everyone who creates an account, how many publish a plan within 7 days?"
        tests={`This is the test. It asks whether the ads reached people who actually have a gathering to organize, and whether the product let them organize it. Healthy is ${Math.round(t.stage3_activation_rate * 100)}% or better. A miss can mean the wrong people clicked, or the right people got stuck; only the interviews can tell those apart.`}
      >
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 520 }}>
            <TableHead>
              <TableRow>
                <TableCell>Where they came from</TableCell>
                <TableCell align="right">Accounts</TableCell>
                <TableCell align="right">Published a plan in 7 days</TableCell>
                <TableCell align="right">Verdict</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.cohorts.map((c) => {
                const meta = cohortLabel(c.cohort);
                return (
                  <TableRow key={c.cohort}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {meta.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {meta.hint}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{c.accounts}</TableCell>
                    <TableCell align="right">
                      {c.activatedHosts}
                      {c.activationRate !== null && c.accounts > 0 ? ` (${pct(c.activationRate)})` : ""}
                    </TableCell>
                    <TableCell align="right">
                      <VerdictChip rate={c.activationRate} threshold={t.stage3_activation_rate} n={c.accounts} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Each ad creative shows up as its own row once its link is clicked, named
          source/medium/creative. QA plans and the research-excluded accounts are out of every
          number on this page.
        </Typography>
      </Stage>

      <Stage
        n={4}
        question="Of the people a host invites, how many respond?"
        tests={`The guest side: invitation emails landing, the invite link making sense to someone who has never heard of NewChums, and saying yes being easy. These are friends invited by friends, so this should be high; a low number means something mechanical broke. Healthy is ${Math.round(t.stage4_response_rate * 100)}% or better responding with any RSVP.`}
      >
        <NumberLine
          numerator={data.stage4.responded}
          denominator={data.stage4.invites}
          noun="invited people responded"
          rate={data.stage4.responseRate}
          threshold={t.stage4_response_rate}
          healthyText={`Healthy: ${Math.round(t.stage4_response_rate * 100)}%+ respond. ${data.stage4.opensNote}`}
        />
      </Stage>

      <Stage
        n={5}
        question="Of published plans, how many gatherings actually happen?"
        tests={`The product's core promise. Counted as: the plan's date passed and at least one person confirmed attendance through the 24-hour check. Healthy is ${Math.round(t.stage5_happened_rate * 100)}% or better; a gathering that never happens shows no guest anything worth copying.`}
      >
        <NumberLine
          numerator={data.stage5.happened}
          denominator={data.stage5.pastPlans}
          noun="past plans demonstrably happened"
          rate={data.stage5.happenedRate}
          threshold={t.stage5_happened_rate}
          healthyText={`Healthy: ${Math.round(t.stage5_happened_rate * 100)}%+ of past plans.`}
        />
      </Stage>

      <Stage
        n={6}
        question="Of guests who made accounts, how many show host-curiosity within 30 days?"
        tests={`The loop's engine in miniature: does being a guest plant the seed? Counted as any host-shaped act, visiting the create page, starting a draft, or publishing, within 30 days of signing up, for accounts that arrived through an invite or share link. Healthy is ${Math.round(t.stage6_signal_rate * 100)}% or better. This is the closest thing to the loop this window can see; full guest-to-host conversion takes months.`}
      >
        <NumberLine
          numerator={data.stage6.withSignal}
          denominator={data.stage6.guests}
          noun="guest-origin accounts showed a host signal"
          rate={data.stage6.signalRate}
          threshold={t.stage6_signal_rate}
          healthyText={`Healthy: ${Math.round(t.stage6_signal_rate * 100)}%+ show any signal.`}
        />
      </Stage>

      <Stage
        n={7}
        question="Of activated hosts, how many publish a second plan within 60 days?"
        tests={`Retention. A host who plans once exposes their group once; a host who plans monthly is a standing advertisement to the same people until one of them converts. Healthy is ${Math.round(t.stage7_repeat_rate * 100)}% or better.`}
      >
        <NumberLine
          numerator={data.stage7.repeatHosts}
          denominator={data.stage7.hosts}
          noun="hosts published a second plan within 60 days"
          rate={data.stage7.repeatRate}
          threshold={t.stage7_repeat_rate}
          healthyText={`Healthy: ${Math.round(t.stage7_repeat_rate * 100)}%+ host again.`}
        />
      </Stage>

      <Divider />

      {/* Invitees per plan */}
      <AppCard>
        <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", mb: 0.5 }}>
          How many people does each plan invite?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
          Any published plan counts as a good outcome for its host, but only plans with invitees
          add fuel to the loop, because guests are how the product spreads. {inv.plans} real plans
          in the window, averaging {inv.mean} invitees each.
        </Typography>
        <Stack spacing={0.75} sx={{ maxWidth: 460 }}>
          {invBuckets.map((b) => (
            <Stack key={b.label} direction="row" spacing={1.5} alignItems="center">
              <Typography variant="caption" sx={{ width: 84, textAlign: "right", fontWeight: 600 }}>
                {b.label}
              </Typography>
              <Box sx={{ flex: 1, height: 18, bgcolor: "action.hover", borderRadius: 1, overflow: "hidden" }}>
                <Box
                  sx={{
                    width: `${(b.value / invMax) * 100}%`,
                    height: "100%",
                    bgcolor: "primary.main",
                    opacity: 0.85,
                    borderRadius: 1,
                  }}
                />
              </Box>
              <Typography variant="caption" sx={{ width: 56, fontWeight: 600 }}>
                {b.value} {b.value === 1 ? "plan" : "plans"}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </AppCard>

      {/* Generations */}
      <AppCard>
        <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", mb: 0.5 }}>
          The loop itself: generations
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.7 }}>
          Generation 0 found NewChums through an ad, a post, or on their own. Generation 1 arrived
          through a gen-0 host&rsquo;s plan. Generation 2 through a gen-1 host&rsquo;s, and so on.
          The theory the whole experiment tests is that this table eventually grows on its own.
          Seeing zero in gen 2 during this window is the <b>expected</b> result even if the theory
          is true; it takes months, not weeks.
        </Typography>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 400 }}>
            <TableHead>
              <TableRow>
                <TableCell>Generation</TableCell>
                <TableCell align="right">Accounts</TableCell>
                <TableCell align="right">Became hosts themselves</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.generations.map((g) => (
                <TableRow key={g.gen}>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {g.gen === 0 ? "Gen 0 (arrived directly)" : `Gen ${g.gen} (through a gen-${g.gen - 1} host)`}
                  </TableCell>
                  <TableCell align="right">{g.accounts}</TableCell>
                  <TableCell align="right">{g.activated_hosts}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>

        {data.lineage.length > 0 && (
          <>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2.5, mb: 0.5 }}>
              Who arrived through whose plan
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
              The newest accounts that arrived through an invitation or share link, and whether
              they have gone on to host anything yet.
            </Typography>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 560 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Account</TableCell>
                    <TableCell>Came in via</TableCell>
                    <TableCell>The plan that brought them</TableCell>
                    <TableCell>That plan&rsquo;s host</TableCell>
                    <TableCell align="right">Hosted since?</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.lineage.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ fontWeight: 600 }}>{r.username ?? "(no handle)"}</TableCell>
                      <TableCell>
                        {r.method === "backfill_invite"
                          ? "invite (historical)"
                          : r.method}
                      </TableCell>
                      <TableCell>{r.originPlan ?? "–"}</TableCell>
                      <TableCell>{r.originHost ?? "–"}</TableCell>
                      <TableCell align="right">
                        {r.activated ? (
                          <Chip size="small" color="success" label="Yes" />
                        ) : (
                          <Chip size="small" variant="outlined" label="Not yet" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </>
        )}
      </AppCard>
    </Stack>
  );
}
