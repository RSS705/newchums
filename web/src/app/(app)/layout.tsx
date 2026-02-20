import { auth } from "@/auth";
import AppShell from "@/components/layout/AppShell";
import { getRequestedPathFromHeaders } from "@/lib/authRedirect";
import { getOrCreateAppUser } from "@/lib/user";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const runtime = "edge";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  const requestHeaders = await headers();
  const requestedPath = getRequestedPathFromHeaders(requestHeaders);

  if (!session) {
    redirect(`/login?next=${encodeURIComponent(requestedPath)}`);
  }

  const email = (session.user as { email?: string })?.email;
  if (!email || typeof email !== "string") {
    return <AppShell>{children}</AppShell>;
  }

  if (requestedPath === "/onboarding/username") {
    return <AppShell>{children}</AppShell>;
  }

  const { username, date_of_birth } = await getOrCreateAppUser(
    email,
    (session.user as { name?: string | null })?.name
  );

  const needsOnboarding =
    !date_of_birth ||
    date_of_birth.trim() === "" ||
    username == null ||
    username.trim() === "";

  if (needsOnboarding) {
    redirect(
      `/onboarding/username?returnTo=${encodeURIComponent(requestedPath)}`
    );
  }

  return <AppShell>{children}</AppShell>;
}
