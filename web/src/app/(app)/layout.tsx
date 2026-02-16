import type { ReactNode } from "react";
import AppShell from "@/components/shell/AppShell";
import { requireAuth } from "@/lib/auth/routeGuards";

export const runtime = "edge";

export default async function AuthedLayout({ children }: { children: ReactNode }) {
  await requireAuth("/home");

  return <AppShell brandHref="/home">{children}</AppShell>;
}

