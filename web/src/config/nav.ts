import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import EventRoundedIcon from "@mui/icons-material/EventRounded";
import AddCircleRoundedIcon from "@mui/icons-material/AddCircleRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import type { SvgIconComponent } from "@mui/icons-material";

export type NavItem = {
  label: string;
  href: string;
  icon: SvgIconComponent;
};

export const appNavItems: NavItem[] = [
  { label: "Home", href: "/", icon: HomeRoundedIcon },
  { label: "Events", href: "/events", icon: EventRoundedIcon },
  { label: "Create", href: "/events/create", icon: AddCircleRoundedIcon },
  { label: "Profile", href: "/profile", icon: PersonRoundedIcon },
  { label: "Settings", href: "/settings", icon: SettingsRoundedIcon },
];
