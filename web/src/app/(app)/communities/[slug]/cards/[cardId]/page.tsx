import type { Metadata } from "next";
import CardPageView from "@/components/mtg/card/CardPageView";

export const metadata: Metadata = {
  title: "Card | NewChums",
};

/** A card's numbers, rank over time and pickers in an MTG Card Evaluation Challenge group (spec 10.7). */
export default function CommunityCardPage() {
  return <CardPageView />;
}
