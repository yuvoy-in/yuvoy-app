import { redirect } from "next/navigation";
import { createApiClient } from "@/lib/api/client";
import { filtersToParams } from "@/lib/search/filters";

/**
 * T1: arrival from a printed QR code.
 *
 * Server-side on purpose. The scan is recorded from here so that nothing
 * correlatable ever touches the client: the endpoint sets no cookie, stores no
 * device id and keeps no IP, and it is the reason there is no consent banner
 * between a traveller and a QR code on a jetty. Adding an identifier from our
 * side would defeat that design, and there is no field for one.
 *
 * The response is always a destination, including for a code that resolves to
 * nothing. Somebody standing on a pier holding a scuffed card did nothing
 * wrong, and a 404 there is a dead end with no staff nearby.
 *
 * ## Where the card was printed (yuvoy-app#27)
 *
 * A card left on a Havelock guesthouse desk and one in a Port Blair hotel sent
 * two travellers to the identical unfiltered feed. The destination has always
 * been on the `scan_codes` row and has always been written to the analytics
 * table; it was simply never returned, so the fact that distinguished the two
 * cards never left the backend. It is on the response as of yuvoy-api#131.
 *
 * The scan analytics were therefore better than the experience they described:
 * we could say which card was scanned where, and the person holding it could
 * not.
 *
 * Three cases, and the order between them matters:
 *
 *   1. `target` names something specific: it wins. A card printed for one
 *      listing opens that listing, which it already did, and narrowing it to a
 *      whole island afterwards would be a worse answer than the one the
 *      operator paid to print.
 *   2. `destinationKey` and no specific target: open Search on that place.
 *   3. Neither: exactly what happened before. The unfiltered feed, no guess.
 *
 * `destinationKey` is **absent for a market-wide card and absent for an
 * unknown code**, deliberately one shape rather than two: an empty string
 * would have meant "yes, a destination whose key is blank", which is a filter
 * matching nothing.
 *
 * The place goes on Search's address the way Search writes it
 * (`filtersToParams`, so `?place=`). It was spelled `?destinationKey=`, a
 * name Search never read since its filters moved into the address
 * (yuvoy-app#37), so a card printed for Havelock opened an unfiltered Search
 * while the e2e, which read only the URL, stayed green (found 6 Oct 2026).
 *
 * ## A route handler, not a page
 *
 * It renders nothing, so it answers with a 307 and nothing else. It was a
 * page under a `loading.tsx`, and a boundary makes a route stream: the shell
 * went out before the redirect, so Next could no longer send a 307 and wrote
 * a `<meta http-equiv="refresh">` into a skeleton instead. A traveller on a
 * jetty saw a grey sheet for a second, then the whole document reloaded into
 * the feed, a second server render and a second hydration on an island
 * connection (stability audit, 6 Oct 2026). `loading.test.ts` keeps a page
 * that only redirects from ever sitting under a boundary again.
 */
export const dynamic = "force-dynamic";

const CODE_PATTERN = /^[A-Za-z0-9-]{3,32}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<never> {
  const { code } = await params;

  // A malformed code is still somebody standing on a jetty. Send them to the
  // feed rather than showing them a validation error.
  if (!CODE_PATTERN.test(code)) redirect("/");

  let target = "/";

  try {
    const api = createApiClient();
    const { data } = await api.POST("/scans", { body: { code } });
    /*
      A code with no `target_path` set falls through to `/` server-side, so a
      default `target` and an explicit one are indistinguishable here. That is
      why the destination is only used when the target is still the feed: a
      target somebody chose is more specific than an island, and must not be
      widened into one.

      `known` is deliberately not read. It says whether the code resolved, and
      the answer for a traveller is the same either way: an unknown code
      carries no destination, so case 3 already covers it without a second
      branch that could disagree.
    */
    if (data?.target) target = data.target;
    const destination = data?.destinationKey?.trim();
    if (destination && target === "/") {
      target = `/search?${filtersToParams({ destinationKey: destination })}`;
    }
  } catch {
    // Counting a scan is a marketing concern. It must never be the reason a
    // traveller cannot get to the feed.
  }

  // The code travels on in the URL, where `AttributionCapture` (root layout)
  // reads it into the session so checkout can put it in
  // `attribution.scanCode`: the code itself, never a scan id, because an id
  // the client keeps and sends back is exactly the correlatable token
  // POST /scans refuses to mint. See lib/booking/attribution.
  const separator = target.includes("?") ? "&" : "?";
  redirect(`${target}${separator}src=qr&code=${encodeURIComponent(code)}`);
}
