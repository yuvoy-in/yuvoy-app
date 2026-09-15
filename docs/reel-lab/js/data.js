/*
  The laboratory's content, shaped exactly like `GET /reels`.

  Each row is `{ media, experience }`, the same envelope
  `operations["listReels"]` declares, so a concept written against this data is
  written against the contract. Field names are the contract's, including the
  three the API insists are rendered VERBATIM and never re-derived:
  `pricingUnitLabel`, `seatsOnNextDisplay` and `activityTypeLabel`.

  ## Truthfulness

  Operator names are marked as samples, the same rule `mocks/fixtures.ts`
  carries and for the same reason: this project removed a whole site for
  publishing claims about businesses that had not made them. No rating, no
  review count and no follower count appears anywhere here, because none exists
  in the API and inventing one in a prototype is how it reaches a roadmap.

  ## Why the set is shaped this way

  Twelve rows, one page, chosen so every real-world condition the brief names is
  reachable by scrolling rather than by editing a file: a title that clamps at
  three lines, an operator name that wraps, a listing with no contracted price,
  one with nothing bookable in ninety days, one nobody has classified, a
  per-group charter, a request-mode listing, an unverified business, a clip that
  will never play, and both extremes of frame brightness.
*/
(function (Lab) {
  "use strict";

  /** Money, in the currency's minor unit. Paise for INR, as the contract says. */
  var inr = function (rupees) {
    return { amountMinor: rupees * 100, currency: "INR" };
  };

  var operators = {
    reef: {
      id: "op_reef",
      slug: "sample-dive-operator",
      name: "Sample Dive Operator",
      verified: true,
      credentialsSummary: [
        "Dive instructor certification checked",
        "Boat safety inspection current",
      ],
    },
    blue: {
      id: "op_blue",
      slug: "sample-boat-operator",
      name: "Sample Boat Operator",
      verified: true,
      credentialsSummary: ["Vessel licence and insurance checked"],
    },
    /* A deliberately long business name. Every caption in every concept has to
       survive it without truncating the title beside it. */
    collective: {
      id: "op_coll",
      slug: "sample-conservation-collective",
      name: "Sample Andaman Reef Conservation and Dive Collective",
      verified: true,
      credentialsSummary: ["Marine park permit on file"],
    },
    /* Not verified. No concept may imply otherwise, and none may draw a
       "pending" state either: the contract publishes a boolean, not a journey. */
    fresh: {
      id: "op_new",
      slug: "sample-new-operator",
      name: "Sample New Operator",
      verified: false,
    },
  };

  /**
   * One reel.
   *
   * `frame` is the laboratory's own field and is not in the contract: it names
   * which procedural poster to draw, so the set can cover a bright frame and a
   * dark one deliberately rather than by luck. Everything else is contract.
   */
  function reel(mediaId, frame, experience) {
    return {
      media: {
        id: mediaId,
        kind: "video",
        posterUrl: null, // filled by Lab.posters at load; see posters.js
        frame: frame,
        aspectRatio: "9:16",
        durationSeconds: experience.__clip || 24,
        alt: experience.title,
        /* `hlsUrl` is "not populated before M15". A row without one is a
           complete card that will never play, which is a real state and the
           reason the sound control is conditional. */
        hlsUrl: experience.__silent ? undefined : "lab://clip",
      },
      experience: experience,
    };
  }

  Lab.DATA = [
    reel("md_01", "reef-shallow", {
      id: "exp_01",
      slug: "try-dive-nemo-reef",
      title: "Try-dive at Nemo Reef",
      location: "Havelock",
      category: "adventure",
      activityType: "scuba",
      activityTypeLabel: "Scuba diving",
      bookingMode: "allotment",
      durationMinutes: 180,
      fromPrice: inr(4500),
      pricingUnit: "per_person",
      pricingUnitLabel: "per person",
      operator: operators.reef,
      nextAvailable: "2026-09-17",
      seatsOnNext: 3,
      seatsOnNextDisplay: "3 seats left",
    }),

    /* The bright frame. White surf across the top two thirds: the worst case
       the caption scrim is sized against, and the case Concept 04 exists for. */
    reel("md_02", "surf-bright", {
      id: "exp_02",
      slug: "snorkel-elephant-beach",
      title: "Snorkel trip to Elephant Beach",
      location: "Havelock",
      category: "adventure",
      activityType: "snorkelling",
      activityTypeLabel: "Snorkelling",
      bookingMode: "allotment",
      durationMinutes: 240,
      fromPrice: inr(2200),
      pricingUnit: "per_person",
      pricingUnitLabel: "per person",
      operator: operators.blue,
      nextAvailable: "2026-09-16",
      seatsOnNext: 8,
      seatsOnNextDisplay: "Available",
    }),

    /* Per GROUP, not per person. "from ₹18,000" would be wrong twice, which is
       why the unit phrase is the server's and is printed verbatim. */
    reel("md_03", "open-sea", {
      id: "exp_03",
      slug: "private-boat-charter",
      title: "Private boat charter, whole day",
      location: "Havelock",
      category: "adventure",
      activityType: "charter",
      activityTypeLabel: "Private charter",
      bookingMode: "request",
      durationMinutes: 480,
      fromPrice: inr(18000),
      pricingUnit: "per_group",
      pricingUnitLabel: "for the group",
      operator: operators.blue,
      nextAvailable: "2026-09-19",
    }),

    /* No contracted price yet. Never render zero: this project removed a whole
       site for publishing a number nobody had agreed to. */
    reel("md_04", "mangrove-dawn", {
      id: "exp_04",
      slug: "mangrove-kayak-dawn",
      title: "Mangrove kayak at dawn",
      location: "Neil Island",
      category: "nature_wildlife",
      activityType: "kayaking",
      activityTypeLabel: "Kayaking",
      bookingMode: "request",
      durationMinutes: 150,
      operator: operators.fresh,
      nextAvailable: "2026-09-20",
    }),

    /* Nothing bookable in the next ninety days. The absence is the message and
       it is the single most useful thing this card can say. */
    reel("md_05", "night-water", {
      id: "exp_05",
      slug: "night-fishing-local-crew",
      title: "Night fishing with a local crew",
      location: "Havelock",
      category: "local_life",
      activityType: "fishing",
      activityTypeLabel: "Fishing",
      bookingMode: "request",
      durationMinutes: 300,
      fromPrice: inr(3400),
      pricingUnit: "per_person",
      pricingUnitLabel: "per person",
      operator: operators.blue,
    }),

    /* The long title. Operator-written and unbounded: three clamped lines is
       the worst case every concept has to compose against. */
    reel("md_06", "reef-deep", {
      id: "exp_06",
      slug: "two-tank-certified-dive",
      title:
        "Two-tank certified dive at the Lighthouse and Aquarium sites, with a surface interval on the boat",
      location: "Havelock",
      category: "adventure",
      activityType: "scuba",
      activityTypeLabel: "Scuba diving",
      bookingMode: "allotment",
      durationMinutes: 300,
      fromPrice: inr(7800),
      pricingUnit: "per_person",
      pricingUnitLabel: "per person",
      operator: operators.collective,
      nextAvailable: "2026-09-18",
      seatsOnNext: 2,
      seatsOnNextDisplay: "2 seats left",
    }),

    /* Unclassified. `activityTypeLabel` is absent on listings that predate the
       vocabulary: render nothing, never a prettified key. */
    reel("md_07", "sunset-cliff", {
      id: "exp_07",
      slug: "sunset-point-walk",
      title: "Sunset at the old jetty",
      location: "Neil Island",
      category: "nature_wildlife",
      bookingMode: "allotment",
      durationMinutes: 90,
      fromPrice: inr(900),
      pricingUnit: "per_person",
      pricingUnitLabel: "per person",
      operator: operators.fresh,
      nextAvailable: "2026-09-16",
      seatsOnNext: 12,
      seatsOnNextDisplay: "Available",
    }),

    /* A poster that will never play. No sound control is drawn: a control for a
       clip that does not exist is a control that does nothing. */
    reel("md_08", "jungle-trail", {
      id: "exp_08",
      slug: "rainforest-morning-walk",
      title: "Rainforest walk before the heat",
      location: "Port Blair",
      category: "nature_wildlife",
      activityType: "walking",
      activityTypeLabel: "Guided walk",
      bookingMode: "allotment",
      durationMinutes: 120,
      fromPrice: inr(1400),
      pricingUnit: "per_person",
      pricingUnitLabel: "per person",
      operator: operators.reef,
      nextAvailable: "2026-09-21",
      __silent: true,
    }),

    /* No `location`. It is optional on the summary, so nothing is drawn in its
       place. */
    reel("md_09", "shore-noon", {
      id: "exp_09",
      slug: "beginner-surf-lesson",
      title: "Beginner surf lesson on the west shore",
      category: "sports",
      activityType: "surfing",
      activityTypeLabel: "Surfing",
      bookingMode: "allotment",
      durationMinutes: 120,
      fromPrice: inr(2600),
      pricingUnit: "per_person",
      pricingUnitLabel: "per person",
      operator: operators.collective,
      nextAvailable: "2026-09-22",
      seatsOnNext: 4,
      seatsOnNextDisplay: "4 seats left",
    }),

    /* The hull frame: bright above and below, dark down one side. The case
       Concept 04's `midLeft` placement exists for. */
    reel("md_10", "boat-side", {
      id: "exp_10",
      slug: "glass-bottom-reef-tour",
      title: "Glass bottom boat over the house reef",
      location: "Havelock",
      category: "nature_wildlife",
      activityType: "boat_tour",
      activityTypeLabel: "Boat tour",
      bookingMode: "allotment",
      durationMinutes: 75,
      fromPrice: inr(1200),
      pricingUnit: "per_person",
      pricingUnitLabel: "per person",
      operator: operators.blue,
      nextAvailable: "2026-09-16",
      seatsOnNext: 6,
      seatsOnNextDisplay: "Available",
    }),

    reel("md_11", "surf-bright", {
      id: "exp_11",
      slug: "island-hop-day-boat",
      title: "Island hop by day boat",
      location: "Neil Island",
      category: "adventure",
      activityType: "boat_tour",
      activityTypeLabel: "Boat tour",
      bookingMode: "request",
      durationMinutes: 420,
      fromPrice: inr(5600),
      pricingUnit: "per_person",
      pricingUnitLabel: "per person",
      operator: operators.collective,
      nextAvailable: "2026-09-23",
    }),

    reel("md_12", "night-water", {
      id: "exp_12",
      slug: "bioluminescence-paddle",
      title: "Bioluminescence paddle after dark",
      location: "Havelock",
      category: "nature_wildlife",
      activityType: "kayaking",
      activityTypeLabel: "Kayaking",
      bookingMode: "request",
      durationMinutes: 100,
      fromPrice: inr(3100),
      pricingUnit: "per_person",
      pricingUnitLabel: "per person",
      operator: operators.reef,
      nextAvailable: "2026-09-17",
    }),
  ];

  /**
   * The feed's tail, told rather than inferred.
   *
   * Three outcomes, not two. `complete` is the only state in which "that is
   * everything" is a fact; `server_stopped` is `complete: false` with no cursor,
   * which the contract is explicit is a different thing from the feed ending.
   */
  Lab.TAIL = "complete";

  /** The lab's fixed clock, so a relative date never drifts between runs. */
  Lab.NOW = new Date("2026-09-14T09:00:00+05:30");

  /**
   * Departures, and where they are NOT allowed to come from.
   *
   * `GET /reels` gives one date per listing (`nextAvailable`) and one seat
   * sentence for it. It does not give a set of dates, and inventing one on the
   * card would be fabricating availability, which is the one thing this product
   * will not do.
   *
   * So Concept 07 does not invent them: it FETCHES them, once, on an explicit
   * act of interest. In production that is the listing's own availability
   * endpoint, called when a traveller opens the second detent and never before,
   * so the feed's payload stays the twelve small rows it is today. This object
   * stands in for that response so the loading, error and empty states are
   * reachable in the laboratory rather than theoretical.
   *
   * The first entry of each list agrees with that listing's `nextAvailable` and
   * `seatsOnNextDisplay`, because a second endpoint that disagreed with the card
   * is a real bug class and the prototype should not model it away.
   */
  Lab.AVAILABILITY = {
    "try-dive-nemo-reef": [
      { date: "2026-09-17", seats: "3 seats left" },
      { date: "2026-09-18", seats: "Available" },
      { date: "2026-09-19", seats: "Available" },
      { date: "2026-09-21", seats: "1 seat left" },
      { date: "2026-09-22", seats: "Available" },
    ],
    "snorkel-elephant-beach": [
      { date: "2026-09-16", seats: "Available" },
      { date: "2026-09-17", seats: "Available" },
      { date: "2026-09-18", seats: "6 seats left" },
      { date: "2026-09-20", seats: "Available" },
    ],
    "private-boat-charter": [
      { date: "2026-09-19", seats: null },
      { date: "2026-09-23", seats: null },
      { date: "2026-09-26", seats: null },
    ],
    "mangrove-kayak-dawn": [
      { date: "2026-09-20", seats: null },
      { date: "2026-09-21", seats: null },
    ],
    "two-tank-certified-dive": [
      { date: "2026-09-18", seats: "2 seats left" },
      { date: "2026-09-20", seats: "Available" },
      { date: "2026-09-24", seats: "4 seats left" },
    ],
    "sunset-point-walk": [
      { date: "2026-09-16", seats: "Available" },
      { date: "2026-09-17", seats: "Available" },
      { date: "2026-09-18", seats: "Available" },
      { date: "2026-09-19", seats: "Available" },
      { date: "2026-09-20", seats: "Available" },
      { date: "2026-09-21", seats: "Available" },
    ],
    "rainforest-morning-walk": [
      { date: "2026-09-21", seats: "Available" },
      { date: "2026-09-23", seats: "Available" },
    ],
    "beginner-surf-lesson": [
      { date: "2026-09-22", seats: "4 seats left" },
      { date: "2026-09-25", seats: "Available" },
    ],
    "glass-bottom-reef-tour": [
      { date: "2026-09-16", seats: "Available" },
      { date: "2026-09-17", seats: "Available" },
      { date: "2026-09-19", seats: "Available" },
    ],
    "island-hop-day-boat": [
      { date: "2026-09-23", seats: null },
      { date: "2026-09-27", seats: null },
    ],
    "bioluminescence-paddle": [
      { date: "2026-09-17", seats: null },
      { date: "2026-09-19", seats: null },
      { date: "2026-09-22", seats: null },
    ],
    /* `night-fishing-local-crew` is deliberately absent: it has no
       `nextAvailable`, so there is nothing to fetch and the sheet must say so
       rather than spin. An empty answer and a failed one are different. */
  };

  /**
   * The stand-in for that request.
   *
   * Latency and failure are switches rather than constants, because a state
   * nobody can reproduce on demand is a state nobody builds. The laboratory's
   * panel drives `Lab.fetchMode`.
   */
  Lab.fetchMode = "normal"; // "normal" | "slow" | "fail" | "empty"

  Lab.fetchDepartures = function (slug, done) {
    var delay = Lab.fetchMode === "slow" ? 2400 : 420;
    window.setTimeout(function () {
      if (Lab.fetchMode === "fail") {
        done(new Error("network"), null);
        return;
      }
      /*
        An empty answer for a listing the CARD said had a departure.

        Not a contrivance. `nextAvailable` is computed when the feed page is
        built and the departures are fetched when a traveller opens the second
        detent, which can be minutes later and one sold-out boat apart. The two
        are allowed to disagree and the panel has to survive it saying so,
        rather than showing an empty rail or, worse, the loading state forever.
      */
      if (Lab.fetchMode === "empty") {
        done(null, []);
        return;
      }
      done(null, Lab.AVAILABILITY[slug] || []);
    }, delay);
  };
})(window.Lab || (window.Lab = {}));
