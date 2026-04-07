import { describe, expect, it } from "vitest";
import {
  type ChumPrefsRow,
  DEFAULT_CHUM_PREFS,
  evaluateChumPreferences,
  parsePrefOverrides,
  resolveEffectiveHostPrefs,
} from "../chumPreferences";

// Helper to build a prefs row with overrides on top of the defaults.
const prefs = (overrides: Partial<ChumPrefsRow> = {}): ChumPrefsRow => ({
  ...DEFAULT_CHUM_PREFS,
  ...overrides,
});

describe("evaluateChumPreferences", () => {
  it("passes when checker prefs are null (uses defaults)", () => {
    const r = evaluateChumPreferences(null, { reliability: 50 });
    expect(r.passes).toBe(true);
    expect(r.failedMetrics).toEqual([]);
  });

  it("passes when all dimensions are permissive (open + age null)", () => {
    const r = evaluateChumPreferences(
      prefs({
        reliability_level: "open",
        sociability_level: "open",
        presentation_level: "open",
        hosting_level: "open",
        age_pref_years: null,
      }),
      { reliability: 0, sociability: 0, presentation: 0, hosting_skills: 0 },
      true,
      { checkerDob: "1990-01-01", targetDob: "1950-01-01" },
    );
    expect(r.passes).toBe(true);
    expect(r.failedMetrics).toEqual([]);
  });

  it("fails reliability when score is below the 'required' threshold", () => {
    const r = evaluateChumPreferences(prefs({ reliability_level: "required" }), {
      reliability: 40,
    });
    expect(r.passes).toBe(false);
    expect(r.failedMetrics).toEqual(["reliability"]);
  });

  it("ignores hosting_skills when includeHosting is false", () => {
    const r = evaluateChumPreferences(prefs({ hosting_level: "required" }), {
      hosting_skills: 0,
    });
    expect(r.passes).toBe(true);
  });

  it("enforces hosting_skills when includeHosting is true", () => {
    const r = evaluateChumPreferences(
      prefs({ hosting_level: "required" }),
      { hosting_skills: 0 },
      true,
    );
    expect(r.passes).toBe(false);
    expect(r.failedMetrics).toEqual(["hosting_skills"]);
  });

  it("uses METRIC_BASELINE (50) when a metric score is missing", () => {
    // 'preferred' threshold is 35; baseline 50 passes.
    const r = evaluateChumPreferences(prefs({ reliability_level: "preferred" }), {});
    expect(r.passes).toBe(true);
  });

  // ── Age check ────────────────────────────────────────────────────────────

  it("fails age when difference exceeds tolerance", () => {
    // Both DOBs are decades in the past so today's clock doesn't matter.
    const r = evaluateChumPreferences(
      prefs({ age_pref_years: 5 }),
      {},
      false,
      { checkerDob: "1990-01-01", targetDob: "1997-01-01" },
    );
    expect(r.passes).toBe(false);
    expect(r.failedMetrics).toEqual(["age"]);
  });

  it("passes age when difference is within tolerance", () => {
    const r = evaluateChumPreferences(
      prefs({ age_pref_years: 5 }),
      {},
      false,
      { checkerDob: "1990-01-01", targetDob: "1994-01-01" },
    );
    expect(r.passes).toBe(true);
  });

  it("passes age when difference equals tolerance (boundary)", () => {
    const r = evaluateChumPreferences(
      prefs({ age_pref_years: 5 }),
      {},
      false,
      { checkerDob: "1990-01-01", targetDob: "1985-01-01" },
    );
    expect(r.passes).toBe(true);
  });

  it("passes age when checker DOB is missing (generous to legacy data)", () => {
    const r = evaluateChumPreferences(
      prefs({ age_pref_years: 5 }),
      {},
      false,
      { checkerDob: null, targetDob: "1997-01-01" },
    );
    expect(r.passes).toBe(true);
  });

  it("passes age when target DOB is missing (generous to legacy data)", () => {
    const r = evaluateChumPreferences(
      prefs({ age_pref_years: 5 }),
      {},
      false,
      { checkerDob: "1990-01-01", targetDob: null },
    );
    expect(r.passes).toBe(true);
  });

  it("never fails age when age_pref_years is null", () => {
    const r = evaluateChumPreferences(
      prefs({ age_pref_years: null }),
      {},
      false,
      { checkerDob: "1990-01-01", targetDob: "1920-01-01" },
    );
    expect(r.passes).toBe(true);
  });

  it("returns combined failed metrics in deterministic order (metrics first, age last)", () => {
    const r = evaluateChumPreferences(
      prefs({ reliability_level: "required", age_pref_years: 5 }),
      { reliability: 40 },
      false,
      { checkerDob: "1990-01-01", targetDob: "1997-01-01" },
    );
    expect(r.passes).toBe(false);
    expect(r.failedMetrics).toEqual(["reliability", "age"]);
  });
});

describe("parsePrefOverrides", () => {
  it("returns null for non-object input", () => {
    expect(parsePrefOverrides(null)).toBeNull();
    expect(parsePrefOverrides("nope")).toBeNull();
    expect(parsePrefOverrides(42)).toBeNull();
  });

  it("returns { disabled: true } when disabled flag is set", () => {
    expect(parsePrefOverrides({ disabled: true })).toEqual({ disabled: true });
  });

  it("accepts age in disabled_metrics", () => {
    expect(parsePrefOverrides({ disabled_metrics: ["age"] })).toEqual({
      disabled_metrics: ["age"],
    });
  });

  it("filters out invalid metric keys but keeps valid ones", () => {
    expect(
      parsePrefOverrides({ disabled_metrics: ["reliability", "garbage", "age", 42] }),
    ).toEqual({ disabled_metrics: ["reliability", "age"] });
  });

  it("returns null when disabled_metrics filters down to nothing", () => {
    expect(parsePrefOverrides({ disabled_metrics: ["garbage"] })).toBeNull();
  });

  it("accepts hosting_skills as a valid metric key", () => {
    expect(parsePrefOverrides({ disabled_metrics: ["hosting_skills"] })).toEqual({
      disabled_metrics: ["hosting_skills"],
    });
  });
});

describe("resolveEffectiveHostPrefs", () => {
  it("returns globalPrefs unchanged when no overrides", () => {
    const g = prefs({ reliability_level: "important", age_pref_years: 10 });
    expect(resolveEffectiveHostPrefs(g, null)).toEqual(g);
  });

  it("returns a fully permissive row when disabled: true", () => {
    const g = prefs({ reliability_level: "required", age_pref_years: 5 });
    expect(resolveEffectiveHostPrefs(g, { disabled: true })).toEqual({
      reliability_level: "open",
      sociability_level: "open",
      presentation_level: "open",
      hosting_level: "open",
      age_pref_years: null,
    });
  });

  it("zeroes out only the listed disabled_metrics, leaving others intact", () => {
    const g = prefs({
      reliability_level: "required",
      sociability_level: "important",
      age_pref_years: 5,
    });
    const r = resolveEffectiveHostPrefs(g, {
      disabled_metrics: ["age", "sociability"],
    });
    expect(r).toEqual({
      reliability_level: "required",
      sociability_level: "open",
      presentation_level: "open",
      hosting_level: "open",
      age_pref_years: null,
    });
  });

  it("uses DEFAULT_CHUM_PREFS when globalPrefs is null and overrides are present", () => {
    const r = resolveEffectiveHostPrefs(null, { disabled: true });
    expect(r).toEqual({
      reliability_level: "open",
      sociability_level: "open",
      presentation_level: "open",
      hosting_level: "open",
      age_pref_years: null,
    });
  });
});
