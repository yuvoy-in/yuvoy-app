/**
 * The analytics question's words, version 2 (`CONSENT_VERSION`,
 * yuvoy-app#181).
 *
 * The phone app's question word for word (yuvoy-mobile#338, `USAGE_V2`),
 * approved for the app on 20 Oct 2026 and taken for the web the same day, so
 * one purpose has one text wherever it is asked. The spec leaves that text to
 * Hima and counsel (R0-T5, C2): a change is a change to both apps.
 *
 * Every line is true of the web as it stands. Reel views and what is done
 * with a card go to the API with no session, so they are not linked to an
 * account, and nothing about where somebody is, or who they are, is ever
 * sent. The yes can be taken back on the Account tab (`UsageSetting`), which
 * is what "change it any time" promises.
 */
export const CONSENT_WORDS = {
  title: "Can we count what you watch and open?",
  lede: "It helps us learn what to show first.",
  rows: [
    { counted: true, text: "Which videos and cards" },
    { counted: true, text: "Opens, saves and shares, and when" },
    { counted: false, text: "Your name, number or email" },
    { counted: false, text: "Where you are" },
  ],
  yes: "Yes, count them",
  reassure: "Not linked to your account · change it any time",
  no: "No thanks",
} as const;

/**
 * The same answer as a setting, in the phone app's words for its switch
 * (yuvoy-mobile#338, `COUNT_SWITCH` and `USAGE_FOOT`). A yes given to the
 * older words is described as what it counts, reel views only, until it is
 * given again.
 */
export const COUNT_SETTING = {
  head: "Usage counts",
  title: {
    1: "Count my views",
    2: "Count what I watch and open",
  },
  sub: {
    1: "Which reels I watch, and for how long. Anonymous.",
    2: "Videos, cards, opens, saves and shares, and when. Never your name, number or email.",
  },
  foot: {
    granted: "On. Turning it off stops the counting from this moment.",
    denied: "Off. Nothing about how you use the app is sent.",
    unset: "You have not been asked yet. Nothing is sent until you say yes.",
  },
} as const;
