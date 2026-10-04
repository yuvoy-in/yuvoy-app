import { defineTabBarGlide } from "./support/motion";
import { defineRouteMotion } from "./support/route-motion";

/* The motion system on the Chromium projects; WebKit runs the same checks. */
defineTabBarGlide();
defineRouteMotion();
