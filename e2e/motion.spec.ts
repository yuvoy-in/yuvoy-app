import { defineTabBarGlide } from "./support/motion";
import { defineRouteMotion } from "./support/route-motion";
import { defineSheetMotion } from "./support/sheet-motion";

/* The motion system on the Chromium projects; WebKit runs the same checks. */
defineTabBarGlide();
defineRouteMotion();
defineSheetMotion();
