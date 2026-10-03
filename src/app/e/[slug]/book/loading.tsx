import { SheetSkeleton } from "@/components/states/route-skeletons";
import { PicturePlaceholder } from "@/components/checkout/checkout-picture";

export default function Loading() {
  // Checkout opens under the listing's picture (`CheckoutPicture`).
  return <SheetSkeleton hero={<PicturePlaceholder />} />;
}
