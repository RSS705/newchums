import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import AdminActivityLogClient from "./AdminActivityLogClient";

export const metadata: Metadata = {
  title: "User Activity | NewChums Admin",
};

export default async function AdminActivityLogPage() {
  const session = await auth();
  const email = (session?.user as { email?: string })?.email;
  if (!email) notFound();

  const rows = (await sql`
    SELECT role FROM users WHERE email = ${email} LIMIT 1
  `) as { role: string | null }[];

  if (rows.length === 0 || rows[0].role !== "super_admin") {
    notFound();
  }

  return (
    <Suspense
      fallback={
        <Stack alignItems="center" sx={{ py: 8 }}>
          <CircularProgress size={32} />
        </Stack>
      }
    >
      <AdminActivityLogClient />
    </Suspense>
  );
}
