import { SheetSkeleton } from "@/components/states/route-skeletons";

/*
  Matched to `BookingScreen`'s own `Shell` — `<Screen back={{href:"/trips"}}
  stageLabel="Your booking">` — so the fallback and the screen are the same
  frame and only the content inside it changes.

  Without the match this route flashed a different chassis on every open: the
  fallback drew the wordmark and tab-bar clearance, the screen drew a back disc,
  a centred label and a `pb-8` foot. That is the one screen a traveller reaches
  from a link somebody sent them, and its only credential is in the fragment, so
  the client always has a moment of work to do after the frame arrives. The
  frame may as well be the right one from the first paint.
*/
export default function Loading() {
  return (
    <SheetSkeleton
      back={{ href: "/trips", label: "your trips" }}
      stageLabel="Your booking"
    />
  );
}
