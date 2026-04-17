import type { Metadata } from "next";
import { Suspense } from "react";
import { auth } from "@/auth";
import { getSafeRedirectPath } from "@/lib/authRedirect";
import MagicClient from "./MagicClient";
import WrongSessionPanel from "./WrongSessionPanel";

export const metadata: Metadata = {
  title: "Confirming sign-in | NewChums",
};

type SearchParams = {
  email?: string | string[];
  token?: string | string[];
  next?: string | string[];
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MagicPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const email = first(params.email)?.trim().toLowerCase() ?? "";
  const token = first(params.token)?.trim() ?? "";
  const next = getSafeRedirectPath(first(params.next));

  const session = await auth();
  const signedInEmail = session?.user?.email?.trim().toLowerCase() ?? "";

  // Wrong-session interstitial: already signed in as a different account.
  if (signedInEmail && email && signedInEmail !== email) {
    return <WrongSessionPanel signedInEmail={signedInEmail} linkEmail={email} next={next} token={token} />;
  }

  // Either not signed in, or signed in as the same email.
  // Either way, hand off to the client component to do the signIn (or redirect).
  return (
    <Suspense fallback={null}>
      <MagicClient
        email={email}
        token={token}
        next={next}
        alreadySignedInSameEmail={Boolean(signedInEmail) && signedInEmail === email}
      />
    </Suspense>
  );
}
