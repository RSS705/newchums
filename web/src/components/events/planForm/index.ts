/**
 * Shared pieces of the two-tier plan form, used by both Add Plan
 * (`CreateEventClient`) and Edit Plan (`EditEventClient`). See `AGENTS.md` →
 * "Add Plan / Edit Plan Parity Rule". The historically drift-prone sections
 * are extracted here along with the collapse chrome and the collapsed-header
 * summary copy; the tier-one fields and the remaining optional sections
 * (Banner, Description, Hobbies, Alternate times, Visibility, Submit) are
 * still duplicated between the two files.
 */

export { default as CollapsibleSection } from "./CollapsibleSection";
export { default as ExtraOptionsSection } from "./ExtraOptionsSection";
export type { FallbackPolicy } from "./ExtraOptionsSection";
export { default as CommunityLinkSection } from "./CommunityLinkSection";
export type { MyCommunity } from "./CommunityLinkSection";
export { default as QAPlanSection } from "./QAPlanSection";
export {
  describeAltTimes,
  describeBanner,
  describeDescription,
  describeHobbies,
  describeVisibility,
} from "./summaries";
