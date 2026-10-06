import { SheetSkeleton } from "@/components/states/route-skeletons";

/*
  With the screen's own Back, so the header does not draw the wordmark and
  Login for a beat and then swap them for a Back disc as the trip lands.
*/
export default function Loading() {
  return <SheetSkeleton back={{ href: "/trips", label: "your trips" }} />;
}
