import type { MetadataRoute } from "next";
import { THEME_COLOR } from "@/lib/site/theme";

/**
 * The web app manifest.
 *
 * Not here to nag anyone into installing. A traveller who adds Yuvoy to their
 * home screen on the ferry gets the cached shell, which on Havelock is the
 * difference between the app opening and not.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Yuvoy",
    short_name: "Yuvoy",
    description:
      "Find something worth doing in the Andaman Islands, and book a seat on it.",
    start_url: "/",
    display: "standalone",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    orientation: "portrait",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
