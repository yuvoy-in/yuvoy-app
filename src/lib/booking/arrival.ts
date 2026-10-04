/**
 * Whether the booking page is being arrived at from the checkout that made
 * the booking, this moment (T10 A, approved 4 Oct 2026).
 *
 * The page a traveller lands on after the tap that books is the same page a
 * link opens a week later, and only the first deserves the moment that says
 * "you just did this". So checkout marks the booking it is about to open,
 * the booking page reads the mark, and the mark is then forgotten: a reload,
 * a poll, Back and Forward, and a shared link all open the page as it is.
 *
 * Held in this module rather than in storage, on purpose. A booking page
 * opened by the same tap is the same document (`router.replace`), and a
 * mark that survived a reload is exactly the replay this exists to prevent.
 */
let mark: string | null = null;

/** Checkout: the booking behind `token` is about to be opened. */
export function markArrival(token: string): void {
  mark = token;
}

/** The booking page: is this the booking checkout just opened? Pure. */
export function arrivalPending(token: string | null): boolean {
  return token !== null && mark === token;
}

/** The booking page, once the moment has been taken: it never replays. */
export function forgetArrival(token: string | null): void {
  if (token !== null && mark === token) mark = null;
}
