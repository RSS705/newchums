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
      <Typography variant="h6" fontWeight={700} sx={{ fontSize: { xs: "1.0625rem", sm: "1.125rem" } }}>
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
