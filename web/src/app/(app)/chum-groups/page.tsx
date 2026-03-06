import type { Metadata } from "next";
import ChumsClient from "./ChumsClient";

export const metadata: Metadata = {
  title: "Your Chums | NewChums",
};

export default function ChumsPage() {
  return <ChumsClient />;
}
