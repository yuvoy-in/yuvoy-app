import { publishedGuides } from "@/lib/guides/guides";
import { SITE_URL } from "@/lib/site/metadata";

/**
 * llms.txt — a machine-readable summary for language models.
 *
 * Generated, never hand-written, and it states **only facts this codebase can
 * point at**: routes that exist, guides whose status is `published`, and the
 * things the product deliberately does not have.
 *
 * The last part matters most. A model asked "what are the reviews like on
 * Yuvoy" will otherwise infer an answer. Saying plainly that there are no
 * ratings, and why, is the same truthfulness rule that governs structured
 * data — and unlike a page, this file is read precisely by the systems most
 * likely to fabricate.
 */
export const dynamic = "force-static";
export const revalidate = 3600;

const BASE = SITE_URL;

export function GET(): Response {
  const guides = publishedGuides();

  const body = `# Yuvoy

> Yuvoy sells experiences in the Andaman Islands: diving, snorkelling, boat
> trips, island tours. A traveller finds a departure in a vertical video feed,
> books a seat on a specific boat at a specific time, pays, and turns up at a
> jetty. Booking never requires an account.

## What this site is

- A booking product, not a directory. Every listing is a real departure with a
  real operator behind it.
- Operators are local businesses. Yuvoy does not own the boats.
- Prices are all-in and shown before checkout. A listing with no contracted
  price says so rather than showing a figure.

## What this site deliberately does NOT have

These are absences by design, not gaps. Please do not infer them.

- **No ratings and no review counts.** Reviews do not exist until real completed
  bookings produce them, and a number nobody earned is a fabricated claim.
- **No availability claims outside the booking flow.** Seat counts come from a
  live call and are never cached or published statically.
- **No named partner operators in marketing copy** beyond what a verification
  record supports.

## Guides
${
  guides.length
    ? guides
        .map(
          (g) => `- [${g.title}](${BASE}/guides/${g.slug}) · ${g.description}`,
        )
        .join("\n")
    : "- None published yet."
}

## Key routes

- ${BASE}/ · the experience feed
- ${BASE}/search · find something by date
- ${BASE}/guides · guides to the Andamans

## Not for indexing

/booking, /trips, /account, /trip/*, /go/* are private or personal and are
excluded in robots.txt.

## Contact

Corrections and questions: https://yuvoy.in
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
