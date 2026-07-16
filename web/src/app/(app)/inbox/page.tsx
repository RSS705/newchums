import { Suspense } from "react";
import type { Metadata } from "next";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import InboxClient from "./InboxClient";

export const metadata: Metadata = {
  title: "Inbox | NewChums",
};

export default function InboxRoute() {
  return (
    <Suspense
      fallback={
        <Stack alignItems="center" sx={{ py: 8 }}>
          <CircularProgress size={32} />
        </Stack>
      }
    >
      <InboxClient />
    </Suspense>
  );
}
