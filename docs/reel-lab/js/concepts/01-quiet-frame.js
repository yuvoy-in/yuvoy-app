/*
  Concept 01: Quiet Frame

  ## Hypothesis

  The 13 September cutback was right about restraint and wrong about which two
  words it kept. Keep the bareness; spend the few characters that are left on
  what actually decides the next swipe (what this is, and whether it can be done
  while the traveller is here) instead of on the name alone. Everything else
  arrives on a press and hold.

  ## The move

  **Inverted clear mode.** TikTok and Instagram both hide their overlay on a
  long press, because both start dense. We start bare, so the same gesture
  ADDS. The picture is what you get for free; the facts are what you ask for.

  ## Two things this concept deletes

  1. **The rail of three discs.** The most borrowed layout in the category, and
     the one place our product looks exactly like everyone else's. What is left
     is one disc: the way forward.
  2. **The empty top right.** The top scrim currently darkens a fifth of the
     frame to carry a 28px mark. Sound moves there, so the scrim carries two
     things instead of one and the foot is freed for type.

  ## Every reveal has a visible route

  WCAG 2.5.1: a path-based gesture is a shortcut, never the only way. Hold is
  transient (release and it is gone); the availability line is a button and
  gives the same panel, sticky. Both are built from one function, so they cannot
  come to disagree about what they show.
*/
(function (Lab) {
  "use strict";
  var el = Lab.el;
  var fmt = Lab.fmt;

  /** How long a press has to last before it counts as a hold. */
  var HOLD_MS = 320;
  /** A finger that travels this far was scrolling, not pressing. */
  var HOLD_SLOP = 10;

  /**
   * The panel. One function, two callers: the hold and the button.
   *
   * It is a block of type on a flat veil, not a card. A card over a picture is
   * a hole in the picture; a veil is a readability layer and is the one thing
   * the design system does allow over artwork.
   */
  function facts(experience) {
    var price = fmt.price(experience);
    var avail = fmt.availability(experience);
    var rows = [];

    rows.push([
      "Price",
      price.amount
        ? price.amount + (price.unit ? " " + price.unit : "")
        : price.absent,
    ]);
    rows.push(["Takes", fmt.duration(experience.durationMinutes)]);
    rows.push([
      "Next departure",
      avail.tone === "closed" ? avail.text : avail.full,
    ]);
    rows.push([
      "Booking",
      experience.bookingMode === "allotment"
        ? "Instant, seats held"
        : "The operator answers first",
    ]);

    var operator = experience.operator;

    return el("div", { class: "qf-facts", "aria-hidden": "true" }, [
      el(
        "dl",
        { class: "qf-grid" },
        rows.reduce(function (acc, row) {
          if (!row[1]) return acc;
          acc.push(el("dt", { class: "label ink-60", text: row[0] }));
          acc.push(el("dd", { class: "qf-value ink-full", text: row[1] }));
          return acc;
        }, []),
      ),
      el("div", { class: "qf-operator" }, [
        el("p", { class: "qf-operator-name ink-full", text: operator.name }),
        /*
          Evidence, not a badge, and not a rating: this API publishes no star
          average and no review count on purpose, because a number nobody earned
          is a fabricated claim. `verified` is a statement about documents we
          hold, and `credentialsSummary` is what was checked. One line of it.
        */
        operator.verified
          ? el("p", { class: "qf-evidence ink-accent" }, [
              Lab.icon("check", "qf-check"),
              el("span", {
                text:
                  (operator.credentialsSummary &&
                    operator.credentialsSummary[0]) ||
                  "Credentials checked and current",
              }),
            ])
          : null,
      ]),
    ]);
  }

  Lab.register({
    id: "01",
    group: "studies",
    name: "Quiet Frame",
    tagline: "Restraint, with the two words that decide a swipe",
    hypothesis:
      "The cutback was right about restraint and wrong about which words it kept. Keep the bareness, spend it on what decides the next swipe, and invert clear mode so a hold ADDS rather than hides.",
    scrim: "bottom",

    /* Sound, opposite the mark, inside a scrim that was already being paid for. */
    chromeRight: function (api) {
      return Lab.soundDisc(api, "qf-sound");
    },

    overlay: function (row, ctx) {
      var experience = row.experience;
      var avail = fmt.availability(experience);
      var panel = facts(experience);
      var sticky = false;

      /* What the line says, and what the panel it opens will say. A disclosure
         control has to carry the SCENT of what is behind it: "Thu 18 Sep, 2
         seats left" plus a chevron predicts a panel about this departure. A
         bare chevron would predict nothing and would be a hidden feature. */
      var line = el(
        "button",
        {
          class: "qf-line",
          type: "button",
          "aria-expanded": "false",
          onclick: function (e) {
            e.stopPropagation();
            sticky = !sticky;
            paint(sticky);
            line.setAttribute("aria-expanded", String(sticky));
          },
        },
        [
          el("span", {
            class: avail.tone === "closed" ? "ink-60" : "ink-full",
            text: avail.text,
          }),
          avail.seats
            ? el("span", { class: "ink-60", text: " · " + avail.seats })
            : null,
          Lab.icon("chevronUp", "qf-chevron"),
        ],
      );

      function paint(open) {
        ctx.surface.classList.toggle("qf-open", open);
        panel.setAttribute("aria-hidden", String(!open));
      }

      /* --------------------------------------------------------- the hold */
      var timer = null;
      var origin = null;
      var held = false;

      function cancel() {
        if (timer) window.clearTimeout(timer);
        timer = null;
        origin = null;
        if (held && !sticky) paint(false);
        held = false;
      }

      ctx.surface.addEventListener("pointerdown", function (e) {
        /* A second finger is a pinch, never a press. A mouse IS allowed here,
           unlike in the swipe: there is no text to select over a clip, and
           refusing it would make the gesture unevaluable on a desktop. */
        if (!e.isPrimary) return;
        origin = { x: e.clientX, y: e.clientY };
        timer = window.setTimeout(function () {
          held = true;
          paint(true);
        }, HOLD_MS);
      });

      ctx.surface.addEventListener("pointermove", function (e) {
        if (!origin) return;
        if (
          Math.abs(e.clientX - origin.x) > HOLD_SLOP ||
          Math.abs(e.clientY - origin.y) > HOLD_SLOP
        ) {
          cancel();
        }
      });

      ctx.surface.addEventListener(
        "click",
        function (e) {
          /* The click that follows a hold is not a tap. Swallowed before the
             strip's tap-to-play sees it, the same rule the swipe already uses
             for a drag that ends on a control. */
          if (held) {
            e.preventDefault();
            e.stopPropagation();
            held = false;
          }
        },
        true,
      );

      ctx.surface.addEventListener("pointerup", cancel);
      ctx.surface.addEventListener("pointercancel", cancel);

      /* Escape closes anything open, on every concept, without exception. */
      ctx.card.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && sticky) {
          sticky = false;
          paint(false);
          line.setAttribute("aria-expanded", "false");
          line.focus();
        }
      });

      return el("div", {}, [
        el("div", { class: "qf-veil", "aria-hidden": "true" }),
        el("div", { class: "reel-foot qf-foot" }, [
          panel,
          el("div", { class: "qf-row" }, [
            el("div", { class: "qf-text" }, [
              /*
                What you would actually be DOING. On a feed where every clip is
                blue water this is the difference between a scroll and a tap,
                and it is one or two words. Absent on a listing nobody has
                classified: render nothing, never a prettified key.
              */
              experience.activityTypeLabel || experience.location
                ? el("p", { class: "qf-eyebrow label ink-70" }, [
                    el("span", { text: experience.activityTypeLabel || "" }),
                    experience.activityTypeLabel && experience.location
                      ? el("span", { class: "qf-dot", text: "·" })
                      : null,
                    experience.location
                      ? el("span", { text: experience.location })
                      : null,
                  ])
                : null,
              el("a", {
                class: "reel-title qf-title",
                href: ctx.href,
                text: experience.title,
                onclick: function (e) {
                  e.preventDefault();
                  ctx.api.open(ctx.href, row, "title");
                },
              }),
              line,
            ]),
            /*
              One disc, not three. With the call to action gone this is the only
              way forward on the card, and a rail of identical discs would say
              the way out of the feed is worth exactly as much as muting it.
              It carries the href the title and the swipe carry.
            */
            Lab.ui.disc({
              icon: "arrowRight",
              label: "Open " + experience.title,
              variant: "paper",
              href: ctx.href,
              onclick: function (e) {
                e.preventDefault();
                ctx.api.open(ctx.href, row, "arrow");
              },
            }),
          ]),
        ]),
      ]);
    },
  });
})(window.Lab || (window.Lab = {}));
