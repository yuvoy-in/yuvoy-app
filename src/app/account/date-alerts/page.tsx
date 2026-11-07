import type { Metadata } from "next";
import { DateAlertsScreen } from "@/components/account/date-alerts-screen";
import { privateRobotsMeta } from "@/lib/site/indexing";
import { TRIGO_LISTS_WORDS } from "@/lib/trigo/lists-words";

export const metadata: Metadata = {
  title: TRIGO_LISTS_WORDS.alertsTitle,
  robots: privateRobotsMeta,
};

/**
 * Date alerts: the alerts Trigo keeps for the signed-in number
 * (yuvoy-app#220). Everything on it is the traveller's own, read through
 * this app's `/api/v1` proxy, so the page is a shell for the client screen.
 */
export default function DateAlertsPage() {
  return <DateAlertsScreen />;
}
