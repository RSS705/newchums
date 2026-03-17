"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import Button from "@mui/material/Button";
import { AppCard } from "@/components/ui";
import { getProfileCardBg } from "@/lib/profileTheme";
import AttendanceRecordSection from "./AttendanceRecordSection";
import ProfileHeaderSection from "./ProfileHeaderSection";
import ProfileBioSection from "./ProfileBioSection";
import ProfileChumsSection from "./ProfileChumsSection";
import ProfileHobbiesSection from "./ProfileHobbiesSection";

export type PublicProfileUser = {
  userId: string;
  displayName: string;
  handle: string | null;
  age: number | null;
  gender: string | null;
  profile_theme: string | null;
  bio: string | null;
  hobbies: string[];
  avatarUrl: string | null;
  is_hidden_chum_list: boolean;
};

export type ChumAction = {
  isChummed: boolean;
  loading: boolean;
  onToggle: () => void;
};

export type PublicProfileViewProps = {
  user: PublicProfileUser;
  avatarBaseUrl: string;
  /** When true, show preview subheader (this is how others see your profile; privacy in Settings) */
  isOwner?: boolean;
  /** When present (viewer is logged in and not the owner), show Add/Remove Chum button. */
  chumAction?: ChumAction;
  /** When true, both users have added each other — show mutual handshake icon */
  isMutual?: boolean;
  /** Number of Chums shared between viewer and profile owner (0 or undefined = hide) */
  sharedCount?: number;
  /** True when the current viewer is logged in (used to enable auth'd fetches in sub-sections) */
  viewerLoggedIn?: boolean;
};

/**
 * Shared public profile view. Renders modular sections; easy to add future
 * sections (XP, badges, trust metrics, unlockables) as separate components.
 */
export default function PublicProfileView({ user, avatarBaseUrl, isOwner, chumAction, isMutual, sharedCount, viewerLoggedIn }: PublicProfileViewProps) {
  const cardBg = getProfileCardBg(user.profile_theme);
  const ownerHandleSlug = user.handle?.replace(/^@/, "") ?? null;
  return (
    <Stack spacing={{ xs: 3, sm: 4 }} sx={{ width: "100%" }}>
      <Box sx={{ textAlign: { xs: "center", sm: "left" } }}>
        <Typography
          component="h1"
          sx={{
            fontSize: { xs: "1.75rem", sm: "2rem" },
            fontWeight: 700,
            lineHeight: 1.25,
            letterSpacing: "-0.02em",
          }}
        >
          Profile
        </Typography>
        {isOwner && (
          <Stack spacing={0.25} sx={{ mt: 1 }}>
            <Typography
              color="text.secondary"
              sx={{ fontSize: { xs: "0.875rem", sm: "0.9375rem" } }}
            >
              This is how other people see your profile. You can adjust visibility in{" "}
              <Typography
                component={Link}
                href="/settings#privacy"
                sx={{
                  color: "inherit",
                  fontWeight: 500,
                  textDecoration: "none",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                Settings → Privacy
              </Typography>
              .
            </Typography>
          </Stack>
        )}
      </Box>

      <AppCard sx={{ borderRadius: { xs: 2, sm: 2.5 }, overflow: "hidden", backgroundColor: cardBg }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <ProfileHeaderSection
              displayName={user.displayName}
              handle={user.handle}
              age={user.age}
              gender={user.gender}
              avatarUrl={user.avatarUrl}
              avatarBaseUrl={avatarBaseUrl}
              isMutual={isMutual}
            />
          </Box>
          {chumAction && (
            <Box sx={{ flexShrink: 0, pt: 0.25 }}>
              <Button
                variant={chumAction.isChummed ? "outlined" : "contained"}
                size="small"
                color={chumAction.isChummed ? "inherit" : "primary"}
                disabled={chumAction.loading}
                onClick={chumAction.onToggle}
                sx={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}
              >
                {chumAction.isChummed ? "Remove from Chums" : "Add to Chums"}
              </Button>
            </Box>
          )}
        </Box>
      </AppCard>

      {user.bio && user.bio.trim() && (
        <AppCard sx={{ borderRadius: { xs: 2, sm: 2.5 }, overflow: "hidden" }}>
          <Stack spacing={1}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ fontSize: "0.9375rem" }}>
              About
            </Typography>
            <ProfileBioSection bio={user.bio} />
          </Stack>
        </AppCard>
      )}

      {user.hobbies && user.hobbies.length > 0 && (
        <AppCard sx={{ borderRadius: { xs: 2, sm: 2.5 }, overflow: "hidden" }}>
          <ProfileHobbiesSection hobbies={user.hobbies} />
        </AppCard>
      )}

      {/* Attendance record */}
      <AttendanceRecordSection userId={user.userId} isOwner={isOwner} />

      {/* Shared Chums count — subtle line below header for logged-in non-owners when > 0 */}
      {!isOwner && sharedCount !== undefined && sharedCount > 0 && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            fontSize: "0.8125rem",
            textAlign: { xs: "center", sm: "left" },
            mt: { xs: -1.5, sm: -2 },
          }}
        >
          You have {sharedCount} {sharedCount === 1 ? "Chum" : "Chums"} in common.
        </Typography>
      )}

      {/* Public Chums section — self-contained card, hidden if owner toggled it off or list is empty */}
      {ownerHandleSlug && !user.is_hidden_chum_list && (
        <ProfileChumsSection ownerHandle={ownerHandleSlug} viewerLoggedIn={viewerLoggedIn} />
      )}

      {/* TODO: Future sections — XP, badges, trust metrics, unlockables — add as separate components. */}
    </Stack>
  );
}
