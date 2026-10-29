/**
 * The words only the guest page says (yuvoy-mobile#373), beside the ones
 * both plan pages share in `words.ts`.
 *
 * Their own module so the shared list stays the list both pages read: these
 * are the lines for a page loading by script, the round trip through
 * sign-in, last week's shares and the share sheet, none of which the
 * signed-in page has. Every line is a DRAFT for @gamallasaiteja with the
 * rest of R7's words; lines marked `new` are in no table yet. The same two
 * rules hold as in `words.ts`, and `guest-words.test.ts` checks them: no
 * dash, and the person who made the plan is never "the host".
 */

export const guestWords = {
  /**
   * The API's own sentence for `details.name` (`guestNameSentence`,
   * `plans_guest.go`), said before a request when the box is empty.
   */
  nameNeeded: "Use your first name, in letters only.",

  /** new: while the plan is on its way. */
  loading: "Loading the plan",
  /** new: no answer, or an answer that was not the plan. */
  loadFailed:
    "We could not load this plan. Check your connection and try again.",
  tryAgain: "Try again",
  trying: "Trying again",

  /** new: after "Link my reply to my account" worked. */
  linked: "Your reply is linked to your account.",
  /** new: the session ended between sign-in and the link. */
  signInAgain: "Sign in again to link your reply.",

  /** new: the heading over a member's shares on earlier weeks. */
  earlierWeeks: "Earlier weeks",
  /** new: one of those shares. */
  earlierShare: (week: string, label: string, share: string, payer: string) =>
    `${week}: ${label}. Your share: ${share}, paid by ${payer}.`,
  /** new: the button that marks one paid. */
  markPaid: "I've paid this share",
  /** new: once it is marked. */
  markedPaid: "You marked this paid.",

  /** The mobile app's share text (`share-text.ts`), without the link. */
  shareMessage: (title: string, when: string) =>
    `${title}. ${when}. Reply here, no app needed:`,
  /** new: the share sheet was closed without sending, said for the ear. */
  shareFailed: "Sharing did not work on this phone. Copy the address instead.",
} as const;

/**
 * Where a guest's safety questions go. The issue says "{support email}";
 * the app names no support address anywhere else, and `info@yuvoy.in` is the
 * address the company answers travellers from (`app/finder/page.tsx`).
 */
export const PLAN_SAFETY_EMAIL = "info@yuvoy.in";
