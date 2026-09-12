import ExploreRoundedIcon from "@mui/icons-material/ExploreRounded";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import MailRoundedIcon from "@mui/icons-material/MailRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import StyleRoundedIcon from "@mui/icons-material/StyleRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import FeedbackRoundedIcon from "@mui/icons-material/FeedbackRounded";
import ForumRoundedIcon from "@mui/icons-material/ForumRounded";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import QueryStatsRoundedIcon from "@mui/icons-material/QueryStatsRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import QrCode2RoundedIcon from "@mui/icons-material/QrCode2Rounded";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import type { SvgIconComponent } from "@mui/icons-material";

export type NavItem = {
  label: string;
  href: string;
  icon: SvgIconComponent;
  /** Small inline tag rendered next to the label (e.g. "Beta"). */
  tag?: string;
};

/**
 * The one definition of Give Feedback. Rendered in two places: the sidebar
 * (via `appNavItems` below) and the account dropdown in AppShell. It used to
 * be hand-written in both, and the copies drifted: when the sidebar moved
 * to /contact, the dropdown kept pushing the old destination for a full
 * release. Anything that renders this entry must read this object.
 *
 * Points at the contact form: someone who wants to report a problem or
 * make a suggestion gets a two-field form. The community roadmap that used
 * to sit beside it was retired in Sept 2026; its URLs redirect here.
 */
export const giveFeedbackNavItem: NavItem = {
  label: "Give Feedback",
  href: "/contact",
  icon: FeedbackRoundedIcon,
};

export const appNavItems: NavItem[] = [
  { label: "Explore", href: "/", icon: ExploreRoundedIcon },
  { label: "Your Plans", href: "/plans", icon: EventNoteRoundedIcon },
  { label: "Inbox", href: "/inbox", icon: MailRoundedIcon },
  { label: "Communities", href: "/communities", icon: ForumRoundedIcon },
  { label: "Your Chums", href: "/chum-groups", icon: GroupsRoundedIcon },
  { label: "Profile", href: "/profile", icon: PersonRoundedIcon },
  giveFeedbackNavItem,
];

export const createEventHref = "/events/create";

export const superAdminNavItems: NavItem[] = [
  { label: "KPIs", href: "/admin/kpis", icon: BarChartRoundedIcon },
  { label: "Growth", href: "/admin/growth", icon: QueryStatsRoundedIcon },
  { label: "Users", href: "/admin/chums", icon: PeopleRoundedIcon },
  { label: "Safety", href: "/admin/safety", icon: ShieldRoundedIcon },
  { label: "Interests", href: "/admin/interests", icon: StyleRoundedIcon },
  { label: "Plans", href: "/admin/plans", icon: CalendarMonthRoundedIcon },
  { label: "Communities", href: "/admin/communities", icon: ForumRoundedIcon },
  { label: "QR Codes", href: "/admin/qr-redirects", icon: QrCode2RoundedIcon },
  { label: "MTG Seasons", href: "/admin/mtg", icon: StyleRoundedIcon },
  { label: "Tags", href: "/admin/kudos", icon: WorkspacePremiumRoundedIcon },
];

export type HeaderNavLink = { label: string; href: string };

/** Marketing-only nav shown in the site header for every viewer. Logged-in
 *  users don't get any product links here because the left sidebar already
 *  carries those. The footer and the logged-out header both read this
 *  array; hand-copied duplicates of these links drifted before.
 *
 *  Science of Friendship is intentionally omitted from the primary nav. The
 *  page still exists, is reachable from the in-page CTA inside the "Why
 *  NewChums works" homepage section, and remains in the footer. */
export const headerNavLinks: HeaderNavLink[] = [
  { label: "How it Works", href: "/how-it-works" },
  { label: "Safety Center", href: "/safety-center" },
];

/** Logged-out nav. Currently identical to `headerNavLinks`: Communities was
 *  deliberately removed from the logged-out header (the product feature is
 *  unchanged, stays in the logged-in sidebar, and /communities remains a
 *  public route), which left the two arrays equal. The alias is kept so
 *  call sites keep saying which audience they mean, and so a future
 *  logged-out-only entry is a one-line change here. */
export const publicHeaderNavLinks: HeaderNavLink[] = headerNavLinks;
