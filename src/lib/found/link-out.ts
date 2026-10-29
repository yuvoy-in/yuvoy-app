/**
 * The addresses a found card may send somebody to (yuvoy-app#179, R2-T4).
 *
 * A found item's `seeDetailsUrl` and its check's `sourceUrl` are pages on
 * somebody else's site: an organiser's, a venue's, a ticket seller's. The API
 * already refuses anything but http and https, and any host on the finder's
 * blocked list ("http or https only, and never a host on the finder's blocked
 * list"), so this is the second lock on the same door rather than the only
 * one. A `javascript:` address that slipped through an API bug would run in
 * our origin the moment it was clicked, with the person's session beside it,
 * and nothing about a link looks different before it is followed.
 *
 * The address is opened exactly as the API stored it (REQ-R2-11). Nothing is
 * appended: no `utm_`, no referral tag, no rewrite to a redirector. The
 * organiser's page is theirs, and an address we had touched would be one we
 * were vouching for.
 *
 * The same rules as the phone app's `linkOut` and `sourceHost`
 * (yuvoy-mobile `packages/core/src/explore/found.ts`), so the two say the
 * same host for the same card.
 */

/**
 * An absolute http or https address with a host, and nothing else.
 *
 * Read with a pattern rather than `new URL`: `URL` normalises what it parses
 * (it lower-cases the host, drops a default port, percent-encodes a space),
 * and the rule is to open what was stored, not what a parser made of it. The
 * pattern only decides whether the string is one we may open at all.
 */
// No backslash and no control character anywhere: a browser reads `\` as
// `/`, so `https://evil.test\@trusted.in/` would read as trusted.in here and
// open evil.test.
// eslint-disable-next-line no-control-regex
const HTTP_URL = /^(https?):\/\/([^/?#\s\\\x00-\x1f]+)([/?#][^\s\\\x00-\x1f]*)?$/i;

/**
 * A link a card may open, returned exactly as stored, or null.
 *
 * Null for a script address, a data address, a relative path, a protocol
 * relative `//host`, an address with whitespace in it, and anything with no
 * host a person could read: each of those is either dangerous or not a page.
 */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string" || !HTTP_URL.test(url)) return null;
  return hostOf(url) ? url : null;
}

/**
 * An address's host for a person to read, as the API's `explore.SourceHost`
 * writes it: lower case, no port, no leading `www.`, no trailing dot. Any
 * `user@` in front of the host is dropped, so `https://example.in@evil.test`
 * reads as the host it actually opens, `evil.test`.
 *
 * Null unless it is an http or https address with a host.
 */
export function hostOf(url: string | null | undefined): string | null {
  const match = HTTP_URL.exec(url?.trim() ?? "");
  if (!match) return null;
  let host = match[2] ?? "";
  host = host.slice(host.lastIndexOf("@") + 1);
  if (host.startsWith("[")) {
    // An IPv6 literal keeps its colons; only the brackets and the port go.
    const end = host.indexOf("]");
    host = end > 0 ? host.slice(1, end) : "";
  } else {
    host = host.replace(/:\d*$/, "");
  }
  host = host
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  return host || null;
}
