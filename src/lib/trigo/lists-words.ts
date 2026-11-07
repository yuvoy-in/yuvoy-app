import type { components } from "@/lib/api/schema.gen";

/**
 * Every word of the date alerts screen and the Trips Drafts view
 * (yuvoy-app#220), the phone's (yuvoy-mobile#456, `TRIGO_LISTS_WORDS` and the
 * two screens). Lines marked "web" are not on the phone: the phone says "This
 * phone is not signed in", which a browser is not.
 */

export type TrigoCard = components["schemas"]["TrigoCard"];
export type DateAlert = components["schemas"]["TrigoDateAlert"];
export type TripDraft = components["schemas"]["TrigoTripDraft"];
export type TripDraftDay = components["schemas"]["TrigoTripDraftDay"];

export const TRIGO_LISTS_WORDS = Object.freeze({
  alertsTitle: "Date alerts",
  alertsEmpty: "Ask Trigo to tell you when something gets a date.",
  stopAlert: "Stop telling me",
  /** web: the working verbs while a change runs. */
  stopping: "Stopping",
  draftsTitle: "Trip drafts",
  /** The Trips tab's label (the phone's view switch). */
  draftsTab: "Drafts",
  draftsEmpty: "Ask Trigo to plan a trip and keep the draft here.",
  deleteDraft: "Delete draft",
  deleting: "Deleting",
  fired: "Has a date now",
  /** The chat card's line for a listing or event that is gone. */
  noLonger: "No longer listed",
  alertsLoading: "Loading your date alerts",
  draftsLoading: "Loading your trip drafts",
  tryAgain: "Try again",
  retrying: "Trying again",
  /** Account, where the screen's back control leads. */
  back: { href: "/account", label: "Account" },
  signedOut: {
    // web
    title: "Sign in to see your date alerts",
    body: "Sign in with your number to see your date alerts.",
    action: "Sign in",
  },
  alertsExpired: {
    title: "Your sign-in has expired",
    body: "Sign in again to see your date alerts.",
    action: "Sign in again",
  },
  draftsExpired: {
    title: "Your sign-in has expired",
    body: "Sign in again to see your trip drafts.",
    action: "Sign in again",
  },
  /** The page while the `trigo` release is closed to this traveller. */
  notOpen:
    "Trigo is not open yet. Until it is, the Yuvoy team is a message away.",
  /** web: the heading over a list that did not load, or a change that failed. */
  alertsFailed: "We could not load your date alerts",
  draftsFailed: "We could not load your trip drafts",
  stopFailed: "We could not stop that date alert",
  deleteFailed: "We could not delete that trip draft",
});

/** The API's sentences on the four routes (yuvoy-api `handler/trigo_alerts_drafts.go`). */
export const TRIGO_LISTS_API_WORDS = Object.freeze({
  alertGone: "We could not find that date alert.",
  draftGone: "We could not find that trip draft.",
  unavailable: "Trigo is not available right now. Try again later.",
  busy: "Trigo is busy. Try again in a moment.",
});

/** At most this many alerts wait at once; a confirm past it is 409 `date_alerts_full`. */
export const MAX_WAITING_DATE_ALERTS = 50;
/** At most this many drafts are listed. */
export const MAX_TRIP_DRAFTS = 20;
