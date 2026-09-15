/*
  Concept 09: Column Compare

  Concept 06's screen, with the panel surviving the swipe.

  ## Hypothesis

  Every panel in every one of these studies belongs to a card, so it dies when
  the card scrolls away. That is correct for a feed and wrong for a traveller
  who has three days and four candidates: to compare two experiences they have
  to open a panel, read it, close it, swipe, open the next one, and hold the
  first in their head.

  **Open it once and it stays open.** The sheet is mounted at the FRAME rather
  than on a card, so swiping changes the reel above it and cross-fades the facts
  inside it. The feed turns into a comparison at a fixed level of detail: same
  fields, same order, same place on the glass, one flick apart.

  ## Why this is the most advanced thing in the family, and the riskiest

  It is the only concept here that changes what a swipe MEANS. Everywhere else a
  swipe is "next reel". Here, while the panel is open, it is also "next
  candidate", and the panel is the thing being read. Get that wrong and the feed
  feels like it has two modes; get it right and it has one mode with a depth
  control.

  Three rules hold it together:

  1. **The reel keeps playing and keeps its ceiling.** The panel is the same
     size it is in 06. Comparison mode is not a list view with a video stuck
     behind it.
  2. **The sheet never re-mounts.** It cross-fades its contents on a 200ms
     interaction budget, so the eye tracks one object changing rather than two
     objects swapping. Re-mounting reads as a page load.
  3. **It closes the same three ways.** Nothing about persistence makes it
     harder to get rid of.

  ## The saved rail earns its place here

  With the panel open across reels, the heart stops being a bookmark for later
  and becomes the mark you make while comparing. The count sits in the sheet's
  own header, where it is a working total rather than a score: it is private,
  it is never published, and it is the number of things YOU are holding, which
  is the only count this product will ever show.

  ## What it costs

  A panel that outlives its card can show the wrong reel's facts for one frame
  if the update is missed, which is a whole class of bug that per-card panels
  simply cannot have. It is driven off the strip's own active-card observer for
  that reason, never off a scroll handler, so there is exactly one source of
  truth for which reel is on screen.
*/
(function (Lab) {
  "use strict";
  var el = Lab.el;
  var col = Lab.column;

  Lab.register({
    id: "09",
    group: "column",
    name: "Column Compare",
    tagline: "The panel stays open across swipes and the facts cross-fade",
    hypothesis:
      "A panel that dies with its card makes comparing two experiences a memory test. Mount it at the frame, keep it open across swipes, and the feed becomes a comparison at a fixed level of detail.",
    scrim: "bottom",
    advanced: true,

    reset: function () {
      col.resetSaved();
      state.open = false;
      state.current = null;
      state.sheet = null;
      state.body = null;
      state.count = null;
      state.arrows = [];
    },

    /* Everything the frame-level sheet needs, in one place rather than in a
       closure per card: the cards come and go and this does not. */
    frameLayer: function (api) {
      var body = el("div", { class: "cc-body" });
      var count = el("p", { class: "label cc-count" });
      state.count = count;

      var foot = el("div", { class: "cc-foot" });

      var sheet = col.sheetShell({
        class: "cc-sheet",
        label: "Details",
        body: body,
        foot: foot,
        onClose: function () {
          setOpen(false);
        },
      });

      state.foot = foot;

      col.draggable(sheet, {
        isOpen: function () {
          return state.open;
        },
        onOpen: function () {
          setOpen(true);
        },
        onClose: function () {
          setOpen(false);
        },
      });

      state.sheet = sheet;
      state.body = body;
      state.count = count;
      state.api = api;

      col.onSavedChange(function (rows) {
        paintCount(rows.length);
      });
      paintCount(0);

      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && state.open) setOpen(false);
      });

      return el("div", { class: "cc-layer" }, [sheet]);
    },

    chromeRight: function (api) {
      return Lab.soundDisc(api, "col-sound");
    },

    overlay: function (row, ctx) {
      var rail = col.rail(row, ctx, {
        onOpenSheet: function () {
          setOpen(!state.open);
        },
      });
      state.arrows.push(rail.arrow);

      /* The card remembers its own context so the shared sheet can be rebuilt
         for whichever card the observer says is active. */
      ctx.railArrow = rail.arrow;

      ctx.mediaLayer.addEventListener("click", function () {
        if (state.open) setOpen(false);
      });

      return el("div", { class: "col-root" }, [
        el("div", { class: "col-bottom" }, [col.foot(row, ctx), rail.node]),
      ]);
    },

    /*
      The one source of truth for which reel is on screen.

      Driven off the strip's own active-card observer, never off a scroll
      handler. A panel that outlives its card can show the previous reel's facts
      for a frame, and the only defence is that exactly one thing decides what
      "current" means.
    */
    onActive: function (ctx) {
      state.current = ctx;
      if (state.open) render(ctx, true);
    },

    sync: function (ctx) {
      var node = ctx.card.querySelector(".col-save");
      if (!node) return;
      var on = col.isSaved(ctx.media.id);
      if ((node.getAttribute("aria-pressed") === "true") === on) return;
      col.paintSave(node, on, ctx.experience.title);
    },
  });

  var state = {
    open: false,
    current: null,
    sheet: null,
    body: null,
    foot: null,
    count: null,
    api: null,
    arrows: [],
  };

  function paintCount(n) {
    if (!state.count) return;
    state.count.textContent = n === 0 ? "Nothing saved" : n + " saved";
    state.count.classList.toggle("is-some", n > 0);
  }

  /**
   * Swap the facts without swapping the object.
   *
   * The sheet never re-mounts: its contents fade out and back in on the
   * interaction budget, so the eye tracks one panel changing rather than two
   * panels trading places. Re-mounting reads as a page load, which is exactly
   * the feeling this concept exists to remove.
   */
  function render(ctx, animate) {
    if (!state.body || !ctx) return;
    var build = function () {
      state.body.innerHTML = "";
      /*
        The count rides the title row rather than a header of its own.

        It had its own line reading "Comparing" with the total opposite it, and
        that line pushed the evidence below the fold on a standard phone: a
        label announcing the mode, above a panel that was self-evidently the
        mode. The total is the only part worth keeping and it fits beside the
        name it is counting alongside.
      */
      state.body.appendChild(
        col.sheetBody(ctx.reel, ctx, { aside: state.count }),
      );
      /* The action is pinned outside the scrolling body, so it is rebuilt
         separately. It is the one control that must stay on screen whichever
         reel the panel is currently describing. */
      state.foot.innerHTML = "";
      state.foot.appendChild(col.cta(ctx.reel, ctx));
      state.sheet.setAttribute(
        "aria-label",
        "Details, " + ctx.experience.title,
      );
      state.body.classList.remove("is-swapping");
      [state.body, state.foot].forEach(function (area) {
        area.querySelectorAll("a, button").forEach(function (node) {
          node.tabIndex = state.open ? 0 : -1;
        });
      });
    };
    if (!animate) {
      build();
      return;
    }
    state.body.classList.add("is-swapping");
    window.setTimeout(build, 120);
  }

  function setOpen(next) {
    state.open = next;
    if (state.sheet) {
      state.sheet.setAttribute("data-open", next ? "open" : "shut");
    }
    state.arrows.forEach(function (node) {
      node.setAttribute("aria-expanded", String(next));
    });
    document.body.classList.toggle("cc-open", next);
    if (next) render(state.current, false);
  }
})(window.Lab || (window.Lab = {}));
