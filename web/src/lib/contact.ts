/**
 * Contact form constants. Keep in sync with api/src/lib/contact.ts.
 */

export const CONTACT_SUBJECT_OPTIONS = [
  { value: "", label: "Select a subject" },
  { value: "Account issue", label: "Account issue" },
  { value: "Bug report", label: "Bug report" },
  { value: "Feature request", label: "Feature request" },
  { value: "Safety concern", label: "Safety concern" },
  { value: "Partnership / business inquiry", label: "Partnership / business inquiry" },
  { value: "Other", label: "Other" },
] as const;

export const CONTACT_SUBJECT_VALUES = CONTACT_SUBJECT_OPTIONS.filter((o) => o.value !== "")
  .map((o) => o.value);
