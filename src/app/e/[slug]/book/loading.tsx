import { CheckoutRouteSkeleton } from "@/components/checkout/checkout-skeleton";

export default function Loading() {
  // Checkout's own frame, its Back read from the route, so the boundary and
  // the screen are one shape.
  return <CheckoutRouteSkeleton />;
}
