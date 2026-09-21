/**
 * What the Help Center answers, as data.
 *
 * ## Why this is a module and not markup
 *
 * Search. A traveller with a problem types a word, not a category, and
 * matching against a structured list is the difference between a help page and
 * a wall of headings. Keeping the answers as data also means the categories,
 * the search and the count all read the same source and cannot drift.
 *
 * ## The rule every answer here follows
 *
 * **Mechanics, never policy.** Everything below describes how the product
 * behaves and is checkable against the pinned contract. Nothing states a
 * refund percentage, a cancellation window or a fee.
 *
 * That is not caution, it is correctness: a cancellation policy is **frozen
 * onto each booking at checkout** from the listing that sold it, so there is
 * no single policy to state centrally. A number written here would be wrong
 * for somebody's booking the day an operator changed theirs, and it would be
 * wrong in the direction that makes people feel tricked. The app shows each
 * traveller their own policy on their own booking, and `getCancellationQuote`
 * prices the actual refund before they confirm. This page points at that
 * rather than competing with it.
 *
 * ## What is deliberately NOT here
 *
 * No ticket tracking. `POST /support/requests` is the entire support surface
 * of the API: it takes a message, answers a reference, and a person replies on
 * WhatsApp. There is no list, no status and no history to read back, so this
 * page does not imply one exists. That gap is yuvoy-api#196.
 */

export interface FaqCategory {
  key: string;
  label: string;
  items: FaqItem[];
}

export interface FaqItem {
  /** Stable, so an open answer survives a re-render and can be linked to. */
  id: string;
  question: string;
  /** Each string is a paragraph. Plain text: no markup, no links to maintain. */
  answer: string[];
}

export const FAQ: FaqCategory[] = [
  {
    key: "booking",
    label: "Booking",
    items: [
      {
        id: "confirmed",
        question: "How do I know my booking is confirmed?",
        answer: [
          "You get a booking link and a short reference. The link opens your trip page, which carries everything you need for the day: when it leaves, where you meet, who is going and what you paid.",
          "Keep the link. It is how you reach that booking again.",
        ],
      },
      {
        id: "no-account",
        question: "Do I need an account to book?",
        answer: [
          "No. You can book without signing in, and your booking link is how you get back to the trip.",
          "Signing in with the same number gathers your trips together in one place, so you are not hunting through messages for a link.",
        ],
      },
      {
        id: "reference",
        question: "What is the booking reference for?",
        answer: [
          "Reading out at the meeting point. It is how the operator finds you on their list.",
          "It is not a password. It is safe to say out loud, and it is not what opens your booking: your link is.",
        ],
      },
      {
        id: "instant-or-request",
        question: "Why did my booking say the operator has to answer?",
        answer: [
          "Some experiences are booked instantly because Yuvoy holds seats on them. Others are a request: the operator answers first and you pay only once they accept.",
          "A request shows you the time the operator has to answer by. Nothing is charged while you wait.",
        ],
      },
    ],
  },
  {
    key: "paying",
    label: "Paying",
    items: [
      {
        id: "price-final",
        question: "Is the price I see the final price?",
        answer: [
          "Yes. The total on the checkout screen is everything. Nothing is added after it.",
        ],
      },
      {
        id: "cash",
        question: "My trip says to bring cash. Why?",
        answer: [
          "Some operators take payment on the day rather than online. Your trip page shows the amount to bring and says to hand it to the operator at the meeting point.",
          "The money goes to them, not to us, and there is nothing to pay before you arrive. That line disappears once the operator records that they have taken it.",
        ],
      },
    ],
  },
  {
    key: "changes",
    label: "Changes and cancelling",
    items: [
      {
        id: "how-to-cancel",
        question: "How do I cancel?",
        answer: [
          "Open your trip and choose the cancel option. Before you confirm anything, you are shown exactly what would come back to you.",
          "The terms are the ones frozen onto your booking when you made it, so they are the ones you agreed to and cannot change afterwards.",
        ],
      },
      {
        id: "no-cancel-button",
        question: "There is no cancel option on my trip. Why?",
        answer: [
          "Not every booking can be cancelled by the traveller directly. When that is the case the app does not show a button that would fail.",
          "Message us here, or talk to your operator from the trip itself, and a person will sort it out.",
        ],
      },
      {
        id: "operator-moved",
        question: "The operator moved my departure. What happens?",
        answer: [
          "If the departure moved after you booked, cancelling refunds you in full.",
          "Your trip page shows any note the operator has sent about the change.",
        ],
      },
      {
        id: "rebooking",
        question: "Can I change my date instead of cancelling?",
        answer: [
          "Rebooking is a fresh booking rather than a silent move, so the price you see when you rebook is the price you pay.",
        ],
      },
    ],
  },
  {
    key: "trips",
    label: "Your trips",
    items: [
      {
        id: "lost-link",
        question: "I lost my booking link.",
        answer: [
          "Ask for it again with the number you booked with. It arrives the same way it did the first time.",
          "For your privacy the app answers the same way whether or not that number has a booking, so nobody can use it to find out who booked what.",
        ],
      },
      {
        id: "talk-to-operator",
        question: "Can I talk to the operator?",
        answer: [
          "Yes. An upcoming or running trip has a conversation with the business on it, so you are talking to the people actually running that trip and they can see which booking you mean.",
        ],
      },
      {
        id: "invite-guests",
        question: "How do I add someone to my trip?",
        answer: [
          "Invite them from the trip. An invitation gives that person their own place in your party.",
          "That is different from sharing the link, which shows whoever you send it to everything about your booking, meeting point included.",
        ],
      },
    ],
  },
  {
    key: "account",
    label: "Account and privacy",
    items: [
      {
        id: "sign-in-code",
        question: "My sign-in code did not work.",
        answer: [
          "Codes last a few minutes and each new one replaces the last, so if you asked twice only the newest works.",
          "If you are trying to reach a booking rather than sign in, you do not need a code at all. Ask for your booking link instead.",
        ],
      },
      {
        id: "saved",
        question: "Where are my saved experiences?",
        answer: [
          "Under Saved, from your account.",
          "Saves currently live in the browser you made them in, so they will not follow you to another phone.",
        ],
      },
    ],
  },
];

/** Every item, flattened, with the category it came from. */
export function allFaqItems(): (FaqItem & { category: string })[] {
  return FAQ.flatMap((c) => c.items.map((i) => ({ ...i, category: c.label })));
}

/**
 * Items matching a query, or everything when the query is empty.
 *
 * Deliberately dumb: case-insensitive substring over the question, the answer
 * and the category name. No stemming and no ranking, because the corpus is
 * about twenty items and anything cleverer would be untestable weight-tuning
 * over a list somebody can read in a minute.
 *
 * The ANSWER is searched, not only the question, because a traveller types the
 * word that is on their screen ("reference", "cash") rather than the phrasing
 * somebody chose for a heading.
 */
export function searchFaq(query: string): (FaqItem & { category: string })[] {
  const q = query.trim().toLowerCase();
  const items = allFaqItems();
  if (!q) return items;
  return items.filter((i) =>
    [i.question, i.category, ...i.answer].some((text) =>
      text.toLowerCase().includes(q),
    ),
  );
}
