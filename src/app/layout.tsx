import type { Metadata, Viewport } from "next";
import { fraunces, satoshi } from "@/lib/fonts";
import { Providers } from "@/components/providers";
import { MswProvider } from "@/components/dev/msw-provider";
import { AppShell } from "@/components/chrome/app-shell";
import { RegisterServiceWorker } from "@/components/pwa/register-sw";
import { AttributionCapture } from "@/components/booking/attribution-capture";
import { InstallObservability } from "@/components/observability/install";
import { ConsentBanner } from "@/components/analytics/consent-banner";
import { THEME_COLOR } from "@/lib/site/theme";
import { robotsMeta } from "@/lib/site/indexing";
import { verificationMeta } from "@/lib/site/verification";
import { SITE_URL } from "@/lib/site/metadata";
import { organizationJsonLd, webSiteJsonLd } from "@/lib/site/structured-data";
import { JsonLd } from "@/components/site/json-ld";
import "./globals.css";

export const metadata: Metadata = {
  /*
    Without this, Next resolves relative metadata URLs — the Open Graph image
    among them — against localhost during a build and against the ephemeral
    deployment host on Vercel. Both produce a share card pointing at a URL
    nobody else can fetch, and the build says so on every run.
  */
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Yuvoy — Experience More.",
    template: "%s · Yuvoy",
  },
  description:
    "Find something worth doing in the Andaman Islands, and book a seat on it.",
  // Noindex until launch (on app.yuvoy.in; the root-domain move is deferred).
  // Derived, never
  // written here: robots.txt and this tag are two halves of one answer and
  // they have to flip together. See lib/site/indexing.ts.
  robots: robotsMeta,
  /*
    Search-engine ownership, from the environment. Absent on every deployment
    that sets no token, which is most of them.

    Deliberately independent of `robotsMeta`: you verify a property BEFORE it
    is indexable, because verifying is how the owner sees crawl and coverage
    problems ahead of launch rather than after it. See lib/site/verification.ts.
  */
  verification: verificationMeta(),
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
      <body className="bg-forest text-cream">
        {/* Emitted once for the whole site. Interior pages add their own
            breadcrumb and article nodes, linked to these by @id. */}
        <JsonLd node={organizationJsonLd()} />
        <JsonLd node={webSiteJsonLd()} />
        {/* First focusable element on every page. */}
        <a
          href="#main"
          className="label bg-cream text-forest sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-3"
        >
          Skip to content
        </a>
        <InstallObservability />
        <RegisterServiceWorker />
        <AttributionCapture />
        <MswProvider>
          <Providers>
            <AppShell>{children}</AppShell>
            <ConsentBanner />
          </Providers>
        </MswProvider>
      </body>
    </html>
  );
}
