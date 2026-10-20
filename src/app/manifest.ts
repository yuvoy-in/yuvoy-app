import type { MetadataRoute } from "next";
import { THEME_COLOR } from "@/lib/site/theme";
import { getAppConfig, siteDescription } from "@/lib/site/app-config";

/**
 * The web app manifest.
 *
 * Not here to nag anyone into installing. A traveller who adds Yuvoy to their
 * home screen on the ferry gets the cached shell, which on Havelock is the
 * difference between the app opening and not.
 *
 * Its description is the site's (`siteDescription`, yuvoy-app#181), so an
 * installed app says what the site says.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  return {
    name: "Yuvoy",
    short_name: "Yuvoy",
    description: siteDescription(await getAppConfig()),
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
