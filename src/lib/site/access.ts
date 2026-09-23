/**
 * Whether Yuvoy is by invitation, and the single place that decides
 * (yuvoy-api#195).
 *
 * ## One switch, off by default
 *
 * `NEXT_PUBLIC_INVITE_ONLY === "true"` puts browsing and booking behind an
 * invite code. It ships OFF and is flipped together with the API's own gate:
 * the API refuses `POST /reservations` with `403 invite_required` for a number
 * that is not admitted, and nothing else server-side. Everything a traveller is
 * refused in the APP (the feed, search, saving, the checkout form) is this
 * app's posture, decided here and nowhere else.
 *
 * Read at build time like every `NEXT_PUBLIC_` value, so a deployment with the
 * switch off compiles the gate out: no cookie is read, no `GET /me` is made and
 * no page that is static today stops being static. The one thing that ships
 * regardless of the switch is the checkout's answer to `403 invite_required`,
 * because the API's gate can be turned on before this one.
 *
 * ## The owner's posture: public pages only (21 Sep 2026)
 *
 *   - Open to anybody, and still indexed: the guides, a listing, a business,
 *     `/help`.
 *   - Always open, because they are links somebody sent or they belong to a
 *     booking that exists: `/go/`, `/i/`, `/trip/`, `/booking`, `/trips`,
 *     `/account`, `/offline` and a shared reel.
 *   - Behind the gate: the feed, search, saving and booking.
 *
 * Mark it NOT Sensitive in Vercel. A Sensitive `NEXT_PUBLIC_` variable reaches
 * the build as the literal `[SENSITIVE]`, which is not `"true"`, so the gate
 * would silently stay off; that exact trap cost this project three deploys.
 */
export const INVITE_ONLY = process.env.NEXT_PUBLIC_INVITE_ONLY === "true";

/**
 * What a page shows a visitor.
 *
 *   - `open`: everything. The switch is off, or the answer did not say whether
 *     this number is admitted (an API that predates `admitted`, or a `GET /me`
 *     that failed). Failing open is deliberate: browsing is a posture, and the
 *     one thing that must be refused, a booking, is refused by the API itself.
 *   - `signed-out`: the invite landing, which says what Yuvoy is and how in.
 *   - `not-admitted`: the code screen.
 *   - `admitted`: everything.
 */
export type Access = "open" | "signed-out" | "not-admitted" | "admitted";

/**
 * Where a device stands with the invitation, whatever the switch says.
 *
 * The client's view, one value richer than `Access`: `unknown` is a signed-in
 * number whose `GET /me` did not say, kept apart from `admitted` so that a
 * failed read is never mistaken for a yes that opens a page, nor for a no that
 * closes one.
 */
export type Standing = "signed-out" | "not-admitted" | "admitted" | "unknown";

/**
 * `admitted` off a `GET /me` answer.
 *
 * `undefined` when the answer does not carry it. The pinned contract marks the
 * field required, and a pinned contract says what the API WILL send, not what
 * the deployed one does: `bookable` was read the same way once, and its
 * absence took every listing on production off sale the moment it shipped
 * (see `experience-detail.tsx`). Absent is therefore its own answer, and it is
 * read as "not asked", never as a no.
 */
export function admittedOf(account: unknown): boolean | undefined {
  if (typeof account !== "object" || account === null) return undefined;
  const admitted = (account as { admitted?: unknown }).admitted;
  return typeof admitted === "boolean" ? admitted : undefined;
}

/** A signed-in number's standing, from its `GET /me` answer. */
export function standingOfAccount(
  account: unknown,
): Exclude<Standing, "signed-out"> {
  const admitted = admittedOf(account);
  if (admitted === true) return "admitted";
  if (admitted === false) return "not-admitted";
  return "unknown";
}

/**
 * The page's decision for a signed-in number with the switch on.
 *
 * `unknown` opens the page, for the reason `open` gives above.
 */
export function accessOfStanding(standing: Standing): Access {
  return standing === "unknown" ? "open" : standing;
}

/** Whether a page shows its own content, rather than the gate. */
export function showsContent(access: Access): access is "open" | "admitted" {
  return access === "open" || access === "admitted";
}

/**
 * Which of the three screens a gated route draws.
 *
 * Two answers that draw the same screen are the same answer as far as a page
 * is concerned: `open` and `admitted` both show the content. This is what a
 * page compares when it asks whether the HTML it was served still says what
 * the device now knows.
 */
export function screenOf(access: Access): "content" | "landing" | "code" {
  if (showsContent(access)) return "content";
  return access === "signed-out" ? "landing" : "code";
}

/**
 * Public routes that leave the index while the gate is on.
 *
 * A crawler is a signed-out visitor, so a gated route serves it the gate. On
 * `/search` that is a page whose only content is "sign in", and indexing it
 * would put a gate in a search result, so the route says `noindex` and leaves
 * the sitemap; both halves derive from this one list, the way `robots.txt` and
 * the meta tag derive from `INDEXABLE` in `indexing.ts`.
 *
 * `/` is deliberately NOT here. It is the front door, and what a crawler gets
 * there is the invite landing: a page written for exactly that reader, saying
 * what Yuvoy is and how to get in. The other gated routes are private already
 * (`/saved`, `/e/{slug}/book`, `/search/r/`), whatever this switch says.
 */
export const GATED_FROM_INDEX: readonly string[] = INVITE_ONLY
  ? ["/search"]
  : [];

export function isGatedFromIndex(path: string): boolean {
  return GATED_FROM_INDEX.includes(path);
}
