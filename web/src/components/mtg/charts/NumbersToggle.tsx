"use client";

import Button from "@mui/material/Button";
import TableChartOutlinedIcon from "@mui/icons-material/TableChartOutlined";

/**
 * The button that opens a chart's table of every value. It sits in the card's
 * title row, on the right, as the game's other small actions do (the same
 * quiet outlined button as "Compare with me" and the community page's Edit),
 * rather than as a tinted text button under the chart.
 */
export default function NumbersToggle({ open, onToggle, tableId }: { open: boolean; onToggle: () => void; tableId: string }) {
  return (
    <Button
      variant="outlined"
      color="inherit"
      size="small"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={open ? tableId : undefined}
      startIcon={<TableChartOutlinedIcon sx={{ fontSize: 16 }} />}
      sx={{ textTransform: "none", fontWeight: 600, borderRadius: 2, whiteSpace: "nowrap", flexShrink: 0 }}
    >
      {open ? "Hide the numbers" : "Show the numbers"}
    </Button>
  );
}
