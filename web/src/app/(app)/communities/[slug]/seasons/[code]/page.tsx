import type { Metadata } from "next";
import SeasonView from "@/components/mtg/results/SeasonView";

export const metadata: Metadata = {
  title: "Season | NewChums",
};

/** A finished season of an MTG Card Evaluation Challenge group (spec 10.8). */
export default function CommunitySeasonPage() {
  return <SeasonView />;
}
