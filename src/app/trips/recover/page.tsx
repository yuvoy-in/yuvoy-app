import type { Metadata } from "next";
import { RecoverScreen } from "@/components/trips/recover-screen";
import { privateRobotsMeta } from "@/lib/site/indexing";

export const metadata: Metadata = {
  title: "Find your booking",
  robots: privateRobotsMeta,
};

export default function RecoverPage() {
  return <RecoverScreen />;
}
