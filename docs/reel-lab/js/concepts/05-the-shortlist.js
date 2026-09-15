/*
  Concept 05: The Shortlist  (advanced showcase 2 of 2, and the bold one)

  ## Hypothesis

  The feed's job is planning, not watching. A traveller has three to seven days
  on an island; the scarce thing is not entertainment, it is deciding what to do
  tomorrow. Today they can watch a reel or book it, and there is nothing in
  between, so four good reels in a row produce nothing at all.

  **The missing verb is "hold".**

  ## What changes

  1. **The caption leads with the date, not the name.** Everywhere else in this
     set the title is the first line, because the title is the subject. Here the
     first line is when you could go, because in a planning tool the question is
     not "what is this" but "does it fit". The title is still the largest thing
     on the card.
  2. **A reel can be held.** Double tap the picture, or use the control in the
     caption. Held reels dock into a tray directly above the tab bar.
  3. **The bottom band becomes composition.** The tray occupies the space every
     other screen leaves empty for the bar. That band is the best land on a
     phone, and every concept except this one parks on it.

  ## Why double tap is free

  `.feed-card` already sets `touch-action: pan-y pinch-zoom`, and the comment in
  `globals.css` records the price and why it was paid: "Any `touch-action` but
  `auto` or `manipulation` also costs double-tap zoom... double-tapping a
  full-bleed clip was never a gesture this feed offered anything for." The
  gesture is already bought and currently does nothing. This concept spends it.

  Single tap stays play and pause. The hold is confirmed after the double-tap
  window closes, so a single tap is never delayed waiting to see if a second one
  arrives: play toggles immediately, and a second tap within the window undoes
  that toggle and holds instead. That ordering is the whole reason double tap is
  usable over a video at all.

  ## What it would take to ship

  Nothing from the backend. There is no wishlist endpoint and there does not
  need to be: the app already keeps trips on the device in **IndexedDB** via
  `@/lib/booking/token-store`, and `localStorage` is banned outright by an
  eslint rule for exactly the reason that store exists. A shortlist is the same
  mechanism with a different object store, no account, and no request. The
  laboratory holds it in memory, which is the only difference.

  ## What it must never become

  A like count. Nothing here is published, aggregated, shown to an operator, or
  turned into a number on anybody's card. This product publishes no rating and
  no review count on purpose, and a shortlist that becomes social proof is that
  decision reversed by accident.
*/
(function (Lab) {
  "use strict";
  var el = Lab.el;
  var fmt = Lab.fmt;

  /** The window a second tap has to arrive in to count as a double. */
  var DOUBLE_MS = 280;

  /* The shortlist itself. In production: an IndexedDB object store beside the
     booking tokens. Here: a Set and a list of subscribers. */
  var held = [];
  var listeners = [];

  function isHeld(id) {
    return held.some(function (r) {
      return r.media.id === id;
    });
  }

  function toggleHold(row) {
    var index = held.findIndex(function (r) {
      return r.media.id === row.media.id;
    });
    if (index >= 0) held.splice(index, 1);
    else held.push(row);
    listeners.forEach(function (fn) {
      fn(held);
    });
    return index < 0;
  }

  Lab.register({
    id: "05",
    group: "studies",
    name: "The Shortlist",
    tagline: "A feed you can hold things in. Availability leads",
    hypothesis:
      "The feed's job is planning, not watching. Give it a verb between watching and booking, and let the band above the bar carry the plan instead of standing empty.",
    scrim: "bottom",
    advanced: true,

    /* Reset between concept switches so the tray does not arrive pre-filled. */
    reset: function () {
      held.length = 0;
      listeners.length = 0;
    },

    chromeRight: function (api) {
      return Lab.soundDisc(api, "sl-sound");
    },

    /**
     * The tray, docked above the bar.
     *
     * It is not drawn until something is held. An empty tray would be a
     * permanent 56px of chrome advertising a feature nobody had used, on the
     * screen whose entire complaint was that too much was drawn on it.
     */
    barExtra: function (api) {
      var strip = el("div", { class: "sl-tray-strip" });
      var count = el("p", { class: "label sl-tray-count" });
      var tray = el(
        "div",
        {
          class: "sl-tray",
          "aria-label": "Your shortlist",
          role: "region",
          hidden: true,
        },
        [count, strip],
      );

      listeners.push(function (rows) {
        tray.hidden = rows.length === 0;
        /* The caption above has to know, because the tray is docked in the band
           the caption was clearing for the bar. */
        var frame = tray.closest(".reel-frame");
        if (frame) frame.classList.toggle("sl-has-tray", rows.length > 0);
        count.textContent =
          rows.length === 1 ? "1 held" : rows.length + " held";
        strip.innerHTML = "";
        rows.forEach(function (row) {
          var index = Lab.DATA.indexOf(row);
          strip.appendChild(
            el(
              "button",
              {
                class: "sl-thumb",
                type: "button",
                "aria-label": "Go back to " + row.experience.title,
                onclick: function () {
                  api.scrollTo(index);
                },
              },
              [
                el("img", {
                  src: row.media.posterUrl,
                  alt: "",
                  class: "sl-thumb-img",
                }),
              ],
            ),
          );
        });
      });

      return tray;
    },

    overlay: function (row, ctx) {
      var experience = row.experience;
      var avail = fmt.availability(experience);
      var duration = fmt.duration(experience.durationMinutes);

      /* ------------------------------------------------------- the control */

      var holdLabel = el("span", { text: "Hold" });
      var hold = el(
        "button",
        {
          class: "sl-hold",
          type: "button",
          "aria-pressed": "false",
          onclick: function (e) {
            e.stopPropagation();
            apply(toggleHold(row));
          },
        },
        [Lab.icon("hold", "sl-hold-icon"), holdLabel],
      );

      function apply(on) {
        hold.setAttribute("aria-pressed", String(on));
        hold.classList.toggle("is-held", on);
        holdLabel.textContent = on ? "Held" : "Hold";
        hold.replaceChild(
          Lab.icon(on ? "holdOn" : "hold", "sl-hold-icon"),
          hold.firstChild,
        );
        if (on) {
          /* A confirmation the eye catches without reading: the card's own edge
             draws once. It is 320ms, one property, and it does not repeat.
             Motion here is feedback for an action the traveller just took,
             which is the only thing the app's motion budget is spent on. */
          ctx.surface.classList.remove("sl-pulse");
          void ctx.surface.offsetWidth;
          ctx.surface.classList.add("sl-pulse");
        }
      }

      /* -------------------------------------------------- the double tap */

      /*
        Listened for on the SURFACE, not on the media layer, and that is a
        defect this laboratory caught rather than a style choice.

        Pausing draws a 64px play disc in the dead centre of the frame, which is
        exactly where a thumb lands for a double tap. With the listener on the
        media layer the second tap hit the disc instead and the gesture simply
        did not fire: **a centred play control is a double-tap trap.** The
        surface sees both, so wherever the second tap lands it counts.

        Playback is restored rather than re-toggled. Tap one pauses; tap two
        either resumes (it hit the disc) or toggles again (it hit the picture),
        and the two paths end in different states. Recording what was true
        before the pair began and putting it back is the only version that is
        correct from both a playing and a paused start: the traveller asked for
        one thing, not two.
      */
      var lastTap = 0;
      var playingAtFirstTap = true;
      ctx.surface.addEventListener("click", function (e) {
        /* The caption's own controls are not the picture. */
        if (e.target.closest && e.target.closest(".reel-foot")) return;

        var now = Date.now();
        if (now - lastTap < DOUBLE_MS) {
          lastTap = 0;
          ctx.api.setPlaying(playingAtFirstTap);
          apply(toggleHold(row));
          return;
        }
        lastTap = now;
        /* Read AFTER the tap, which has already toggled it, so the value stored
           is the one to undo back to. */
        playingAtFirstTap = !ctx.api.isPlaying();
      });

      /* --------------------------------------------------------- the card */

      return el("div", { class: "reel-foot sl-foot" }, [
        /*
          Availability first, and this is the concept's argument in one line.
          `nextAvailable` absent means nothing is bookable in the next ninety
          days, and on a planning surface that is the most useful sentence on
          the card, not the one to hide.
        */
        el(
          "p",
          {
            class:
              "sl-when " + (avail.tone === "closed" ? "is-closed" : "is-open"),
          },
          [
            Lab.icon(
              avail.tone === "closed" ? "clock" : "calendar",
              "sl-when-icon",
            ),
            el("span", {
              text:
                avail.tone === "closed"
                  ? "No dates in the next 90 days"
                  : avail.text,
            }),
            avail.seats
              ? el("span", { class: "sl-seats", text: avail.seats })
              : null,
          ],
        ),

        el("a", {
          class: "reel-title sl-title",
          href: ctx.href,
          text: experience.title,
          onclick: function (e) {
            e.preventDefault();
            ctx.api.open(ctx.href, row, "title");
          },
        }),

        el("p", {
          class: "sl-meta ink-70",
          text: [experience.activityTypeLabel, experience.location, duration]
            .filter(Boolean)
            .join(" · "),
        }),

        el("div", { class: "sl-actions" }, [
          hold,
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
      ]);
    },

    /* Held state has to survive the card leaving and returning to the preload
       budget, so it is re-read rather than remembered in the DOM. */
    sync: function (ctx) {
      var node = ctx.card.querySelector(".sl-hold");
      if (!node) return;
      var on = isHeld(ctx.media.id);
      if ((node.getAttribute("aria-pressed") === "true") === on) return;
      node.setAttribute("aria-pressed", String(on));
      node.classList.toggle("is-held", on);
      node.lastChild.textContent = on ? "Held" : "Hold";
      node.replaceChild(
        Lab.icon(on ? "holdOn" : "hold", "sl-hold-icon"),
        node.firstChild,
      );
    },
  });
})(window.Lab || (window.Lab = {}));
