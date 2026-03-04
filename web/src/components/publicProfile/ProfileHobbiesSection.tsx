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

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1" fontWeight={600} sx={{ fontSize: "0.9375rem" }}>
        Hobbies
      </Typography>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        {hobbies.map((name) => (
          <Chip
            key={name}
            label={name}
            size="small"
            color="primary"
            variant="outlined"
            sx={{
              fontSize: "0.8125rem",
              fontWeight: 500,
            }}
          />
        ))}
      </Box>
    </Stack>
  );
}
