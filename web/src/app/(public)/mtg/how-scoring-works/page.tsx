import type { Metadata } from "next";
import { auth } from "@/auth";
import LandingLayout from "@/components/landing/LandingLayout";
import type { MtgSetPayload } from "@/components/mtg/mtgTypes";
import HowScoringWorksContent from "./HowScoringWorksContent";

const DESCRIPTION =
  "How the MTG Card Evaluation Challenge scores your picks: 17Lands GIH WR, Card Scores from 0 to 100, small samples, ties and the season calendar.";

export const metadata: Metadata = {
  title: "How scoring works | MTG Card Evaluation Challenge",
  description: DESCRIPTION,
  alternates: { canonical: "/mtg/how-scoring-works" },
  openGraph: { title: "How MTG Card Evaluation Challenge scoring works", description: DESCRIPTION, url: "/mtg/how-scoring-works" },
};

/** Season dates change once a season, so an hour of caching is plenty. */
async function loadCurrentSet(): Promise<MtgSetPayload | null> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  if (!base) return null;
  try {
    const res = await fetch(`${base}/mtg/sets/current`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; set?: MtgSetPayload };
    return data.ok && data.set ? data.set : null;
  } catch {
    return null;
  }
}

/** Public explainer linked from every challenge home, the pick wizard and
 *  the season emails (spec 10.9). Readable without an account. */
export default async function HowScoringWorksPage() {
  const [session, set] = await Promise.all([auth(), loadCurrentSet()]);
  const isLoggedIn = Boolean(session?.user?.email);
  return (
    <LandingLayout isLoggedIn={isLoggedIn}>
      <HowScoringWorksContent set={set} />
    </LandingLayout>
  );
}
