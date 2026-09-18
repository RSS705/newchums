import { createElement } from "react";
import type { SvgIconComponent } from "@mui/icons-material";
import AdjustRoundedIcon from "@mui/icons-material/AdjustRounded";
import AirRoundedIcon from "@mui/icons-material/AirRounded";
import AlarmRoundedIcon from "@mui/icons-material/AlarmRounded";
import AltRouteRoundedIcon from "@mui/icons-material/AltRouteRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import BedtimeRoundedIcon from "@mui/icons-material/BedtimeRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import CasinoRoundedIcon from "@mui/icons-material/CasinoRounded";
import CenterFocusStrongRoundedIcon from "@mui/icons-material/CenterFocusStrongRounded";
import CleaningServicesRoundedIcon from "@mui/icons-material/CleaningServicesRounded";
import DonutLargeRoundedIcon from "@mui/icons-material/DonutLargeRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import FactCheckRoundedIcon from "@mui/icons-material/FactCheckRounded";
import FavoriteRoundedIcon from "@mui/icons-material/FavoriteRounded";
import FormatListNumberedRoundedIcon from "@mui/icons-material/FormatListNumberedRounded";
import GpsFixedRoundedIcon from "@mui/icons-material/GpsFixedRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import HiveRoundedIcon from "@mui/icons-material/HiveRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import LightbulbRoundedIcon from "@mui/icons-material/LightbulbRounded";
import LocalFireDepartmentRoundedIcon from "@mui/icons-material/LocalFireDepartmentRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";
import LooksOneRoundedIcon from "@mui/icons-material/LooksOneRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import MilitaryTechRoundedIcon from "@mui/icons-material/MilitaryTechRounded";
import PaidRoundedIcon from "@mui/icons-material/PaidRounded";
import PaletteRoundedIcon from "@mui/icons-material/PaletteRounded";
import PetsRoundedIcon from "@mui/icons-material/PetsRounded";
import PhotoCameraRoundedIcon from "@mui/icons-material/PhotoCameraRounded";
import RestaurantRoundedIcon from "@mui/icons-material/RestaurantRounded";
import SensorsRoundedIcon from "@mui/icons-material/SensorsRounded";
import SportsBaseballRoundedIcon from "@mui/icons-material/SportsBaseballRounded";
import SportsScoreRoundedIcon from "@mui/icons-material/SportsScoreRounded";
import SsidChartRoundedIcon from "@mui/icons-material/SsidChartRounded";
import StarsRoundedIcon from "@mui/icons-material/StarsRounded";
import TerrainRoundedIcon from "@mui/icons-material/TerrainRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import VerticalAlignBottomRoundedIcon from "@mui/icons-material/VerticalAlignBottomRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import WbTwilightRoundedIcon from "@mui/icons-material/WbTwilightRounded";
import WorkspacePremiumRoundedIcon from "@mui/icons-material/WorkspacePremiumRounded";
import Box from "@mui/material/Box";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import { BADGE_TIER_STYLE, type MtgBadge } from "./mtgTypes";

/** One icon per badge (spec 7), keyed by badge code. */
const BADGE_ICONS: Record<string, SvgIconComponent> = {
  champion: EmojiEventsRoundedIcon,
  runner_up: WorkspacePremiumRoundedIcon,
  third_place: MilitaryTechRoundedIcon,
  common_sense: LightbulbRoundedIcon,
  uncommon_knowledge: MenuBookRoundedIcon,
  rare_insight: InsightsRoundedIcon,
  mythic_vision: AutoAwesomeRoundedIcon,
  pick_of_the_season: StarsRoundedIcon,
  comeback_kid: TrendingUpRoundedIcon,
  king_of_the_hill: TerrainRoundedIcon,
  contrarian: AltRouteRoundedIcon,
  hive_mind: HiveRoundedIcon,
  photo_finish: PhotoCameraRoundedIcon,
  rollercoaster: SsidChartRoundedIcon,
  early_bird: WbTwilightRoundedIcon,
  clean_sweep: CleaningServicesRoundedIcon,
  beat_the_crowd: GroupsRoundedIcon,
  wire_to_wire: SportsScoreRoundedIcon,
  perfect_order: FormatListNumberedRoundedIcon,
  oracle: VisibilityRoundedIcon,
  sleeper_agent: BedtimeRoundedIcon,
  called_it: CampaignRoundedIcon,
  sniper: GpsFixedRoundedIcon,
  grand_slam: SportsBaseballRoundedIcon,
  bomb_squad: LocalFireDepartmentRoundedIcon,
  common_denominator: LooksOneRoundedIcon,
  lone_wolf: PetsRoundedIcon,
  sharp_eye: CenterFocusStrongRoundedIcon,
  bullseye: AdjustRoundedIcon,
  well_rounded: DonutLargeRoundedIcon,
  bomb_detector: SensorsRoundedIcon,
  on_the_record: FactCheckRoundedIcon,
  locked_and_loaded: LockRoundedIcon,
  buzzer_beater: AlarmRoundedIcon,
  rainbow: PaletteRoundedIcon,
  loyalist: FavoriteRoundedIcon,
  gold_rush: PaidRoundedIcon,
  artificer: BuildRoundedIcon,
  wooden_spoon: RestaurantRoundedIcon,
  whiff_of_the_season: AirRoundedIcon,
  bust: TrendingDownRoundedIcon,
  rock_bottom: VerticalAlignBottomRoundedIcon,
  monkey_business: CasinoRoundedIcon,
};

/** A badge's icon as an element, so callers never hold a component chosen at
 *  render time. Other props go to the icon, including the class a Chip adds
 *  to style its icon. */
export function BadgeGlyph({ code, ...props }: { code: string } & SvgIconProps) {
  return createElement(BADGE_ICONS[code] ?? MilitaryTechRoundedIcon, props);
}

/**
 * A badge's icon in a disc of its tier's colors: filled when earned, a
 * dashed outline on a plain background when the player is only on track
 * for it. Hall of Shame badges are dashed either way, like their chips.
 * Decorative: the badge's name and reason are always given as text nearby.
 */
export function BadgeIcon({ badge, size = 24 }: { badge: Pick<MtgBadge, "code" | "tier" | "onTrack">; size?: number | Partial<Record<"xs" | "sm" | "md", number>> }) {
  const style = BADGE_TIER_STYLE[badge.tier] ?? BADGE_TIER_STYLE.common;
  // Pixel strings on purpose: in sx a bare number from 0 to 1 is a fraction.
  const px = (scale: number) => (typeof size === "number"
    ? `${Math.round(size * scale)}px`
    : Object.fromEntries(Object.entries(size).map(([bp, n]) => [bp, `${Math.round((n as number) * scale)}px`])));
  return (
    <Box
      aria-hidden
      sx={{
        width: px(1),
        height: px(1),
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        bgcolor: badge.onTrack ? "background.paper" : style.bg,
        color: style.fg,
        border: "1.5px solid",
        borderColor: style.border,
        borderStyle: badge.onTrack || badge.tier === "shame" ? "dashed" : "solid",
      }}
    >
      <BadgeGlyph code={badge.code} sx={{ fontSize: px(0.62) }} />
    </Box>
  );
}
