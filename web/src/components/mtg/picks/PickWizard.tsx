"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import LockClockOutlinedIcon from "@mui/icons-material/LockClockOutlined";
import { AppCard, useToast } from "@/components/ui";
import { apiFetch } from "@/lib/apiClient";
import {
  MTG_ATTRIBUTION, MTG_RARITIES, MTG_SLOTS_PER_RARITY, MTG_TOTAL_PICKS, RARITY_LABEL, RARITY_PLURAL,
  type MtgCard, type MtgCardWithNew, type MtgEntryPayload, type MtgRarity, countdown, formatWhen,
} from "../mtgTypes";
import CardGrid from "./CardGrid";
import CardViewer from "./CardViewer";
import PickTray, { SaveStatus, type SaveState } from "./PickTray";
import ReviewStep from "./ReviewStep";
import {
  EMPTY_FILTERS, type CardFilters, type PickState, applyFilters, clampNote, emptyPickState, moveItem, toPutBody, totalPicked,
} from "./pickUtils";

type Step = MtgRarity | "review";
const STEPS: Step[] = [...MTG_RARITIES, "review"];

type Load =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "not_member"; name: string }
  | { kind: "no_season" }
  | { kind: "ready" };

type SetInfo = MtgEntryPayload["set"];
type Viewer = { rarity: MtgRarity; list: MtgCardWithNew[]; index: number };

function pickStateFromEntry(entry: MtgEntryPayload["entry"]): PickState {
  const state = emptyPickState();
  if (!entry) return state;
  for (const r of MTG_RARITIES) {
    state[r] = [...(entry.picks[r] ?? [])].sort((a, b) => a.slot - b.slot).map((p) => ({ card: p.card, note: p.note ?? "" }));
  }
  return state;
}

/**
 * The pick wizard (spec 10.3): Commons, Uncommons, Rares, Mythics, then a
 * review with Receipts. Every change saves on its own a moment later as a
 * full replace of the entry, one request at a time, so a slow save can never
 * land after a newer one. The server is the lock: after it, saves come back
 * 423 and the page turns read-only.
 */
export default function PickWizard() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const toast = useToast();

  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [communityName, setCommunityName] = useState("");
  const [setInfo, setSetInfo] = useState<SetInfo | null>(null);
  const [picks, setPicks] = useState<PickState>(emptyPickState);
  const [dropped, setDropped] = useState<{ name: string; rarity: MtgRarity }[]>([]);
  const [step, setStep] = useState(0);
  const [cards, setCards] = useState<Partial<Record<MtgRarity, MtgCardWithNew[]>>>({});
  const [filters, setFilters] = useState<CardFilters>(EMPTY_FILTERS);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Autosave bookkeeping: `dirty` counts local changes, `saved` is the change
  // count the server has confirmed. They differ while anything is unsaved.
  const [dirty, setDirty] = useState(0);
  const [saved, setSaved] = useState(0);
  const [retryTick, setRetryTick] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const picksRef = useRef(picks);
  const dirtyRef = useRef(dirty);
  const savingRef = useRef(false);

  useEffect(() => { picksRef.current = picks; }, [picks]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Community, season and the player's own entry.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const cRes = await apiFetch(`/communities/${encodeURIComponent(slug)}`, { auth: true });
        const cData = await cRes.json();
        if (cancelled) return;
        if (!cData.ok || !cData.community) { setLoad({ kind: "error", message: "We couldn't find that community." }); return; }
        setCommunityName(cData.community.name ?? "");
        if (cData.community.specialization !== "mtg_prediction_challenge") {
          setLoad({ kind: "error", message: "This community isn't an MTG Prediction Challenge." });
          return;
        }
        if (cData.viewerMembership?.status !== "active") { setLoad({ kind: "not_member", name: cData.community.name ?? "this community" }); return; }

        const sRes = await apiFetch("/mtg/sets/current", { auth: true });
        const sData = await sRes.json();
        if (cancelled) return;
        if (!sData.ok || !sData.set) { setLoad({ kind: "no_season" }); return; }

        const eRes = await apiFetch(`/mtg/sets/${sData.set.code}/entry`, { auth: true });
        const eData = (await eRes.json()) as { ok?: boolean } & MtgEntryPayload;
        if (cancelled) return;
        if (!eRes.ok || !eData.ok) { setLoad({ kind: "error", message: "We couldn't load your picks. Try again in a moment." }); return; }
        setSetInfo(eData.set);
        setPicks(pickStateFromEntry(eData.entry));
        setDropped(eData.entry?.dropped ?? []);
        setLoad({ kind: "ready" });
      } catch {
        if (!cancelled) setLoad({ kind: "error", message: "We couldn't load your picks. Check your connection and try again." });
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const setCode = setInfo?.code ?? null;
  const stepKey = STEPS[step];
  const rarity: MtgRarity | null = stepKey === "review" ? null : stepKey;
  const lockMs = setInfo ? new Date(setInfo.lockAt).getTime() : 0;
  const pastLock = !!setInfo && nowMs >= lockMs;
  const readOnly = !setInfo || setInfo.locked || !setInfo.picksOpen || pastLock;
  const lockCountdown = setInfo && !readOnly ? countdown(setInfo.lockAt, nowMs) : null;

  // Cards for the open step, fetched once per rarity. Opening a rarity also
  // stamps the visit, so NEW ribbons stay for this visit and clear next time.
  const rarityLoaded = rarity ? cards[rarity] !== undefined : true;
  useEffect(() => {
    if (!setCode || !rarity || rarityLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/mtg/sets/${setCode}/cards?rarity=${rarity}`, { auth: true });
        const data = await res.json();
        if (cancelled) return;
        setCards((prev) => ({ ...prev, [rarity]: data.ok && Array.isArray(data.cards) ? (data.cards as MtgCardWithNew[]) : [] }));
        apiFetch(`/mtg/sets/${setCode}/reviewed`, {
          auth: true,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rarity }),
        }).catch(() => {});
      } catch {
        if (!cancelled) setCards((prev) => ({ ...prev, [rarity]: [] }));
      }
    })();
    return () => { cancelled = true; };
  }, [setCode, rarity, rarityLoaded]);

  /** Pull the entry again after the server refused a change, so the screen
   *  shows what is actually saved. */
  const resync = useCallback(async () => {
    if (!setCode) return;
    try {
      const res = await apiFetch(`/mtg/sets/${setCode}/entry`, { auth: true });
      const data = (await res.json()) as { ok?: boolean } & MtgEntryPayload;
      if (!data.ok) return;
      setSetInfo(data.set);
      setPicks(pickStateFromEntry(data.entry));
      setDropped(data.entry?.dropped ?? []);
    } catch { /* keep what is on screen */ }
  }, [setCode]);

  // Autosave: a short pause after the last change, one request at a time.
  useEffect(() => {
    if (!setCode || dirty === saved) return;
    const version = dirty;
    const timer = setTimeout(async () => {
      if (savingRef.current) { setRetryTick((t) => t + 1); return; }
      savingRef.current = true;
      setSaveState("saving");
      try {
        const res = await apiFetch(`/mtg/sets/${setCode}/entry`, {
          auth: true,
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toPutBody(picksRef.current)),
        });
        const data = await res.json().catch(() => ({} as { ok?: boolean; message?: string }));
        if (res.status === 423) {
          setSaved(version);
          setSaveState("locked");
          setSetInfo((s) => (s ? { ...s, locked: true, picksOpen: false } : s));
          toast.info("Picks are locked. Your last saved entry stands.");
          resync();
        } else if (res.ok && data.ok) {
          setSaved(version);
          // Only say Saved when nothing newer is queued behind this save.
          setSaveState(dirtyRef.current === version ? "saved" : "saving");
        } else if (res.status === 400 || res.status === 409) {
          // A change the server will never accept: stop retrying and show
          // what is really saved.
          setSaved(version);
          setSaveState("error");
          toast.error(data.message || "That change couldn't be saved.");
          resync();
        } else {
          setSaveState("error");
          setTimeout(() => setRetryTick((t) => t + 1), 4000);
        }
      } catch {
        setSaveState("error");
        setTimeout(() => setRetryTick((t) => t + 1), 4000);
      } finally {
        savingRef.current = false;
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [setCode, dirty, saved, retryTick, toast, resync]);

  // Warn before leaving with a change still unsaved.
  useEffect(() => {
    if (dirty === saved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, saved]);

  const mutate = useCallback((fn: (p: PickState) => PickState) => {
    setPicks((prev) => fn(prev));
    setDirty((d) => d + 1);
  }, []);

  const addPick = useCallback((card: MtgCard) => {
    mutate((p) => {
      const list = p[card.rarity];
      if (list.length >= MTG_SLOTS_PER_RARITY || list.some((s) => s.card.id === card.id)) return p;
      return { ...p, [card.rarity]: [...list, { card, note: "" }] };
    });
  }, [mutate]);

  const removePick = useCallback((r: MtgRarity, cardId: string) => {
    mutate((p) => ({ ...p, [r]: p[r].filter((s) => s.card.id !== cardId) }));
  }, [mutate]);

  const replacePick = useCallback((card: MtgCard, slotIndex: number) => {
    mutate((p) => {
      const list = p[card.rarity];
      if (list.some((s) => s.card.id === card.id) || !list[slotIndex]) return p;
      const next = list.slice();
      next[slotIndex] = { card, note: "" };
      return { ...p, [card.rarity]: next };
    });
  }, [mutate]);

  const reorder = useCallback((r: MtgRarity, from: number, to: number) => {
    mutate((p) => ({ ...p, [r]: moveItem(p[r], from, to) }));
  }, [mutate]);

  const setNote = useCallback((r: MtgRarity, index: number, note: string) => {
    mutate((p) => {
      if (!p[r][index]) return p;
      const next = p[r].slice();
      next[index] = { ...next[index], note: clampNote(note) };
      return { ...p, [r]: next };
    });
  }, [mutate]);

  const goToStep = useCallback((next: number) => {
    setStep(next);
    setFilters((f) => ({ ...EMPTY_FILTERS, sort: f.sort }));
    setViewer(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const rarityCards = rarity ? cards[rarity] : undefined;
  const pickedIds = useMemo(() => new Set(rarity ? picks[rarity].map((s) => s.card.id) : []), [picks, rarity]);
  const pickedSlotById = useMemo(
    () => new Map(rarity ? picks[rarity].map((s, i) => [s.card.id, i + 1] as const) : []),
    [picks, rarity],
  );
  const visible = useMemo(() => (rarityCards ? applyFilters(rarityCards, filters, pickedIds) : []), [rarityCards, filters, pickedIds]);
  const newCount = useMemo(() => (rarityCards ? rarityCards.filter((c) => c.isNew).length : 0), [rarityCards]);

  // The grid's open handler stays stable so memoised tiles skip re-rendering
  // when a pick changes; it reads the current list through a ref.
  const visibleRef = useRef(visible);
  useEffect(() => { visibleRef.current = visible; }, [visible]);
  const openFromGrid = useCallback((index: number) => {
    const list = visibleRef.current;
    const card = list[index];
    if (card) setViewer({ rarity: card.rarity, list, index });
  }, []);
  const openCard = useCallback((card: MtgCard) => {
    const pool = cards[card.rarity];
    const list: MtgCardWithNew[] = pool && pool.some((c) => c.id === card.id) ? pool : [card];
    setViewer({ rarity: card.rarity, list, index: Math.max(0, list.findIndex((c) => c.id === card.id)) });
  }, [cards]);

  if (load.kind === "loading") {
    return <Typography variant="body2" color="text.secondary" sx={{ py: 8, textAlign: "center" }}>Loading your picks…</Typography>;
  }
  if (load.kind !== "ready" || !setInfo) {
    const message =
      load.kind === "error" ? load.message
        : load.kind === "not_member" ? `Join ${load.name} to make your picks.`
          : load.kind === "no_season" ? "No season is set up yet."
            : "Something went wrong.";
    return (
      <AppCard>
        <Stack spacing={2} alignItems="flex-start">
          <Typography variant="body1" fontWeight={600}>{message}</Typography>
          <Button component={Link} href={`/communities/${slug}`} variant="outlined" startIcon={<ArrowBackRoundedIcon />} sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5 }}>
            Back to the community
          </Button>
        </Stack>
      </AppCard>
    );
  }

  const total = totalPicked(picks);
  const inPreviews = setInfo.phase === "previews" || setInfo.phase === "upcoming";

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }} sx={{ pb: { xs: rarity && !readOnly ? 11 : 2, md: 2 } }}>
      <Box>
        <Button component={Link} href={`/communities/${slug}`} variant="text" size="small" startIcon={<ArrowBackRoundedIcon />} sx={{ textTransform: "none", fontWeight: 600, color: "text.secondary", ml: -1, mb: 0.5, boxShadow: "none", "&:hover": { bgcolor: "action.hover", boxShadow: "none" } }}>
          {communityName || "Back"}
        </Button>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "flex-end" }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: "1.625rem", sm: "2rem" }, lineHeight: 1.15 }}>Your picks</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {setInfo.name}. One entry counts in every group you&apos;re in.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.25} alignItems="center" useFlexGap flexWrap="wrap">
            <Chip label={`${total} of ${MTG_TOTAL_PICKS}`} color={total === MTG_TOTAL_PICKS ? "success" : "default"} sx={{ fontWeight: 700 }} />
            {lockCountdown && (
              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "text.secondary" }}>
                <LockClockOutlinedIcon sx={{ fontSize: 16 }} />
                <Typography variant="caption" fontWeight={700}>Locks in {lockCountdown}</Typography>
              </Stack>
            )}
            <Box sx={{ display: { xs: "none", md: "block" } }}><SaveStatus state={saveState} /></Box>
          </Stack>
        </Stack>
      </Box>

      {readOnly && (
        <Alert severity="info" sx={{ borderRadius: 2.5 }}>
          {setInfo.locked || pastLock
            ? `Picks locked ${formatWhen(setInfo.lockAt)}. This is your final entry.`
            : "Picks aren't open yet. They open when previews begin."}
        </Alert>
      )}
      {dropped.length > 0 && (
        <Alert severity="warning" onClose={() => setDropped([])} sx={{ borderRadius: 2.5 }}>
          {dropped.map((d) => d.name).join(", ")} left the card pool, so {dropped.length === 1 ? "it was" : "they were"} taken off your picks.
        </Alert>
      )}

      <Box sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
        <Tabs
          value={step}
          onChange={(_, v: number) => goToStep(v)}
          variant="scrollable"
          allowScrollButtonsMobile
          aria-label="Pick steps"
          sx={{ minHeight: 44, "& .MuiTabs-indicator": { height: 3, borderRadius: 2 } }}
        >
          {STEPS.map((s) => (
            <Tab
              key={s}
              label={s === "review" ? `Review ${total}/${MTG_TOTAL_PICKS}` : `${RARITY_LABEL[s]} ${picks[s].length}/${MTG_SLOTS_PER_RARITY}`}
              sx={{ textTransform: "none", fontWeight: 700, minHeight: 44, fontSize: "0.875rem" }}
            />
          ))}
        </Tabs>
      </Box>

      {rarity ? (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1fr) 290px" }, gap: 2.5, alignItems: "start" }}>
          <AppCard>
            <Typography variant="body1" sx={{ fontWeight: 700, lineHeight: 1.45 }}>
              Pick the 5 {RARITY_PLURAL[rarity]} you think will post the highest GIH WR on 17Lands. Your #1 counts 1.5×.
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 0.75, mb: 2 }}>
              {inPreviews && (
                <Typography variant="caption" color="text.secondary">
                  {setInfo.pool[rarity]} {RARITY_PLURAL[rarity]} revealed so far. Previews are still running.
                </Typography>
              )}
              {newCount > 0 && <Chip label={`${newCount} new`} size="small" sx={{ height: 20, fontSize: "0.6875rem", fontWeight: 800, bgcolor: "#1E8E5A", color: "#fff" }} />}
            </Stack>
            <CardGrid
              cards={rarityCards}
              visible={visible}
              filters={filters}
              onFiltersChange={setFilters}
              pickedSlotById={pickedSlotById}
              onOpen={openFromGrid}
              pluralLabel={RARITY_PLURAL[rarity]}
            />
          </AppCard>
          <PickTray
            rarity={rarity}
            slots={picks[rarity]}
            locked={readOnly}
            saveState={saveState}
            lockCountdown={lockCountdown}
            onReorder={(from, to) => reorder(rarity, from, to)}
            onRemove={(i) => { const s = picks[rarity][i]; if (s) removePick(rarity, s.card.id); }}
            onOpenCard={openCard}
          />
        </Box>
      ) : (
        <ReviewStep
          picks={picks}
          locked={readOnly}
          onReorder={reorder}
          onRemove={(r, i) => { const s = picks[r][i]; if (s) removePick(r, s.card.id); }}
          onNote={setNote}
          onEdit={(r) => goToStep(MTG_RARITIES.indexOf(r))}
        />
      )}

      <Stack direction="row" spacing={1.5} justifyContent="space-between">
        <Button variant="outlined" disabled={step === 0} onClick={() => goToStep(step - 1)} sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, minWidth: 110 }}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="contained" onClick={() => goToStep(step + 1)} sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2.5, boxShadow: "none", minWidth: 110 }}>
            Next: {STEPS[step + 1] === "review" ? "Review" : RARITY_LABEL[STEPS[step + 1] as MtgRarity]}
          </Button>
        ) : (
          <Button component={Link} href={`/communities/${slug}`} variant="contained" sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2.5, boxShadow: "none", minWidth: 110 }}>
            Done
          </Button>
        )}
      </Stack>

      <Typography variant="caption" color="text.disabled" sx={{ display: "block", lineHeight: 1.5, px: 0.5 }}>{MTG_ATTRIBUTION}</Typography>

      {viewer && (
        <CardViewer
          open
          cards={viewer.list}
          index={viewer.index}
          onIndexChange={(i) => setViewer((v) => (v ? { ...v, index: i } : v))}
          onClose={() => setViewer(null)}
          picks={picks[viewer.rarity]}
          locked={readOnly}
          onAdd={addPick}
          onRemove={(cardId) => removePick(viewer.rarity, cardId)}
          onReplace={replacePick}
        />
      )}
    </Stack>
  );
}
