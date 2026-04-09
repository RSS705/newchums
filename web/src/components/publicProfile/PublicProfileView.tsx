"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import Button from "@mui/material/Button";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import PersonRemoveRoundedIcon from "@mui/icons-material/PersonRemoveRounded";
import { AppCard } from "@/components/ui";
import { getProfileCardBg } from "@/lib/profileTheme";
import AttendanceRecordSection from "./AttendanceRecordSection";
import ProfileHeaderSection from "./ProfileHeaderSection";
import ProfileBioSection from "./ProfileBioSection";
import ProfileChumsSection from "./ProfileChumsSection";
import ProfileHobbiesSection from "./ProfileHobbiesSection";
import PublicProfileShoutoutsSection from "./PublicProfileShoutoutsSection";

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
  is_hidden_shoutouts: boolean;
};

export type ChumAction = {
  isSaved: boolean;
  loading: boolean;
  onToggle: () => void;
};

export type PublicProfileViewProps = {
  user: PublicProfileUser;
  avatarBaseUrl: string;
  isOwner?: boolean;
  chumAction?: ChumAction;
  viewerLoggedIn?: boolean;
};

/**
 * Shared public profile view. Renders modular sections; easy to add future
 * sections (XP, badges, trust metrics, unlockables) as separate components.
 */
export default function PublicProfileView({ user, avatarBaseUrl, isOwner, chumAction, viewerLoggedIn }: PublicProfileViewProps) {
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
                variant="inherit"
                sx={{
                  color: "primary.main",
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
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "stretch", sm: "flex-start" },
            gap: { xs: 2, sm: 1 },
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <ProfileHeaderSection
              displayName={user.displayName}
              handle={user.handle}
              age={user.age}
              gender={user.gender}
              avatarUrl={user.avatarUrl}
              avatarBaseUrl={avatarBaseUrl}
              viewerLoggedIn={viewerLoggedIn}
            />
          </Box>
          {chumAction && (
            <Box sx={{ flexShrink: 0, pt: { xs: 0, sm: 0.25 }, width: { xs: "100%", sm: "auto" } }}>
              {chumAction.isSaved ? (
                /* Already-a-chum state: deliberately understated. The user
                   has already taken the primary action; "Remove from Chums"
                   should be discoverable but never the focus of the page. */
                <Button
                  variant="text"
                  size="small"
                  disabled={chumAction.loading}
                  onClick={chumAction.onToggle}
                  startIcon={<PersonRemoveRoundedIcon sx={{ fontSize: "1rem !important" }} />}
                  sx={{
                    fontSize: "0.75rem",
                    lineHeight: 1.25,
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    textTransform: "none",
                    fontWeight: 500,
                    borderRadius: 2,
                    color: "text.disabled",
                    px: { xs: 1.25, sm: 1.5 },
                    py: 0.5,
                    width: { xs: "100%", sm: "auto" },
                    "&:hover": {
                      color: "text.secondary",
                      backgroundColor: "action.hover",
                    },
                  }}
                >
                  Remove from Chums
                </Button>
              ) : (
                <Button
                  variant="contained"
                  size="medium"
                  color="primary"
                  disabled={chumAction.loading}
                  onClick={chumAction.onToggle}
                  startIcon={<PersonAddRoundedIcon />}
                  fullWidth
                  sx={{
                    fontSize: "0.8125rem",
                    lineHeight: 1.25,
                    textAlign: "center",
                    whiteSpace: "nowrap",
                    textTransform: "none",
                    fontWeight: 600,
                    borderRadius: 2.5,
                    px: { xs: 2, sm: 2.5 },
                    py: { xs: 1, sm: 0.75 },
                    width: { xs: "100%", sm: "auto" },
                  }}
                >
                  Add to Chums
                </Button>
              )}
            </Box>
          )}
        </Box>
      </AppCard>

      {user.bio && user.bio.trim() && (
        <AppCard sx={{ borderRadius: { xs: 2, sm: 2.5 }, overflow: "hidden" }}>
          <Stack spacing={1}>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: { xs: "1.0625rem", sm: "1.125rem" } }}>
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

      {/* Stats */}
      <AttendanceRecordSection
        userId={user.userId}
        isOwner={isOwner}
        displayName={user.displayName}
        variant="public"
        viewerLoggedIn={viewerLoggedIn}
      />

      {/* Approved shout-outs from people they've joined plans with. Self-
          contained card with its own fetch. The owner sees a subtle inline
          hide/show toggle and can preview the dimmed-hidden state without
          leaving the page. Empty (no approved shout-outs) renders nothing. */}
      {ownerHandleSlug && (
        <PublicProfileShoutoutsSection
          handle={ownerHandleSlug}
          isOwner={!!isOwner}
          viewerLoggedIn={!!viewerLoggedIn}
          initiallyHidden={user.is_hidden_shoutouts}
        />
      )}

      {/* Public connections section, self-contained card, hidden if owner toggled it off or list is empty */}
      {ownerHandleSlug && !user.is_hidden_chum_list && (
        <ProfileChumsSection ownerHandle={ownerHandleSlug} viewerLoggedIn={viewerLoggedIn} />
      )}

      {/* Sign-in / sign-up CTA for logged-out viewers */}
      {!viewerLoggedIn && (
        <AppCard
          sx={{
            borderRadius: { xs: 2, sm: 2.5 },
            overflow: "hidden",
            textAlign: "center",
            py: { xs: 3, sm: 4 },
            px: { xs: 2.5, sm: 4 },
          }}
        >
          <Stack spacing={1.5} alignItems="center">
            <Typography variant="subtitle1" fontWeight={700} sx={{ fontSize: { xs: "1rem", sm: "1.0625rem" } }}>
              Want to see the full profile?
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 380, lineHeight: 1.6 }}>
              Sign in to view complete profiles, connect with people, and start planning real-world gatherings.
            </Typography>
            <Stack direction="row" spacing={1.5} sx={{ mt: 0.5 }}>
              <Button
                component={Link}
                href="/login"
                variant="outlined"
                sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3 }}
              >
                Sign in
              </Button>
              <Button
                component={Link}
                href="/signup"
                variant="contained"
                sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2.5, px: 3 }}
              >
                Create an account
              </Button>
            </Stack>
          </Stack>
        </AppCard>
      )}

      {/* TODO: Future sections, XP, badges, trust metrics, unlockables, add as separate components. */}
    </Stack>
  );
}
