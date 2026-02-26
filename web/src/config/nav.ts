import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import type { SvgIconComponent } from "@mui/icons-material";

export type NavItem = {
  label: string;
  href: string;
  icon: SvgIconComponent;
};

export const appNavItems: NavItem[] = [
  { label: "Home", href: "/", icon: HomeRoundedIcon },
  { label: "Your Chums", href: "/chum-groups", icon: GroupsRoundedIcon },
  { label: "Calendar", href: "/calendar", icon: CalendarMonthRoundedIcon },
  { label: "Profile", href: "/profile", icon: PersonRoundedIcon },
];

export const createEventHref = "/events/create";

export const headerNavLinks = [
  { label: "How it Works", href: "/how-it-works" },
  { label: "Science of Friendship", href: "/science-of-friendship" },
  { label: "Safety Center", href: "/safety-center" },
] as const;
