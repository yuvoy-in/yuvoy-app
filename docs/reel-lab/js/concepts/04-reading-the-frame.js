/*
  Concept 04: Reading the Frame

  ## Hypothesis

  Every other layout in this set, and every layout in every competitor, darkens
  the picture to suit the type. The frame is fixed and the caption is fixed, so
  the scrim has to be sized for the worst pixel the clip could ever show, on
  every clip, forever. **That is a tax every frame pays for the worst frame.**

  Invert it: read the frame, put the type where the picture is already quiet,
  and darken only that. A night dive pays nothing. Bright noon surf pays a lot,
  in one small place, instead of a little everywhere.

  The scoring, the veil arithmetic and the fallback all live in
  `js/frame-read.js`, because Concept 08 applies the same engine under a
  different layout and two copies of a scoring function are two answers to one
  question.

  ## The discipline that makes it usable rather than clever

  **Information moves. Controls never do.** The arrow is bottom right and the
  sound control is top right on every frame, in every region, always. A control
  that moved with the composition would be unlearnable, and a feed is used at
  speed by muscle memory. Only the words relocate, and words are read where they
  are found.
*/
(function (Lab) {
  "use strict";
  var el = Lab.el;
  var fmt = Lab.fmt;

  Lab.register({
    id: "04",
    group: "studies",
    name: "Reading the Frame",
    tagline: "The type moves to the quiet part of the picture",
    hypothesis:
      "A fixed caption forces every frame to pay the scrim the worst frame needs. Read the poster, write where it is already quiet, and darken only that.",
    /* The strip paints nothing. This concept sizes its own. */
    scrim: "adaptive",

    chromeRight: function (api) {
      return Lab.soundDisc(api, "rf-sound");
    },

    overlay: function (row, ctx) {
      var experience = row.experience;
      var avail = fmt.availability(experience);
      var price = fmt.price(experience);

      var caption = el("div", { class: "rf-caption" }, [
        experience.activityTypeLabel || experience.location
          ? el("p", {
              class: "label rf-eyebrow",
              text: [experience.activityTypeLabel, experience.location]
                .filter(Boolean)
                .join(" · "),
            })
          : null,
        el("a", {
          class: "reel-title rf-title",
          href: ctx.href,
          text: experience.title,
          onclick: function (e) {
            e.preventDefault();
            ctx.api.open(ctx.href, row, "title");
          },
        }),
        el("p", { class: "rf-line" }, [
          el("span", {
            class: avail.tone === "closed" ? "ink-60" : "ink-full",
            text: avail.tone === "closed" ? "No dates in 90 days" : avail.text,
          }),
          price.amount
            ? el("span", { class: "ink-60", text: " · " + price.amount })
            : null,
          price.unit
            ? el("span", { class: "ink-60", text: " " + price.unit })
            : null,
        ]),
      ]);

      var arrow = Lab.ui.disc({
        icon: "arrowRight",
        label: "Open " + experience.title,
        variant: "paper",
        href: ctx.href,
        class: "rf-arrow frame-control",
        onclick: function (e) {
          e.preventDefault();
          ctx.api.open(ctx.href, row, "arrow");
        },
      });

      var debug = el("div", { class: "frame-debug", "aria-hidden": "true" });

      var root = el("div", { class: "rf-root" }, [
        el("div", { class: "frame-veil", "aria-hidden": "true" }),
        caption,
        arrow,
        debug,
      ]);

      Lab.frameRead.applyTo(
        ctx.surface,
        ctx.media.posterUrl,
        function (pick, grid) {
          if (!pick) return; // Tainted or unreachable. The fallback stands.
          Lab.frameRead.paintDebug(debug, grid, pick);
        },
      );

      return root;
    },
  });
})(window.Lab || (window.Lab = {}));
