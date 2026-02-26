"use client";

import * as React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { AppTextField } from "@/components/ui";
import PlaceRoundedIcon from "@mui/icons-material/PlaceRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import GridViewRoundedIcon from "@mui/icons-material/GridViewRounded";

const ROW_HEIGHT = 48;

type TimeRange = "this-week" | "next-30" | "all";

export default function ExploreFilterBar() {
  const [timeRange, setTimeRange] = React.useState<TimeRange>("this-week");

  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 1.5, sm: 2 },
        borderRadius: { xs: 2, sm: 2.5 },
        borderColor: "divider",
        bgcolor: "background.paper",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}
    >
      <Stack spacing={{ xs: 1.5, sm: 2 }}>
        <Stack
          direction="row"
          flexWrap="wrap"
          useFlexGap
          gap={{ xs: 1, sm: 1.25 }}
          sx={{
            alignItems: "center",
            "& .MuiInputBase-root": { minHeight: ROW_HEIGHT },
            "& .MuiInputBase-input": { py: 0 },
          }}
        >
          <AppTextField
            placeholder="London, ON"
            helperText={null}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ ml: -0.5 }}>
                  <PlaceRoundedIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            }}
            sx={{ flex: { xs: "1 1 100%", sm: "1 1 160px" }, minWidth: { xs: 0, sm: 140 } }}
          />
          <AppTextField
            select
            helperText={null}
            SelectProps={{ native: true }}
            defaultValue="5"
            sx={{
              flex: { xs: "1 1 100%", sm: "0 0 auto" },
              minWidth: { xs: 0, sm: 145 },
            }}
          >
            <option value="5">Within 5 km</option>
            <option value="10">Within 10 km</option>
            <option value="25">Within 25 km</option>
            <option value="50">Within 50 km</option>
          </AppTextField>
          <AppTextField
            placeholder="Hobbies (e.g. Hiking)"
            helperText={null}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ ml: -0.5 }}>
                  <GridViewRoundedIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            }}
            sx={{ flex: { xs: "1 1 100%", sm: "1 1 160px" }, minWidth: { xs: 0, sm: 140 } }}
          />
          <Button
            variant="contained"
            color="primary"
            startIcon={<SearchRoundedIcon fontSize="small" />}
            sx={{
              height: ROW_HEIGHT,
              minWidth: 100,
              borderRadius: 2,
              textTransform: "capitalize",
              boxShadow: "none",
              flex: { xs: "1 1 100%", sm: "0 0 auto" },
              transition: "opacity 0.2s ease, transform 0.15s ease",
              "&:hover": { boxShadow: "none", opacity: 0.95 },
              "&:active": { transform: "scale(0.98)" },
            }}
          >
            Search
          </Button>
        </Stack>
        <Box>
          <ToggleButtonGroup
            value={timeRange}
            exclusive
            onChange={(_, v) => v != null && setTimeRange(v)}
            size="small"
            sx={{
              "& .MuiToggleButton-root": {
                ml: 0.5,
                "&:first-of-type": { ml: 0 },
                px: 1.5,
                py: 0.5,
                borderRadius: 2,
                textTransform: "capitalize",
                borderColor: "divider",
                color: "text.secondary",
                transition: "all 0.2s ease",
                "&.Mui-selected": {
                  bgcolor: "primary.light",
                  color: "primary.dark",
                  borderColor: "primary.light",
                  "&:hover": { bgcolor: "primary.light" },
                },
                "&:hover": {
                  bgcolor: "action.hover",
                },
                "&:active": {
                  transform: "scale(0.98)",
                },
              },
            }}
          >
            <ToggleButton value="this-week">This Week</ToggleButton>
            <ToggleButton value="next-30">Next 30 Days</ToggleButton>
            <ToggleButton value="all">All</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Stack>
    </Paper>
  );
}
