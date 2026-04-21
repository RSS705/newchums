import type { Metadata } from "next";
import YourPlanClient from "./YourPlanClient";

export const metadata: Metadata = {
  title: "Your Plan | NewChums",
};

export default function YourPlanPage() {
  return <YourPlanClient />;
}
