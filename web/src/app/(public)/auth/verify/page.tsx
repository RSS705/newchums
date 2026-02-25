import type { Metadata } from "next";
import VerifyClient from "./VerifyClient";

export const metadata: Metadata = {
  title: "Verify Email | NewChums",
};

export default function VerifyPage() {
  return <VerifyClient />;
}
