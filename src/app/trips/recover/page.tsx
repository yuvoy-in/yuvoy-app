import type { Metadata } from "next";
import { RecoverScreen } from "@/components/trips/recover-screen";
import { privateRobotsMeta } from "@/lib/site/indexing";

export const metadata: Metadata = {
  title: "Get your booking back",
  robots: privateRobotsMeta,
};

export default function RecoverPage() {
  return <RecoverScreen />;
}
