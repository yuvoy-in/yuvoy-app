/*
  Concept 03: Two Detents  (advanced showcase 1 of 2)

  ## Hypothesis

  The traveller stopping is the signal. A feed cannot read intent from a scroll,
  but it can read it from the absence of one: **dwell is the only honest
  interest signal this screen has**, it costs nothing to measure, and it is the
  exact moment a layered CTA is supposed to arrive.

  So the reel has three states rather than one layout.

      REST     the picture, the name, one way forward
        |  the traveller stops for 1.2s
      PEEK     a 44px strip above the bar: price, unit, date. Scented.
        |  they tap it, or drag it up
      OPEN     a non-modal sheet: operator, evidence, duration, booking mode,
               and the CTA, now a labelled control instead of a glyph

  ## Four rules this concept holds itself to

  1. **The video never stops and is never covered above 54% of the frame.** The
     sheet's ceiling is a number, not a feeling, and it is checked in the
     laboratory's own audit.
  2. **Nothing appears on a clock.** The peek answers a dwell, which is an act.
     A control that faded in after three seconds regardless would be an
     advertisement, and the design system's motion rule is that motion is
     feedback rather than entrance.
  3. **The vertical axis is arbitrated, not shared.** The feed owns it
     everywhere except inside the sheet's own box. Scrolling the feed dismisses
     the sheet; dragging the sheet never scrolls the feed. Stated here because
     "just add a bottom sheet to a scroll-snap feed" is how a feed starts
     fighting the thumb.
  4. **The CTA transforms rather than multiplying.** There is one way forward on
     the card at all times. In REST it is a disc; in OPEN the disc fades as a
     labelled control takes the same band. Two controls to one destination is
     the thing the 13 September change removed, and it stays removed.

  ## Why the peek is priced

  Price is the second question a traveller asks, never the first, so it is not
  in REST. But it is also the question that ends the most sessions when it goes
  unanswered, so it is the first thing PEEK says. The peek is the scented stub:
  it shows the currency, the number and the server's own unit phrase, which
  predicts both the topic and the granularity of the sheet behind it.
*/
(function (Lab) {
  "use strict";
  var el = Lab.el;
  var fmt = Lab.fmt;

  /** How long a traveller has to stop before the peek arrives. */
  var DWELL_MS = 1200;
  /** How far the sheet has to be dragged up before it opens on release. */
  var OPEN_COMMIT = 56;
  /** ...and down before it closes. */
  var CLOSE_COMMIT = 48;
  /** Inside the 250ms interaction budget. */
  var SETTLE_MS = 240;

  Lab.register({
    id: "03",
    group: "studies",
    name: "Two Detents",
    tagline: "Rest, peek, open. The traveller stopping is the signal",
    hypothesis:
      "Dwell is the only honest interest signal this screen has. A non-modal sheet on two detents gives the traveller what stopping earned, without the video stopping or being covered.",
    scrim: "bottom",
    advanced: true,

    chromeRight: function (api) {
      return Lab.soundDisc(api, "td-sound");
    },

    overlay: function (row, ctx) {
      var experience = row.experience;
      var operator = experience.operator;
      var price = fmt.price(experience);
      var avail = fmt.availability(experience);

      /** "rest" | "peek" | "open". One variable; every class derives from it. */
      var detent = "rest";
      var dwellTimer = null;

      /* ------------------------------------------------------------- rest */

      var arrow = Lab.ui.disc({
        icon: "arrowRight",
        label: "Open " + experience.title,
        variant: "paper",
        href: ctx.href,
        onclick: function (e) {
          e.preventDefault();
          ctx.api.open(ctx.href, row, "arrow");
        },
      });
      arrow.classList.add("td-arrow");

      var rest = el("div", { class: "reel-foot td-rest" }, [
        el("div", { class: "td-rest-row" }, [
          el("div", { class: "td-rest-text" }, [
            experience.activityTypeLabel || experience.location
              ? el("p", {
                  class: "label ink-70 td-eyebrow",
                  text: [experience.activityTypeLabel, experience.location]
                    .filter(Boolean)
                    .join(" · "),
                })
              : null,
            el("a", {
              class: "reel-title",
              href: ctx.href,
              text: experience.title,
              onclick: function (e) {
                e.preventDefault();
                ctx.api.open(ctx.href, row, "title");
              },
            }),
          ]),
          arrow,
        ]),
      ]);

      /* ------------------------------------------------------------- peek */

      /*
        The scented stub. It states the topic (this departure and what it
        costs) and the granularity (a number, a unit, a date), so a traveller
        can predict the sheet rather than discover it.
      */
      var peekLabel = el("span", { class: "td-peek-price" }, [
        price.amount
          ? el("span", { class: "ink-full", text: price.amount })
          : el("span", { class: "ink-70", text: price.absent }),
        price.unit
          ? el("span", { class: "ink-60", text: " " + price.unit })
          : null,
      ]);

      var peek = el(
        "button",
        {
          class: "td-peek",
          type: "button",
          "aria-expanded": "false",
          "aria-label":
            "Details for " +
            experience.title +
            (price.amount ? ", " + price.amount : ""),
          onclick: function (e) {
            e.stopPropagation();
            set(detent === "open" ? "peek" : "open");
          },
        },
        [
          peekLabel,
          el("span", { class: "td-peek-sep", "aria-hidden": "true" }),
          el("span", {
            class: avail.tone === "closed" ? "ink-60" : "ink-70",
            text: avail.tone === "closed" ? "No dates" : avail.text,
          }),
          Lab.icon("chevronUp", "td-peek-chevron"),
        ],
      );

      /* ------------------------------------------------------------- open */

      function factLine(term, value, tone) {
        if (!value) return null;
        return el("div", { class: "td-fact" }, [
          el("dt", { class: "label ink-60", text: term }),
          el("dd", { class: tone || "ink-full", text: value }),
        ]);
      }

      var sheet = el("div", { class: "td-sheet", role: "group" }, [
        /* The handle. Material and iOS both formalise it and both let it be
           operated rather than only dragged, which is what makes the sheet
           reachable without a gesture. */
        el("button", {
          class: "td-handle",
          type: "button",
          "aria-label": "Close details",
          onclick: function (e) {
            e.stopPropagation();
            set("peek");
          },
        }),
        el("div", { class: "td-sheet-body" }, [
          el("dl", { class: "td-facts" }, [
            /*
              `avail.text`, not `avail.full`. The full form carries its own
              "Next " prefix because it was written for a card with no label
              beside it; under a term that already reads "Next departure" it
              printed "Next departure: Next Thu, 17 Sep". The seats sentence is
              still the server's own and is appended verbatim.
            */
            factLine(
              "Next departure",
              avail.tone === "closed"
                ? "Nothing in the next 90 days"
                : avail.text + (avail.seats ? " · " + avail.seats : ""),
              avail.tone === "closed" ? "ink-70" : "ink-full",
            ),
            factLine("Takes", fmt.duration(experience.durationMinutes)),
            factLine(
              "Booking",
              experience.bookingMode === "allotment"
                ? "Instant, seats held for you"
                : "The operator answers first, then you pay",
            ),
          ]),
          el("div", { class: "td-operator" }, [
            el("p", { class: "td-operator-name", text: operator.name }),
            operator.verified
              ? el("p", { class: "td-evidence" }, [
                  Lab.icon("check", "td-check"),
                  el("span", {
                    text:
                      (operator.credentialsSummary &&
                        operator.credentialsSummary[0]) ||
                      "Credentials checked and current",
                  }),
                ])
              : null,
          ]),
          /* The CTA the arrow becomes. Same href, built from the same string. */
          el(
            "a",
            {
              class: "td-cta",
              href: ctx.href,
              onclick: function (e) {
                e.preventDefault();
                ctx.api.open(ctx.href, row, "cta");
              },
            },
            [
              el("span", {
                text: experience.nextAvailable ? "See dates" : "Have a look",
              }),
              Lab.icon("arrowRight", "td-cta-arrow"),
            ],
          ),
        ]),
      ]);

      /* ------------------------------------------------------- the machine */

      function set(next) {
        if (next === detent) return;
        detent = next;
        ctx.surface.setAttribute("data-detent", detent);
        peek.setAttribute("aria-expanded", String(detent === "open"));
        /* A sheet that is not open is not reachable by tab. */
        sheet.querySelectorAll("a, button").forEach(function (node) {
          node.tabIndex = detent === "open" ? 0 : -1;
        });
      }

      /*
        The dwell.

        Armed when the card becomes active and disarmed the moment it is not.
        It measures a pause in a gesture, which is why it is not a timed
        entrance: a traveller flicking through ten reels never sees a peek, and
        that is the correct behaviour rather than a missed impression.
      */
      ctx.onActive = function () {
        window.clearTimeout(dwellTimer);
        dwellTimer = window.setTimeout(function () {
          if (detent === "rest") set("peek");
        }, DWELL_MS);
      };
      ctx.onInactive = function () {
        window.clearTimeout(dwellTimer);
        set("rest");
      };

      /* ------------------------------------------------------- the gesture */

      /*
        The sheet's own vertical axis, and nothing else's.

        The listeners are on the SHEET and on the PEEK, never on the card, so a
        drag that begins on the picture still belongs to the feed. That is the
        arbitration: the feed owns the axis everywhere except inside this box.
      */
      var dragFrom = null;
      var dragged = 0;

      function onDown(e) {
        if (!e.isPrimary) return;
        dragFrom = e.clientY;
        dragged = 0;
        sheet.style.transition = "none";
      }

      function onMove(e) {
        if (dragFrom === null) return;
        dragged = e.clientY - dragFrom;
        /* Damped past the detent so the sheet never leaves its own travel. */
        var travel =
          detent === "open" ? Math.max(0, dragged) : Math.min(0, dragged) * 0.6;
        sheet.style.transform = "translate3d(0," + travel.toFixed(1) + "px,0)";
      }

      function onUp() {
        if (dragFrom === null) return;
        dragFrom = null;
        sheet.style.transition =
          "transform " + SETTLE_MS + "ms var(--ease-interaction)";
        sheet.style.transform = "";
        if (detent !== "open" && dragged <= -OPEN_COMMIT) set("open");
        else if (detent === "open" && dragged >= CLOSE_COMMIT) set("peek");
      }

      [peek, sheet].forEach(function (node) {
        node.addEventListener("pointerdown", onDown);
        node.addEventListener("pointermove", onMove);
        node.addEventListener("pointerup", onUp);
        node.addEventListener("pointercancel", onUp);
      });

      /* Three dismissals, all of them cheap and all of them reversible. */
      ctx.mediaLayer.addEventListener("click", function () {
        if (detent === "open") set("peek");
      });
      ctx.card.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && detent === "open") {
          set("peek");
          peek.focus();
        }
      });

      var root = el("div", { class: "td-root" }, [rest, peek, sheet]);
      ctx.surface.setAttribute("data-detent", "rest");
      set("rest");
      return root;
    },

    /* The strip calls these; the per-card closures above do the work. */
    onActive: function (ctx) {
      if (ctx && ctx.onActive) ctx.onActive();
    },
    onInactive: function (ctx) {
      if (ctx && ctx.onInactive) ctx.onInactive();
    },
  });
})(window.Lab || (window.Lab = {}));
