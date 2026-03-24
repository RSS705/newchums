import ExploreRoundedIcon from "@mui/icons-material/ExploreRounded";
import EventNoteRoundedIcon from "@mui/icons-material/EventNoteRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import StyleRoundedIcon from "@mui/icons-material/StyleRounded";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import FeedbackRoundedIcon from "@mui/icons-material/FeedbackRounded";
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import IntegrationInstructionsRoundedIcon from "@mui/icons-material/IntegrationInstructionsRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import type { SvgIconComponent } from "@mui/icons-material";

export type NavItem = {
  label: string;
  href: string;
  icon: SvgIconComponent;
};

export const appNavItems: NavItem[] = [
  { label: "Explore", href: "/", icon: ExploreRoundedIcon },
  { label: "Your Plans", href: "/plans", icon: EventNoteRoundedIcon },
  { label: "Connections", href: "/chum-groups", icon: GroupsRoundedIcon },
  { label: "Profile", href: "/profile", icon: PersonRoundedIcon },
  { label: "Feedback", href: "/roadmap", icon: FeedbackRoundedIcon },
];

export const createEventHref = "/events/create";

export const superAdminNavItems: NavItem[] = [
  { label: "KPIs", href: "/admin/kpis", icon: BarChartRoundedIcon },
  { label: "System Logic", href: "/admin/system-logic", icon: IntegrationInstructionsRoundedIcon },
  { label: "Users", href: "/admin/chums", icon: PeopleRoundedIcon },
  { label: "Safety", href: "/admin/safety", icon: ShieldRoundedIcon },
  { label: "Interests", href: "/admin/interests", icon: StyleRoundedIcon },
  { label: "Plans", href: "/admin/plans", icon: CalendarMonthRoundedIcon },
  { label: "Roadmap", href: "/admin/roadmap", icon: MapRoundedIcon },
];

export const headerNavLinks = [
  { label: "How it Works", href: "/how-it-works" },
  { label: "Science of Friendship", href: "/science-of-friendship" },
  { label: "Safety Center", href: "/safety-center" },
] as const;
