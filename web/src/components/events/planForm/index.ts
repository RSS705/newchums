/**
 * Shared sections used by both the Add Plan (`CreateEventClient`) and Edit
 * Plan (`EditEventClient`) forms. See `AGENTS.md` → "Add Plan / Edit Plan
 * Parity Rule". Only the historically drift-prone sections are extracted
 * here; the other sections (Banner, Basic details, Date & time, Location,
 * Visibility, Submit) remain duplicated between the two files.
 */

export { default as ExtraOptionsSection } from "./ExtraOptionsSection";
export type { FallbackPolicy } from "./ExtraOptionsSection";
export { default as CommunityLinkSection } from "./CommunityLinkSection";
export type { MyCommunity } from "./CommunityLinkSection";
export {
  default as MatchingPreferencesSection,
  PREF_METRICS,
  PREF_METRIC_LABELS,
} from "./MatchingPreferencesSection";
export type { PrefMetric } from "./MatchingPreferencesSection";
export { default as QAPlanSection } from "./QAPlanSection";
