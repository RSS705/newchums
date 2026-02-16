import { auth } from "@/auth";
import AppShell from "@/components/layout/AppShell";
import { getRequestedPathFromHeaders } from "@/lib/authRedirect";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const runtime = "edge";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  if (!session) {
    const requestHeaders = await headers();
    const requestedPath = getRequestedPathFromHeaders(requestHeaders);
    redirect(`/login?next=${encodeURIComponent(requestedPath)}`);
  }

  return <AppShell>{children}</AppShell>;
}
