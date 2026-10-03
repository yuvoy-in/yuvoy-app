import { SheetSkeleton } from "@/components/states/route-skeletons";
import { PicturePlaceholder } from "@/components/chrome/picture-strip";

export default function Loading() {
  // Checkout opens under the listing's picture (`CheckoutPicture`).
  return <SheetSkeleton hero={<PicturePlaceholder />} />;
}
