/**
 * Content safety: validates user-entered text for inappropriate terms.
 * Server is the source of truth; uses full list from data/bannedTerms.
 */

import { BANNED_TERMS } from "../data/bannedTerms";

/** Fields that get a tailored rejection message. "title" is included because
 *  plan/community titles are validated too; it intentionally falls through to
 *  the generic message below. */
export type ContentField = "display_name" | "username" | "hobby" | "title";

const BANNED_SET = new Set(BANNED_TERMS);

/** Multi-word phrases (checked as substring in normalized input) */
const BANNED_PHRASES = ["kill yourself", "kill himself", "kill herself"];

/** Leetspeak mapping: digit/symbol -> letter. Applied before repeat collapse. */
const LEET_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  $: "s",
};

/** Precompiled regex: collapse repeated chars (e.g. fuuuuck -> fuck) */
const RE_COLLAPSE = /(.)\1+/g;

/**
 * Normalize for matching: trim, CamelCase split, lowercase, separators to space.
 */
function normalizeInput(input: string): string {
  return input
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[\s_\-\.]+/g, " ")
    .trim();
}

/**
 * Normalize a single token for bypass detection: leetspeak + collapse repeats.
 */
function normalizeToken(token: string): string {
  let t = token;
  for (const [from, to] of Object.entries(LEET_MAP)) {
    t = t.split(from).join(to);
  }
  return t.replace(RE_COLLAPSE, "$1");
}

/**
 * Split normalized text into tokens (words) for whole-word matching.
 */
function tokenize(normalized: string): string[] {
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
}

/**
 * Check if concatenation of consecutive single-char tokens matches a banned term.
 * Catches patterns like "f.u.c.k" or "s h i t".
 */
function checkMergedSingles(tokens: string[], banned: Set<string>): boolean {
  let i = 0;
  while (i < tokens.length) {
    let merged = "";
    while (i < tokens.length && tokens[i]!.length === 1) {
      merged += tokens[i];
      i++;
    }
    if (merged.length >= 2) {
      const normalized = normalizeToken(merged);
      if (banned.has(normalized)) return true;
    }
    if (i < tokens.length) i++;
  }
  return false;
}

/**
 * Returns true if the input contains a banned term.
 * Handles: CamelCase, spaces/underscores/hyphens/dots, repeated chars, basic leetspeak.
 */
export function containsBannedTerm(input: string): boolean {
  const n = normalizeInput(input);
  if (!n) return false;
  for (const phrase of BANNED_PHRASES) {
    if (n.includes(phrase)) return true;
  }
  const tokens = tokenize(n);

  for (const t of tokens) {
    const normalized = normalizeToken(t);
    if (BANNED_SET.has(normalized)) return true;
  }
  if (BANNED_SET.has(normalizeToken(n))) return true;
  if (checkMergedSingles(tokens, BANNED_SET)) return true;
  return false;
}

/**
 * Validate text for content safety. Returns ok and optional reason.
 */
export function validateCleanText(
  input: string,
  field?: ContentField,
): { ok: boolean; reason?: string } {
  if (!input || typeof input !== "string") return { ok: true };
  if (containsBannedTerm(input)) {
    switch (field) {
      case "display_name":
        return { ok: false, reason: "Please choose a different display name." };
      case "username":
        return { ok: false, reason: "That username isn't allowed. Try something else." };
      case "hobby":
        return { ok: false, reason: "That hobby name isn't allowed. Try a different wording." };
      default:
        return { ok: false, reason: "This text isn't allowed." };
    }
  }
  return { ok: true };
}
