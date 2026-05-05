import ExploreRoundedIcon from "@mui/icons-material/ExploreRounded";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import StyleRoundedIcon from "@mui/icons-material/StyleRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import FeedbackRoundedIcon from "@mui/icons-material/FeedbackRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import IntegrationInstructionsRoundedIcon from "@mui/icons-material/IntegrationInstructionsRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import QrCode2RoundedIcon from "@mui/icons-material/QrCode2Rounded";
import type { SvgIconComponent } from "@mui/icons-material";

export type NavItem = {
  label: string;
  href: string;
  icon: SvgIconComponent;
  /** Small inline tag rendered next to the label (e.g. "Beta"). */
  tag?: string;
};

export const appNavItems: NavItem[] = [
  { label: "Explore", href: "/", icon: ExploreRoundedIcon },
  { label: "Your Plans", href: "/plans", icon: EventNoteRoundedIcon },
  { label: "Communities", href: "/communities", icon: ForumRoundedIcon },
  { label: "Your Chums", href: "/chum-groups", icon: GroupsRoundedIcon },
  { label: "Profile", href: "/profile", icon: PersonRoundedIcon },
  { label: "Give Feedback", href: "/roadmap", icon: FeedbackRoundedIcon },
];

export const createEventHref = "/events/create";

export const superAdminNavItems: NavItem[] = [
  { label: "KPIs", href: "/admin/kpis", icon: BarChartRoundedIcon },
  { label: "System Logic", href: "/admin/system-logic", icon: IntegrationInstructionsRoundedIcon },
  { label: "Users", href: "/admin/chums", icon: PeopleRoundedIcon },
  { label: "Safety", href: "/admin/safety", icon: ShieldRoundedIcon },
  { label: "Shout-outs", href: "/admin/shoutouts", icon: CampaignRoundedIcon },
  { label: "Interests", href: "/admin/interests", icon: StyleRoundedIcon },
  { label: "Plans", href: "/admin/plans", icon: CalendarMonthRoundedIcon },
  { label: "Communities", href: "/admin/communities", icon: ForumRoundedIcon },
  { label: "QR Codes", href: "/admin/qr-redirects", icon: QrCode2RoundedIcon },
  { label: "Roadmap", href: "/admin/roadmap", icon: MapRoundedIcon },
];

export type HeaderNavLink = { label: string; href: string };

/** Marketing-only nav shown in the site header for every viewer. Logged-in
 *  users don't get any product links here because the left sidebar already
 *  carries those. Kept as a plain array (not a tuple) so the logged-out
 *  variant below can be composed from it with a spread.
 *
 *  Science of Friendship is intentionally omitted from the primary nav. The
 *  page still exists, is reachable from the in-page CTA inside the "Why
 *  NewChums works" homepage section, and remains in the footer. */
export const headerNavLinks: HeaderNavLink[] = [
  { label: "How it Works", href: "/how-it-works" },
  { label: "Safety Center", href: "/safety-center" },
];

/** Logged-out nav: marketing links plus a "Communities" entry so non-
 *  authenticated visitors can discover public communities from the top nav
 *  the same way they can browse public plans from the landing Explore feed.
 *  Kept out of the logged-in header because authenticated users already
 *  have Communities in the left sidebar; showing it twice would be noise.
 *
 *  The homepage's "For Organizers" section (id `for-organizers`) is
 *  similarly unlinked from the top nav, the in-page hero CTA on the
 *  homepage routes there. */
export const publicHeaderNavLinks: HeaderNavLink[] = [
  { label: "How it Works", href: "/how-it-works" },
  { label: "Communities", href: "/communities" },
  { label: "Safety Center", href: "/safety-center" },
];
