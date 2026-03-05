"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
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
    description:
      "Friendships begin when people share the same physical or digital spaces. Seeing the same faces regularly creates the low-stakes opportunities for conversation that eventually lead to deeper connection. Without shared space, meeting new people requires constant, exhausting effort.",
    actionLabel: "ACTION",
    actionText: 'Pick a "third place" and stick to it.',
  },
  {
    icon: RepeatIcon,
    title: "Repetition",
    hoverKey: "repetition",
    description:
      'Closeness isn\'t built in a single day; it grows through repeated, unplanned interactions over time. Small, consistent conversations accumulate into familiarity and trust over weeks and months. It is the "showing up" that transforms a stranger into a friend.',
    actionLabel: "ACTION",
    actionText: "Show up consistently, even when tired.",
  },
  {
    icon: ChatBubbleOutlineRoundedIcon,
    title: "Disclosure",
    hoverKey: "disclosure",
    description:
      "As familiarity grows, people gradually share more about their lives, thoughts, and feelings. Trust is built through these vulnerable exchanges, moving from surface-level \"small talk\" to meaningful \"big talk\" that forms the bedrock of lasting support.",
    actionLabel: "ACTION",
    actionText: 'Ask "second-interest" questions.',
  },
];

/**
 * Three cards for the Friendship Engine section: Proximity, Repetition, Disclosure.
 * White bg, light border, shadow, hover lift, icon in soft circle, ACTION accent.
 * Linked hover with diagram circles above.
 */
export default function FriendshipEngineCards({ hoveredItem, onHoverChange }: Props) {
  return (
      <Grid container spacing={{ xs: 3, md: 4 }}>
      {CARDS.map(({ icon: Icon, title, hoverKey, description, actionLabel, actionText }) => {
        const isHovered = hoveredItem === hoverKey;
        return (
          <Grid size={{ xs: 12, md: 4 }} key={title}>
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
            <CardContent sx={{ pt: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 }, "&:last-child": { pb: { xs: 2, sm: 3 } } }}>
              <Stack
                direction={{ xs: "row", sm: "column" }}
                spacing={2}
                alignItems={{ xs: "center", sm: "flex-start" }}
                sx={{ mb: 1.5 }}
              >
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    flexShrink: 0,
                    borderRadius: "50%",
                    bgcolor: "primary.light",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon sx={{ fontSize: 24, color: "primary.main" }} aria-hidden />
                </Box>
                <Typography
                  variant="h6"
                  component="h3"
                  fontWeight={700}
                  sx={{ fontSize: "1.0625rem" }}
                >
                  {title}
                </Typography>
              </Stack>
              <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7, mb: 2 }}>
                {description}
              </Typography>
              <Typography
                variant="caption"
                fontWeight={700}
                sx={{
                  color: "secondary.main",
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  fontSize: "0.8125rem",
                }}
              >
                {actionLabel}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ display: "block", mt: 0.25, fontSize: "0.875rem" }}
              >
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
