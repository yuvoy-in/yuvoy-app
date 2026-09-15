/*
  Concept 06: Column

  The owner's concept, built to the brief: Concept 01's whole screen layout, a
  right-hand column carrying save and share above the arrow as icons only, and
  the arrow opening Concept 03's panel instead of navigating.

  This is the BASELINE of the family. 07, 08 and 09 are this screen pushed
  further in three different directions, so what is here is deliberately the
  plain version: no dwell, no second detent, no adaptive placement, no
  persistence across swipes.

  ## The split, after the owner's ruling of 14 September

  The chevron after the seats opens the panel. The arrow opens the listing.
  **Every control on this card does exactly one thing**, which is the version of
  this concept the owner asked for and the better one: the first version put
  disclosure on the arrow, which made a right-pointing glyph mean "stay here"
  and cost the feed its one-tap route out.

  So the routes now read: chevron for what it costs and who runs it, arrow for
  the listing, heart to keep it, share to send the clip, title and a
  right-to-left swipe for the listing as well.

  ## What the composition is doing

  The screen reads in one Z: mark top left, sound top right, the name at the
  foot left, the column at the foot right. The two halves of the foot are the
  two halves of a decision, which is why the caption and the rail are
  bottom-aligned rather than the rail floating higher: the arrow sits level with
  the line that tells you whether the tap is worth making.

  Sound stays at the top, where Concept 01 moved it. That is what keeps the
  column to the three controls that were asked for instead of four, and the top
  scrim was already darkening a fifth of the frame to carry one 28px mark.

  ## What it costs

  The panel covers the foot while it is open, so the chevron that opened it is
  hidden the whole time it is expanded. That is geometry rather than choice: the
  panel is bottom anchored and reaches 52% of the frame, and the caption sits
  92px from the bottom. The panel's own handle is the visible way to close it,
  and Escape and a tap on the picture do the same.

  A traveller who wants only the listing still pays nothing: the arrow, the
  title and the swipe all go straight there.
*/
(function (Lab) {
  "use strict";
  var el = Lab.el;
  var col = Lab.column;

  Lab.register({
    id: "06",
    group: "column",
    name: "Column",
    tagline: "01's layout, a save and share rail, and 03's panel on the arrow",
    hypothesis:
      "The owner's concept. Concept 01's restraint, a right-hand rail of icon-only controls with the arrow at its foot, and that arrow opening Concept 03's panel rather than leaving the feed.",
    scrim: "bottom",
    advanced: false,

    reset: function () {
      col.resetSaved();
    },

    chromeRight: function (api) {
      return Lab.soundDisc(api, "col-sound");
    },

    overlay: function (row, ctx) {
      var open = false;

      /*
        The availability line is the disclosure, as asked: the same chevron
        Concept 01 puts after the seats, opening the panel Concept 03 opens.

        Built before the rail and the sheet because both refer to it, and
        declared with `var` for the same reason `set` can be called from inside
        it: this file is hoisted plain JavaScript, not a module graph.
      */
      var foot = col.foot(row, ctx, {
        onDisclose: function () {
          set(!open);
        },
      });

      /*
        The arrow is a link again.

        Owner's ruling, 14 September: the chevron after the seats opens the
        panel, so the arrow goes back to being the way out of the feed. Every
        control on this card now does exactly one thing, and the one-tap route
        to the listing that the first version of this concept spent is returned.
      */
      var rail = col.rail(row, ctx, { arrow: "listing" });

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
        /* The disclosure state belongs to the control that discloses, which is
           now the availability line. */
        if (foot.disclose) {
          foot.disclose.setAttribute("aria-expanded", String(open));
        }
        /* A panel that is not open is not reachable by tab. */
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

      /* Three dismissals, all cheap and all reversible. Scrolling on is the
         fourth and costs nothing to support: the card leaves. */
      ctx.mediaLayer.addEventListener("click", function () {
        if (open) set(false);
      });
      ctx.card.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && open) {
          set(false);
          /* Focus returns to whatever opened it, which is the line. The panel
             covers the foot while it is open, so without this a keyboard would
             land back at the top of the document. */
          if (foot.disclose) foot.disclose.focus();
        }
      });

      set(false);

      return el("div", { class: "col-root" }, [
        el("div", { class: "col-bottom" }, [foot, rail.node]),
        sheet,
      ]);
    },

    /* The saved state has to survive a card leaving and re-entering the preload
       budget, so it is re-read rather than remembered in the DOM. */
    sync: function (ctx) {
      var node = ctx.card.querySelector(".col-save");
      if (!node) return;
      var on = col.isSaved(ctx.media.id);
      if ((node.getAttribute("aria-pressed") === "true") === on) return;
      col.paintSave(node, on, ctx.experience.title);
    },
  });
})(window.Lab || (window.Lab = {}));
