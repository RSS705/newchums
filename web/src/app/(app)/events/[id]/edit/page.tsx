import type { Metadata } from "next";
import { Suspense } from "react";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";
import EditEventClient from "./EditEventClient";

export const metadata: Metadata = {
  title: "Edit Plan | NewChums",
};

export default function EditEventPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
          <CircularProgress />
        </Box>
      }
    >
      <EditEventClient />
    </Suspense>
  );
}
