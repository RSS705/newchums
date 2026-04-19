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
  { label: "Communities", href: "/communities", icon: ForumRoundedIcon, tag: "Beta" },
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

export const headerNavLinks = [
  { label: "How it Works", href: "/how-it-works" },
  { label: "Science of Friendship", href: "/science-of-friendship" },
  { label: "Safety Center", href: "/safety-center" },
] as const;
