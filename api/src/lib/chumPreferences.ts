/**
 * Chum preference matching: pure helpers used by the digest, explore feed, and
 * plan-detail compatibility note pathways. Kept free of Hono/DB dependencies so
 * the logic is unit-testable in isolation.
 */

import { computeAge } from "./publicProfile";

// ─── Constants ───────────────────────────────────────────────────────────────

export const METRIC_BASELINE = 50;

export const PREF_LEVELS = ["open", "preferred", "important", "required"] as const;
export type PrefLevel = (typeof PREF_LEVELS)[number];

export const PREF_THRESHOLDS: Record<string, number> = {
  open: 0,
  preferred: 35,
  important: 45,
  required: 55,
};

/** Allowed values for `age_pref_years` (NULL = Any age). */
export const AGE_PREF_YEAR_OPTIONS: readonly number[] = [5, 10, 15] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChumPrefsRow = {
  reliability_level: string;
  sociability_level: string;
  presentation_level: string;
  hosting_level: string;
  age_pref_years: number | null;
};

export const DEFAULT_CHUM_PREFS: ChumPrefsRow = {
  reliability_level: "preferred",
  sociability_level: "open",
  presentation_level: "open",
  hosting_level: "open",
  age_pref_years: null,
};

export type UserMetricsMap = Record<string, number>;

export type PrefOverrides = { disabled?: boolean; disabled_metrics?: string[] } | null;

/** Optional context for the dynamic age check. Both DOBs are YYYY-MM-DD strings. */
export type ChumPrefContext = {
  checkerDob?: string | null;
  targetDob?: string | null;
};

// ─── Evaluation ──────────────────────────────────────────────────────────────

/**
 * Evaluate whether a target user passes a checker's chum preferences.
 *
 * @param checkerPrefs   The checker's preferences (null = use defaults).
 * @param targetMetrics  The target user's metric scores.
 * @param includeHosting If true, also evaluate `hosting_skills`.
 * @param context        Optional DOB pair for the age preference check.
 * @returns `passes` (all checks met) and the list of failed metric keys.
 *
 * Age check semantics:
 *   - If `checkerPrefs.age_pref_years` is null, age is not evaluated.
 *   - If either DOB is missing, the age check passes (generous to legacy data
 *     and to users without DOB on file).
 *   - Otherwise, the integer year difference must be ≤ `age_pref_years`.
 *   - The synthetic failed-metric key is `"age"` (matches the override JSONB
 *     `disabled_metrics` token, the frontend `PREF_NOTE_LABELS` map, and the
 *     plan-create override UI).
 */
export function evaluateChumPreferences(
  checkerPrefs: ChumPrefsRow | null,
  targetMetrics: UserMetricsMap,
  includeHosting: boolean = false,
  context?: ChumPrefContext,
): { passes: boolean; failedMetrics: string[] } {
  const prefs = checkerPrefs ?? DEFAULT_CHUM_PREFS;

  const checks: [string, string][] = [
    ["reliability", prefs.reliability_level],
    ["sociability", prefs.sociability_level],
    ["presentation", prefs.presentation_level],
  ];
  if (includeHosting) {
    checks.push(["hosting_skills", prefs.hosting_level]);
  }

  const failedMetrics: string[] = [];
  for (const [metric, level] of checks) {
    const threshold = PREF_THRESHOLDS[level] ?? 0;
    if (threshold === 0) continue;
    const score = targetMetrics[metric] ?? METRIC_BASELINE;
    if (score < threshold) failedMetrics.push(metric);
  }

  // Age check — generous to missing DOB on either side (legacy users, OAuth
  // imports without DOB collected, etc).
  if (prefs.age_pref_years != null) {
    const checkerAge = computeAge(context?.checkerDob ?? null);
    const targetAge = computeAge(context?.targetDob ?? null);
    if (
      checkerAge != null &&
      targetAge != null &&
      Math.abs(checkerAge - targetAge) > prefs.age_pref_years
    ) {
      failedMetrics.push("age");
    }
  }

  return { passes: failedMetrics.length === 0, failedMetrics };
}

// ─── Plan-level overrides ────────────────────────────────────────────────────

const VALID_OVERRIDE_METRICS = new Set([
  "reliability",
  "sociability",
  "presentation",
  "hosting_skills",
  "age",
]);

export function parsePrefOverrides(raw: unknown): PrefOverrides {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.disabled === true) return { disabled: true };
  if (Array.isArray(obj.disabled_metrics) && obj.disabled_metrics.length > 0) {
    const filtered = (obj.disabled_metrics as unknown[]).filter(
      (m) => typeof m === "string" && VALID_OVERRIDE_METRICS.has(m),
    ) as string[];
    return filtered.length > 0 ? { disabled_metrics: filtered } : null;
  }
  return null;
}

/**
 * Merge a host's profile preferences with their per-plan overrides.
 *
 * Plan-level "disable all" returns a fully permissive prefs row (every level
 * `open`, age `null`). This replaces the previous master-toggle short-circuit.
 */
export function resolveEffectiveHostPrefs(
  globalPrefs: ChumPrefsRow | null,
  planOverrides: PrefOverrides,
): ChumPrefsRow | null {
  const prefs = globalPrefs ?? DEFAULT_CHUM_PREFS;
  if (!planOverrides) return globalPrefs;

  if (planOverrides.disabled === true) {
    return {
      ...prefs,
      reliability_level: "open",
      sociability_level: "open",
      presentation_level: "open",
      hosting_level: "open",
      age_pref_years: null,
    };
  }

  const dm = planOverrides.disabled_metrics;
  if (Array.isArray(dm) && dm.length > 0) {
    return {
      ...prefs,
      reliability_level: dm.includes("reliability") ? "open" : prefs.reliability_level,
      sociability_level: dm.includes("sociability") ? "open" : prefs.sociability_level,
      presentation_level: dm.includes("presentation") ? "open" : prefs.presentation_level,
      hosting_level: dm.includes("hosting_skills") ? "open" : prefs.hosting_level,
      age_pref_years: dm.includes("age") ? null : prefs.age_pref_years,
    };
  }

  return globalPrefs;
}
