"use client";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Skeleton from "@mui/material/Skeleton";

export default function EventCardSkeleton() {
  return (
    <Card sx={{ width: "100%", overflow: "hidden" }}>
      <Skeleton variant="rectangular" height={140} sx={{ borderRadius: 0 }} />
      <CardContent>
        <Skeleton variant="text" width="75%" height={24} sx={{ mb: 0.5 }} />
        <Skeleton variant="text" width="50%" height={18} sx={{ mb: 1 }} />
        <Skeleton variant="text" width="60%" height={18} />
      </CardContent>
    </Card>
  );
}
