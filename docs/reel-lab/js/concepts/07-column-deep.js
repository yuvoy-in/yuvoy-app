/*
  Concept 07: Column Deep

  Concept 06's screen, with the panel taken one detent further.

  ## Hypothesis

  The arrow answers "what is this and who runs it", and a traveller who likes
  the answer has exactly one question left: **can I actually go on a day I am
  here.** Today that costs a page load, a date picker and a scroll. It should
  cost a drag.

  ## The two detents

      FACTS   the arrow opens it. Price, the next departure, how long, how it
              books, the operator and the evidence. Built entirely from data the
              feed already holds, so it is instant, every time, offline included.

      DATES   drag up again, or press "Choose a day". The departures arrive
              here and only here.

  ## Why the dates are fetched rather than carried

  `GET /reels` gives one date per listing and one seat sentence for it. It does
  not give a set, and putting one on the card would mean either a much larger
  feed payload on a 0.5 Mbps island link or an invented list. Neither is
  acceptable: the first is measured against LCP and the second is a fabricated
  claim.

  So the second detent is the only thing in this family that touches the
  network, it does so once per listing, and only after a traveller has opened a
  panel and then asked for more. **That is the point of the second detent, not a
  side effect of it:** an explicit act of interest is the cheapest possible
  trigger for an expensive request.

  Which means this concept has to ship all three states, and does: loading,
  failed with a retry, and the honest empty answer for a listing with nothing in
  the next ninety days. The laboratory's panel forces slow and failing responses
  so all three can be walked rather than imagined.

  ## What it costs

  It is the most machinery in the family, and the second detent covers more of
  the frame than anything else here. It holds the same stated ceiling, and the
  clip keeps running above it, but a traveller in DATES is no longer really
  watching a reel: they are booking. That is the right trade at that moment and
  it is worth naming.
*/
(function (Lab) {
  "use strict";
  var el = Lab.el;
  var col = Lab.column;
  var fmt = Lab.fmt;

  Lab.register({
    id: "07",
    group: "column",
    name: "Column Deep",
    tagline: "The same panel, with the departures one drag further down",
    hypothesis:
      "A traveller who likes the facts has one question left: can I go on a day I am here. Answer it in the feed, with a second detent that fetches the departures once, on an explicit act of interest.",
    scrim: "bottom",
    advanced: true,

    reset: function () {
      col.resetSaved();
    },

    chromeRight: function (api) {
      return Lab.soundDisc(api, "col-sound");
    },

    overlay: function (row, ctx) {
      /** "shut" | "facts" | "dates". One variable; every class derives from it. */
      var detent = "shut";
      var fetched = false;

      var rail = col.rail(row, ctx, {
        onOpenSheet: function () {
          set(detent === "shut" ? "facts" : "shut");
        },
      });

      /* ------------------------------------------------------ the dates */

      var datesBody = el("div", { class: "cd-dates-body" });
      var dates = el("section", { class: "cd-dates" }, [
        el("h3", { class: "label ink-60 cd-dates-head", text: "Departures" }),
        datesBody,
      ]);

      function renderLoading() {
        datesBody.innerHTML = "";
        datesBody.appendChild(
          el("div", { class: "cd-rail", "aria-hidden": "true" }, [
            el("span", { class: "cd-chip cd-chip-skeleton skeleton" }),
            el("span", { class: "cd-chip cd-chip-skeleton skeleton" }),
            el("span", { class: "cd-chip cd-chip-skeleton skeleton" }),
          ]),
        );
        datesBody.appendChild(
          el("p", {
            class: "cd-note ink-60",
            role: "status",
            text: "Checking departures",
          }),
        );
      }

      function renderError() {
        datesBody.innerHTML = "";
        datesBody.appendChild(
          el("p", {
            class: "cd-note ink-70",
            role: "alert",
            text: "Could not reach the departures, usually the island signal rather than you.",
          }),
        );
        datesBody.appendChild(
          el("button", {
            class: "cd-retry",
            type: "button",
            text: "Try again",
            onclick: function (e) {
              e.stopPropagation();
              fetched = false;
              load();
            },
          }),
        );
      }

      function renderDates(list) {
        datesBody.innerHTML = "";
        if (!list.length) {
          /*
            The honest empty answer, and it is a DISAGREEMENT rather than an
            absence.

            A listing with nothing in ninety days never reaches this view at
            all: `nextAvailable` is absent, the action says "Have a look" and
            goes to the listing, because sending somebody into an empty date
            picker is the tap that loses them. Getting here means the card
            promised a departure and the departures endpoint did not have one,
            which is a real race: the card's date is computed when the feed page
            is built and this is fetched when a traveller asks, one sold-out
            boat later.

            So the copy does not claim the season is wrong. It says what
            happened and offers the one place that can still answer.
          */
          datesBody.appendChild(
            el("p", {
              class: "cd-note ink-70",
              text: "No days are on sale right now. The departure this card was showing has gone since the feed loaded.",
            }),
          );
          return;
        }
        datesBody.appendChild(
          el(
            "div",
            { class: "cd-rail", role: "list" },
            list.map(function (d) {
              var parts = fmt.marketDate(d.date).split(", ");
              return el(
                "a",
                {
                  class: "cd-chip",
                  role: "listitem",
                  href: ctx.href + "/book?date=" + d.date,
                  onclick: function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    ctx.api.open(
                      ctx.href + "/book?date=" + d.date,
                      row,
                      "date",
                    );
                  },
                },
                [
                  el("span", { class: "cd-chip-day", text: parts[0] }),
                  el("span", {
                    class: "cd-chip-date",
                    text: parts[1] || d.date,
                  }),
                  /* The server's sentence, verbatim, or nothing. A request-mode
                     departure holds no seats, so a number here would be a
                     promise we cannot keep. */
                  d.seats
                    ? el("span", { class: "cd-chip-seats", text: d.seats })
                    : null,
                ],
              );
            }),
          ),
        );
      }

      function load() {
        if (fetched) return;
        fetched = true;
        renderLoading();
        Lab.fetchDepartures(row.experience.slug, function (err, list) {
          if (err) {
            fetched = false;
            renderError();
            return;
          }
          renderDates(list);
        });
      }

      /* ------------------------------------------------------- the sheet */

      /*
        There is no separate "choose a day" row.

        It was one, a 44px control with its own rule above it, and the panel
        promptly needed to scroll on a standard phone to fit everything else.
        Making the pinned action carry the view change instead removes the row
        and states the model more clearly: **one action per view.** In FACTS it
        offers the days; in DATES the day chips are the booking and it offers
        everything else.

        The route to the listing is the panel's own title, which is a link in
        every concept in this family for exactly this reason.
      */
      /*
        Two detents, two VIEWS, not one growing list.

        The first version appended the departures under the facts, and the panel
        promptly broke its own 54% ceiling: the laboratory reported it clipping
        and putting the call to action under the bar. Making the second detent
        replace the first is the better design as well as the shorter one. The
        facts have been read by the time anybody asks for days, the price stays
        because it is the anchor for choosing one, and dragging back down
        restores them.
      */
      var facts = col.sheetBody(row, ctx);
      facts.classList.add("cd-facts");

      /* The pinned action, whose label and destination both follow the view. */
      var action = el(
        "button",
        {
          class: "col-cta",
          type: "button",
          onclick: function (e) {
            e.stopPropagation();
            if (detent === "dates" || !row.experience.nextAvailable) {
              ctx.api.open(ctx.href, row, "cta");
            } else {
              set("dates");
            }
          },
        },
        [
          el("span", { text: "Choose a day" }),
          Lab.icon("arrowRight", "col-cta-arrow"),
        ],
      );
      var ctaLabel = action.querySelector("span");

      var sheet = col.sheetShell({
        class: "cd-sheet",
        label: "Details, " + row.experience.title,
        body: el("div", {}, [facts, dates]),
        foot: action,
        onClose: function () {
          set(detent === "dates" ? "facts" : "shut");
        },
      });

      function set(next) {
        if (next === detent) return;
        detent = next;
        ctx.surface.setAttribute("data-detent", detent);
        rail.arrow.setAttribute("aria-expanded", String(detent !== "shut"));
        /* The action is a disclosure in the facts view (it opens the days) and
           a link in the dates view (it leaves), so it says which. */
        action.setAttribute(
          "aria-expanded",
          detent === "dates" ? "true" : "false",
        );
        /*
          The action says what it does in THIS view, and nothing says what state
          it is in. "See dates" under a rail of dates would be the panel
          offering what it is already showing.

          A listing with nothing in ninety days never offers days at all: there
          is nothing to choose, and the panel says so where the rail would be.
        */
        ctaLabel.textContent = !row.experience.nextAvailable
          ? "Have a look"
          : detent === "dates"
            ? "Full listing"
            : "Choose a day";
        sheet.querySelectorAll("a, button").forEach(function (node) {
          node.tabIndex = detent === "shut" ? -1 : 0;
        });
        /* The request rides the SECOND detent, never the first. Opening the
           panel is cheap and offline; asking for days is the expensive act and
           the traveller has to ask for it. */
        if (detent === "dates") load();
      }

      col.draggable(sheet, {
        isOpen: function () {
          return detent === "dates";
        },
        onOpen: function () {
          set("dates");
        },
        onClose: function () {
          set("facts");
        },
        onSettle: function (moved) {
          if (detent === "facts" && moved >= 48) set("shut");
        },
      });

      ctx.mediaLayer.addEventListener("click", function () {
        if (detent !== "shut") set("shut");
      });
      ctx.card.addEventListener("keydown", function (e) {
        if (e.key !== "Escape" || detent === "shut") return;
        /* Escape retreats one detent at a time. Collapsing straight to the reel
           from the dates would throw away the panel a traveller opened on
           purpose, to dismiss something they opened by accident. */
        set(detent === "dates" ? "facts" : "shut");
        if (detent === "shut") rail.arrow.focus();
      });

      ctx.surface.setAttribute("data-detent", "shut");
      set("shut");

      return el("div", { class: "col-root" }, [
        el("div", { class: "col-bottom" }, [col.foot(row, ctx), rail.node]),
        sheet,
      ]);
    },

    sync: function (ctx) {
      var node = ctx.card.querySelector(".col-save");
      if (!node) return;
      var on = col.isSaved(ctx.media.id);
      if ((node.getAttribute("aria-pressed") === "true") === on) return;
      col.paintSave(node, on, ctx.experience.title);
    },
  });
})(window.Lab || (window.Lab = {}));
