import type { Metadata } from "next";
import { TripsScreen } from "@/components/trips/trips-screen";
import { privateRobotsMeta } from "@/lib/site/indexing";

export const metadata: Metadata = {
  title: "Your trips",
  robots: privateRobotsMeta,
};

export default function TripsPage() {
  return <TripsScreen />;
}
