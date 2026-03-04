"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import RepeatIcon from "@mui/icons-material/Repeat";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import type { FriendshipEngineHover } from "@/app/(public)/science-of-friendship/ScienceOfFriendshipContent";

type Props = {
  hoveredItem: FriendshipEngineHover;
  onHoverChange: (item: FriendshipEngineHover) => void;
};

const CARDS: Array<{
  icon: typeof PlaceRoundedIcon;
  title: string;
  hoverKey: NonNullable<FriendshipEngineHover>;
  description: string;
  actionLabel: string;
  actionText: string;
}> = [
  {
    icon: PlaceRoundedIcon,
    title: "Proximity",
    hoverKey: "proximity",
    description: "Being in the same spaces regularly.",
    actionLabel: "Show up",
    actionText: "Share the same places and create opportunity.",
  },
  {
    icon: RepeatIcon,
    title: "Repetition",
    hoverKey: "repetition",
    description: "Seeing the same people over time.",
    actionLabel: "Return",
    actionText: "Small conversations build familiarity.",
  },
  {
    icon: ChatBubbleOutlineRoundedIcon,
    title: "Disclosure",
    hoverKey: "disclosure",
    description: "Gradually sharing more about yourself.",
    actionLabel: "Open up",
    actionText: "Trust grows through gentle exchange.",
  },
];

/**
 * Three cards for the Friendship Engine section: Proximity, Repetition, Disclosure.
 * White bg, light border, shadow, hover lift, icon in soft circle, ACTION accent.
 * Linked hover with diagram circles above.
 */
export default function FriendshipEngineCards({ hoveredItem, onHoverChange }: Props) {
  return (
    <Grid container spacing={3}>
      {CARDS.map(({ icon: Icon, title, hoverKey, description, actionLabel, actionText }) => {
        const isHovered = hoveredItem === hoverKey;
        return (
          <Grid size={{ xs: 12, sm: 4 }} key={title}>
            <Card
              variant="outlined"
              onMouseEnter={() => onHoverChange(hoverKey)}
              onMouseLeave={() => onHoverChange(null)}
              sx={{
                height: "100%",
                bgcolor: "background.paper",
                borderColor: "grey.200",
                borderRadius: 2,
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
                transform: isHovered ? "translateY(-4px)" : undefined,
                boxShadow: isHovered ? 3 : 1,
                "&:hover": {
                  transform: "translateY(-4px)",
                  boxShadow: 3,
                },
              }}
            >
            <CardContent sx={{ pt: 3, pb: 3, "&:last-child": { pb: 3 } }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  bgcolor: "primary.light",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  mb: 2,
                }}
              >
                <Icon sx={{ fontSize: 24, color: "primary.main" }} aria-hidden />
              </Box>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                {title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6, mb: 2 }}>
                {description}
              </Typography>
              <Typography
                variant="caption"
                fontWeight={700}
                sx={{ color: "secondary.main", letterSpacing: 0.5, textTransform: "uppercase" }}
              >
                {actionLabel}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                {actionText}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        );
      })}
    </Grid>
  );
}
