import type { Metadata } from "next";
import { SearchScreen } from "@/components/search/search-screen";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage() {
  return <SearchScreen />;
}
