/**
 * Every word the two plan pages say, in one place (yuvoy-app#193,
 * yuvoy-mobile#373).
 *
 * ## Where the words come from
 *
 * The guest page's table in yuvoy-mobile#373, as its 28 Oct comment rewrote
 * it for the planner names; R7-c section 3 for the money lines; R7-d's member
 * view for "Leave this plan" and "Report a problem". The mobile app draws the
 * same lists (`contract-notes/R7-M1-M2-mobile-names.md` section 3), so the
 * app and both web pages read alike and @gamallasaiteja approves one list.
 *
 * Every line is a DRAFT. Lines marked `new` are not in any of those tables:
 * they fill a gap the tables leave (a member's view of an unsplit cost, the
 * people before the pick, the report sheet, whose words wait on
 * yuvoy-api#418 Q18). They go to Teja with the rest; the build does not wait.
 *
 * ## The person who made the plan is the planner
 *
 * Never "the host": since 21 Oct that word means a business and nothing else
 * (yuvoy-api#480). Where a plan is loaded, a line names the planner by first
 * name (`PlanView.planner.name`); where none is, it says "the person who made
 * the plan". `words.test.ts` fails on the word anywhere in this file's output.
 *
 * No dash anywhere, as everywhere in this product's copy.
 */

/** The three answers to an offered time. */
const TIME_ANSWERS = { can: "Can", maybe: "Maybe", cant: "Can't" } as const;
/** The same three, once a time is picked. */
const DECIDED_ANSWERS = {
  can: "Going",
  maybe: "Maybe",
  cant: "Can't make it",
} as const;

export const planWords = {
  /* ------------------------------------------------------------- page -- */

  /** The tab, and the guest page's Open Graph title. */
  pageTitle: "A plan on Yuvoy",
  ogDescription: "A plan on Yuvoy. Open the link to reply.",
  noScript:
    "Turn on JavaScript to see this plan and reply. Your phone's own browser works too.",

  /* --------------------------------------------------- signed out (#193) -- */

  /** new: the signed-in page, for somebody with no session. */
  signInTitle: "Sign in to see this plan",
  /** new */
  signInBody:
    "This plan is only for the people on it. Sign in and it opens here.",
  signIn: "Sign in",

  /* ----------------------------------------------------------- heading -- */

  invitedYou: (planner: string) => `${planner} invited you`,
  /** R7-d's card line, for the planner reading their own plan. */
  youArePlanning: "You're planning this",
  where: (place: string) => `Where: ${place}`,
  placeToDecide: "Place to be decided",
  when: (time: string) => `When: ${time}`,
  choosingTime: "Friends are choosing a time",
  /** new: the map link beside the place. */
  openMap: "Open the map",
  /** new: the heading over `gettingHome`. */
  gettingHome: "Getting home",
  /** new: the heading over `note`. */
  noteFrom: (planner: string) => `From ${planner}`,

  /* ------------------------------------------------------ times, ideas -- */

  canYouMakeIt: "Can you make it?",
  timeAnswer: TIME_ANSWERS,
  /** R7-d. A middle dot, not a dash. */
  counts: (c: { can: number; maybe: number; cant: number }) =>
    `Can ${c.can} · Maybe ${c.maybe} · Can't ${c.cant}`,
  goingSoFar: (names: string) => `Going so far: ${names}`,
  areYouGoing: (time: string) => `${time}. Are you going?`,
  decidedAnswer: DECIDED_ANSWERS,
  whatShouldWeDo: "What should we do?",
  myVote: "My vote",
  votes: (n: number) => (n === 1 ? "1 vote" : `${n} votes`),
  /** R7-d, once an idea is picked. */
  doing: (idea: string) => `We're doing: ${idea}`,

  /* -------------------------------------------------------- bring list -- */

  bringList: "Who's bringing what",
  illBringIt: "I'll bring it",
  bringing: (name: string) => `${name} is bringing it`,
  takenFirst: (item: string) => `${item} was taken by someone else first.`,

  /* ------------------------------------------------------------- costs -- */

  /** new: the heading over the costs. */
  costs: "Costs",
  /** R7-c, the first half of "Member, share line". */
  costLine: (label: string, amount: string, payer: string) =>
    `${label}: ${amount}, paid by ${payer}.`,
  /** R7-c, the second half. */
  yourShare: (share: string) => `Your share: ${share}.`,
  /** new: a member's view of a cost before the pick freezes the shares. */
  shareLater: (planner: string) =>
    `Your share is worked out when ${planner} picks the time.`,
  havePaid: (n: number, m: number) => `${n} of ${m} have paid`,
  payButton: (share: string) => `Pay ${share} by UPI`,
  underPayButton: (payer: string, share: string) =>
    `Yuvoy does not take or check this money. The button opens your UPI app with ${payer}'s UPI ID and ${share} filled in, and you pay them directly.`,
  /** R7-c "Member, fallback", under a pay button. */
  payFallback: (share: string, upiId: string) =>
    `Button not working? Send ${share} to ${upiId} from any UPI app.`,
  /** new: the same line with no button above it to fall back from. */
  payByHand: (share: string, upiId: string) =>
    `Send ${share} to ${upiId} from any UPI app.`,
  /** new: the name a UPI app shows for the payee, to check before paying. */
  payeeName: (name: string) => `Your UPI app should show ${name}.`,
  /** new: a share with nobody to pay yet. */
  noPayeeYet: (payer: string) => `Ask ${payer} for their UPI ID.`,
  copyUpiId: "Copy UPI ID",
  copied: "Copied",
  paidTick: "I've paid my share",
  paidHint: (payer: string) => `This tells ${payer}. Yuvoy cannot see payments.`,
  /** new: the planner ticked "Got it" on this share. */
  received: (payer: string) => `${payer} says they got it.`,

  /* ------------------------------------------------------------ people -- */

  /** new: the heading over who is coming. */
  people: "Who's coming",
  you: "You",
  going: (names: string) => `Going: ${names}`,
  maybe: (names: string) => `Maybe: ${names}`,
  cantMakeIt: (names: string) => `Can't make it: ${names}`,
  /** new: before the pick, a reply says only that somebody answered. */
  replied: (names: string) => `Replied: ${names}`,
  /** new */
  notRepliedYet: (names: string) => `Not replied yet: ${names}`,
  /** new: joins names, "Asha, Ravi and Meera". */
  and: "and",

  /* ----------------------------------------------------------- the reply -- */

  sendReply: "Send my reply",
  updateReply: "Update my reply",
  /** The working verb on the button while a reply is on its way. */
  sending: "Sending",
  adult: "I am 18 or older",
  /** The API's own sentence for `details.adult` (plans_members.go). */
  adultNeeded: "Tick to say you are 18 or over.",
  thanks: (name: string) => `Thanks, ${name}. Your reply is in.`,
  /** A guest without a session: the reply is this phone's. */
  changeFromThisPhone: (time: string) =>
    `You can change it from this phone until ${time}.`,
  /** new: a signed-in reply belongs to the account, not to a phone. */
  changeUntil: (time: string) => `You can change it until ${time}.`,

  /* ------------------------------------------------------------ leaving -- */

  /** R7-d's member view. */
  leavePlan: "Leave this plan",
  /** The guest page. */
  removeReply: "Remove my reply",
  leaveWarning:
    "Your name and answers will be deleted, and your items freed for others.",
  /** new: the way out of the confirmation. */
  keepReply: "Keep my reply",
  /** new: after a member leaves. */
  left: "You left this plan.",
  /** new: after a guest removes their reply. */
  replyRemoved: "Your reply is removed.",

  /* ------------------------------------------------------------- states -- */

  /** 404 and a bad link, on the guest page (28 Oct comment). */
  linkNotWorking:
    "This plan link is not working. It may have expired, or the person who made the plan may have made a new one. Ask whoever sent it to you for a fresh link.",
  planFull: (planner: string) =>
    `This plan has as many people as Yuvoy allows. Ask ${planner} if there is room.`,
  started: "Replies are closed because the plan has started.",
  cancelled: (planner: string) => `${planner} cancelled this plan.`,
  done: "This plan has happened.",
  closed: "This plan is no longer available.",
  rateLimited: "Lots of replies at once. Wait a minute and send again.",
  /** Two sentences, so a page can set the first as a heading. */
  paused: "Plans are paused for a moment.",
  pausedNext: "Try again later.",
  notSent:
    "We could not send your reply. Check your connection and send again. Your answers are still filled in.",
  /** `planner_leaves` on leave. */
  plannerLeaves: "Cancel the plan instead.",
  /** new: `conflict` with `nonce` (#373 case 5 says "send again"). */
  sendAgain: "That reply did not go through. Send it again.",
  alreadyAnswered: "This account already answered this plan.",

  /* ------------------------------------------------- guest page (Part C) -- */

  firstName: "Your first name",
  firstNameHint: "Friends see this. Letters only, up to 30.",
  reminderOffer:
    "Want a reminder the evening before? Sign in with your email and we will link this reply to your account.",
  linkMyReply: "Link my reply to my account",
  share: "Share",
  footerNoPhone:
    "Yuvoy never asks guests for a phone number or payment details. Money goes straight between friends by UPI.",
  footerKept:
    "Your first name and replies are kept until 90 days after the plan, or until you remove your reply.",
  footerSeen: (planner: string) =>
    `${planner} and the others on this plan see your name and replies.`,
  safety: (email: string) => `Safety questions: ${email}`,

  /* ------------------------------------------------------------- report -- */

  /** R7-d's member view. */
  reportProblem: "Report a problem",
  /** The guest page. */
  reportPlan: "Report this plan",
  /** new, like everything below until yuvoy-api#418 Q18 is answered. */
  reportWhy: "What is wrong?",
  reportReason: {
    unsafe: "Something here is unsafe",
    harassment: "Someone is harassing people",
    spam: "It is spam or a scam",
    impersonation: "Someone is pretending to be someone else",
    other: "Something else",
  },
  reportPerson: "Is it about one person? (optional)",
  reportWholePlan: "The plan itself",
  reportNote: "Anything else we should know (optional)",
  reportNoteHint: "Only Yuvoy staff read this. Up to 300 characters.",
  reportSend: "Send report",
  reportSending: "Sending",
  reportSent:
    "Thanks for telling us. A person at Yuvoy reads every report within one working day.",
  reportClose: "Close",
  reportPersonUnknown: "That name is not on this plan.",
  reportTooFast: "Too many reports at once. Wait a minute and send again.",
  reportNotSent:
    "We could not send your report. Check your connection and send again.",
} as const;

/** The line under a time for one answer, before or after the pick. */
export function answerLabel(
  answer: "can" | "maybe" | "cant",
  decided: boolean,
): string {
  return decided ? DECIDED_ANSWERS[answer] : TIME_ANSWERS[answer];
}

/**
 * "Asha", "Asha and Ravi", "Asha, Ravi and Meera". Written out rather than
 * `Intl.ListFormat`, whose joiners differ between runtimes the same way date
 * names do (yuvoy-app#67): the server and the browser must draw one string.
 */
export function namesList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${planWords.and} ${names[names.length - 1]}`;
}

/**
 * The line a plan's state says above the reply, or null for a plan still
 * taking answers. A switch with a default rather than a lookup, so a state
 * this build has not seen (the enum grows on the server) says nothing rather
 * than taking the page down.
 */
export function stateLine(
  plan: { state: string; canReply: boolean; planner: { name: string } },
): string | null {
  switch (plan.state) {
    case "cancelled":
      return planWords.cancelled(plan.planner.name);
    case "done":
      return planWords.done;
    case "closed":
      return planWords.closed;
    default:
      return plan.canReply ? null : planWords.started;
  }
}

/**
 * The sentence for a refused reply or leave, by `code` and `reason`, never by
 * the message (it changes; the code does not). A field refusal is the API's
 * own sentence for that field, which is what the contract says to show.
 */
export function refusalLine(
  refusal: { code: string; reason?: string; message: string },
  planner: string,
): string {
  switch (refusal.code) {
    case "plan_closed":
      switch (refusal.reason) {
        case "started":
          return planWords.started;
        case "cancelled":
          return planWords.cancelled(planner);
        case "done":
          return planWords.done;
        default:
          return planWords.closed;
      }
    case "plan_full":
      return planWords.planFull(planner);
    case "conflict":
      if (refusal.reason === "planner_leaves") return planWords.plannerLeaves;
      if (refusal.reason === "nonce") return planWords.sendAgain;
      if (refusal.reason === "already_answered") {
        return planWords.alreadyAnswered;
      }
      return refusal.message || planWords.notSent;
    case "rate_limited":
      return planWords.rateLimited;
    case "plans_unavailable":
      return `${planWords.paused} ${planWords.pausedNext}`;
    case "invalid_input":
      return refusal.message || planWords.notSent;
    default:
      return planWords.notSent;
  }
}
