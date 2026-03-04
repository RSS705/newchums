"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { AppCard } from "@/components/ui";
import ProfileHeaderSection from "./ProfileHeaderSection";
import ProfileBioSection from "./ProfileBioSection";
import ProfileHobbiesSection from "./ProfileHobbiesSection";

export type PublicProfileUser = {
  userId: string;
  displayName: string;
  handle: string | null;
  age: number | null;
  bio: string | null;
  hobbies: string[];
  avatarUrl: string | null;
};

export type PublicProfileViewProps = {
  user: PublicProfileUser;
  avatarBaseUrl: string;
  /** When true, show preview subheader (this is how others see your profile; privacy in Settings) */
  isOwner?: boolean;
};

/**
 * Shared public profile view. Renders modular sections; easy to add future
 * sections (XP, badges, trust metrics, unlockables) as separate components.
 */
export default function PublicProfileView({ user, avatarBaseUrl, isOwner }: PublicProfileViewProps) {
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

      <AppCard sx={{ borderRadius: { xs: 2, sm: 2.5 }, overflow: "hidden" }}>
        <Stack spacing={2}>
          <ProfileHeaderSection
            displayName={user.displayName}
            handle={user.handle}
            age={user.age}
            avatarUrl={user.avatarUrl}
            avatarBaseUrl={avatarBaseUrl}
          />
        </Stack>
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

      {/* TODO: Future sections — XP, badges, trust metrics, unlockables — add as separate components. */}
    </Stack>
  );
}
