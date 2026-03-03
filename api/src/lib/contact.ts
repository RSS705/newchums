/**
 * Contact form constants. Keep in sync with web/src/lib/contact.ts.
 */

export const CONTACT_SUBJECT_OPTIONS = [
  "Account issue",
  "Bug report",
  "Feature request",
  "Safety concern",
  "Partnership / business inquiry",
  "Other",
] as const;

export type ContactSubject = (typeof CONTACT_SUBJECT_OPTIONS)[number];

export const CONTACT_SUBJECT_SET = new Set(CONTACT_SUBJECT_OPTIONS);

export function isValidContactSubject(value: string): value is ContactSubject {
  return CONTACT_SUBJECT_SET.has(value as ContactSubject);
}
