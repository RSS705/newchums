"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import Button from "@mui/material/Button";
import MailRoundedIcon from "@mui/icons-material/MailRounded";
import PersonAddRoundedIcon from "@mui/icons-material/PersonAddRounded";
import PersonRemoveRoundedIcon from "@mui/icons-material/PersonRemoveRounded";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import SparklesRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import { AppCard } from "@/components/ui";
import { getProfileCardBg } from "@/lib/profileTheme";
import AttendanceRecordSection from "./AttendanceRecordSection";
import ProfileHeaderSection from "./ProfileHeaderSection";
import ProfileBioSection from "./ProfileBioSection";
import ProfileChumsSection from "./ProfileChumsSection";
import ProfileCommunitiesSection from "./ProfileCommunitiesSection";
import ProfileHobbiesSection from "./ProfileHobbiesSection";
import ProfileSectionHeader from "./ProfileSectionHeader";
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
  /** Account creation timestamp (ISO string) for the "Joined {Month Year}"
   *  trust line in the hero. Null only on legacy rows without a created_at. */
  memberSince: string | null;
  is_hidden_chum_list: boolean;
  is_hidden_shoutouts: boolean;
  is_hidden_communities: boolean;
};

export type ChumAction = {
  isSaved: boolean;
  loading: boolean;
  onToggle: () => void;
};

/** Block/Unblock from the profile itself. This is the reachability fix for
 *  the old gap where blocking was only possible from inside an existing
 *  message thread; you can now block someone you have never messaged. */
export type BlockAction = {
  hasBlocked: boolean;
  loading: boolean;
  onToggle: () => void;
};

export type PublicProfileViewProps = {
  user: PublicProfileUser;
  avatarBaseUrl: string;
  isOwner?: boolean;
  chumAction?: ChumAction;
  blockAction?: BlockAction;
  viewerLoggedIn?: boolean;
  /** When set, renders a "Message" button linking into the Inbox compose
   *  flow. Null/undefined hides the button (logged out, self, or the
   *  profile owner isn't accepting messages from this viewer). */
  messageHref?: string | null;
};

/**
 * Shared public profile view. Renders modular sections; easy to add future
 * sections (XP, badges, trust metrics, unlockables) as separate components.
 */
export default function PublicProfileView({ user, avatarBaseUrl, isOwner, chumAction, blockAction, viewerLoggedIn, messageHref }: PublicProfileViewProps) {
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const cardBg = getProfileCardBg(user.profile_theme);
  const ownerHandleSlug = user.handle?.replace(/^@/, "") ?? null;
  return (
    <>
    <Stack spacing={{ xs: 2.5, sm: 3 }} sx={{ width: "100%" }}>
      {/* Owner-only orientation banner. Non-owner viewers don't see a
          generic "Profile" page heading, the profile card itself is the
          page identity. The banner is small, warm, and ends with a quick
          link into Settings -> Privacy so the owner can flip visibility
          without leaving the page. */}
      {isOwner && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: { xs: 1.75, sm: 2 },
            py: { xs: 1.25, sm: 1.5 },
            borderRadius: 2.5,
            border: "1px solid",
            borderColor: "primary.light",
            background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
          }}
        >
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              bgcolor: "primary.main",
              color: "primary.contrastText",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <SparklesRoundedIcon sx={{ fontSize: 18 }} />
          </Box>
          <Typography
            color="text.secondary"
            sx={{ fontSize: { xs: "0.8125rem", sm: "0.875rem" }, lineHeight: 1.5, flex: 1, minWidth: 0 }}
          >
            This is how other people see your profile. Adjust visibility in{" "}
            <Typography
              component={Link}
              href="/settings#privacy"
              variant="inherit"
              sx={{
                color: "primary.dark",
                fontWeight: 600,
                textDecoration: "none",
                "&:hover": { textDecoration: "underline" },
              }}
            >
              Settings &rsaquo; Privacy
            </Typography>
            .
          </Typography>
          <Button
            component={Link}
            href="/profile"
            variant="text"
            size="small"
            startIcon={<EditRoundedIcon sx={{ fontSize: 16 }} />}
            sx={{
              flexShrink: 0,
              textTransform: "none",
              fontWeight: 600,
              borderRadius: 2,
              color: "primary.dark",
              display: { xs: "none", sm: "inline-flex" },
              "&:hover": { bgcolor: "rgba(230, 91, 19, 0.08)" },
            }}
          >
            Edit profile
          </Button>
        </Box>
      )}

      <AppCard
        sx={{
          borderRadius: { xs: 2.5, sm: 3 },
          overflow: "hidden",
          backgroundColor: cardBg,
          border: "1px solid",
          borderColor: "grey.200",
          boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
          p: { xs: 2.25, sm: 3 },
          "& > .MuiCardContent-root": { p: 0, "&:last-child": { pb: 0 } },
        }}
      >
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
              memberSince={user.memberSince}
              viewerLoggedIn={viewerLoggedIn}
            />
          </Box>
          {(chumAction || messageHref) && (
            <Stack
              spacing={1}
              sx={{ flexShrink: 0, pt: { xs: 0, sm: 0.25 }, width: { xs: "100%", sm: "auto" }, alignItems: { xs: "stretch", sm: "flex-end" } }}
            >
              {messageHref && (
                <Button
                  component={Link}
                  href={messageHref}
                  variant={chumAction?.isSaved ? "contained" : "outlined"}
                  size="medium"
                  color="primary"
                  startIcon={<MailRoundedIcon sx={{ fontSize: "1.05rem !important" }} />}
                  sx={{
                    fontSize: "0.8125rem",
                    lineHeight: 1.25,
                    whiteSpace: "nowrap",
                    textTransform: "none",
                    fontWeight: 600,
                    borderRadius: 2.5,
                    px: { xs: 2, sm: 2.5 },
                    py: { xs: 1, sm: 0.75 },
                    width: { xs: "100%", sm: "auto" },
                  }}
                >
                  Message
                </Button>
              )}
              {chumAction && (chumAction.isSaved ? (
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
              ))}
              {blockAction && (
                <Button
                  variant="text"
                  size="small"
                  disabled={blockAction.loading}
                  onClick={() => {
                    if (blockAction.hasBlocked) blockAction.onToggle();
                    else setBlockConfirmOpen(true);
                  }}
                  startIcon={<BlockRoundedIcon sx={{ fontSize: "1rem !important" }} />}
                  sx={{
                    textTransform: "none",
                    fontWeight: 600,
                    fontSize: "0.78rem",
                    color: "text.disabled",
                    backgroundColor: "transparent",
                    alignSelf: { xs: "stretch", sm: "flex-end" },
                    "&:hover": { bgcolor: "action.hover", color: "text.secondary" },
                  }}
                >
                  {blockAction.loading ? "Working…" : blockAction.hasBlocked ? "Unblock" : "Block"}
                </Button>
              )}
            </Stack>
          )}
        </Box>
      </AppCard>

      {user.bio && user.bio.trim() && (
        <AppCard sx={{ borderRadius: { xs: 2, sm: 2.5 }, overflow: "hidden" }}>
          <Stack spacing={1.75}>
            <ProfileSectionHeader
              icon={<PersonOutlineRoundedIcon sx={{ fontSize: 22 }} />}
              title="About"
            />
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

      {/* Communities section, self-contained card, hidden if owner toggled it off,
          if the user has no active memberships, or all of theirs are in closed
          communities. Click-through to /communities/[slug] respects existing
          private-community access rules. */}
      {ownerHandleSlug && !user.is_hidden_communities && (
        <ProfileCommunitiesSection ownerHandle={ownerHandleSlug} viewerLoggedIn={viewerLoggedIn} />
      )}

      {/* Sign-in / sign-up CTA for logged-out viewers. Warm-wash + primary
          icon orb match the discovery and community-detail footers so the
          viewer is greeted by one consistent product surface across every
          public-facing page. */}
      {!viewerLoggedIn && (
        <Box
          sx={{
            mt: { xs: 1, sm: 1.5 },
            p: { xs: 2.75, sm: 3.25 },
            borderRadius: 3,
            border: "1px solid",
            borderColor: "primary.light",
            background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 65%)",
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "flex-start", sm: "center" },
            gap: { xs: 1.5, sm: 2.5 },
          }}
        >
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              bgcolor: "primary.main",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 2px 8px rgba(230, 91, 19, 0.18)",
            }}
          >
            <PersonAddRoundedIcon sx={{ color: "primary.contrastText", fontSize: 22 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.25, fontSize: "1rem" }}>
              Connect with{" "}
              {user.handle ? `@${user.handle.replace(/^@/, "")}` : user.displayName} on NewChums
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              Sign up free to see the full profile, save people as Chums, and start planning real-world gatherings.
            </Typography>
          </Box>
          <Stack
            direction="row"
            spacing={1}
            sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}
          >
            <Button
              component={Link}
              href="/signup"
              variant="contained"
              sx={{
                textTransform: "none",
                fontWeight: 600,
                borderRadius: 2.5,
                boxShadow: "none",
                flex: { xs: 1, sm: "0 0 auto" },
                "&:hover": { boxShadow: "none", opacity: 0.92 },
              }}
            >
              Sign up
            </Button>
            <Button
              component={Link}
              href="/login"
              variant="outlined"
              sx={{
                textTransform: "none",
                fontWeight: 600,
                borderRadius: 2.5,
                flex: { xs: 1, sm: "0 0 auto" },
              }}
            >
              Sign in
            </Button>
          </Stack>
        </Box>
      )}

      {/* TODO: Future sections, XP, badges, trust metrics, unlockables, add as separate components. */}
    </Stack>

      <Dialog open={blockConfirmOpen} onClose={() => setBlockConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Block {user.displayName}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            You&apos;ll stop seeing each other on NewChums: no messages, no invites, no RSVPs to
            each other&apos;s plans. They won&apos;t be told they&apos;ve been blocked. You can
            unblock them any time from here or from Settings.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setBlockConfirmOpen(false)} sx={{ textTransform: "none", fontWeight: 600 }} variant="text">
            Cancel
          </Button>
          <Button
            onClick={() => { setBlockConfirmOpen(false); blockAction?.onToggle(); }}
            color="error"
            variant="contained"
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            Block
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
