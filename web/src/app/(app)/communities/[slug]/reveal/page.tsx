import type { Metadata } from "next";
import RevealView from "@/components/mtg/reveal/RevealView";

export const metadata: Metadata = {
  title: "The Reveal | NewChums",
};

/** The MTG Card Evaluation Challenge Reveal (spec 10.4), opened at the lock. */
export default function CommunityRevealPage() {
  return <RevealView />;
}
