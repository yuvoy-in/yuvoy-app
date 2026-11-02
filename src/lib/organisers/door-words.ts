/**
 * The web's words for the door (yuvoy-app#226, the web half of
 * yuvoy-mobile#394). The phone's own from
 * `packages/core/src/organisers/door-check-in.ts` (`DOOR_CHECK_IN_WORDS`) and
 * `packages/core/src/organisers/words.ts` on yuvoy-mobile dev, kept word for
 * word, and the API's sentences from `internal/handler/door_check_in.go`
 * (yuvoy-api #483, #573) as the fallbacks for an answer that came without
 * one. The API's `message` is what the page shows when it sends one.
 *
 * The spec's and the proposed lines wait on Sai Teja in yuvoy-api#491. Lines
 * marked ours are in neither the phone nor the API.
 *
 * Left out from the phone: the camera lines ("Point the camera at the QR on
 * their phone.", "Type the code", the camera refused line) and "This is not a
 * door code.": the web page has no camera, the phone's own camera opens
 * `/door#code`.
 */
export const DOOR_WORDS = Object.freeze({
  /** The page's title (phone `title`). */
  title: "Check people in",
  /** The link on the organiser pages (phone: every entry's button is the title). */
  entry: "Check people in",
  /** The field's label (spec, phone `field`). */
  field: "Code from their phone",
  /** The button (spec, phone `send`). */
  button: "Check in",
  /** A 200 (spec); an empty `firstName` reads "Checked in" (proposed, phone). */
  checkedIn: (firstName: string): string =>
    firstName ? `${firstName} is checked in` : "Checked in",
  /** A 200 with an empty `firstName` (proposed, phone). */
  checkedInNoName: "Checked in",
  /** A 200 with `alreadyCheckedIn` (spec, phone): the time in India, "19:42". */
  already: (time: string): string =>
    time ? `Already checked in at ${time}` : "Already checked in",
  /** No answer (spec, phone `noSignal`). The code stays, nothing is queued. */
  offline: "No signal. Try again when the signal is back.",
  /** Ours, as the phone's `fault`: a 500 or an answer the page cannot read. */
  broken: "Something went wrong on our side. Try again.",
  /** The phone's organiser `tryAgain`. */
  tryAgain: "Try again",
  /**
   * Proposed by the web, not in the phone or the API: the page for a person
   * who is not a member (owner or helper) of any verified organiser. The phone
   * offers no entry to such a person and has no sentence for it.
   */
  notMember:
    "You can check people in once you help run an organiser that Yuvoy has checked.",
  /** Ours: under the field when eight or more characters hold 0, 1, I, L or O. */
  lookalike: "Codes never use 0, 1, I, L or O.",
  /** Ours: under the field when `/door#...` held something that is not a code. */
  badLink:
    "That link did not carry a door code. Type the code from the Going card.",

  /* The API's sentences, the fallbacks for an answer that came without one. */

  /** 503 `organisers_paused` (API draft). */
  paused: "Door check-in is paused for a moment. Try again soon.",
  /** 401 (API draft). The page shows its own sign-in line with this. */
  signIn: "Sign in to check people in at the door.",
  /** 403 `adult_confirmation_required` (API draft). */
  adultsOnly:
    "Checking people in is for people 18 or over. Confirm your age in your account, then try again.",
  /** 404 while `supply` is closed to the person (API draft). */
  notOpen: "Door check-in is not open to your account yet.",
  /** 400 `invalid_input` (API draft). */
  badCode: "We could not read that code.",
  /** 404 `not_found` (spec). */
  notFound: "This code is not for one of your events.",
  /** 409 `own_code` (spec). */
  ownCode: "You can't check yourself in. Ask another helper at the door.",
  /** 409 `check_in_not_today` (spec): the day as "Sat 24 Oct", from `details.validOn`. */
  notToday: (day: string): string => `This code is for ${day}.`,
  /** Ours, as the operator app's: a 409 `check_in_not_today` with no sentence and no day. */
  notTodayNoDay: "This code is for another day.",
  /** 429 after 30 misses in an hour (API draft). */
  tooManyMisses: "Too many codes did not match. Try again in an hour.",
  /** 429 from the shared limiter, as it reads since yuvoy-api #573. */
  tooFast:
    "Too many door check-ins in a short time. Wait a moment and try again.",
});
