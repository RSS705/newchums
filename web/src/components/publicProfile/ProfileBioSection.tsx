"use client";

import Typography from "@mui/material/Typography";

export type ProfileBioSectionProps = {
  bio: string | null;
};

export default function ProfileBioSection({ bio }: ProfileBioSectionProps) {
  if (!bio || !bio.trim()) return null;

  return (
    <Typography
      variant="body1"
      sx={{
        fontSize: "0.9375rem",
        lineHeight: 1.6,
        color: "text.secondary",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {bio.trim()}
    </Typography>
  );
}
