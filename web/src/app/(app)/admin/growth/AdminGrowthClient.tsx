"use client";

import { useCallback, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
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
 * The growth-experiment research view (docs/Growth_Experiment_Plan.md §6.3):
 * the §4 funnel with its pre-registered thresholds beside the actuals, the
 * invitees-per-plan distribution, the generation table with lineage, and the
 * repeat-host / host-signal counts. Stages 1-2 live in Meta and GA, marked
 * as such rather than pretended at; email opens are explicitly unmeasured
 * this round.
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
  return v === null ? "–" : `${Math.round(v * 100)}%`;
}

/** Actual-vs-threshold chip: green at or above, amber below, grey when no
 *  data yet. Small n is the norm for this experiment, so the chip carries
 *  the n rather than hiding it. */
function ThresholdChip({ rate, threshold, n }: { rate: number | null; threshold: number; n: number }) {
  const color = rate === null || n === 0 ? "default" : rate >= threshold ? "success" : "warning";
  return (
    <Chip
      size="small"
      color={color}
      variant={color === "default" ? "outlined" : "filled"}
      label={`${pct(rate)} vs ${Math.round(threshold * 100)}% healthy · n=${n}`}
      sx={{ fontWeight: 600 }}
    />
  );
}

function StageCard({
  stage,
  title,
  children,
}: {
  stage: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <AppCard sx={{ height: "100%" }}>
      <Typography variant="overline" sx={{ color: "primary.dark", fontWeight: 700, letterSpacing: 1 }}>
        {stage}
      </Typography>
      <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", mb: 1 }}>
        {title}
      </Typography>
      {children}
    </AppCard>
  );
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
    void load();
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
    { label: "0", value: inv.b0 },
    { label: "1–2", value: inv.b1_2 },
    { label: "3–5", value: inv.b3_5 },
    { label: "6–9", value: inv.b6_9 },
    { label: "10+", value: inv.b10p },
  ];
  const invMax = Math.max(1, ...invBuckets.map((b) => b.value));

  return (
    <Stack spacing={3} sx={{ pb: 4 }}>
      <Box>
        <Typography variant="h4" fontWeight={800} sx={{ fontSize: { xs: "1.5rem", sm: "1.75rem" } }}>
          Growth experiment
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 640 }}>
          The pre-registered funnel from docs/Growth_Experiment_Plan.md, last {data.windowDays} days.
          QA plans and research-excluded accounts are out of every number below. Stages 1–2 (ad
          views, clicks, visit-to-account rate) read from Meta Ads Manager and GA, not here.
        </Typography>
      </Box>

      {/* Cohort funnel */}
      <AppCard>
        <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", mb: 0.5 }}>
          Accounts and activated hosts by source
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Stage 3: activated = published a real plan within 7 days of signup. Healthy:{" "}
          {Math.round(t.stage3_activation_rate * 100)}%+.
        </Typography>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 420 }}>
            <TableHead>
              <TableRow>
                <TableCell>Source</TableCell>
                <TableCell align="right">Accounts</TableCell>
                <TableCell align="right">Activated hosts</TableCell>
                <TableCell align="right">Rate</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.cohorts.map((c) => (
                <TableRow key={c.cohort}>
                  <TableCell sx={{ fontWeight: 600 }}>{c.cohort}</TableCell>
                  <TableCell align="right">{c.accounts}</TableCell>
                  <TableCell align="right">{c.activatedHosts}</TableCell>
                  <TableCell align="right">
                    <Chip
                      size="small"
                      variant="outlined"
                      color={
                        c.activationRate === null
                          ? "default"
                          : c.activationRate >= t.stage3_activation_rate
                            ? "success"
                            : "warning"
                      }
                      label={pct(c.activationRate)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </AppCard>

      {/* Stage tiles */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <StageCard stage="Stage 4" title="Invited people who respond">
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {data.stage4.responded} of {data.stage4.invites} invited people RSVP&rsquo;d.
            </Typography>
            <ThresholdChip rate={data.stage4.responseRate} threshold={t.stage4_response_rate} n={data.stage4.invites} />
            <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1 }}>
              {data.stage4.opensNote}
            </Typography>
          </StageCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <StageCard stage="Stage 5" title="Plans that actually happened">
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {data.stage5.happened} of {data.stage5.pastPlans} past plans ({data.stage5.definition}).
            </Typography>
            <ThresholdChip rate={data.stage5.happenedRate} threshold={t.stage5_happened_rate} n={data.stage5.pastPlans} />
          </StageCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <StageCard stage="Stage 6" title="Guests showing host-curiosity">
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {data.stage6.withSignal} of {data.stage6.guests} guest-origin accounts visited the
              create page, drafted, or published within 30 days.
            </Typography>
            <ThresholdChip rate={data.stage6.signalRate} threshold={t.stage6_signal_rate} n={data.stage6.guests} />
          </StageCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <StageCard stage="Stage 7" title="Hosts who host again">
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {data.stage7.repeatHosts} of {data.stage7.hosts} hosts published a second plan within
              60 days of their first.
            </Typography>
            <ThresholdChip rate={data.stage7.repeatRate} threshold={t.stage7_repeat_rate} n={data.stage7.hosts} />
          </StageCard>
        </Grid>
      </Grid>

      {/* Invitees per plan */}
      <AppCard>
        <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", mb: 0.5 }}>
          Invitees per plan
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {inv.plans} real plans in the window, mean {inv.mean} invitees. A plan with zero invitees
          adds no fuel to the loop, however satisfying to its creator.
        </Typography>
        <Stack spacing={0.75} sx={{ maxWidth: 420 }}>
          {invBuckets.map((b) => (
            <Stack key={b.label} direction="row" spacing={1.5} alignItems="center">
              <Typography variant="caption" sx={{ width: 32, textAlign: "right", fontWeight: 600 }}>
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
              <Typography variant="caption" sx={{ width: 24, fontWeight: 600 }}>
                {b.value}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </AppCard>

      {/* Generations */}
      <AppCard>
        <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem", mb: 0.5 }}>
          Generations
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Gen-0 arrived by ad, post, or on their own; gen-1 through a gen-0 host&rsquo;s plan, and so
          on. Zero gen-2 in this window is the expected result even if the theory is true.
        </Typography>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 360 }}>
            <TableHead>
              <TableRow>
                <TableCell>Generation</TableCell>
                <TableCell align="right">Accounts</TableCell>
                <TableCell align="right">Activated hosts</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.generations.map((g) => (
                <TableRow key={g.gen}>
                  <TableCell sx={{ fontWeight: 600 }}>Gen {g.gen}</TableCell>
                  <TableCell align="right">{g.accounts}</TableCell>
                  <TableCell align="right">{g.activated_hosts}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>

        {data.lineage.length > 0 && (
          <>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 2.5, mb: 1 }}>
              Newest invite-originated accounts
            </Typography>
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 560 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Account</TableCell>
                    <TableCell>Arrived via</TableCell>
                    <TableCell>Origin plan</TableCell>
                    <TableCell>Origin host</TableCell>
                    <TableCell align="right">Hosted?</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.lineage.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell sx={{ fontWeight: 600 }}>{r.username ?? "(no handle)"}</TableCell>
                      <TableCell>{r.method}</TableCell>
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
