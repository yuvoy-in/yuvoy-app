/*
  Concept 08: Column Aware

  Concept 06's screen, with the caption reading the frame.

  ## Hypothesis

  The recommendation coming out of the first five studies was that Concept 04 is
  a technique rather than a direction: its placement engine is orthogonal to
  every layout and can sit under any of them. This is that claim, built, so it
  can be judged rather than believed.

  ## What moves and what does not

  **The caption moves. The rail never does.** That is the whole discipline, and
  it is what separates this from a gimmick. The column is at the foot right on
  every frame in every region, always, because a feed is used at speed by muscle
  memory and a control that moved with the composition would be unlearnable. The
  words relocate, and words are read where they are found.

  The rail's own hairline is solved separately, at the 3:1 non-text floor rather
  than the 7:1 the type gets: a solid paper disc carries its glyph at 13.11:1
  whatever is behind it, so the only thing at risk is its edge dissolving into
  white surf. On deep water that hairline resolves to nothing.

  ## The one real gain over Concept 06

  Because the overlay is cheaper, it can carry more. Concept 06 keeps price
  behind the arrow; this one puts it on the persistent line, and on the six
  frames out of twelve that need no veil at all it still darkens less of the
  picture than Concept 06 does. That is the argument in one sentence: **read the
  frame and you can afford another fact.**

  ## What it costs

  A caption that changes position between reels is unfamiliar, and whether it
  reads as intelligence or as instability is the one question this laboratory
  cannot answer. It also needs `Access-Control-Allow-Origin` from the poster
  host to work at all; without it the canvas is tainted, the read throws, and
  the layout falls back to the fixed foot with the full system scrim, which is
  Concept 06 exactly.
*/
(function (Lab) {
  "use strict";
  var el = Lab.el;
  var col = Lab.column;

  Lab.register({
    id: "08",
    group: "column",
    name: "Column Aware",
    tagline: "The same rail, with the caption moving to the quiet region",
    hypothesis:
      "Concept 04's engine is a technique, not a layout. Put it under the owner's screen: the words move to where the picture is already dark, the rail never moves, and the saved veil buys one more fact on the card.",
    /* The strip paints nothing. The engine sizes it. */
    scrim: "adaptive",
    advanced: true,

    reset: function () {
      col.resetSaved();
    },

    chromeRight: function (api) {
      return Lab.soundDisc(api, "col-sound");
    },

    overlay: function (row, ctx) {
      var open = false;

      var rail = col.rail(row, ctx, {
        onOpenSheet: function () {
          set(!open);
        },
      });
      rail.node.classList.add("frame-control");

      /* The body scrolls, the action does not. See `sheetShell`: the panel's
         54% ceiling is a promise about the video, so content gives way rather
         than the ceiling, and the one control a traveller came for never leaves
         the screen. */
      var sheet = col.sheetShell({
        label: "Details, " + row.experience.title,
        body: col.sheetBody(row, ctx),
        foot: col.cta(row, ctx),
        onClose: function () {
          set(false);
        },
      });

      function set(next) {
        open = next;
        ctx.surface.setAttribute("data-sheet", open ? "open" : "shut");
        rail.arrow.setAttribute("aria-expanded", String(open));
        sheet.querySelectorAll("a, button").forEach(function (node) {
          node.tabIndex = open ? 0 : -1;
        });
      }

      col.draggable(sheet, {
        isOpen: function () {
          return open;
        },
        onOpen: function () {
          set(true);
        },
        onClose: function () {
          set(false);
        },
      });

      ctx.mediaLayer.addEventListener("click", function () {
        if (open) set(false);
      });
      ctx.card.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && open) {
          set(false);
          rail.arrow.focus();
        }
      });

      set(false);

      var debug = el("div", { class: "frame-debug", "aria-hidden": "true" });

      /* Price on the persistent line, which Concept 06 does not do. It is
         affordable here precisely because the veil under it is measured rather
         than assumed. */
      var caption = col.foot(row, ctx, { priceInline: true });
      caption.classList.add("ca-caption");

      Lab.frameRead.applyTo(
        ctx.surface,
        ctx.media.posterUrl,
        function (pick, grid) {
          if (!pick) return; // Tainted or unreachable. The fallback is 06.
          Lab.frameRead.paintDebug(debug, grid, pick);
        },
      );

      return el("div", { class: "col-root ca-root" }, [
        el("div", { class: "frame-veil", "aria-hidden": "true" }),
        caption,
        rail.node,
        sheet,
        debug,
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
