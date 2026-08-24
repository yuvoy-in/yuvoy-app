import type { Metadata } from "next";
import { RecoverScreen } from "@/components/trips/recover-screen";

export const metadata: Metadata = {
  title: "Get your booking back",
  robots: { index: false, follow: false },
};

export default function RecoverPage() {
  return <RecoverScreen />;
}
