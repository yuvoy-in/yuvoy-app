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

  /* ----------------------------------------------------------- the sheet */

  /**
   * The panel the arrow opens. Concept 03's sheet, on one detent.
   *
   * Non-modal, and that is the whole design: a modal sheet brings a scrim and a
   * focus trap, and both of those stop the video being watched. This one covers
   * a stated ceiling of the frame and no more, leaves the clip running above
   * it, and is dismissed by scrolling on.
   */
  function sheetBody(row, ctx, opts) {
    opts = opts || {};
    var experience = row.experience;
    var operator = experience.operator;
    var price = fmt.price(experience);
    var avail = fmt.availability(experience);

    function line(term, value, tone) {
      if (!value) return null;
      return el("div", { class: "col-fact" }, [
        el("dt", { class: "label ink-60", text: term }),
        el("dd", { class: tone || "ink-full", text: value }),
      ]);
    }

    return el("div", { class: "col-sheet-facts" }, [
      /*
        The name, because the panel covers the caption that was carrying it.

        The foot steps aside when this opens, so without a title here the panel
        describes an experience it never names: a price, three facts and an
        operator, floating. It matters most in Concept 09, where the whole point
        is comparing two of them and the only thing distinguishing the panels
        would have been a number.

        Satoshi rather than the display face. The reel above is still showing
        the thing; this is a label on a panel, not a headline, and a second
        Fraunces title inside a panel would compete with the one behind it.
      */
      el("div", { class: "col-sheet-titlerow" }, [
        /*
          The name, and the way to it.

          A link rather than a label, which matters more than it looks. The foot
          steps aside when this panel opens, taking the caption's own link with
          it, and Concept 07's second view replaces the facts entirely. Without
          this the panel would be the one place in the product where a traveller
          could read everything about an experience and have no way to open it
          except the action at the foot, whatever that action happened to be in
          that view.
        */
        el("a", {
          class: "col-sheet-title",
          href: ctx.href,
          text: experience.title,
          onclick: function (e) {
            e.preventDefault();
            e.stopPropagation();
            ctx.api.open(ctx.href, row, "sheet-title");
          },
        }),
        opts.aside || null,
      ]),

      /*
        Price leads here and nowhere else on the card.

        It is the second question a traveller asks and the one that ends the
        most sessions when it goes unanswered, so it is the first thing this
        panel says and it is never on the reel itself. `pricingUnitLabel` is the
        server's phrase and is printed verbatim: for a per-group charter
        "from 18,000 per person" would be wrong twice.
      */
      el("div", { class: "col-price" }, [
        price.amount
          ? el("span", { class: "col-price-amount", text: price.amount })
          : el("span", { class: "col-price-absent", text: price.absent }),
        price.unit
          ? el("span", { class: "col-price-unit ink-60", text: price.unit })
          : null,
      ]),

      el("dl", { class: "col-facts" }, [
        line(
          "Next departure",
          avail.tone === "closed"
            ? "Nothing in the next 90 days"
            : avail.text + (avail.seats ? " · " + avail.seats : ""),
          avail.tone === "closed" ? "ink-70" : "ink-full",
        ),
        line("Takes", fmt.duration(experience.durationMinutes)),
        line(
          "Booking",
          experience.bookingMode === "allotment"
            ? "Instant, seats held for you"
            : "The operator answers first, then you pay",
        ),
        experience.maxPartySize
          ? line("Party", "Up to " + experience.maxPartySize + " people")
          : null,
      ]),

      /*
        Who runs it, and the evidence.

        Where a competitor writes a star average and a review count, this writes
        what was checked. `verified` is a statement about documents on file, not
        a badge, and an operator who is not verified gets their name and nothing
        else: the contract publishes a boolean, not a journey, so there is no
        "pending" state to draw.
      */
      el("div", { class: "col-operator" }, [
        el("p", { class: "col-operator-name", text: operator.name }),
        operator.verified
          ? el("p", { class: "col-evidence" }, [
              Lab.icon("check", "col-check"),
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

  /** The call to action. The only thing in this family that navigates. */
  function cta(row, ctx, label) {
    return el(
      "a",
      {
        class: "col-cta",
        href: ctx.href,
        onclick: function (e) {
          e.preventDefault();
          ctx.api.open(ctx.href, row, "cta");
        },
      },
      [
        el("span", {
          text:
            label ||
            (row.experience.nextAvailable ? "See dates" : "Have a look"),
        }),
        Lab.icon("arrowRight", "col-cta-arrow"),
      ],
    );
  }

  /**
   * The handle.
   *
   * The 4px bar is the affordance; the CONTROL is 44px tall and the full width
   * of the sheet, because a 4px target is not a target. Material and iOS both
   * formalise a handle that can be operated as well as dragged, which is what
   * makes the sheet reachable without a gesture at all.
   */
  function handle(onClose) {
    return el("button", {
      class: "col-handle",
      type: "button",
      "aria-label": "Close details",
      onclick: function (e) {
        e.stopPropagation();
        onClose();
      },
    });
  }

  /**
   * The sheet's chassis: a handle, a body that scrolls, and a foot that does
   * not.
   *
   * ## Why the call to action is pinned
   *
   * The panel has a stated ceiling of 54% of the frame, which is a promise
   * about the video and is not negotiable. This family's panel carries more
   * than Concept 03's did (a price set as display type, and in 07 a whole
   * second view), and on an iPhone SE that overflowed: the laboratory's audit
   * reported the panel clipping its own content and the call to action sitting
   * under the tab bar.
   *
   * Three ways out of that, and only one of them is honest. Raising the ceiling
   * breaks the promise. Cutting facts until it fits makes the smallest phone
   * decide what every phone shows. So the BODY scrolls and the ACTION does not,
   * which is the standard answer and the only one that holds for any content on
   * any screen: nothing is ever unreachable, and the one control a traveller
   * came for is always on screen.
   *
   * `tabindex` on the scroll area because a scrollable region has to be
   * operable from a keyboard. Without it a keyboard user can reach the controls
   * inside and never reach the part between them.
   */
  function sheetShell(opts) {
    var scroll = el(
      "div",
      {
        class: "col-sheet-scroll",
        tabindex: "0",
        role: "group",
        "aria-label": opts.scrollLabel || "Details",
      },
      [opts.body],
    );

    /*
      Say when there is more, and only when there is.

      On an iPhone SE the panel does not fit: title, price, three facts, the
      operator and their credential line come to about seventeen pixels more
      than 54% of a 667px screen allows, and the line that falls off the bottom
      is the credential one, which is this product's entire answer to not having
      star ratings. Seventeen pixels is not worth shrinking the type for and it
      is not worth raising the ceiling for, so the panel scrolls and says so.

      A fade rather than a rule or a chevron, because the fade acts on the CUT
      content itself: the thing going out of view is visibly going out of view,
      which is the message. It is removed the moment the end is reached, so a
      panel that has been read carries no decoration.

      A ResizeObserver rather than a one-off measurement: the laboratory changes
      phone size under a live panel, and in production a rotation does the same.
    */
    function markOverflow() {
      var more = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop;
      scroll.setAttribute("data-more", more > 2 ? "true" : "false");
    }
    scroll.addEventListener("scroll", markOverflow);
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(markOverflow).observe(scroll);
    }

    return el(
      "div",
      {
        class: "col-sheet" + (opts.class ? " " + opts.class : ""),
        role: "group",
        "aria-label": opts.label || "Details",
      },
      [
        handle(opts.onClose),
        scroll,
        el("div", { class: "col-sheet-foot" }, [opts.foot]),
      ],
    );
  }

  /**
   * The sheet's own vertical axis, and nothing else's.
   *
   * The listeners go on the SHEET, never on the card, so a drag that begins on
   * the picture still belongs to the feed. That is the arbitration, and it is
   * the part that has to be right: adding a bottom sheet to a scroll-snap feed
   * without deciding this is how a feed starts fighting the thumb.
   */
  function draggable(sheet, opts) {
    var from = null;
    var moved = 0;

    function down(e) {
      if (!e.isPrimary) return;
      from = e.clientY;
      moved = 0;
      sheet.style.transition = "none";
    }
    function move(e) {
      if (from === null) return;
      moved = e.clientY - from;
      var travel = opts.isOpen()
        ? Math.max(0, moved)
        : Math.min(0, moved) * 0.6;
      sheet.style.transform = "translate3d(0," + travel.toFixed(1) + "px,0)";
    }
    function up() {
      if (from === null) return;
      from = null;
      sheet.style.transition = "transform 240ms var(--ease-interaction)";
      sheet.style.transform = "";
      if (opts.isOpen() && moved >= 48) opts.onClose();
      else if (!opts.isOpen() && moved <= -56) opts.onOpen();
      else if (opts.onSettle) opts.onSettle(moved);
    }

    sheet.addEventListener("pointerdown", down);
    sheet.addEventListener("pointermove", move);
    sheet.addEventListener("pointerup", up);
    sheet.addEventListener("pointercancel", up);
  }

  Lab.column = {
    foot: foot,
    rail: rail,
    paintSave: paintSave,
    sheetBody: sheetBody,
    cta: cta,
    handle: handle,
    sheetShell: sheetShell,
    draggable: draggable,
    isSaved: isSaved,
    toggleSaved: toggleSaved,
    onSavedChange: onSavedChange,
    resetSaved: resetSaved,
    savedRows: function () {
      return saved.slice();
    },
  };
})(window.Lab || (window.Lab = {}));
