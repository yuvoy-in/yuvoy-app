import type { Metadata, Viewport } from "next";
import { fraunces, satoshi } from "@/lib/fonts";
import { Providers } from "@/components/providers";
import { MswProvider } from "@/components/dev/msw-provider";
import { AppShell } from "@/components/chrome/app-shell";
import { THEME_COLOR } from "@/lib/site/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Yuvoy — Experience More.",
    template: "%s · Yuvoy",
  },
  description:
    "Find something worth doing in the Andaman Islands, and book a seat on it.",
  // The app is noindex until it takes the root domain at launch. The
  // marketing site owns search until then, and two indexed copies of the same
  // brand is the worst of both.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  // `viewport-fit: cover` is deliberately NOT set. It is a standing rule from
  // the marketing site's header work: cover mode paints under the status bar
  // and broke the transparent-at-top header contract. `tabbar-foot` reads the
  // safe-area inset anyway, so nothing depends on it.
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${satoshi.variable}`}>
      <body className="bg-abyss">
        {/* First focusable element on every page. */}
        <a
          href="#main"
          className="label bg-cream text-forest sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-3"
        >
          Skip to content
        </a>
        <MswProvider>
          <Providers>
            <AppShell>{children}</AppShell>
          </Providers>
        </MswProvider>
      </body>
    </html>
  );
}
