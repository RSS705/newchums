"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

export type ProfileHobbiesSectionProps = {
  hobbies: string[];
};

export default function ProfileHobbiesSection({ hobbies }: ProfileHobbiesSectionProps) {
  if (!hobbies || hobbies.length === 0) return null;

  const sortedHobbies = [...hobbies].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ fontSize: "0.9375rem" }}>
        Hobbies
      </Typography>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 1.5,
        }}
      >
        {sortedHobbies.map((name) => (
          <Chip
            key={name}
            label={name}
            size="medium"
            color="primary"
            variant="filled"
            sx={{
              height: 34,
              fontSize: "0.875rem",
              fontWeight: 600,
              "& .MuiChip-label": {
                px: 1.5,
                py: 0.5,
              },
            }}
          />
        ))}
      </Box>
    </Stack>
  );
}
