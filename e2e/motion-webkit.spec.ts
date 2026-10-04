import { defineTabBarGlide } from "./support/motion";

/*
  The same checks on WebKit (Safari's engine): how a clip, a filter and a
  transform composite is an engine difference, and the study's tab bar drew a
  shaded block in Safari while passing everywhere else.
*/
defineTabBarGlide();
