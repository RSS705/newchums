/**
 * 18+ age validation for NewChums.
 * Input from HTML date input (YYYY-MM-DD). Uses local calendar dates only to avoid timezone off-by-one bugs.
 */

export type DateParts = { y: number; m: number; d: number };

/**
 * Parse YYYY-MM-DD string into {y,m,d}. Returns null for invalid dates.
 * Uses local calendar semantics (no UTC).
 */
export function parseDateOnly(yyyyMmDd: string): DateParts | null {
  const trimmed = yyyyMmDd?.trim();
  if (!trimmed) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;

  const y = parseInt(match[1]!, 10);
  const m = parseInt(match[2]!, 10);
  const d = parseInt(match[3]!, 10);

  // Validate calendar: new Date(y, m-1, d) in local time, then check it round-trips
  const local = new Date(y, m - 1, d);
  if (
    local.getFullYear() !== y ||
    local.getMonth() !== m - 1 ||
    local.getDate() !== d
  ) {
    return null;
  }

  return { y, m, d };
}

/**
 * Returns age in full (completed) years. Returns -1 for invalid input.
 * Uses local calendar: person turns N on the anniversary of their birth.
 */
export function getAgeYears(
  yyyyMmDd: string,
  nowDate: Date = new Date()
): number {
  const parts = parseDateOnly(yyyyMmDd);
  if (!parts) return -1;

  const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
  const birth = new Date(parts.y, parts.m - 1, parts.d);

  if (birth > today) return -1;

  let age = today.getFullYear() - parts.y;
  const thisYearBirth = new Date(today.getFullYear(), parts.m - 1, parts.d);
  if (thisYearBirth > today) age--;

  return age;
}

/**
 * True if person is at least 18 years old (in full years) on nowDate.
 * Returns false for invalid input or future dates.
 */
export function isAtLeast18(
  yyyyMmDd: string,
  nowDate: Date = new Date()
): boolean {
  const parts = parseDateOnly(yyyyMmDd);
  if (!parts) return false;

  const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
  const birth = new Date(parts.y, parts.m - 1, parts.d);

  if (birth > today) return false;

  const eligibility = new Date(parts.y + 18, parts.m - 1, parts.d);
  return eligibility <= today;
}
