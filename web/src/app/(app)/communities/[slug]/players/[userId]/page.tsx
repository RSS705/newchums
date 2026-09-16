import type { Metadata } from "next";
import PlayerView from "@/components/mtg/player/PlayerView";

export const metadata: Metadata = {
  title: "Player | NewChums",
};

/** A player's picks and standing in an MTG Card Evaluation Challenge group (spec 10.6). */
export default function CommunityPlayerPage() {
  return <PlayerView />;
}
