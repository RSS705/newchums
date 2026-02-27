import type { Metadata } from "next";
import PlansPage from "@/components/dashboard/PlansPage";

export const metadata: Metadata = {
  title: "Your Plans | NewChums",
};

export default function PlansRoute() {
  return <PlansPage />;
}
