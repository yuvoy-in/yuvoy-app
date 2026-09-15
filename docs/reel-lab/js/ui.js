/*
  Shared primitives: DOM helper, the icon set, the formatters, and the chrome
  every concept sits inside.

  Nothing here is concept-specific. Anything that appears in more than one
  concept lives here so five copies of a formatter cannot drift apart, which is
  the same reason `ExperienceCard` builds one `href` and hands it to the arrow,
  the title and the swipe.

  The formatters are reimplementations of `src/lib/format/*`, matched function
  for function, so a price or a duration in this laboratory reads exactly as it
  would on the real screen.
*/
(function (Lab) {
  "use strict";

  /* --------------------------------------------------------------- the DOM */

  /**
   * `el("div", { class: "x", onclick: fn }, [child])`.
   *
   * `class`, `text`, `html` and `on*` are handled; everything else is set as an
   * attribute, so `aria-label` and `data-*` work without special cases. A null
   * or undefined child is skipped, which is what lets a concept write a
   * conditional line inline instead of building an array first.
   */
  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key === "html") node.innerHTML = value;
        else if (key.slice(0, 2) === "on")
          node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? "" : value);
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(
        typeof child === "string" ? document.createTextNode(child) : child,
      );
    });
    return node;
  }

  /* -------------------------------------------------------------- the icons */

  /*
    The app's own set, traced from `src/components/ui/icons.tsx` path for path:
    one weight (1.5), round caps, a 24 unit grid. Not a library. An icon library
    ships six weights per glyph and a stroke that reads as a toolkit; these add
    about four kilobytes to a bundle a 0.5 Mbps connection has to carry.

    Every icon is decorative. The control holding it carries the name.
  */
  var PATHS = {
    arrowRight: ['<path d="M5 12h14"/>', '<path d="m12 5 7 7-7 7"/>'],
    arrowLeft: ['<path d="M19 12H5"/>', '<path d="m12 19-7-7 7-7"/>'],
    chevronRight: ['<path d="m9 6 6 6-6 6"/>'],
    chevronUp: ['<path d="m6 15 6-6 6 6"/>'],
    chevronDown: ['<path d="m6 9 6 6 6-6"/>'],
    search: ['<circle cx="11" cy="11" r="7"/>', '<path d="m20 20-3.5-3.5"/>'],
    compass: [
      '<circle cx="12" cy="12" r="9"/>',
      '<path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z"/>',
    ],
    ticket: [
      '<path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6z"/>',
      '<path d="M15 5v2"/>',
      '<path d="M15 11v2"/>',
      '<path d="M15 17v2"/>',
    ],
    user: [
      '<circle cx="12" cy="8" r="4"/>',
      '<path d="M4 21a8 8 0 0 1 16 0"/>',
    ],
    share: [
      '<path d="M12 3v12"/>',
      '<path d="m8 7 4-4 4 4"/>',
      '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/>',
    ],
    volume: [
      '<path d="M11 5 6 9H3v6h3l5 4z"/>',
      '<path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
    ],
    volumeOff: [
      '<path d="M11 5 6 9H3v6h3l5 4z"/>',
      '<path d="m16 9 6 6"/>',
      '<path d="m22 9-6 6"/>',
    ],
    check: ['<path d="m5 12 5 5 9-10"/>'],
    close: ['<path d="M18 6 6 18"/>', '<path d="m6 6 12 12"/>'],
    mapPin: [
      '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/>',
      '<circle cx="12" cy="10" r="2.5"/>',
    ],
    clock: ['<circle cx="12" cy="12" r="9"/>', '<path d="M12 7v5l3 2"/>'],
    calendar: [
      '<rect x="3" y="5" width="18" height="16" rx="3"/>',
      '<path d="M3 10h18"/>',
      '<path d="M8 3v4"/>',
      '<path d="M16 3v4"/>',
    ],
    zap: ['<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'],
    play: ['<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>'],
    /*
      Save.

      Drawn as a heart because that is the glyph a traveller reads as "keep
      this", and wired as a PRIVATE save: it lives on the device, it is never
      published, never aggregated and never shown to an operator, and it carries
      no count. The API publishes no rating, no review count and no follower
      count on purpose, and a heart with a number under it would reverse that
      decision by accident. The glyph is familiar; the semantics are ours.
    */
    heart: [
      '<path d="M12 20.3C7.1 16.7 4 13.9 4 10.5A4 4 0 0 1 12 8a4 4 0 0 1 8 2.5c0 3.4-3.1 6.2-8 9.8Z"/>',
    ],
    heartOn: [
      '<path d="M12 20.3C7.1 16.7 4 13.9 4 10.5A4 4 0 0 1 12 8a4 4 0 0 1 8 2.5c0 3.4-3.1 6.2-8 9.8Z" fill="currentColor"/>',
    ],
    /* The shortlist verb (Concept 05). A pin, not a heart: a heart means "like",
       which is a social gesture this product does not have. */
    hold: [
      '<path d="M12 3a6 6 0 0 1 6 6c0 4.2-6 12-6 12S6 13.2 6 9a6 6 0 0 1 6-6z"/>',
      '<path d="M9.5 9.5h5"/>',
    ],
    holdOn: [
      '<path d="M12 3a6 6 0 0 1 6 6c0 4.2-6 12-6 12S6 13.2 6 9a6 6 0 0 1 6-6z" fill="currentColor"/>',
    ],
  };

  /** An inert 24 unit glyph. The control that holds it carries the name. */
  function icon(name, className) {
    var svgNS = "http://www.w3.org/2000/svg";
    var node = document.createElementNS(svgNS, "svg");
    node.setAttribute("viewBox", "0 0 24 24");
    node.setAttribute("fill", "none");
    node.setAttribute("stroke", "currentColor");
    node.setAttribute("stroke-width", "1.5");
    node.setAttribute("stroke-linecap", "round");
    node.setAttribute("stroke-linejoin", "round");
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("focusable", "false");
    node.setAttribute("class", "icon " + (className || ""));
    node.innerHTML = (PATHS[name] || []).join("");
    return node;
  }

  /* --------------------------------------------------------- the formatters */

  var MINOR_UNITS = { INR: 2, USD: 2, EUR: 2, JPY: 0 };

  /**
   * Money is `amountMinor`, an integer in the currency's minor unit. Whole
   * amounts drop the decimals: "₹4,500" reads as a price and "₹4,500.00" reads
   * as an invoice.
   */
  function money(value) {
    if (!value || typeof value.amountMinor !== "number") return null;
    var digits =
      MINOR_UNITS[value.currency] === undefined
        ? 2
        : MINOR_UNITS[value.currency];
    var major = value.amountMinor / Math.pow(10, digits);
    var hasFraction = value.amountMinor % Math.pow(10, digits) !== 0;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: value.currency,
      minimumFractionDigits: hasFraction ? digits : 0,
      maximumFractionDigits: hasFraction ? digits : 0,
    }).format(major);
  }

  /**
   * "About 3 hours", "45 minutes", "A full day". Rounded to the half hour past
   * ninety minutes: a dive listed at 180 minutes is "about 3 hours", not a
   * number that pretends to know the tide.
   */
  function duration(minutes) {
    if (!minutes || !isFinite(minutes) || minutes <= 0) return null;
    if (minutes >= 8 * 60) return "A full day";
    if (minutes < 60) return Math.round(minutes) + " minutes";
    var halfHours = Math.round(minutes / 30) / 2;
    var whole = Math.floor(halfHours);
    var half = halfHours - whole === 0.5;
    return (
      "About " +
      whole +
      (half ? "½" : "") +
      " hour" +
      (halfHours === 1 ? "" : "s")
    );
  }

  /** "Thu 17 Sep", in the market's timezone. Never the device's. */
  function marketDate(iso) {
    return new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(iso + "T00:00:00+05:30"));
  }

  /**
   * How many days out a departure is, from the lab's fixed clock. Used only to
   * choose a WORD ("tomorrow"), never to compute a date: the date itself is
   * always the market's.
   */
  function daysOut(iso) {
    var day = 24 * 60 * 60 * 1000;
    var then = new Date(iso + "T00:00:00+05:30").getTime();
    /*
      `Intl.DateTimeFormat`, never `toLocaleDateString`.

      The repository bans every `toLocale*` call with an eslint ERROR, and the
      reason is in the rule: a slot time rendered in the device's timezone is a
      missed boat. This call is about "today in the market" rather than about a
      slot, so the danger is not the same one, and the rule is deliberately
      blunt because the safe cases and the dangerous ones look identical at a
      glance. `en-CA` in the market zone gives YYYY-MM-DD, which is the same
      thing `formatMarketTime` does one file away.
    */
    var today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
    }).format(Lab.NOW);
    var now = new Date(today + "T00:00:00+05:30").getTime();
    return Math.round((then - now) / day);
  }

  /**
   * The availability sentence, and the reason this screen exists.
   *
   * `nextAvailable` absent means **nothing is bookable in the next ninety
   * days**, not "we did not check". Saying so is what stops the tap that ends
   * in "no dates", which is the tap that loses the traveller. The old feed card
   * carried exactly this function; it was deleted on 13 September and the
   * field it reads has been rendered nowhere since.
   *
   * `seatsOnNextDisplay` is the server's sentence and is printed verbatim. A
   * client deriving its own from `seatsOnNext` is a second copy of a rule the
   * API owns, and the copy that drifts is the one that misstates a departure.
   */
  function availability(experience, opts) {
    var short = opts && opts.short;
    if (!experience.nextAvailable) {
      return {
        tone: "closed",
        text: short ? "No dates" : "No dates in the next 90 days",
      };
    }
    var out = daysOut(experience.nextAvailable);
    var when =
      out === 0
        ? "Today"
        : out === 1
          ? "Tomorrow"
          : marketDate(experience.nextAvailable);
    return {
      tone: out <= 2 ? "soon" : "open",
      text: when,
      seats: experience.seatsOnNextDisplay || null,
      /* The long form the old card used, kept so a concept can choose it. */
      full: experience.seatsOnNextDisplay
        ? "Next " + when + " · " + experience.seatsOnNextDisplay
        : "Next " + when,
    };
  }

  /** The price and the server's unit phrase, or the honest absence of both. */
  function price(experience) {
    var amount = money(experience.fromPrice);
    if (!amount)
      return { amount: null, unit: null, absent: "Price on request" };
    return {
      amount: amount,
      /* Verbatim. Never built from `pricingUnit`. */
      unit: experience.pricingUnitLabel || null,
      absent: null,
    };
  }

  /* ------------------------------------------------------------- the chrome */

  var TABS = [
    { label: "Feed", icon: "compass", active: true },
    { label: "Search", icon: "search" },
    { label: "Trips", icon: "ticket" },
    { label: "Account", icon: "user" },
  ];

  /**
   * The floating tab bar: a forest pill detached from the foot of the phone.
   *
   * **It is visible on every reel and it never retracts.** The retract was
   * built, shipped on 9 September and ruled against by the owner on the 13th by
   * name. It is reproduced here exactly, including the 56px height, the 12px
   * foot and the `paper/12` hairline ring, because every concept has to compose
   * against it rather than around it.
   *
   * The wrapper is inert so the strip beside the pill still scrolls the feed.
   */
  function tabBar(extra) {
    var list = el(
      "ul",
      { class: "tabbar-list" },
      TABS.map(function (tab) {
        return el("li", {}, [
          el(
            "a",
            {
              class: "tabbar-item" + (tab.active ? " is-active" : ""),
              href: "#",
              "aria-current": tab.active ? "page" : null,
              onclick: function (e) {
                e.preventDefault();
              },
            },
            [
              icon(tab.icon),
              el("span", {
                class: "tabbar-label" + (tab.active ? "" : " sr-only"),
                text: tab.label,
              }),
            ],
          ),
        ]);
      }),
    );

    return el("nav", { class: "tabbar", "aria-label": "Primary" }, [
      extra || null,
      el("div", { class: "tabbar-pill app-chrome" }, [list]),
    ]);
  }

  /**
   * The mark that floats over a reel: top left, 28px, no tagline.
   *
   * Settled on 13 September and reproduced verbatim. The geometry is measured
   * rather than chosen: 16px above the mark, 28px of mark, 80px of tail, and
   * `feed-scrim-top`'s stops are percentages of exactly that, so the mark sits
   * between 13% and 35% of the gradient. Changing the padding without changing
   * the stops slides it into a lighter band with every contrast test still
   * passing.
   *
   * Inert where it can be. With nothing to press, the whole top of a reel
   * scrolls the strip.
   *
   * ## It is NOT `aria-hidden`, and that took an axe run to notice
   *
   * The block was `aria-hidden="true"`, which is correct for a decorative mark
   * and wrong the moment a concept puts a control beside it. Four of the five
   * do: the sound control moves up here so the top scrim carries two things
   * instead of one. A focusable control inside an `aria-hidden` subtree is a
   * serious violation and the worst kind of one, because it is invisible from
   * the screen: a keyboard lands on a button a screen reader has been told does
   * not exist.
   *
   * The mark carries `alt=""` instead. That hides the DECORATION, which is what
   * was wanted, without hiding anything a person might reach.
   *
   * This is the same shape as the bug the production feed hit with `role="feed"`
   * and its heading: an ARIA container attribute that was right about the
   * element and wrong about its children.
   */
  function masthead(right) {
    return el("div", { class: "masthead feed-scrim-top" }, [
      el("img", {
        class: "masthead-mark",
        src: "assets/yuvoy-mark-compact-on-dark.svg",
        alt: "",
      }),
      right || null,
    ]);
  }

  /** A disc control. `paper` is the solid paper one; `onDark` is translucent. */
  function disc(opts) {
    var node = el(
      opts.href ? "a" : "button",
      {
        class:
          "disc disc-" +
          (opts.variant || "onDark") +
          (opts.class ? " " + opts.class : ""),
        href: opts.href || null,
        type: opts.href ? null : "button",
        "aria-label": opts.label,
        "aria-pressed":
          opts.pressed === undefined ? null : String(opts.pressed),
        onclick: opts.onclick || null,
      },
      [icon(opts.icon)],
    );
    return node;
  }

  /**
   * The sound control, built once.
   *
   * Four concepts move sound out of the foot and into the top scrim, opposite
   * the mark, because that scrim was already darkening a fifth of the frame to
   * carry one 28px logo. Four copies of the same toggle is four places for the
   * label and the glyph to stop agreeing about which state they are in.
   *
   * It is `ghost` rather than `onDark`: the top band is the one place on the
   * card with no other object in it, and a filled disc there reads as a second
   * mark competing with the first.
   */
  function soundDisc(api, className) {
    var button = disc({
      icon: api.isMuted() ? "volumeOff" : "volume",
      label: api.isMuted() ? "Unmute" : "Mute",
      variant: "ghost",
      class: className,
      onclick: function () {
        var muted = api.toggleMute();
        button.setAttribute("aria-label", muted ? "Unmute" : "Mute");
        button.replaceChild(
          icon(muted ? "volumeOff" : "volume"),
          button.firstChild,
        );
      },
    });
    return button;
  }

  Lab.el = el;
  Lab.icon = icon;
  Lab.soundDisc = soundDisc;
  Lab.fmt = {
    money: money,
    duration: duration,
    marketDate: marketDate,
    daysOut: daysOut,
    availability: availability,
    price: price,
  };
  Lab.ui = { tabBar: tabBar, masthead: masthead, disc: disc };
})(window.Lab || (window.Lab = {}));
