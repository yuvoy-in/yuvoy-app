import type { components } from "@/lib/api/schema.gen";

export type Attribution = components["schemas"]["Attribution"];

/**
 * Where a checkout came from, carried from the door to the booking.
 *
 * `/go/[code]` records a QR scan server-side and sends the traveller on with
 * `?src=qr&code=…` in the URL — the code itself, never a scan id, because an
 * id the client keeps and sends back is exactly the correlatable token
 * `POST /scans` refuses to mint. For a month that was where the trail ended:
 * nothing read the parameters, and every checkout was unattributed. The
 * prototype's "attribution carried through to the booking row for channel
 * economics" needs something to carry it.
 *
 * This is that something. `captureAttribution` reads the arrival URL once,
 * `readAttribution` hands it to checkout, and sessionStorage carries it in
 * between — the tab is the visit. A new tab is a new visit with no claim to
 * the old one, and nothing here outlives the session. Contract: "client-
 * claimed, and trusted for nothing — it decides no price, no eligibility and
 * no permission, which is what makes accepting it from an anonymous caller
 * safe." So a malformed value is dropped rather than sent: a checkout must
 * not fail over a marketing field.
 */

const STORAGE_KEY = "yuvoy.attribution";

const SOURCES = [
  "qr",
  "direct",
  "search",
  "social",
  "referral",
  "operator",
  "unknown",
] as const satisfies readonly NonNullable<Attribution["source"]>[];

/** Same shape `/go/[code]` accepts, so a code that got that far is valid here. */
const CODE_PATTERN = /^[A-Za-z0-9-]{3,32}$/;

function isSource(value: string): value is NonNullable<Attribution["source"]> {
  return (SOURCES as readonly string[]).includes(value);
}

/** A value the contract caps at `maxLength`, or nothing. Never truncated. */
function bounded(value: string | null, max: number): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  return v.length > 0 && v.length <= max ? v : undefined;
}

/**
 * The attribution an arrival URL carries, if it carries one.
 *
 * Pure, so the rule can be tested without a browser. `src` alone is enough —
 * `?src=social` from a shared post attributes a visit — and a QR arrival
 * additionally names its code.
 */
export function captureAttribution(
  search: string,
  landingPath?: string,
): Attribution | null {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const src = params.get("src")?.trim().toLowerCase() ?? "";
  if (!src || !isSource(src)) return null;

  const code = params.get("code")?.trim() ?? "";
  const out: Attribution = { source: src };
  if (src === "qr" && CODE_PATTERN.test(code)) out.scanCode = code;

  const placement = bounded(params.get("placement"), 120);
  if (placement) out.placement = placement;
  const campaign = bounded(params.get("campaign"), 120);
  if (campaign) out.campaign = campaign;

  // "The checkout path is not accepted here — we already know it for certain."
  const landing = bounded(landingPath ?? null, 256);
  if (landing && !landing.startsWith("/e/")) out.landingPath = landing;

  return out;
}

export function storeAttribution(attribution: Attribution): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Private browsing or quota. The booking is not worth less for it.
  }
}

/** What checkout sends. Absent when the visit made no claim. */
export function readAttribution(): Attribution | undefined {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Attribution;
    // Re-validated on the way out: storage is writable by anything on the
    // origin, and the contract's caps are the contract's.
    return parsed &&
      typeof parsed.source === "string" &&
      isSource(parsed.source)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Capture the current page's arrival, once per visit.
 *
 * First claim wins. Somebody who scanned a jetty code and then found the
 * listing through search is a QR arrival; overwriting on every navigation
 * would attribute them to whatever page they loaded last.
 */
export function captureFromLocation(): void {
  if (typeof window === "undefined") return;
  if (readAttribution()) return;
  const found = captureAttribution(
    window.location.search,
    window.location.pathname,
  );
  if (found) storeAttribution(found);
}
