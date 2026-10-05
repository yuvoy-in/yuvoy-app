import { defineTabBarGlide } from "./support/motion";
import { defineRouteMotion } from "./support/route-motion";
import { defineSheetMotion } from "./support/sheet-motion";
import { defineSearchMotion } from "./support/search-motion";
import { defineBookingMotion } from "./support/booking-motion";
import { defineMediaMotion } from "./support/media-motion";

/* The motion system on the Chromium projects; WebKit runs the same checks. */
defineTabBarGlide();
defineRouteMotion();
defineSheetMotion();
defineSearchMotion();
defineBookingMotion();
defineMediaMotion();
