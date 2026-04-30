"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
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
  /** Account creation timestamp (ISO). Surfaced as "Joined {Month Year}"
   *  in the hero as a quiet trust signal. Skipped when null or invalid. */
  memberSince?: string | null;
  viewerLoggedIn?: boolean;
};

/** "Joined {Month Year}" formatter. Returns null if the input is missing
 *  or doesn't parse, so the caller can simply skip rendering. Year-only
 *  feels too cold; full date is too granular; month + year is what
 *  GitHub / Twitter / X all use for the same trust signal. */
function formatMemberSince(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const month = d.toLocaleString(undefined, { month: "short" });
  const year = d.getFullYear();
  return `Joined ${month} ${year}`;
}

/**
 * Profile hero. Lifts the avatar with a 3px white ring + soft drop
 * shadow (matching the participant-hero pattern in UI_Patterns.md so
 * every "this is a person" surface in the app reads the same way), and
 * gives the display name a stronger H1 treatment with -0.025em
 * letter-spacing. Identity meta (age / gender) and the handle stay
 * subordinate beneath the name.
 */
export default function ProfileHeaderSection({
  displayName,
  handle,
  age,
  gender,
  avatarUrl,
  avatarBaseUrl,
  memberSince,
  viewerLoggedIn,
}: ProfileHeaderSectionProps) {
  const handleDisplay = handle ? (handle.startsWith("@") ? handle : `@${handle}`) : null;
  const loggedOut = viewerLoggedIn === false;

  // For logged-out viewers: show handle as the primary identity, skip redundant display name
  const primaryName = loggedOut && handleDisplay ? handleDisplay : displayName;
  const showHandleLine = !loggedOut && handleDisplay;

  const ageText = age != null ? `${age} years old` : null;
  const genderText = gender && gender !== "prefer_not_to_say" ? (GENDER_DISPLAY[gender] ?? null) : null;
  const identityText = [ageText, genderText].filter(Boolean).join(" • ") || null;
  const memberSinceLabel = formatMemberSince(memberSince);

  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={{ xs: 2, sm: 2.5 }}
      alignItems={{ xs: "center", sm: "flex-start" }}
    >
      <Box
        sx={{
          flexShrink: 0,
          borderRadius: "50%",
          padding: "3px",
          bgcolor: "background.paper",
          boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
          display: "inline-flex",
        }}
      >
        <UserAvatar
          src={avatarUrl ? `${avatarBaseUrl}${avatarUrl}` : null}
          name={displayName}
          username={handleDisplay}
          size={112}
        />
      </Box>
      <Box sx={{ textAlign: { xs: "center", sm: "left" }, minWidth: 0, pt: { xs: 0, sm: 0.5 } }}>
        <Typography
          component="h1"
          sx={{
            fontSize: { xs: "1.625rem", sm: "2rem" },
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: "-0.025em",
            wordBreak: "break-word",
          }}
        >
          {primaryName}
        </Typography>
        {showHandleLine && (
          <Typography
            color="primary.dark"
            sx={{ fontSize: "0.9375rem", mt: 0.5, fontWeight: 600 }}
          >
            {handleDisplay}
          </Typography>
        )}
        {identityText && (
          <Typography color="text.secondary" sx={{ fontSize: "0.875rem", mt: 0.5 }}>
            {identityText}
          </Typography>
        )}
        {memberSinceLabel && (
          // Quiet trust signal at the foot of the hero: tells the viewer
          // this isn't a brand-new account without competing with the
          // primary identity above. Calendar glyph keeps the line scannable
          // when it sits below the age/gender row.
          <Stack
            direction="row"
            spacing={0.625}
            alignItems="center"
            justifyContent={{ xs: "center", sm: "flex-start" }}
            sx={{ mt: 0.75 }}
          >
            <CalendarMonthRoundedIcon sx={{ fontSize: 14, color: "text.disabled" }} />
            <Typography
              color="text.disabled"
              sx={{ fontSize: "0.8125rem", fontWeight: 500, lineHeight: 1.4 }}
            >
              {memberSinceLabel}
            </Typography>
          </Stack>
        )}
      </Box>
    </Stack>
  );
}
