import type { Metadata } from "next";
import { Suspense } from "react";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";
import EventDetailClient from "./EventDetailClient";

export const metadata: Metadata = {
  title: "Event Details | NewChums",
};

export default function EventDetailPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
          <CircularProgress />
        </Box>
      }
    >
      <EventDetailClient />
    </Suspense>
  );
}
