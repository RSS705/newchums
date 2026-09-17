"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Snackbar from "@mui/material/Snackbar";
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
  type MtgCard, type MtgCardWithNew, type MtgEntryPayload, type MtgRarity, countdown, formatWhenZoned,
} from "../mtgTypes";
import CardGrid from "./CardGrid";
import CardViewer from "./CardViewer";
import PickTray, { SaveStatus, type SaveState } from "./PickTray";
import ReviewStep from "./ReviewStep";
import {
  EMPTY_FILTERS, type CardFilters, type PickSlot, type PickState, applyFilters, emptyPickState, fitNote, moveItem, toPutBody, totalPicked,
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
type Dropped = { name: string; rarity: MtgRarity };
type PutResponse = { ok?: boolean; error?: string; message?: string; dropped?: Dropped[]; unchanged?: boolean; entry?: { revision?: number } };

const LIVE_TEXT: Record<SaveState, string> = {
  idle: "",
  saving: "Saving your picks",
  saved: "Picks saved",
  error: "Your latest change isn't saved yet. Retrying.",
  locked: "Picks are locked",
  signedOut: "You've been signed out, so changes can't be saved",
};

/** Screen-reader-only styles for the single save status announcement. */
const VISUALLY_HIDDEN = {
  position: "absolute" as const, width: "1px", height: "1px", margin: "-1px", padding: 0,
  overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" as const, border: 0,
};

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
 * review with Receipts.
 *
 * Saving: every change bumps a counter and saves the whole entry about 0.7 s
 * later. Saves run strictly one after another on a promise chain, so an older
 * save can never land after a newer one. Leaving the wizard (Done, the back
 * link, another page in the app, hiding the tab, closing it) flushes a
 * pending change straight away, with keepalive when the page is going away.
 * The server is the lock: a 423 turns the page read-only.
 *
 * Each save names the revision of the picks this page last loaded or saved.
 * If another tab or device has saved since, the server refuses it (409
 * STALE) and the page loads the newer picks instead of erasing them. Coming
 * back to the tab reloads the picks when nothing here is waiting to save.
 */
export default function PickWizard() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const router = useRouter();
  const toast = useToast();

  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [communityName, setCommunityName] = useState("");
  const [setInfo, setSetInfo] = useState<SetInfo | null>(null);
  const [picks, setPicks] = useState<PickState>(emptyPickState);
  const [dropped, setDropped] = useState<Dropped[]>([]);
  const [step, setStep] = useState(0);
  const [cards, setCards] = useState<Partial<Record<MtgRarity, MtgCardWithNew[]>>>({});
  const [filters, setFilters] = useState<CardFilters>(EMPTY_FILTERS);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [undo, setUndo] = useState<{ rarity: MtgRarity; index: number; slot: PickSlot } | null>(null);
  const [cardsFailed, setCardsFailed] = useState<MtgRarity | null>(null);
  const [cardsAttempt, setCardsAttempt] = useState(0);

  // `dirty` counts local changes; `saved` is the count the server confirmed.
  const [dirty, setDirty] = useState(0);
  const [saved, setSaved] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [signedOut, setSignedOut] = useState(false);

  const picksRef = useRef(picks);
  const dirtyRef = useRef(0);
  const savedRef = useRef(0);
  const setCodeRef = useRef<string | null>(null);
  const readOnlyRef = useRef(true);
  const blockedRef = useRef(false);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveOnceRef = useRef<(keepalive: boolean) => Promise<void>>(async () => {});
  const resyncRef = useRef<() => Promise<void>>(async () => {});
  /** The stored picks' revision this page builds on; undefined until loaded. */
  const baseRef = useRef<number | undefined>(undefined);
  const inFlightRef = useRef(false);
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => { picksRef.current = picks; }, [picks]);

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
          setLoad({ kind: "error", message: "This community isn't an MTG Card Evaluation Challenge." });
          return;
        }
        if (cData.viewerMembership?.status !== "active") { setLoad({ kind: "not_member", name: cData.community.name ?? "this community" }); return; }

        const sRes = await apiFetch("/mtg/sets/current", { auth: true });
        const sData = await sRes.json();
        if (cancelled) return;
        // No season is a 404 NOT_FOUND; anything else that isn't ok is a failure to load.
        if ((sRes.status === 404 && sData.error === "NOT_FOUND") || (sData.ok && !sData.set)) { setLoad({ kind: "no_season" }); return; }
        if (!sRes.ok || !sData.ok) { setLoad({ kind: "error", message: "We couldn't load the season. Try again in a moment." }); return; }

        const eRes = await apiFetch(`/mtg/sets/${sData.set.code}/entry`, { auth: true });
        const eData = (await eRes.json()) as { ok?: boolean } & MtgEntryPayload;
        if (cancelled) return;
        if (!eRes.ok || !eData.ok) { setLoad({ kind: "error", message: "We couldn't load your picks. Try again in a moment." }); return; }
        baseRef.current = eData.entry?.revision ?? 0;
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
  const readOnly = !setInfo || setInfo.locked || !setInfo.picksOpen || pastLock || signedOut;
  const lockCountdown = setInfo && !readOnly ? countdown(setInfo.lockAt, nowMs) : null;

  useEffect(() => { setCodeRef.current = setCode; }, [setCode]);
  useEffect(() => { readOnlyRef.current = readOnly; }, [readOnly]);

  // Cards for the open step, fetched once per rarity. Opening a rarity also
  // stamps the visit, so NEW ribbons stay for this visit and clear next time.
  // A failed load stamps nothing and offers a retry, rather than showing an
  // empty rarity.
  const rarityLoaded = rarity ? cards[rarity] !== undefined : true;
  useEffect(() => {
    if (!setCode || !rarity || rarityLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/mtg/sets/${setCode}/cards?rarity=${rarity}`, { auth: true });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.ok || !Array.isArray(data.cards)) { setCardsFailed(rarity); return; }
        setCardsFailed(null);
        setCards((prev) => ({ ...prev, [rarity]: data.cards as MtgCardWithNew[] }));
        apiFetch(`/mtg/sets/${setCode}/reviewed`, {
          auth: true,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rarity }),
        }).catch(() => {});
      } catch {
        if (!cancelled) setCardsFailed(rarity);
      }
    })();
    return () => { cancelled = true; };
  }, [setCode, rarity, rarityLoaded, cardsAttempt]);

  /** Show what is really saved after the server changed or refused a save,
   *  or after coming back to the tab. A change made while the request was out
   *  wins: it saves against the revision it was made on. */
  const resync = useCallback(async () => {
    const code = setCodeRef.current;
    if (!code) return;
    const startedAt = dirtyRef.current;
    try {
      const res = await apiFetch(`/mtg/sets/${code}/entry`, { auth: true });
      const data = (await res.json()) as { ok?: boolean } & MtgEntryPayload;
      if (!data.ok) return;
      setSetInfo(data.set);
      if (dirtyRef.current !== startedAt) return;
      baseRef.current = data.entry?.revision ?? 0;
      const next = pickStateFromEntry(data.entry);
      picksRef.current = next;
      setPicks(next);
      if (data.entry?.dropped?.length) setDropped(data.entry.dropped);
    } catch { /* keep what is on screen */ }
  }, []);

  /** Queue a save behind any save already running. Resolves when it is done. */
  const queueSave = useCallback((keepalive = false): Promise<void> => {
    if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    chainRef.current = chainRef.current.then(() => saveOnceRef.current(keepalive)).catch(() => {});
    return chainRef.current;
  }, []);

  const saveOnce = useCallback(async (keepalive: boolean) => {
    const code = setCodeRef.current;
    const version = dirtyRef.current;
    if (!code || blockedRef.current || version === savedRef.current) return;
    inFlightRef.current = true;
    setSaveState("saving");
    const markSaved = () => { savedRef.current = Math.max(savedRef.current, version); setSaved(savedRef.current); };
    // What the screen shows once a refused save has been replaced by the stored picks.
    const settled = () => setSaveState(dirtyRef.current === savedRef.current ? "saved" : "saving");
    try {
      const res = await apiFetch(`/mtg/sets/${code}/entry`, {
        auth: true,
        method: "PUT",
        keepalive,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...toPutBody(picksRef.current), baseRevision: baseRef.current }),
      });
      const data = (await res.json().catch(() => ({}))) as PutResponse;
      if (res.ok && data.ok) {
        if (typeof data.entry?.revision === "number") baseRef.current = data.entry.revision;
        markSaved();
        if (data.dropped && data.dropped.length > 0) {
          setDropped(data.dropped);
          // Only replace the screen if nothing newer was typed meanwhile; a
          // newer save will drop the same cards on its own.
          if (dirtyRef.current === version) await resyncRef.current();
        }
        setSaveState(dirtyRef.current === savedRef.current ? "saved" : "saving");
        return;
      }
      if (res.status === 401) {
        blockedRef.current = true;
        setSignedOut(true);
        setSaveState("signedOut");
        return;
      }
      if (res.status === 423) {
        blockedRef.current = true;
        markSaved();
        setSaveState("locked");
        setSetInfo((s) => (s ? { ...s, locked: true, picksOpen: false } : s));
        toast.info("Picks are locked. Your last saved picks stand.");
        await resyncRef.current();
        return;
      }
      if (res.status === 409 && data.error === "STALE") {
        // Another tab or device saved first. Its picks are newer, so show them
        // rather than overwrite them with this page's older list.
        markSaved();
        toast.info("Your picks were changed in another tab or on another device, so this page now shows those. Make your last change again if you still want it.");
        await resyncRef.current();
        settled();
        return;
      }
      if (res.status === 400 || res.status === 403 || res.status === 404 || res.status === 409) {
        // A change the server will not take: stop retrying and show what is saved.
        markSaved();
        toast.error(data.message || "That change couldn't be saved.");
        await resyncRef.current();
        settled();
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch {
      setSaveState("error");
      if (retryRef.current) clearTimeout(retryRef.current);
      retryRef.current = setTimeout(() => { retryRef.current = null; void queueSave(); }, 4000);
    } finally {
      inFlightRef.current = false;
    }
  }, [toast, queueSave]);

  useEffect(() => { saveOnceRef.current = saveOnce; }, [saveOnce]);
  useEffect(() => { resyncRef.current = resync; }, [resync]);

  // Debounced autosave after the last change.
  useEffect(() => {
    if (!setCode || dirty === saved) return;
    debounceRef.current = setTimeout(() => { debounceRef.current = null; void queueSave(); }, 700);
    return () => {
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null; }
    };
  }, [setCode, dirty, saved, queueSave]);

  // Flush when the tab is hidden, when the page goes away, and when the
  // wizard unmounts because the player moved elsewhere in the app. Coming
  // back to the tab picks up changes made elsewhere meanwhile.
  useEffect(() => {
    const unsaved = () => dirtyRef.current !== savedRef.current && !blockedRef.current;
    // Behind a save still on its way, a second save would carry the same
    // revision and be refused, so it waits its turn.
    const sendNow = () => {
      if (!unsaved()) return;
      if (inFlightRef.current) void queueSave(true);
      else void saveOnceRef.current(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        if (unsaved()) void queueSave(true);
        return;
      }
      const awayMs = hiddenAtRef.current === null ? 0 : Date.now() - hiddenAtRef.current;
      hiddenAtRef.current = null;
      if (!unsaved() && !blockedRef.current && !inFlightRef.current) void resyncRef.current();
      // After a long time away, list the cards again for any revealed since.
      if (awayMs > 10 * 60000) { setCards({}); setCardsFailed(null); }
    };
    window.addEventListener("pagehide", sendNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", sendNow);
      document.removeEventListener("visibilitychange", onVisibility);
      if (retryRef.current) clearTimeout(retryRef.current);
      if (unsaved()) void queueSave(true);
    };
  }, [queueSave]);

  // Warn before a reload or close with a change still unsaved.
  useEffect(() => {
    if (dirty === saved || signedOut) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, saved, signedOut]);

  /** Leave for another page after the pending change is saved (up to 4 s). */
  const leaveTo = useCallback((href: string) => (e: React.MouseEvent) => {
    if (dirtyRef.current === savedRef.current || blockedRef.current) return;
    e.preventDefault();
    void Promise.race([queueSave(), new Promise((resolve) => setTimeout(resolve, 4000))]).then(() => router.push(href));
  }, [queueSave, router]);

  /** Apply a change. A change that returns the same state is not a change,
   *  so it neither saves nor moves the tie-break time. */
  const mutate = useCallback((fn: (p: PickState) => PickState) => {
    if (readOnlyRef.current) return;
    const prev = picksRef.current;
    const next = fn(prev);
    if (next === prev) return;
    picksRef.current = next;
    setPicks(next);
    dirtyRef.current += 1;
    setDirty(dirtyRef.current);
  }, []);

  const addPick = useCallback((card: MtgCard) => {
    mutate((p) => {
      const list = p[card.rarity];
      if (list.length >= MTG_SLOTS_PER_RARITY || list.some((s) => s.card.id === card.id)) return p;
      return { ...p, [card.rarity]: [...list, { card, note: "" }] };
    });
  }, [mutate]);

  const removePick = useCallback((r: MtgRarity, cardId: string) => {
    const index = picksRef.current[r].findIndex((s) => s.card.id === cardId);
    if (index < 0 || readOnlyRef.current) return;
    const slot = picksRef.current[r][index];
    mutate((p) => ({ ...p, [r]: p[r].filter((s) => s.card.id !== cardId) }));
    setUndo({ rarity: r, index, slot });
  }, [mutate]);

  const undoRemove = useCallback(() => {
    if (!undo) return;
    const { rarity: r, index, slot } = undo;
    mutate((p) => {
      if (p[r].length >= MTG_SLOTS_PER_RARITY || p[r].some((s) => s.card.id === slot.card.id)) return p;
      const next = p[r].slice();
      next.splice(Math.min(index, next.length), 0, slot);
      return { ...p, [r]: next };
    });
    setUndo(null);
  }, [undo, mutate]);

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
    mutate((p) => {
      const moved = moveItem(p[r], from, to);
      return moved === p[r] ? p : { ...p, [r]: moved };
    });
  }, [mutate]);

  const setNote = useCallback((r: MtgRarity, index: number, note: string) => {
    mutate((p) => {
      const current = p[r][index];
      if (!current) return p;
      const fitted = fitNote(current.note, note);
      if (fitted === current.note) return p;
      const next = p[r].slice();
      next[index] = { ...current, note: fitted };
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
  const communityHref = `/communities/${slug}`;

  return (
    <Stack spacing={{ xs: 2, sm: 2.5 }} sx={{ pb: { xs: rarity && !readOnly ? 11 : 2, md: 2 } }}>
      <Box role="status" aria-live="polite" sx={VISUALLY_HIDDEN}>{LIVE_TEXT[saveState]}</Box>

      <Box>
        <Button component={Link} href={communityHref} onClick={leaveTo(communityHref)} variant="text" size="small" startIcon={<ArrowBackRoundedIcon />} sx={{ textTransform: "none", fontWeight: 600, color: "text.secondary", ml: -1, mb: 0.5, minHeight: 40, boxShadow: "none", "&:hover": { bgcolor: "action.hover", boxShadow: "none" } }}>
          {communityName || "Back"}
        </Button>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: "flex-start", sm: "flex-end" }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: "1.625rem", sm: "2rem" }, lineHeight: 1.15 }}>Your picks</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Current Set: {setInfo.name}. You pick once, and these picks count in every challenge group you&apos;re in when picks lock.
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

      {signedOut && (
        <Alert
          severity="warning"
          sx={{ borderRadius: 2.5 }}
          action={
            <Button component={Link} href={`/login?next=${encodeURIComponent(`/communities/${slug}/picks`)}`} variant="text" color="inherit" size="small" sx={{ textTransform: "none", fontWeight: 700 }}>
              Sign in
            </Button>
          }
        >
          You&apos;ve been signed out, so your latest change isn&apos;t saved. Sign in and make it again.
        </Alert>
      )}
      {readOnly && !signedOut && (
        <Alert
          severity="info"
          sx={{ borderRadius: 2.5 }}
          action={setInfo.locked || pastLock ? (
            <Button component={Link} href={`/communities/${slug}/reveal`} variant="text" color="inherit" size="small" sx={{ textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" }}>
              See the Reveal
            </Button>
          ) : undefined}
        >
          {setInfo.locked || pastLock
            ? `Picks locked ${formatWhenZoned(setInfo.lockAt)}. These are your final picks.`
            : "Picks aren't open yet. They open when previews begin."}
        </Alert>
      )}
      {dropped.length > 0 && (
        <Alert severity="warning" onClose={() => setDropped([])} sx={{ borderRadius: 2.5 }}>
          {dropped.map((d) => d.name).join(", ")} {dropped.length === 1 ? "is" : "are"} no longer in the card pool at that rarity, so {dropped.length === 1 ? "it was" : "they were"} taken off your picks.
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
            {cardsFailed === rarity && !rarityCards ? (
              <Alert
                severity="error"
                sx={{ borderRadius: 2.5 }}
                action={
                  <Button color="inherit" size="small" onClick={() => { setCardsFailed(null); setCardsAttempt((n) => n + 1); }} sx={{ textTransform: "none", fontWeight: 700, whiteSpace: "nowrap" }}>
                    Try again
                  </Button>
                }
              >
                We couldn&apos;t load the {RARITY_PLURAL[rarity]}. Check your connection and try again.
              </Alert>
            ) : (
              <CardGrid
                cards={rarityCards}
                visible={visible}
                filters={filters}
                onFiltersChange={setFilters}
                pickedSlotById={pickedSlotById}
                onOpen={openFromGrid}
                pluralLabel={RARITY_PLURAL[rarity]}
              />
            )}
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
        <Button variant="outlined" disabled={step === 0} onClick={() => goToStep(step - 1)} sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, minWidth: 110, minHeight: 44 }}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="contained" onClick={() => goToStep(step + 1)} sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2.5, boxShadow: "none", minWidth: 110, minHeight: 44 }}>
            Next: {STEPS[step + 1] === "review" ? "Review" : RARITY_LABEL[STEPS[step + 1] as MtgRarity]}
          </Button>
        ) : (
          <Button component={Link} href={communityHref} onClick={leaveTo(communityHref)} variant="contained" sx={{ textTransform: "none", fontWeight: 700, borderRadius: 2.5, boxShadow: "none", minWidth: 110, minHeight: 44 }}>
            Done
          </Button>
        )}
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.5, px: 0.5 }}>{MTG_ATTRIBUTION}</Typography>

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

      <Snackbar
        open={!!undo}
        autoHideDuration={6000}
        onClose={(_, reason) => { if (reason !== "clickaway") setUndo(null); }}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{ bottom: { xs: rarity && !readOnly ? 88 : 16, md: 24 } }}
      >
        <Alert
          severity="info"
          variant="filled"
          onClose={() => setUndo(null)}
          action={<Button color="inherit" size="small" onClick={undoRemove} sx={{ textTransform: "none", fontWeight: 800, minHeight: 36 }}>Undo</Button>}
          sx={{ alignItems: "center", borderRadius: 2.5 }}
        >
          Removed {undo?.slot.card.name}
        </Alert>
      </Snackbar>
    </Stack>
  );
}
