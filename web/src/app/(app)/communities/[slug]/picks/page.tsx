import type { Metadata } from "next";
import PickWizard from "@/components/mtg/picks/PickWizard";

export const metadata: Metadata = {
  title: "Your Picks | NewChums",
};

/** The MTG Card Evaluation Challenge pick wizard. Nested under the community so
 *  the way back is obvious; the (app) layout already requires sign-in for
 *  anything below a community slug. The entry itself belongs to the player
 *  and counts in every challenge community they are in. */
export default function CommunityPicksPage() {
  return <PickWizard />;
}
