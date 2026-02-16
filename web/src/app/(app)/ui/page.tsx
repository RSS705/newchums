import type { Metadata } from "next";
import UIDemoClient from "./UIDemoClient";

export const metadata: Metadata = {
  title: "UI Validation | NewChums",
};

export default function UIPage() {
  return <UIDemoClient />;
}
