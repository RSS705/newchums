"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import InterestsRoundedIcon from "@mui/icons-material/InterestsRounded";
import ProfileSectionHeader from "./ProfileSectionHeader";

export type ProfileHobbiesSectionProps = {
  hobbies: string[];
};

export default function ProfileHobbiesSection({ hobbies }: ProfileHobbiesSectionProps) {
  if (!hobbies || hobbies.length === 0) return null;

  const sortedHobbies = [...hobbies].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  return (
    <Stack spacing={1.75}>
      <ProfileSectionHeader
        icon={<InterestsRoundedIcon sx={{ fontSize: 20 }} />}
        title="Hobbies"
        meta={sortedHobbies.length}
      />
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        {sortedHobbies.map((name) => (
          <Chip
            key={name}
            label={name}
            size="small"
            sx={{
              height: 30,
              fontSize: "0.8125rem",
              fontWeight: 600,
              borderRadius: 1.75,
              bgcolor: "primary.light",
              color: "primary.dark",
              border: "1px solid",
              borderColor: "primary.light",
              "& .MuiChip-label": {
                px: 1.5,
              },
            }}
          />
        ))}
      </Box>
    </Stack>
  );
}
