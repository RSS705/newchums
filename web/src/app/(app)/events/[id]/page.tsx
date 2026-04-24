import type { Metadata } from "next";
import { Suspense } from "react";
import CircularProgress from "@mui/material/CircularProgress";
import Box from "@mui/material/Box";
import EventDetailClient from "./EventDetailClient";

// Static fallback metadata overriding the (app)/layout.tsx noindex cascade.
// generateMetadata in the follow-up commit will replace this with dynamic,
// plan-specific metadata (title, hobby, approximate area, start time)
// built from the public unauthenticated plan response only.
export const metadata: Metadata = {
  title: "Plan",
  robots: { index: true, follow: true },
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
