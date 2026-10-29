import { planTimeRange } from "./format";
import { guestWords } from "./guest-words";
import type { PlanView } from "./types";
import { planWords } from "./words";

/**
 * "Share" on the guest page (yuvoy-mobile#373): a friend passing the plan
 * on to another friend, the same way the planner sent it.
 *
 * The phone's own share sheet first (`navigator.share`), and WhatsApp's
 * `wa.me` only when the browser has none, which is what the issue asks:
 * the share sheet lets somebody pick the chat themselves, and WhatsApp is
 * where these links travel anyway.
 *
 * What is shared is the plan's link as the planner's share sheet sends it,
 * `/p/#<token>` on this origin, and the mobile app's words before it
 * (`share-text.ts`). Never `location.href`, which in a mocked build carries
 * `?__scenario=` and in any build could carry a query somebody added.
 * Passing the link on is the point of the page, so the token going into a
 * share is not a leak: it goes where the guest sends it, as it came to them.
 */

/** The plan's link, as `PlanView.link` is for the planner. */
export function planLinkFor(origin: string, token: string): string {
  return `${origin}/p/#${token}`;
}

/** The words that go before the link: the title and when. */
export function shareMessage(plan: PlanView): string {
  const decided = plan.decidedTimeId
    ? plan.times.find((t) => t.id === plan.decidedTimeId)
    : undefined;
  const when = decided
    ? planTimeRange(decided.startsAt, decided.endsAt, plan.timeZone)
    : null;
  return guestWords.shareMessage(plan.title, when ?? planWords.choosingTime);
}

/** WhatsApp's own share address, the words and the link as one message. */
export function whatsAppUrl(message: string, link: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${message} ${link}`)}`;
}

export type ShareOutcome = "shared" | "closed" | "whatsapp" | "failed";

/**
 * Shares, and says how it went. A share sheet closed without sending is
 * `closed` and nothing more is done: the person changed their mind. The
 * share sheet refusing for another reason is `failed`, and the page says to
 * copy the address: opening WhatsApp then would come after an `await`, no
 * longer inside the tap, where a browser may block it without a word while
 * `noopener` still answers null. With no share sheet at all, WhatsApp opens
 * at once, still inside the tap (nothing is awaited before it).
 */
export async function sharePlan(
  share: { title: string; message: string; link: string },
  nav: Pick<Navigator, "share"> | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
  open: (url: string) => Window | null = (url) =>
    window.open(url, "_blank", "noopener,noreferrer"),
): Promise<ShareOutcome> {
  if (nav && typeof nav.share === "function") {
    try {
      await nav.share({
        title: share.title,
        text: share.message,
        url: share.link,
      });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "closed";
      }
      return "failed";
    }
  }
  /*
    `noopener` makes `window.open` answer null whether or not it opened, so
    null is not a failure; only a throw (a blocked popup in some browsers)
    is.
  */
  try {
    open(whatsAppUrl(share.message, share.link));
    return "whatsapp";
  } catch {
    return "failed";
  }
}
