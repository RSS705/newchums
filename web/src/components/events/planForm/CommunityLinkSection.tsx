"use client";

import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { AppCard } from "@/components/ui";

export type MyCommunity = {
  id: string;
  name: string;
  slug?: string;
  is_online?: boolean;
  location_name?: string | null;
  location_address?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
};

export type PlanVisibility = "public" | "chums_only" | "invite_only";

type CommonProps = {
  /** Plan's base visibility. Drives what this section renders:
   *  - `invite_only`: section is hidden entirely because invite_only plans
   *    cannot participate in community discovery (Explore and the community
   *    feed both exclude them server-side).
   *  - `chums_only`: section renders but surfaces a reminder that chums-only
   *    rules still apply, so the author understands community members who
   *    aren't on their Chum List still won't see the plan.
   *  - `public`: standard Community section behavior. */
  visibility: PlanVisibility;
};

type AddProps = CommonProps & {
  mode: "add";
  /** User's communities available for linking. Section is only rendered when this has items. */
  myCommunities: MyCommunity[];
  selectedCommunityId: string | null;
  onChangeSelectedCommunityId: (id: string | null) => void;
  hideFromExplore: boolean;
  onChangeHideFromExplore: (value: boolean) => void;
};

type EditProps = CommonProps & {
  mode: "edit";
  /** Linked community info loaded from the event. Section is only rendered when both are set. */
  communityId: string | null;
  communityName: string | null;
  hideFromExplore: boolean;
  onChangeHideFromExplore: (value: boolean) => void;
};

type Props = AddProps | EditProps;

/** Unified "Community" section header, matches Add and Edit plan form heading style. */
function Header({ subtitle }: { subtitle: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
        Community
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {subtitle}
      </Typography>
    </Box>
  );
}

/** Shared "Only show this plan to community members" toggle. Single source of
 *  truth for the label, helper text, and slotProps styling across both forms. */
function MembersOnlyToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <>
      <FormControlLabel
        control={
          <Switch checked={value} onChange={(e) => onChange(e.target.checked)} size="small" />
        }
        label="Only show this plan to community members"
        slotProps={{ typography: { variant: "body2", fontWeight: 500 } }}
        sx={{ gap: 0.5 }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>
        When on, this plan only appears in the community feed and to members in their Explore.
        Others won&#39;t see it.
      </Typography>
    </>
  );
}

/** Reminder rendered inside the Community section when the plan is
 *  chums_only. Community linkage does not expand the audience beyond the
 *  base visibility rule, so we make that explicit here rather than letting
 *  the author assume all community members will see the plan. */
function ChumsOnlyReminder() {
  return (
    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
      Because this plan is set to <strong>Chums only</strong>, only people on your Chum List will
      see it. Community members who aren&#39;t on your Chum List still won&#39;t see it, even in the
      community feed.
    </Typography>
  );
}

export default function CommunityLinkSection(props: Props) {
  // Invite-only plans cannot participate in community discovery. Hide the
  // section entirely so the form never suggests otherwise. POST/PATCH
  // server-side also force-clears community_id when visibility=invite_only.
  if (props.visibility === "invite_only") return null;

  if (props.mode === "add") {
    if (props.myCommunities.length === 0) return null;
    return (
      <AppCard>
        <Stack spacing={2}>
          <Header subtitle="Linked plans appear in the community and in explore by default." />

          <FormControl fullWidth size="medium">
            <Select
              id="community-select"
              value={props.selectedCommunityId ?? ""}
              onChange={(e) => {
                const val = e.target.value || null;
                props.onChangeSelectedCommunityId(val);
                if (!val) props.onChangeHideFromExplore(false);
              }}
              displayEmpty
              variant="outlined"
              sx={{ "& .MuiSelect-select": { py: 1.25 } }}
            >
              <MenuItem value="">
                <Typography variant="body2" color="text.secondary">
                  None
                </Typography>
              </MenuItem>
              {props.myCommunities.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  <Typography variant="body2">{c.name}</Typography>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {props.selectedCommunityId && (
            <>
              <MembersOnlyToggle
                value={props.hideFromExplore}
                onChange={props.onChangeHideFromExplore}
              />
              {props.visibility === "chums_only" && <ChumsOnlyReminder />}
            </>
          )}
        </Stack>
      </AppCard>
    );
  }

  // mode === "edit"
  if (!props.communityId || !props.communityName) return null;
  return (
    <AppCard>
      <Stack spacing={2}>
        <Header
          subtitle={
            <>
              This plan is linked to <strong>{props.communityName}</strong>.
            </>
          }
        />
        <MembersOnlyToggle
          value={props.hideFromExplore}
          onChange={props.onChangeHideFromExplore}
        />
        {props.visibility === "chums_only" && <ChumsOnlyReminder />}
      </Stack>
    </AppCard>
  );
}
