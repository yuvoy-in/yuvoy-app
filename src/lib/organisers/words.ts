import type { components } from "@/lib/api/schema.gen";
import type {
  OrganiserEventState,
  OrganiserLinkKind,
  OrganiserRole,
  OrganiserState,
} from "./types";

type Category = components["schemas"]["Category"];

/**
 * The departments a page can pick, in the `Category` enum's order, with the
 * API's own labels (`CategoryLabels`, which `GET /catalog/vocabulary` serves).
 * The form shows the vocabulary's list when it has one, these when it has not,
 * as the phone does with its `DEPARTMENT_LABELS`.
 */
export const ORGANISER_DEPARTMENTS: Readonly<Record<Category, string>> =
  Object.freeze({
    adventure: "Adventure",
    nature_wildlife: "Nature and wildlife",
    food_drink: "Food and drink",
    arts_creativity: "Arts and creativity",
    learning: "Learning",
    culture_heritage: "Culture and heritage",
    wellness: "Wellness",
    entertainment: "Entertainment",
    community: "Community",
    sports: "Sports",
    local_life: "Local life",
    events: "Events",
  } satisfies Record<Category, string>);

/**
 * The web's words for organiser pages (yuvoy-app#224), the phone's own from
 * `packages/core/src/organisers/words.ts` on yuvoy-mobile dev, kept word for
 * word. The group lines came with yuvoy-app#225 (yuvoy-mobile#395), under
 * the web's own names. Left out: the phone's "Add an email" button (the web
 * shows the API's sentence with no button).
 *
 * The phone's note: the app's words for organiser pages (yuvoy-mobile#393), in one place: the hub, the page form,
 * the state card, helpers, and the event form, states and numbers the event screens draw.
 *
 * Three kinds of line, as the issue marks them: the spec's (R11-b), the API's own sentences, and
 * lines proposed in the issue that are with Sai Teja to confirm (yuvoy-api#491), each kept word
 * for word. Lines marked ours are in none of those and go to him with the rest. The server's
 * words are drawn as they come and are not here: every `details.<field>` sentence and every
 * refusal's `message` (`organiserRefusal`); the ones below are the fallbacks for an answer that
 * came without one.
 */

/** The spec's event states. `not_accepted` carries the desk's reason (`eventStateLabel`). */
const EVENT_STATES: Readonly<
  Record<Exclude<OrganiserEventState, "not_accepted">, string>
> = Object.freeze({
  in_checking: "In checking",
  live: "Live",
  changes_in_checking: "Changes in checking",
  cancelled: "Cancelled",
  ended: "Ended",
});

/** Ours: an organiser's state on its hub row. The state card says it in full. */
const ORGANISER_STATES: Readonly<Record<OrganiserState, string>> =
  Object.freeze({
    pending: "Waiting for a check",
    verified: "Checked by Yuvoy",
    not_verified: "Not confirmed yet",
    suspended: "Suspended",
    closed: "Closed",
  });

/** Ours: a state this build does not know yet (the server added one). Never a blank or a crash. */
const UNKNOWN_STATE = "Status not known yet";

/** Ours: the person's role on a hub row. */
const ROLES: Readonly<Record<OrganiserRole, string>> = Object.freeze({
  owner: "Owner",
  helper: "Helper",
});

/** Ours: the link kinds as the form names them. The API has no Instagram kind. */
const LINK_KINDS: Readonly<Record<OrganiserLinkKind, string>> = Object.freeze({
  website: "Website",
  meetup: "Meetup",
  luma: "Luma",
  other: "Other",
});

export const ORGANISER_WORDS = Object.freeze({
  /* ------------------------------------------------------------------- the gates -- */

  /** The Account row and the hub's title. */
  title: "Organiser pages",
  /** The spec's off line: `supply` closed to this person, a deep link included. */
  notOpen: "This is not open yet.",
  /** The API's 401 for a recovery link, said on a signed-out screen. */
  signIn: "Sign in to run your organiser page.",
  signInButton: "Sign in",
  /** The API's 403 `adult_confirmation_required`. */
  adultsOnly:
    "Organiser pages are for people 18 or over. Confirm your age in your account, then try again.",
  /** The API's 409 `organiser_email_required`. */
  needEmail: "Add an email to your account to post events.",
  /** The API's 503 `organisers_paused`. */
  paused: "Organiser pages are paused for a moment. Try again soon.",
  /** The API's 404s. */
  notFound: "We could not find that organiser.",
  eventNotFound: "We could not find that event.",
  /** The API's 403s. */
  notMember: "You are not a member of this organiser.",
  notOwner: "Only an owner of this organiser can do that.",
  /** The API's 400 with no `details`. */
  badBody: "Send it as the API contract describes it.",
  /** The API's 400 naming several fields. */
  checkFields: "Check the fields marked and try again.",
  /** Ours: a 429 that came without a sentence. */
  slowDown: "Too many changes at once. Wait a moment and try again.",
  /** Ours: a failure with nothing better to say. */
  notNow: "That did not go through. Try again in a moment.",
  tryAgain: "Try again",

  /* ------------------------------------------------------------------------- hub -- */

  /** The spec's hub line, signed in with no organiser. */
  empty:
    "Run a group or a series of events? Set up your organiser page, post your events, and see how many people are going.",
  setUp: "Set up your organiser page",
  /** Ours: the hub's button once the person has an organiser. */
  setUpAnother: "Set up another organiser page",
  /** [proposed, @gamallasaiteja to confirm] The hub's card for a group the person holds. */
  clubCard: (name: string): string => `Post ${name}'s events`,
  clubCardButton: "Set up its organiser page",
  /** [proposed, @gamallasaiteja to confirm] After a group's 201, in place of `made`. */
  clubMade: (name: string): string =>
    `Your organiser page is set up and checked. Your events show as posted by ${name}.`,
  /** Ours: beside a group's name and place, shown fixed on its setup and edit forms. */
  clubFixed: "These come from the group and stay the group's.",
  /** The API's 404 for a group that is not shown, for a link to one no longer offered. */
  noClub: "We could not find that group.",
  /** The API's 409 `club_already_linked`. */
  clubLinked: "This group already has an organiser.",
  /** The API's 403 `not_club_holder`. */
  notClubHolder:
    "Only the person who holds this group on Yuvoy can set up its organiser.",
  /** The API's 403 `people_paused`, by `details.standing`. */
  peoplePaused: "Your use of People is paused for now.",
  peopleEnded: "Your use of People has ended.",
  loading: "Loading your organiser pages",
  stateLabel: (state: OrganiserState): string =>
    ORGANISER_STATES[state] ?? UNKNOWN_STATE,
  roleLabel: (role: OrganiserRole): string => ROLES[role],
  /** Ours: a hub row for a screen reader, in the order it is drawn. */
  rowLabel: (
    name: string,
    state: OrganiserState,
    role: OrganiserRole,
  ): string =>
    `${name}, ${ORGANISER_STATES[state] ?? UNKNOWN_STATE}, ${ROLES[role]}`,

  /* ------------------------------------------------------------------ the page form -- */

  formTitle: "Set up your organiser page",
  editTitle: "Edit page",
  name: "Name people know you by",
  place: "Where you run things",
  departments: "What you run (up to 3)",
  about: "About (optional)",
  /** [proposed, @gamallasaiteja to confirm] */
  aboutHint: "Links, phone numbers and emails are taken out.",
  links: "Links (up to 3)",
  linkKind: (kind: OrganiserLinkKind): string => LINK_KINDS[kind],
  /** Ours. */
  linkUrl: "Link",
  linkPlaceholder: "https://",
  addLink: "Add a link",
  removeLink: "Remove",
  contactEmail: "Email for Yuvoy to reach you",
  /** Ours: the issue says it is optional, private and never shown publicly. */
  contactEmailHint: "Optional. Only Yuvoy sees it, never anyone else.",
  runsIt: "I run this group or these events, and I am 18 or over.",
  send: "Send for checking",
  /** Ours: the edit form's button. */
  save: "Save",
  /** The spec's line after the 201. */
  made: "Thanks. We check new organisers by email or a short call, usually within two working days. You can post events now, and we check each one before it shows.",
  /** Ours: after an edit's 200. */
  saved: "Saved.",
  /** Ours: the buttons' working verbs while a write is out. */
  sending: "Sending",
  saving: "Saving",
  adding: "Adding",
  removing: "Removing",
  /** Ours: a department by its key, the API's label, or the key for one this build has never heard of. */
  departmentLabel: (key: string): string =>
    (ORGANISER_DEPARTMENTS as Readonly<Record<string, string>>)[key] ?? key,
  /** Ours: the form's own checks, before anything is sent. */
  needName: "Give the name people know you by, 2 to 120 characters.",
  needPlace: "Pick where you run things.",
  needDepartments: "Pick what you run: one to three kinds.",
  needRunsIt:
    "Tick the line to say you run this group or these events and are 18 or over.",
  noPlaces: "We could not load the places just now.",

  /* ---------------------------------------------------------------- the state card -- */

  /** [proposed, @gamallasaiteja to confirm] */
  pendingLine: (code: string): string =>
    `Post ${code} on your group's page or bio. We look for it when we check you, and it is the quickest way to be checked.`,
  /** [proposed, @gamallasaiteja to confirm] */
  notVerifiedLine: (code: string): string =>
    `We could not confirm this page is yours yet. You can still post events, and we check each one before it shows. Post ${code} on your group's own page and we can look again.`,
  /** [proposed, @gamallasaiteja to confirm] */
  verifiedLine: (name: string): string =>
    `Checked by Yuvoy. Your events show as posted by ${name}.`,
  /** The API's sentences. */
  suspended: "This organiser is suspended.",
  closed: "This organiser is closed.",
  copyCode: "Copy code",
  /** Ours. */
  copied: "Copied",
  copyFailed: "Could not copy. Write the code down instead.",
  editPage: "Edit page",
  helpers: "Helpers",
  postEvent: "Post an event",
  /** Ours: the events list's heading and its empty line. */
  events: "Events",
  noEvents: "No events yet.",
  loadingOrganiser: "Loading this organiser",

  /* ---------------------------------------------------------------------- helpers -- */

  /** [proposed, @gamallasaiteja to confirm] */
  helperEmail: "Their email",
  /** [proposed, @gamallasaiteja to confirm] */
  addHelper: "Add helper",
  /** [proposed, @gamallasaiteja to confirm]: "{firstName} is a helper now.", or "Helper added." */
  helperAdded: (firstName: string): string =>
    firstName.trim() ? `${firstName.trim()} is a helper now.` : "Helper added.",
  /** The API's sentence for the 409 before verified. */
  helpersAfterCheck:
    "You can add helpers once Yuvoy has checked your organiser.",
  /** [proposed, @gamallasaiteja to confirm]: a helper with no name chosen. */
  helperName: (firstName: string): string => firstName.trim() || "Helper",
  removeHelper: "Remove",
  /** Ours. */
  removeHelperLabel: (firstName: string): string =>
    `Remove ${firstName.trim() || "this helper"}`,
  noHelpers: "No helpers yet.",
  loadingHelpers: "Loading the helpers",
  /** Ours: what a helper reads above the names. */
  helpersRead: "The people who help run this organiser.",
  /** Ours. */
  needHelperEmail: "Enter the email they sign in to Yuvoy with.",

  /* ------------------------------------------------------- events (part B's screens) -- */

  eventStateLabel: (state: OrganiserEventState, reason?: string): string =>
    state === "not_accepted"
      ? reason?.trim()
        ? `Not accepted: ${reason.trim()}`
        : "Not accepted"
      : (EVENT_STATES[state] ?? UNKNOWN_STATE),
  eventTitle: "Title",
  /** Ours, for the department, start, end, place, venue, address, price, link and about fields. */
  eventDepartment: "What kind of thing it is",
  eventStart: "Starts",
  eventEnd: "Ends (optional)",
  eventPlace: "Where it is",
  eventVenue: "Venue name",
  eventAddress: "Address (optional)",
  eventFree: "Free",
  eventPaid: "Paid",
  eventPrice: "From, in rupees",
  eventLink: "Link to the event",
  eventAbout: "About (optional)",
  eventPriceNote: "Price note (optional)",
  /** [proposed, @gamallasaiteja to confirm] */
  eventRepeat: "Every week until",
  /** The API's sentences, for the form's own checks before anything is sent. */
  priceNoteTooLong: "A price note can be at most 80 characters.",
  repeatRange: "Pick a last date from the first one up to 26 weeks ahead.",
  /** [proposed, @gamallasaiteja to confirm]: "Send for checking" while self-publish is off. */
  sendEvent: (selfPublish: boolean): string =>
    selfPublish ? "Post" : "Send for checking",
  /** [proposed, @gamallasaiteja to confirm]: after the 201, by the event's state. */
  eventSent: (state: OrganiserEventState): string =>
    state === "live"
      ? "It is live."
      : "Thanks. A person at Yuvoy checks it before it shows.",
  change: "Change",
  cancelEvent: "Cancel this event",
  cancelConfirm:
    "Cancel this event? Everyone who said they are going is told once.",
  /** The same confirm in the system alert's two parts: its question and its line. */
  cancelConfirmTitle: "Cancel this event?",
  cancelConfirmLine: "Everyone who said they are going is told once.",
  /** Ours: the confirm's two buttons, the way out and the step. */
  keepEvent: "Keep it",
  cancelEventYes: "Yes, cancel it",
  openCard: "Open the card",
  /** Ours: the event form's titles, its edit button, and the screen's loading line. */
  eventFormTitle: "Post an event",
  eventEditTitle: "Change the event",
  saveEvent: "Save changes",
  /** Ours: where a screen's back goes, for its label. */
  backToOrganiser: "the organiser",
  backToEvent: "the event",
  loadingEvent: "Loading this event",
  /** Ours: the kinds of things come from the API's vocabulary, never a list kept here. */
  noDepartments: "We could not load the kinds of things just now.",
  /** Ours: under the price note, and the way to make a weekly event one date again. */
  priceNoteHint: "For example: Students pay half",
  noRepeat: "Make it one date",
  /** Ours: names the free or paid choice for a screen reader. */
  eventFreeOrPaid: "Free or paid",
  /** The API's sentences, for what the form cannot send at all. */
  needStart: "Pick a start from now up to 180 days ahead.",
  needEnd: "The end must be after the start, and at most 14 days after it.",
  needPrice: "Enter the lowest ticket price in rupees, from 1 to 1,00,000.",
  /** The API's 409 sentences for a change the event's state no longer allows. */
  endedNoChange: "This event has ended, so it can no longer be changed.",
  cancelledNoChange:
    "This event was cancelled, so it can no longer be changed.",
  notAcceptedNoChange:
    "This event was not accepted, so it can no longer be changed.",
  /** Ours: the posted fields as the event's screen says them. */
  priceFrom: (price: string): string => `From ${price}`,
  repeatsUntil: (day: string): string => `Every week until ${day}`,

  /* -------------------------------------------------------------------- numbers -- */

  /** The spec's line. Counts only, never a name. */
  numbers: (n: {
    going: number;
    ticketTapsAtLeast: number;
    checkedIn: number;
    went: number;
  }) =>
    `${n.going} going · at least ${n.ticketTapsAtLeast} ticket taps · ${n.checkedIn} checked in · ${n.went} went`,
  /** [proposed, @gamallasaiteja to confirm] */
  updated: (time: string): string => `Updated ${time}`,
  /** Ours: the numbers' heading, a block's date, and their loading line. */
  numbersTitle: "Numbers",
  numbersNow: (day: string): string => `Current date, ${day}`,
  numbersLastWeek: (day: string): string => `Last week, ${day}`,
  loadingNumbers: "Loading the numbers",
});
