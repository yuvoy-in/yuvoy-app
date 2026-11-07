import { civilInZone, dayMonth } from "@/lib/format/date";
import type { components } from "@/lib/api/schema.gen";
import { BIRTH_YEAR_WORDS } from "@/lib/auth/birth-year";

export type PeopleHome = components["schemas"]["PeopleHome"];
export type Friend = components["schemas"]["Friend"];
export type FriendRequest = components["schemas"]["FriendRequest"];
export type FriendLink = components["schemas"]["FriendLink"];
export type PersonRef = components["schemas"]["PersonRef"];
export type Sharing = "friends" | "only_me";

/**
 * Every word of People on the web (yuvoy-app#222, the web half of
 * yuvoy-mobile#366), in one place: the row on Account, the People screen,
 * the age and name steps and the friend link page.
 *
 * A refusal the API explains is shown in the API's own `error.message`, as it
 * is sent, so none of those sentences is here. What is here is what the
 * screen says on its own: headings, buttons, the empty states and who sees
 * each choice.
 *
 * ## Names
 *
 * Exactly as the API sends them, never built here: `shortName` ("Priya S.")
 * for somebody who is not a friend, `name` (their first word) for a friend.
 * No phone number and no email appears anywhere on People.
 */
export const PEOPLE_WORDS = {
  pageTitle: "People",
  title: "People",
  intro:
    "Your friends on Yuvoy. You become friends only when both of you say yes.",
  back: { href: "/account", label: "Account" },
  loading: "Loading People",
  failed: "People did not load",
  retry: "Try again",
  retrying: "Trying again",

  /** The Account row. */
  row: "People",
  rowWaiting: (n: number) =>
    n === 1 ? "1 friend request waiting" : `${n} friend requests waiting`,

  /** A `404` on the home: the release is closed to this traveller. */
  closed: {
    title: "People is not open yet",
    body: "When it opens to you, it shows on Account.",
  },

  signedOut: {
    title: "Sign in to see People",
    body: "People is your friends on Yuvoy. Sign in with your number to see them.",
    action: "Sign in",
  },
  /** A `401` once signed in: the same answer Trips gives. */
  sessionEnded: {
    title: "Your sign-in has expired",
    body: "Sign in again to see People.",
    action: "Sign in again",
  },

  /** Standing that stops everything. The API's own words for the refusal. */
  paused: "Your use of People is paused for now.",
  ended: "Your use of People has ended.",
  requestsPaused: "You can't ask anyone to be your friend for now.",

  requestsIn: "Friend requests",
  accept: "Accept",
  decline: "Decline",
  mutual: (n: number) => (n === 1 ? "1 mutual friend" : `${n} mutual friends`),
  /** `answerFriendRequest` 404: answered elsewhere, or taken back. */
  gone: "That request is no longer waiting.",

  requestsOut: "Requests you sent",
  takeBack: "Take back",

  friends: "Friends",
  friendCount: (n: number) => (n === 1 ? "1 friend" : `${n} friends`),
  friendsEmpty:
    "No friends yet. Send your friend link to someone you travel with.",
  friendsFailed: "Your friends did not load",
  unfriend: "Unfriend",
  /** Under Unfriend, before the tap: nobody is told. */
  unfriendNote: "They are not told.",
  unfriendAsk: (name: string) => `Unfriend ${name}?`,
  unfriendConfirm: "Yes, unfriend",
  keep: "Keep",
  more: "Show more friends",
  loadingMore: "Loading more friends",

  linkTitle: "Your friend link",
  linkIntro:
    "Anyone with this link can ask to be your friend. Nothing happens until you say yes.",
  noLink: "You have no friend link switched on.",
  getLink: "Get my friend link",
  invite: "Invite on WhatsApp",
  copyLink: "Copy link",
  copied: "Copied",
  newLink: "Make a new link",
  newLinkNote: "The old link stops working.",
  switchOff: "Switch the link off",
  linkOff: "Your friend link is off. Nobody can use it to ask.",
  messageCopied: "Message copied. Paste it in WhatsApp.",
  copyRefused: "This browser did not let us copy. Try again.",
  makingLink: "Making the link",
  switchingOff: "Switching off",

  sharingTitle: "What your friends see",
  sharingFriends: "Friends",
  sharingFriendsHint: "Your friends see the trips and plans you are going to.",
  sharingOnlyMe: "Only me",
  sharingOnlyMeHint: "Nobody else sees them.",
  sharingWhoFriends: "Only your friends see this.",
  sharingWhoMe: "Only you see this.",
  /** The offer that comes with Friends while older goings are private. */
  shareUpcoming: (n: number) =>
    n === 1
      ? "Also show friends the 1 trip you already have coming up"
      : `Also show friends the ${n} trips you already have coming up`,
  sharingFirst: {
    title: "Before you start",
    body: "Choose what your friends see. You can change it any time on People.",
    action: "Continue",
  },
  sharingSave: "Save",
  saved: "Saved",

  emailsTitle: "Friend request emails",
  emailsHint:
    "An email when someone asks to be your friend, at most one a day. Only you see this setting.",

  age: {
    title: "Your birth year",
    body: "People is for adults, so we ask the year you were born. We ask once.",
    /* The field's own words are the sign-in year step's (yuvoy-app#229). */
    year: BIRTH_YEAR_WORDS.label,
    yearBad: BIRTH_YEAR_WORDS.needYear,
    birthday: BIRTH_YEAR_WORDS.birthday,
    yes: BIRTH_YEAR_WORDS.yes,
    no: BIRTH_YEAR_WORDS.notYet,
    birthdayMissing: BIRTH_YEAR_WORDS.needBirthday,
    action: "Continue",
    saving: "Saving",
    /** After `under_age_sign_up`: the account is closed and signed out. */
    closedAction: "Back to the feed",
  },

  name: {
    title: "Your first name",
    body: "Friends see your first name. Somebody who is not your friend sees it with your last initial.",
    field: "Your name",
    missing: "Write your name.",
    action: "Save",
    saving: "Saving",
  },

  add: {
    pageTitle: "Friend link",
    loading: "Opening this friend link",
    signedOut: {
      title: "Sign in to see whose link this is",
      body: "A friend link opens once you are signed in. Sign in and you come back here.",
      action: "Sign in",
    },
    asks: (shortName: string) => `${shortName} wants to be friends on Yuvoy`,
    asksBody:
      "If you both say yes, you see what each other is going to. Your number is never shown.",
    send: "Send request",
    sending: "Sending",
    /** `202` whatever happened behind it. Never "declined". */
    sent: "Request sent",
    /** A send that answered 404 while the link still opens: our words, never the API's. */
    notSent: "Your request was not sent. Try again.",
    acceptIn: (shortName: string) => `${shortName} already asked you`,
    friends: "Friends",
    friendsBody: "You are already friends.",
    self: "This is your own friend link",
    selfBody:
      "Send it to someone you travel with, and they can ask to be your friend.",
    toPeople: "Go to People",
    expired: {
      title: "This friend link has expired",
      body: "Ask the person who sent it for a new one.",
    },
    full: {
      title: "This friend link has taken all the requests it can",
      body: "Ask the person who sent it for a new one.",
    },
    unavailable: {
      title: "This link doesn't work any more",
      body: "It may have been switched off. Ask the person who sent it for a new one.",
    },
    failed: "This friend link did not open",
    back: { href: "/", label: "the feed" },
  },
} as const;

/** "Let's plan weekends together on Yuvoy. Add me: {url}", the url as sent. */
export function inviteText(link: Pick<FriendLink, "url">): string {
  return `Let's plan weekends together on Yuvoy. Add me: ${link.url}`;
}

/**
 * "Works until 2 Dec · 18 requests left", for the friend link. The day is
 * read in India, where the link's 30 days are counted.
 */
export function linkLife(
  link: Pick<FriendLink, "expiresAt" | "requestsLeft">,
): string {
  const left =
    link.requestsLeft === 1
      ? "1 request left"
      : `${link.requestsLeft} requests left`;
  const civil = civilInZone(link.expiresAt, "Asia/Kolkata");
  return civil ? `Works until ${dayMonth(civil)} · ${left}` : left;
}

/**
 * The code from `/add/{code}`, as the page was opened with it.
 *
 * The API takes it in any case, hyphen or not, so nothing is rewritten: it is
 * only decoded and trimmed. A code too long or with anything but letters,
 * digits and hyphens cannot be one, and answers null, so the page says the
 * link does not work without asking the API about it.
 */
export function friendCode(raw: string): string | null {
  let code: string;
  try {
    code = decodeURIComponent(raw).trim();
  } catch {
    return null;
  }
  return /^[A-Za-z0-9-]{4,16}$/.test(code) ? code : null;
}

/*
  The year rules moved to lib/auth/birth-year.ts (yuvoy-app#229): the sign-in
  doors ask the same question, and one copy keeps them from drifting.
*/
export { indiaYear, needsBirthday, birthYearOf } from "@/lib/auth/birth-year";
