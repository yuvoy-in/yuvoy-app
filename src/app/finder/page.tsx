import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site/metadata";
import { Screen } from "@/components/chrome/screen";

export const metadata: Metadata = pageMetadata({
  title: "YuvoyFinder",
  description:
    "YuvoyFinder is the program Yuvoy uses to find things to do in Indian cities and towns, such as events, workshops and trips, so people can discover them on Yuvoy.",
  path: "/finder",
});

/** What every finder request sends (yuvoy-api `internal/finder/robots.go`, `UserAgent`). */
const USER_AGENT = "YuvoyFinder/1.0 (+https://app.yuvoy.in/finder)";

/** The robots.txt group that stops it: the finder matches groups on its product token. */
const STOP_RULE = "User-agent: YuvoyFinder\nDisallow: /";

/**
 * The page YuvoyFinder names in every request (yuvoy-api#324, R1-T3 step 5).
 *
 * A site owner who finds the finder in their logs follows the link in its
 * User-Agent and lands here, so this page must answer before the finder's
 * first live fetch. It says what the finder reads, how long it keeps a page
 * and how a site asks it to stop, in the words of the R1-T3 spec. The owner
 * shipped them on 19 Oct 2026 ahead of Sai Teja's review (DEC-13 B,
 * yuvoy-api#318 item 5), so a change asked for there lands here. The page is
 * on the app, not yuvoy.in, because the landing page stays untouched.
 *
 * Open to anybody and indexed, like /help, whatever the invite gate says: it
 * is for people who will never be travellers. Static: nothing on it changes
 * between deploys. Stop requests to info@yuvoy.in are answered by the owner.
 */
export default function FinderPage() {
  return (
    <Screen>
      <h1 className="font-display tracking-display leading-display text-4xl text-balance">
        YuvoyFinder
      </h1>
      <p className="text-forest/70 mt-3 font-mono text-sm break-all">
        {USER_AGENT}
      </p>
      <div className="text-forest/80 leading-body mt-8 max-w-prose space-y-4 text-base text-pretty">
        <p>
          YuvoyFinder is the program Yuvoy uses to find things to do in Indian
          cities and towns, such as events, workshops and trips, so people can
          discover them on Yuvoy. It reads public pages only, as text. It
          follows robots.txt, waits at least five seconds between requests to a
          site, and never downloads images or video.
        </p>
        <p>
          It keeps the text of a page for 30 days after it last reads it. Short
          quotes that prove an item&apos;s date, place and price stay with the
          item while it is listed, and about 60 pages are kept, with phone
          numbers and email addresses removed, to test the program. Every item
          it finds names its source.
        </p>
        <p>
          To ask us to stop reading your site, add a Disallow rule for
          YuvoyFinder to your robots.txt, or write to{" "}
          <a
            href="mailto:info@yuvoy.in"
            className="text-forest underline underline-offset-2"
          >
            info@yuvoy.in
          </a>{" "}
          and we will stop within one working day.
        </p>
      </div>
      <pre className="rounded-card border-paper-line bg-paper-deep text-forest mt-6 overflow-x-auto border p-4 font-mono text-sm">
        <code>{STOP_RULE}</code>
      </pre>
    </Screen>
  );
}
