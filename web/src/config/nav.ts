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
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
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
  { label: "Inbox", href: "/inbox", icon: MailRoundedIcon },
  { label: "Communities", href: "/communities", icon: ForumRoundedIcon },
  { label: "Your Chums", href: "/chum-groups", icon: GroupsRoundedIcon },
  { label: "Profile", href: "/profile", icon: PersonRoundedIcon },
  { label: "Give Feedback", href: "/roadmap", icon: FeedbackRoundedIcon },
];

export const createEventHref = "/events/create";

export const superAdminNavItems: NavItem[] = [
  { label: "KPIs", href: "/admin/kpis", icon: BarChartRoundedIcon },
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

/** Logged-out nav: marketing links only. The public site sells one job
 *  (post the plan, share one link, see who is really coming), so the
 *  header stays minimal: How it Works and Safety Center. Communities is
 *  deliberately absent here; the product feature is unchanged and stays
 *  in the logged-in sidebar (`appNavItems`), and /communities remains a
 *  public route reachable by direct URL and community share links. */
export const publicHeaderNavLinks: HeaderNavLink[] = [
  { label: "How it Works", href: "/how-it-works" },
  { label: "Safety Center", href: "/safety-center" },
];
