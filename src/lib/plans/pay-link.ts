/**
 * Whether a share's `payLink` may be offered as a "Pay by UPI" button
 * (yuvoy-app#193, R7-c section 3).
 *
 * ## Why a page checks a link its own API built
 *
 * This is money between people. The button opens the reader's UPI app with a
 * payee and an amount already filled in, and a person in a hurry pays what is
 * filled in. The page also shows the UPI ID and the amount as text, from
 * `payee.upiId` and `mine.amountMinor`, so the one thing that must never
 * happen is a button that pays someone or something other than what the text
 * beside it says. Any path that put a different link in `payLink` (a server
 * bug, a planner's UPI ID changed between the two reads, a proxy, a fixture)
 * would do exactly that, silently. So the link is offered only when it agrees
 * with the text, and is otherwise dropped: the UPI ID and the amount stay on
 * screen and somebody can still pay by hand. Never built here: a page that
 * wrote its own link would have nothing to check it against.
 *
 * ## What the API writes (internal/upi/upi.go at ad4fa894)
 *
 *     upi://pay?pa=<id>&pn=<name>&am=<rupees>&cu=INR&tn=<note>
 *
 * Each value `url.QueryEscape`d with spaces as `%20`; `am` is
 * `fmt.Sprintf("%d.%02d", paise/100, paise%100)`, so 25000 paise is `250.00`;
 * nothing else (`tr`, `mc` and `url` are merchant fields a link between
 * friends must not carry).
 *
 * ## The check, and what it refuses
 *
 * Exactly that shape, and a refusal for anything else:
 *
 *   - **The scheme** is `upi://pay?`, written as the API writes it. Another
 *     scheme, another case (`UPI://PAY?`), a leading space, or no query at
 *     all is refused.
 *   - **Printable ASCII only**, no space and no `#`. The API escapes every
 *     value, so a raw space, a newline, a non-ASCII letter or a fragment can
 *     only mean the link was written somewhere else.
 *   - **Only the five names**, each once, in lower case. Another name is
 *     refused rather than ignored: `mam` (a minimum amount), `tr` or `url`
 *     changes what a UPI app does, and an app that reads `PA` beside `pa`
 *     may pay either (the mobile app's review MN3). A part with no `=`, an
 *     empty part (`&&`) or a value that does not decode is refused too.
 *   - **`pa` equals `payee.upiId` exactly**, after decoding. Not ignoring
 *     case: the API writes both from the same stored value, so an honest link
 *     always matches exactly, and a check that forgave a difference would be
 *     forgiving something no honest link has. (The mobile app's check folds
 *     case; this one is the stricter of the two on purpose.)
 *   - **`am` equals the share** in the API's own two-decimal form, as a
 *     string: `250.00` for 25000 paise, never `250` or `250.0`. A whole-number
 *     share always has `.00`, so a reformatted amount means a rewritten link.
 *   - **`cu` is `INR`** when present. It always is today; the contract's
 *     PlanCost `currency` has the one value.
 *   - **A share above zero**, a whole number of paise. The API sends no link
 *     on the payer's own share or a zero share, so one there is wrong.
 *   - **`pn` and `tn` are not compared**: the payee's name and the note are
 *     what a UPI app shows, not where the money goes, and `tn` is the plan's
 *     title clipped by the server (`plans_costs.go`). They must still decode.
 *
 * Returns the link exactly as it arrived, never a rebuilt or re-encoded one,
 * so what was checked is what is opened.
 */

const SCHEME = "upi://pay?";
const NAMES: ReadonlySet<string> = new Set(["pa", "pn", "am", "cu", "tn"]);
const PRINTABLE = /^[\x21-\x7E]+$/;
/*
  A value exactly as the API writes it: Go's `url.QueryEscape` (with `+` made
  `%20`, `internal/upi/upi.go`), so the unreserved characters and upper-case
  `%XX` and nothing else. A raw `;`, `?`, `+`, `'` or `/` is something the API
  never sends, and some parsers split on `;` or read `+` as a space, so a value
  carrying one could name a second payee to them (independent review, #193).
*/
const ENCODED_VALUE = /^(?:[A-Za-z0-9_.~-]|%[0-9A-F]{2})*$/;

/**
 * Paise as the UPI link writes rupees: `250.00`. Digits are cut rather than
 * divided, so the answer is the API's `%d.%02d` exactly, with no float in
 * between. `null` for anything that is not a whole number of paise from zero.
 */
export function upiAmount(paise: number): string | null {
  if (!Number.isSafeInteger(paise) || paise < 0) return null;
  const digits = String(paise).padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export function checkedPayLink(
  payLink: string | undefined,
  payee: { upiId: string } | undefined,
  amountMinor: number,
): string | null {
  if (typeof payLink !== "string" || !payLink.startsWith(SCHEME)) return null;
  if (!PRINTABLE.test(payLink) || payLink.includes("#")) return null;

  const upiId = payee?.upiId;
  if (typeof upiId !== "string" || upiId === "") return null;

  const amount = upiAmount(amountMinor);
  if (amount === null || amountMinor === 0) return null;

  const params = new Map<string, string>();
  for (const part of payLink.slice(SCHEME.length).split("&")) {
    const at = part.indexOf("=");
    // No `=`, or nothing before it: `&&`, `pa`, `=x`.
    if (at <= 0) return null;
    const name = part.slice(0, at);
    if (!NAMES.has(name) || params.has(name)) return null;
    if (!ENCODED_VALUE.test(part.slice(at + 1))) return null;
    let value: string;
    try {
      value = decodeURIComponent(part.slice(at + 1));
    } catch {
      return null;
    }
    params.set(name, value);
  }

  if (params.get("pa") !== upiId) return null;
  if (params.get("am") !== amount) return null;
  const currency = params.get("cu");
  if (currency !== undefined && currency !== "INR") return null;
  return payLink;
}
