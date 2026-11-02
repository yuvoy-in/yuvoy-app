import type { components } from "@/lib/api/schema.gen";

/**
 * Every word of the groups directory, a group's page and its three forms
 * (yuvoy-mobile#386, web backfill), in one place.
 *
 * Ported from mobile's `packages/core/src/people/clubs.ts` with the same
 * names, so the two apps read alike. The words are the issue's, except the
 * ones marked "ours". Follow is left out (that is yuvoy-mobile#392), so the
 * intro has no "Follow the ones you like."
 */

/** The words of the directory and a group's page. */
export const CLUB_WORDS = Object.freeze({
  /** The web spec's "Groups" tab. */
  entry: "Groups",
  /** Ours: the line under the entry. */
  entrySub: "Clubs and communities that meet regularly",
  intro: (city: string) =>
    `Clubs and communities in ${city} that meet regularly.`,
  from: (sourceName: string) => `From ${sourceName}`,
  notOnYuvoy: "Not on Yuvoy yet",
  onYuvoy: "On Yuvoy",
  footer:
    "These groups haven't joined Yuvoy. We list them from their own public pages.",
  empty: (city: string) => `No groups listed for ${city} yet.`,
  claim: "Run this group? Claim it",
  remove: "Remove this listing",
  report: "Something wrong? Tell us",
  /** Ours: a screen reader's name for the row of place chips. */
  places: "Places",
  /** Ours: the places list came back with no place in it. */
  noPlaces: "There are no places to show groups for yet.",
  /** Ours: what a screen reader hears while the list or a page loads. */
  loadingList: "Loading groups",
  loadingPage: "Loading this group",
  /** Ours: a screen reader's name for the link to the group's own page. */
  opensSource: (sourceName: string) => `Opens ${sourceName}`,
});

/** The claim form's words (signed in only). */
export const CLAIM_WORDS = Object.freeze({
  title: (name: string) => `Claim ${name}`,
  intro:
    "Tell us how you're part of this group. A person on our team checks with the group through its own public contact before we hand the listing over.",
  roleText: "What do you do in the group?",
  contactEmail: "Email we can reach you on",
  proofUrl: "A page of the group's that names you (optional)",
  note: "Anything else (optional)",
  send: "Send claim",
  /** Ours: the button while the claim is on its way, and the one that closes the form after. */
  sending: "Sending",
  done: "Done",
});

/** The claim form's fields, in the contract's names. */
export type ClaimField = keyof components["schemas"]["ClubClaimInput"];

/** Ours: what each field says when the API (or a required field left empty) refuses it. */
export const CLAIM_FIELD_WORDS: Readonly<Record<ClaimField, string>> =
  Object.freeze({
    roleText: "Tell us what you do in the group, in 2 to 80 characters.",
    contactEmail: "Enter an email address we can reach you on.",
    proofUrl:
      "Use a page address that starts with https://, at most 500 characters.",
    note: "Keep it to 500 characters or fewer.",
  });

/** The removal form's words (anyone, signed in or not). */
export const CLUB_REMOVAL_WORDS = Object.freeze({
  title: CLUB_WORDS.remove,
  lead: (name: string) =>
    `If you run ${name} and don't want it listed, we'll hide it now. A person on our team then takes it down for good.`,
  /** Ours: a screen reader's name for the group of reasons. */
  reasons: "Why it should go",
  send: "Remove the listing",
  /** Ours: the button while the request is on its way, and the one that closes the form after. */
  sending: "Removing",
  done: "Done",
});

/** A reason a form offers: the contract's value, and the words it is offered in. */
export type ReasonOf<K extends string> = { key: K; label: string };

export type ClubRemovalReason =
  components["schemas"]["ClubRemovalRequest"]["reason"];

/** The three reasons, in the issue's order. */
export const CLUB_REMOVAL_REASONS: readonly ReasonOf<ClubRemovalReason>[] =
  Object.freeze([
    { key: "we_run_it_and_want_off", label: "We run it and want it off Yuvoy" },
    { key: "not_a_real_group", label: "It isn't a real group" },
    { key: "other", label: "Something else" },
  ]);

/** The report form's words (signed in only). Proposed words, Teja to confirm. */
export const CLUB_REPORT_WORDS = Object.freeze({
  title: (name: string) => `Something wrong with ${name}?`,
  intro:
    "Tell us what's wrong. A person on our team looks at it; the listing stays as it is until then.",
  /** Ours: a screen reader's name for the group of reasons. */
  reasons: "What's wrong",
  note: "Tell us more",
  /** The note's label once "Something else" is picked: then it is required. */
  noteRequired: "Tell us what's wrong",
  /** Ours: Send with "Something else" and no note, said on the note before anything is sent. */
  noteMissing: "Tell us what's wrong before you send.",
  /** Ours: a note the API refused (1 to 500 characters). */
  noteTooLong: "Keep it to 500 characters or fewer.",
  send: "Send",
  /** Ours: the button while the report is on its way, and the one that closes the form after. */
  sending: "Sending",
  done: "Done",
});

export type ClubReportReason = components["schemas"]["ClubReport"]["reason"];

/** The four reasons, in the issue's order. */
export const CLUB_REPORT_REASONS: readonly ReasonOf<ClubReportReason>[] =
  Object.freeze([
    { key: "not_a_real_group", label: "It isn't a real group" },
    { key: "wrong_details", label: "The details are wrong" },
    { key: "offensive", label: "It's offensive" },
    { key: "other", label: "Something else" },
  ]);

/** The API's sentences (yuvoy-api `internal/handler/clubs.go`), for an answer without one. */
export const CLUB_API_WORDS = Object.freeze({
  gone: "We couldn't find that group.",
  claimWaiting: "Your claim on this group is already waiting for our team.",
  alreadyClaimed: "This group has already been claimed.",
  claimLimit: "You have sent a lot of claims today. Try again tomorrow.",
  reportLimit: "You have sent a lot of reports today. Try again tomorrow.",
  removalLimit:
    "This listing has had a lot of requests today. Try again tomorrow.",
});

/**
 * Mobile's People error words, the ones a group's forms can need.
 *
 * `age` and `name` say what is missing in words only: the web has no age
 * step or name step yet (they come with yuvoy-app#222), so there is nothing
 * to open. Once #222 is in, the form opens those steps instead.
 */
export const PEOPLE_ERROR_WORDS = Object.freeze({
  signIn: "Sign in again to use People.",
  age: "People is for adults. Confirm your age to go on.",
  name: "Add your first name before you use People.",
  paused: "Your use of People is paused for now.",
  ended: "Your use of People has ended.",
  noSignal: "We could not reach Yuvoy. Check your signal and try again.",
  fault: "Something went wrong on our side. Try again in a minute.",
});
