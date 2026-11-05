/*
  The Column family: the shared parts of concepts 06 to 09.

  ## Where it came from

  The owner read the five studies and specified a sixth out of pieces of two:
  Concept 01's whole screen layout, a right-hand column of icon-only controls
  (save and share ABOVE the arrow), and Concept 03's sheet, opened by that arrow
  instead of by dwell.

  Concepts 07, 08 and 09 are that screen pushed further, so everything true of
  all four lives here: the foot caption, the rail, the saved set and the sheet.
  A concept file is then only its own idea, which is also what makes any one of
  them extractable on its own.

  ## The two decisions in this file worth arguing with

  **The arrow opens a panel rather than navigating.** That is what was asked
  for, and it is a real change: the arrow used to be the one way forward and is
  now the one way to know more. The listing is still reachable three ways, which
  is the rule that must not break: the title, a right-to-left swipe, and the
  sheet's own call to action. The glyph turns to point up while the sheet is
  open and the control carries `aria-expanded`, so it announces as a disclosure
  rather than as a link.

  **Save is private.** It is a heart, because that is the glyph a traveller
  reads as "keep this". It is not a like: nothing is published, counted,
  aggregated or shown to an operator, and no number appears anywhere near it.
  The API publishes no rating and no review count on purpose, and a heart with a
  count under it would reverse that decision by accident. In production this is
  IndexedDB beside the booking tokens, which is where the app already keeps
  trips on the device; `localStorage` is banned outright by an eslint rule.
*/
(function (Lab) {
  "use strict";
  var el = Lab.el;
  var fmt = Lab.fmt;

  /* ------------------------------------------------------- the saved set */

  var saved = [];
  var listeners = [];

  function isSaved(mediaId) {
    return saved.some(function (row) {
      return row.media.id === mediaId;
    });
  }

  function toggleSaved(row) {
    var i = saved.findIndex(function (r) {
      return r.media.id === row.media.id;
    });
    if (i >= 0) saved.splice(i, 1);
    else saved.push(row);
    listeners.forEach(function (fn) {
      fn(saved.slice());
    });
    return i < 0;
  }

  function onSavedChange(fn) {
    listeners.push(fn);
  }

  function resetSaved() {
    saved.length = 0;
    listeners.length = 0;
  }

  /* ------------------------------------------------------------ the foot */

  /**
   * Concept 01's caption, unchanged in substance.
   *
   * Activity and place, the title, and the one line that decides whether the
   * tap is worth making.
   *
   * ## The availability line can be the disclosure
   *
   * Pass `onDisclose` and it becomes Concept 01's control: the same line, with
   * the same chevron after the seats, opening the same panel. That is the
   * owner's ruling of 14 September and it is the better split, because it gives
   * every control on the card exactly one job. The chevron says "know more" and
   * the arrow says "go", and neither has to carry the other's meaning.
   *
   * It also fixes an alignment that was wrong: as plain type the line is about
   * 20px tall and bottom-aligned against a 44px disc, so the words sat twelve
   * pixels below the arrow's centre. As a 44px control the two centres agree.
   *
   * Without `onDisclose` the line stays plain type, which is what the rest of
   * the family still does.
   */
  function foot(row, ctx, opts) {
    opts = opts || {};
    var experience = row.experience;
    var avail = fmt.availability(experience);
    var price = fmt.price(experience);

    var whenContents = [
      el("span", {
        text:
          avail.tone === "closed" ? "No dates in the next 90 days" : avail.text,
      }),
      /*
        The server's own sentence, printed verbatim. A client deriving its own
        from `seatsOnNext` is a second copy of a rule the API owns, and the copy
        that drifts is the one that misstates a departure.

        It sits in the bottom band of the scrim, where `terra-soft` measures
        5.5:1 or better. The caption's ORDER is contrast, not taste.
      */
      avail.seats
        ? el("span", { class: "col-seats", text: avail.seats })
        : null,
      opts.priceInline && price.amount
        ? el("span", { class: "ink-60", text: " · " + price.amount })
        : null,
    ];

    var whenClass =
      "col-when " + (avail.tone === "closed" ? "is-closed" : "is-open");

    var when;
    if (opts.onDisclose) {
      /*
        The chevron goes AFTER the seats, which is where Concept 01 put it and
        where the owner asked for it. It is the last thing on the line that
        decides the tap, so it reads as "and there is more behind this",
        which is exactly what it does.

        The whole line is the control, not just the glyph: a 16px chevron is a
        16px target, well under the 24px floor, and the line is already the
        thing a thumb is aiming at.
      */
      whenContents.push(Lab.icon("chevronUp", "col-when-chevron"));
      when = el(
        "button",
        {
          class: whenClass + " col-when-button",
          type: "button",
          "aria-expanded": "false",
          onclick: function (e) {
            e.stopPropagation();
            opts.onDisclose();
          },
        },
        whenContents,
      );
    } else {
      when = el("p", { class: whenClass }, whenContents);
    }

    var node = el("div", { class: "col-foot" }, [
      experience.activityTypeLabel || experience.location
        ? el("p", {
            class: "label ink-70 col-eyebrow",
            text: [experience.activityTypeLabel, experience.location]
              .filter(Boolean)
              .join(" · "),
          })
        : null,

      el("a", {
        class: "reel-title col-title",
        href: ctx.href,
        text: experience.title,
        onclick: function (e) {
          e.preventDefault();
          ctx.api.open(ctx.href, row, "title");
        },
      }),

      when,
    ]);

    /* Handed back so the concept can keep `aria-expanded` truthful. Set on the
       node rather than returned in a pair, because every existing caller treats
       this function's result as an element. */
    node.disclose = opts.onDisclose ? when : null;
    return node;
  }

  /* ------------------------------------------------------------ the rail */

  /**
   * The right-hand column: save, share, then the arrow at the foot of it.
   *
   * Icon only, as asked. The two above are `onDark`, the translucent disc that
   * survives on a picture; the arrow is `paper`, the system's solid paper one.
   * That difference is doing real work: three identical discs would say that
   * knowing more about this experience is worth exactly as much as saving it,
   * and the arrow is the only one of the three that leads anywhere.
   *
   * The arrow is LAST, at the bottom of the column, which puts the control a
   * traveller uses most nearest the thumb.
   */
  function rail(row, ctx, handlers) {
    var experience = row.experience;
    /*
      What the arrow is for.

      `"sheet"` makes it the disclosure, which is how 07, 08 and 09 still work.
      `"listing"` makes it what it has always been in production: the way out of
      the feed. Concept 06 takes the second, because its chevron now owns
      disclosure and a control should do one thing.
    */
    var arrowMode = handlers.arrow || "sheet";

    var save = Lab.ui.disc({
      icon: "heart",
      label: "Save " + experience.title,
      variant: "onDark",
      class: "col-save",
      pressed: false,
      onclick: function (e) {
        e.stopPropagation();
        paintSave(save, toggleSaved(row), experience.title);
      },
    });

    var share = Lab.ui.disc({
      icon: "share",
      /* The REEL, not the listing. Somebody sharing a clip means the clip. A
         card with no clip has nothing to share but the listing and says so in
         its own label, rather than sending a `/r/` address for a reel that does
         not exist. */
      label: ctx.media.hlsUrl ? "Share this reel" : "Share this experience",
      variant: "onDark",
      class: "col-share",
      onclick: function (e) {
        e.stopPropagation();
        ctx.api.open(
          ctx.media.hlsUrl ? "/r/" + ctx.media.id : ctx.href,
          row,
          "share",
        );
      },
    });

    var arrow;
    if (arrowMode === "listing") {
      /*
        The word, not the glyph. Owner's ruling, 14 September.

        ## Why it is not always "Book"

        `nextAvailable` absent means nothing is bookable in the next ninety
        days, and the contract is explicit that this is a fact rather than a
        gap. A button offering to book a listing with no departures is a promise
        the product cannot keep, and the tap that ends in "no dates" is the one
        that loses a traveller: it is the exact failure this whole study started
        from. So the word follows the data, the same way the panel's own action
        already does.

        Both words go to the same place. The listing is where you see dates and
        where you book; the label says which of those is on offer.
      */
      var bookable = Boolean(experience.nextAvailable);
      arrow = el(
        "a",
        {
          class: "col-book",
          href: ctx.href,
          "aria-label": (bookable ? "Book " : "View ") + experience.title,
          onclick: function (e) {
            e.stopPropagation();
            e.preventDefault();
            ctx.api.open(ctx.href, row, "book");
          },
        },
        [el("span", { text: bookable ? "Book" : "View" })],
      );
    } else {
      arrow = Lab.ui.disc({
        icon: "arrowRight",
        label: "More about " + experience.title,
        variant: "paper",
        class: "col-arrow",
        onclick: function (e) {
          e.stopPropagation();
          handlers.onOpenSheet();
        },
      });
      arrow.setAttribute("aria-expanded", "false");
    }

    /* A labelled control is wider than a disc, so the column aligns to its
       right edge rather than to its centre: the pill and the two discs above it
       share an edge with the frame's gutter instead of floating off it. */
    var railNode = el(
      "div",
      { class: "col-rail" + (arrowMode === "listing" ? " has-book" : "") },
      [save, share, arrow],
    );

    return { node: railNode, save: save, arrow: arrow };
  }

  /** Keeps the glyph, the pressed state and the name saying the same thing. */
  function paintSave(node, on, title) {
    node.setAttribute("aria-pressed", String(on));
    node.setAttribute("aria-label", (on ? "Saved. Remove " : "Save ") + title);
    node.classList.toggle("is-saved", on);
    node.replaceChild(Lab.icon(on ? "heartOn" : "heart"), node.firstChild);
  }

  /* The sheet (its body, call to action, handle, chassis and drag) is in
     column-sheet.js, which loads next and adds itself to Lab.column, so
     neither file runs past 500 lines (yuvoy-app#243). */

  Lab.column = {
    foot: foot,
    rail: rail,
    paintSave: paintSave,
    isSaved: isSaved,
    toggleSaved: toggleSaved,
    onSavedChange: onSavedChange,
    resetSaved: resetSaved,
    savedRows: function () {
      return saved.slice();
    },
  };
})(window.Lab || (window.Lab = {}));
