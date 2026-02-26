"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { AppTextField } from "@/components/ui";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import GridViewRoundedIcon from "@mui/icons-material/GridViewRounded";

type TimeRange = "this-week" | "next-30" | "all";

export default function ExploreFilterBar() {
  const [timeRange, setTimeRange] = React.useState<TimeRange>("this-week");

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        flexWrap="wrap"
        useFlexGap
      >
        <AppTextField
          placeholder="Central Park, NY"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <PlaceRoundedIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 180 }}
        />
        <AppTextField
          select
          SelectProps={{ native: true }}
          defaultValue="5"
          sx={{ minWidth: 140 }}
        >
          <option value="5">Within 5 km</option>
          <option value="10">Within 10 km</option>
          <option value="25">Within 25 km</option>
          <option value="50">Within 50 km</option>
        </AppTextField>
        <AppTextField
          placeholder="Interests (e.g. Hiking)"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <GridViewRoundedIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 180 }}
        />
        <Button variant="contained" color="primary" startIcon={<SearchRoundedIcon />}>
          Search
        </Button>
      </Stack>
      <Box>
        <ToggleButtonGroup
          value={timeRange}
          exclusive
          onChange={(_, v) => v != null && setTimeRange(v)}
          size="small"
        >
          <ToggleButton value="this-week">This Week</ToggleButton>
          <ToggleButton value="next-30">Next 30 Days</ToggleButton>
          <ToggleButton value="all">All</ToggleButton>
        </ToggleButtonGroup>
      </Box>
    </Stack>
  );
}
