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

type Props = {
  /** Plan's base visibility. Drives what this section renders:
   *  - `invite_only`: section is hidden entirely because invite_only plans
   *    cannot participate in community discovery (Explore and the community
   *    feed both exclude them server-side).
   *  - `chums_only`: section renders but surfaces a reminder that chums-only
   *    rules still apply, so the author understands community members who
   *    aren't on their Chum List still won't see the plan.
   *  - `public`: standard Community section behavior. */
  visibility: PlanVisibility;
  /** User's communities available for linking. When empty and no community is
   *  already selected, the section is hidden, there's nothing to offer. If a
   *  community is already selected that isn't in this list (e.g. the host left
   *  the community after creating the plan), the caller should include the
   *  linked community in this array so the author can still see and detach
   *  it. */
  myCommunities: MyCommunity[];
  selectedCommunityId: string | null;
  onChangeSelectedCommunityId: (id: string | null) => void;
  hideFromExplore: boolean;
  onChangeHideFromExplore: (value: boolean) => void;
};

export default function CommunityLinkSection(props: Props) {
  // Invite-only plans cannot participate in community discovery. Hide the
  // section entirely so the form never suggests otherwise. POST/PATCH
  // server-side also force-clears community_id when visibility=invite_only.
  if (props.visibility === "invite_only") return null;

  // Nothing to show when the user has no communities and the plan isn't
  // already linked to one. Prevents an empty dropdown on first-time hosts.
  if (props.myCommunities.length === 0 && !props.selectedCommunityId) return null;

  return (
    <AppCard>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6" fontWeight={700} sx={{ fontSize: "1.0625rem" }}>
            Community
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Linked plans appear in the community and in explore by default.
          </Typography>
        </Box>

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
            <FormControlLabel
              control={
                <Switch
                  checked={props.hideFromExplore}
                  onChange={(e) => props.onChangeHideFromExplore(e.target.checked)}
                  size="small"
                />
              }
              label="Only show this plan to community members"
              slotProps={{ typography: { variant: "body2", fontWeight: 500 } }}
              sx={{ gap: 0.5 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: -0.5 }}>
              When on, this plan only appears in the community feed and to members in their Explore.
              Others won&#39;t see it.
            </Typography>
            {props.visibility === "chums_only" && (
              <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                Because this plan is set to <strong>Chums only</strong>, only people on your Chum
                List will see it. Community members who aren&#39;t on your Chum List still won&#39;t
                see it, even in the community feed.
              </Typography>
            )}
          </>
        )}
      </Stack>
    </AppCard>
  );
}
