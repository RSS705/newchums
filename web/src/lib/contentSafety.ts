/**
 * Client-side content safety validator for fast feedback.
 * Uses a smaller "quick-catch" list (~100 terms). Server is canonical and blocks more.
 */

export type ContentField = "display_name" | "username" | "hobby";

/** Quick-catch list: most common/ severe terms. Must be subset of API list. */
const BANNED_TERMS: ReadonlyArray<string> = [
  "anal",
  "anus",
  "apeshit",
  "arsehole",
  "ass",
  "asshole",
  "bitch",
  "bitches",
  "blowjob",
  "bollocks",
  "boner",
  "boob",
  "boobs",
  "bullshit",
  "bunghole",
  "butt",
  "butthole",
  "cock",
  "cocks",
  "coon",
  "coons",
  "cum",
  "cunt",
  "dick",
  "dildo",
  "fag",
  "faggot",
  "fuck",
  "fuckin",
  "fucking",
  "genitals",
  "hooker",
  "incest",
  "jailbait",
  "jigaboo",
  "jiggaboo",
  "jiggerboo",
  "jizz",
  "kike",
  "kys",
  "milf",
  "motherfucker",
  "negro",
  "neonazi",
  "nigga",
  "nigger",
  "nude",
  "nudity",
  "pedo",
  "pedophile",
  "penis",
  "pissing",
  "porn",
  "porno",
  "pornography",
  "pussy",
  "rape",
  "raping",
  "rapist",
  "retard",
  "schlong",
  "semen",
  "sex",
  "sexcam",
  "sexual",
  "shit",
  "shitty",
  "slut",
  "sodomize",
  "sodomy",
  "tit",
  "tits",
  "titties",
  "titty",
  "twat",
  "vagina",
  "viagra",
  "vibrator",
  "vulva",
  "wank",
  "wetback",
  "whore",
] as const;

const BANNED_SET = new Set(BANNED_TERMS);

const BANNED_PHRASES = ["kill yourself", "kill himself", "kill herself"];

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

const RE_COLLAPSE = /(.)\1+/g;

function normalizeInput(input: string): string {
  return input
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[\s_\-\.]+/g, " ")
    .trim();
}

function normalizeToken(token: string): string {
  let t = token;
  for (const [from, to] of Object.entries(LEET_MAP)) {
    t = t.split(from).join(to);
  }
  return t.replace(RE_COLLAPSE, "$1");
}

function tokenize(normalized: string): string[] {
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
}

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
