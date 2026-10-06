import { SearchRouteSkeleton } from "@/components/search/search-parts";

/*
  The Search tab's own first paint, not the generic sheet: the generic one
  had no title or field, was wider than the screen on a desktop, and was
  followed by 300ms of nothing before the grid's skeleton faded in.
*/
export default function Loading() {
  return <SearchRouteSkeleton />;
}
