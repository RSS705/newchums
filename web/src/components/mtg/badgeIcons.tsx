import { createElement } from "react";
import type { SvgIconComponent } from "@mui/icons-material";
import AdjustRoundedIcon from "@mui/icons-material/AdjustRounded";
import AirRoundedIcon from "@mui/icons-material/AirRounded";
import AlarmRoundedIcon from "@mui/icons-material/AlarmRounded";
import AltRouteRoundedIcon from "@mui/icons-material/AltRouteRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import AutoFixHighRoundedIcon from "@mui/icons-material/AutoFixHighRounded";
import AutoStoriesRoundedIcon from "@mui/icons-material/AutoStoriesRounded";
import BedtimeRoundedIcon from "@mui/icons-material/BedtimeRounded";
import BlurOnRoundedIcon from "@mui/icons-material/BlurOnRounded";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import CampaignRoundedIcon from "@mui/icons-material/CampaignRounded";
import CasinoRoundedIcon from "@mui/icons-material/CasinoRounded";
import CastleRoundedIcon from "@mui/icons-material/CastleRounded";
import CenterFocusStrongRoundedIcon from "@mui/icons-material/CenterFocusStrongRounded";
import CleaningServicesRoundedIcon from "@mui/icons-material/CleaningServicesRounded";
import CompareArrowsRoundedIcon from "@mui/icons-material/CompareArrowsRounded";
import ContentCutRoundedIcon from "@mui/icons-material/ContentCutRounded";
import CrueltyFreeRoundedIcon from "@mui/icons-material/CrueltyFreeRounded";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import DiamondRoundedIcon from "@mui/icons-material/DiamondRounded";
import Diversity1RoundedIcon from "@mui/icons-material/Diversity1Rounded";
import Diversity3RoundedIcon from "@mui/icons-material/Diversity3Rounded";
import DonutLargeRoundedIcon from "@mui/icons-material/DonutLargeRounded";
import EmojiEventsRoundedIcon from "@mui/icons-material/EmojiEventsRounded";
import FavoriteRoundedIcon from "@mui/icons-material/FavoriteRounded";
import FingerprintRoundedIcon from "@mui/icons-material/FingerprintRounded";
import FlashOnRoundedIcon from "@mui/icons-material/FlashOnRounded";
import FlightRoundedIcon from "@mui/icons-material/FlightRounded";
import FormatListNumberedRoundedIcon from "@mui/icons-material/FormatListNumberedRounded";
import GeneratingTokensRoundedIcon from "@mui/icons-material/GeneratingTokensRounded";
import GpsFixedRoundedIcon from "@mui/icons-material/GpsFixedRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import HiveRoundedIcon from "@mui/icons-material/HiveRounded";
import HomeWorkRoundedIcon from "@mui/icons-material/HomeWorkRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import LightbulbRoundedIcon from "@mui/icons-material/LightbulbRounded";
import LocalFireDepartmentRoundedIcon from "@mui/icons-material/LocalFireDepartmentRounded";
import LocalOfferRoundedIcon from "@mui/icons-material/LocalOfferRounded";
import LooksOneRoundedIcon from "@mui/icons-material/LooksOneRounded";
import LooksTwoRoundedIcon from "@mui/icons-material/LooksTwoRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import MilitaryTechRoundedIcon from "@mui/icons-material/MilitaryTechRounded";
import PaidRoundedIcon from "@mui/icons-material/PaidRounded";
import ParkRoundedIcon from "@mui/icons-material/ParkRounded";
import PeopleAltRoundedIcon from "@mui/icons-material/PeopleAltRounded";
import PetsRoundedIcon from "@mui/icons-material/PetsRounded";
import PhotoCameraRoundedIcon from "@mui/icons-material/PhotoCameraRounded";
import PlusOneRoundedIcon from "@mui/icons-material/PlusOneRounded";
import RestaurantRoundedIcon from "@mui/icons-material/RestaurantRounded";
import SensorsRoundedIcon from "@mui/icons-material/SensorsRounded";
import ShieldRoundedIcon from "@mui/icons-material/ShieldRounded";
import SportsBaseballRoundedIcon from "@mui/icons-material/SportsBaseballRounded";
import SportsScoreRoundedIcon from "@mui/icons-material/SportsScoreRounded";
import SsidChartRoundedIcon from "@mui/icons-material/SsidChartRounded";
import StarsRoundedIcon from "@mui/icons-material/StarsRounded";
import StyleRoundedIcon from "@mui/icons-material/StyleRounded";
import TerrainRoundedIcon from "@mui/icons-material/TerrainRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import VerticalAlignBottomRoundedIcon from "@mui/icons-material/VerticalAlignBottomRounded";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import WaterDropRoundedIcon from "@mui/icons-material/WaterDropRounded";
import WhatshotRoundedIcon from "@mui/icons-material/WhatshotRounded";
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
  buzzer_beater: AlarmRoundedIcon,
  loyalist: FavoriteRoundedIcon,
  gold_rush: PaidRoundedIcon,
  artificer: BuildRoundedIcon,
  one_of_a_kind: FingerprintRoundedIcon,
  big_spender: DiamondRoundedIcon,
  bargain_hunter: LocalOfferRoundedIcon,
  creature_feature: CrueltyFreeRoundedIcon,
  instant_gratification: FlashOnRoundedIcon,
  sorcery_believer: AutoStoriesRoundedIcon,
  enchanted: AutoFixHighRoundedIcon,
  white_knight: ShieldRoundedIcon,
  true_blue: WaterDropRoundedIcon,
  back_in_black: DarkModeRoundedIcon,
  seeing_red: WhatshotRoundedIcon,
  green_thumb: ParkRoundedIcon,
  grey_area: BlurOnRoundedIcon,
  landlord: HomeWorkRoundedIcon,
  living_legend: CastleRoundedIcon,
  superfriends: Diversity3RoundedIcon,
  two_for_one: LooksTwoRoundedIcon,
  kindred_spirit: Diversity1RoundedIcon,
  frequent_flyer: FlightRoundedIcon,
  token_effort: GeneratingTokensRoundedIcon,
  quick_draw: StyleRoundedIcon,
  counter_culture: PlusOneRoundedIcon,
  removal_service: ContentCutRoundedIcon,
  bold_move: BoltRoundedIcon,
  two_of_a_kind: PeopleAltRoundedIcon,
  polar_opposites: CompareArrowsRoundedIcon,
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
