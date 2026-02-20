import { describe, expect, it } from "vitest";
import {
  getAgeYears,
  isAtLeast18,
  parseDateOnly,
} from "./ageValidation";

describe("parseDateOnly", () => {
  it("parses valid YYYY-MM-DD", () => {
    expect(parseDateOnly("2000-01-15")).toEqual({ y: 2000, m: 1, d: 15 });
    expect(parseDateOnly("1999-12-31")).toEqual({ y: 1999, m: 12, d: 31 });
    expect(parseDateOnly("2004-02-29")).toEqual({ y: 2004, m: 2, d: 29 });
  });

  it("rejects invalid dates", () => {
    expect(parseDateOnly("")).toBeNull();
    expect(parseDateOnly("  ")).toBeNull();
    expect(parseDateOnly("invalid")).toBeNull();
    expect(parseDateOnly("2000-13-01")).toBeNull(); // invalid month
    expect(parseDateOnly("2000-00-01")).toBeNull();
    expect(parseDateOnly("2000-01-32")).toBeNull(); // invalid day
    expect(parseDateOnly("2001-02-29")).toBeNull(); // non-leap
  });

  it("trims whitespace", () => {
    expect(parseDateOnly("  2000-01-15  ")).toEqual({ y: 2000, m: 1, d: 15 });
  });
});

describe("getAgeYears", () => {
  it("returns full years", () => {
    const ref = new Date(2025, 1, 18); // Feb 18, 2025
    expect(getAgeYears("2007-02-18", ref)).toBe(18);
    expect(getAgeYears("2007-02-19", ref)).toBe(17);
    expect(getAgeYears("2007-02-17", ref)).toBe(18);
  });

  it("returns -1 for invalid or future", () => {
    expect(getAgeYears("")).toBe(-1);
    expect(getAgeYears("2050-01-01")).toBe(-1);
    const future = new Date(2020, 0, 1);
    expect(getAgeYears("2025-01-01", future)).toBe(-1);
  });
});

describe("isAtLeast18", () => {
  it("returns true when 18+", () => {
    const ref = new Date(2025, 1, 18);
    expect(isAtLeast18("2007-02-18", ref)).toBe(true);
    expect(isAtLeast18("2007-02-17", ref)).toBe(true);
    expect(isAtLeast18("2000-01-01", ref)).toBe(true);
  });

  it("returns false when under 18", () => {
    const ref = new Date(2025, 1, 18);
    expect(isAtLeast18("2007-02-19", ref)).toBe(false);
    expect(isAtLeast18("2010-01-01", ref)).toBe(false);
  });

  it("returns false for invalid or future dates", () => {
    expect(isAtLeast18("")).toBe(false);
    expect(isAtLeast18("bad")).toBe(false);
    expect(isAtLeast18("2030-01-01")).toBe(false);
  });

  it("handles Feb 29 birth in leap year", () => {
    const ref = new Date(2024, 2, 1); // Mar 1, 2024
    expect(isAtLeast18("2006-02-28", ref)).toBe(true); // 2006 not leap, use 28
    expect(isAtLeast18("2004-02-29", ref)).toBe(true); // 2004 leap, 20yo on Mar 1 2024
  });
});
