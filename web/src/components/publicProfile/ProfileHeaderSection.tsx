"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import UserAvatar from "@/components/common/UserAvatar";

const GENDER_DISPLAY: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

export type ProfileHeaderSectionProps = {
  displayName: string;
  handle: string | null;
  age: number | null;
  gender: string | null;
  avatarUrl: string | null;
  avatarBaseUrl: string;
};

export default function ProfileHeaderSection({
  displayName,
  handle,
  age,
  gender,
  avatarUrl,
  avatarBaseUrl,
}: ProfileHeaderSectionProps) {
  const ageText = age != null ? `${age} years old` : null;
  // prefer_not_to_say is suppressed at the API level, but guard here too
  const genderText = gender && gender !== "prefer_not_to_say" ? (GENDER_DISPLAY[gender] ?? null) : null;
  const identityText = [ageText, genderText].filter(Boolean).join(" • ") || null;
  const handleDisplay = handle ? (handle.startsWith("@") ? handle : `@${handle}`) : null;

  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ xs: "center", sm: "flex-start" }}>
      <UserAvatar
        src={avatarUrl ? `${avatarBaseUrl}${avatarUrl}` : null}
        name={displayName}
        username={handleDisplay}
        size={96}
      />
      <Box sx={{ textAlign: { xs: "center", sm: "left" } }}>
        <Typography
          component="h1"
          sx={{
            fontSize: { xs: "1.5rem", sm: "1.75rem" },
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: "-0.02em",
          }}
        >
          {displayName}
        </Typography>
        {handleDisplay && (
          <Typography color="text.secondary" sx={{ fontSize: "0.9375rem", mt: 0.25 }}>
            {handleDisplay}
          </Typography>
        )}
        {identityText && (
          <Typography color="text.secondary" sx={{ fontSize: "0.875rem", mt: 0.25 }}>
            {identityText}
          </Typography>
        )}
      </Box>
    </Stack>
  );
}
