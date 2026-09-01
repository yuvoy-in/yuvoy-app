import type { Metadata } from "next";
import { AccountScreen } from "@/components/account/account-screen";
import { privateRobotsMeta } from "@/lib/site/indexing";

export const metadata: Metadata = {
  title: "Account",
  robots: privateRobotsMeta,
};

export default function AccountPage() {
  return <AccountScreen />;
}
