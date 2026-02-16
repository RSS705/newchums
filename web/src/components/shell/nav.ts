import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";

export type NavItem = {
  label: string;
  href: string;
  icon: typeof HomeRoundedIcon;
};

export const navItems: NavItem[] = [
  { label: "Home", href: "/home", icon: HomeRoundedIcon },
  { label: "Events", href: "/events", icon: CalendarMonthRoundedIcon },
  { label: "Create", href: "/events/new", icon: AddCircleRoundedIcon },
  { label: "Profile", href: "/profile", icon: PersonRoundedIcon },
  { label: "Settings", href: "/settings", icon: SettingsRoundedIcon },
];
