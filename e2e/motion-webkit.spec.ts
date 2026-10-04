import { defineTabBarGlide } from "./support/motion";
import { defineRouteMotion } from "./support/route-motion";
import { defineSheetMotion } from "./support/sheet-motion";
import { defineSearchMotion } from "./support/search-motion";
import { defineBookingMotion } from "./support/booking-motion";

/*
  The same checks on WebKit (Safari's engine): how a clip, a filter and a
  transform composite is an engine difference, and the study's tab bar drew a
  shaded block in Safari while passing everywhere else. Screen changes are
  view transitions, an engine feature, and Safari is most of the traffic.
*/
defineTabBarGlide();
defineRouteMotion();
defineSheetMotion();
defineSearchMotion();
defineBookingMotion();
