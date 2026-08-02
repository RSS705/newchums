"use client";

import Autocomplete from "@mui/material/Autocomplete";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import CollapsibleSection from "./CollapsibleSection";

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
  /** Collapsed by default (two-tier form); the parent owns the open state. */
  expanded: boolean;
  onToggle: () => void;
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
   *  community is already linked that isn't in this list (e.g. the host left
   *  the community after creating the plan), the caller should include those
   *  linked communities in this array so the author can still see and detach
   *  them. */
  myCommunities: MyCommunity[];
  selectedCommunityIds: string[];
  onChangeSelectedCommunityIds: (ids: string[]) => void;
  hideFromExplore: boolean;
  onChangeHideFromExplore: (value: boolean) => void;
};

export default function CommunityLinkSection(props: Props) {
  // Invite-only plans cannot participate in community discovery. Hide the
  // section entirely so the form never suggests otherwise. POST/PATCH
  // server-side also force-clears community links when visibility=invite_only.
  if (props.visibility === "invite_only") return null;

  // Nothing to show when the user has no communities and the plan isn't
  // already linked to one. Prevents an empty selector on first-time hosts.
  if (props.myCommunities.length === 0 && props.selectedCommunityIds.length === 0) return null;

  const selectedSet = new Set(props.selectedCommunityIds);
  const selectedCommunities = props.myCommunities.filter((c) => selectedSet.has(c.id));
  const hasAnySelection = selectedCommunities.length > 0;
  // Use singular copy when the host only has access to one community, the
  // plural prompts ("pick more than one", "each community") read as
  // confusing in that case. The plan can still be linked to the single
  // community via the same multi-select control.
  const isSingleCommunity = props.myCommunities.length === 1;
  // Mirror the server-side cap so the user can't push past it and then get
  // a silent server-side truncation. POST /events and PATCH /events/:id
  // both slice to this length after dedup.
  const MAX_COMMUNITIES = 10;
  const atCap = selectedCommunities.length >= MAX_COMMUNITIES;

  // Collapsed-header summary: which communities the plan is linked to, and
  // whether it is members-only in Explore.
  const summary =
    selectedCommunities.length === 0
      ? "Not linked to a community"
      : `${selectedCommunities
          .map((c) => c.name)
          .slice(0, 2)
          .join(", ")}${selectedCommunities.length > 2 ? `, +${selectedCommunities.length - 2} more` : ""}${
          props.hideFromExplore ? " (members only)" : ""
        }`;

  return (
    <CollapsibleSection
      sectionKey="community"
      icon={<GroupsRoundedIcon sx={{ fontSize: 22 }} />}
      title={isSingleCommunity ? "Community" : "Communities"}
      subtitle={
        isSingleCommunity
          ? "Linked plans appear in your community and in explore by default."
          : "Linked plans appear in each community and in explore by default. You can pick more than one."
      }
      summary={summary}
      expanded={props.expanded}
      onToggle={props.onToggle}
    >
      <Stack spacing={2}>
        <Autocomplete
          multiple
          options={props.myCommunities}
          value={selectedCommunities}
          onChange={(_e, value) => {
            // Cap selections at MAX_COMMUNITIES so the user gets a clear
            // "no more" instead of a silent server-side truncation.
            const next = value.slice(0, MAX_COMMUNITIES).map((v) => v.id);
            props.onChangeSelectedCommunityIds(next);
            if (next.length === 0) props.onChangeHideFromExplore(false);
          }}
          getOptionLabel={(opt) => opt.name}
          isOptionEqualToValue={(opt, val) => opt.id === val.id}
          getOptionDisabled={(opt) => atCap && !selectedSet.has(opt.id)}
          renderTags={(value, getTagProps) =>
            value.map((opt, index) => {
              const tagProps = getTagProps({ index });
              return (
                <Chip
                  {...tagProps}
                  key={opt.id}
                  label={opt.name}
                  size="small"
                />
              );
            })
          }
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder={
                hasAnySelection
                  ? ""
                  : isSingleCommunity
                    ? "Link to your community"
                    : "Pick one or more communities"
              }
              size="medium"
              helperText={atCap ? `Maximum of ${MAX_COMMUNITIES} communities reached.` : undefined}
            />
          )}
        />

        {hasAnySelection && (
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
    </CollapsibleSection>
  );
}
