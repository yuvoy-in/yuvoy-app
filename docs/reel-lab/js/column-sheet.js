/*
  The Column family's sheet: the panel the arrow opens, its call to action,
  its handle, its chassis and its drag.

  Moved out of column.js word for word (yuvoy-app#243). It loads straight after
  column.js and adds these to the same Lab.column, so the concepts reach them
  exactly as before. The reasons for each part are at the part.
*/
(function (Lab) {
  "use strict";
  var el = Lab.el;
  var fmt = Lab.fmt;

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

        The text face rather than the display face. The reel above is still
        showing the thing; this is a label on a panel, not a headline, and a
        second display title inside a panel would compete with the one behind it.
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

  var column = Lab.column;
  column.sheetBody = sheetBody;
  column.cta = cta;
  column.handle = handle;
  column.sheetShell = sheetShell;
  column.draggable = draggable;
})(window.Lab || (window.Lab = {}));
