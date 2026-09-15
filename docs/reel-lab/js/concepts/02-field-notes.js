/*
  Concept 02: Field Notes

  ## Hypothesis

  A travel feed should read as a published guide rather than a social stream.
  The owner's complaint was that the reel was covered. The most complete answer
  to "covered" is not a smaller overlay: it is **no overlay at all.**

  ## The move

  The clip is letterboxed into a 32px well set on the forest stage, and every
  word sits on the stage beside it. Nothing is written on the picture. There is
  no caption scrim anywhere in this concept, because there is nothing to make
  legible over footage.

  This is the concept's whole trade and it is stated plainly so it can be judged
  rather than admired: **the picture is about 22% smaller, and in exchange it is
  100% visible, always, on every frame, in every lighting condition.** No other
  concept in the set can make that promise.

  ## Why it does not read as a downgrade

  Because the stage is already the app's own ground. v2.7 made the whole
  application a dark stage with cream sheets rising out of it; the feed is the
  one screen that opted out. This concept opts it back in, and the reel becomes
  a plate on a page rather than a video with writing on it. The marketing site's
  destination panels are the same gesture.

  ## Finiteness, made legible

  A folio: "03 / 12". The feed is a catalogue of tens rather than a stream of
  thousands, `feedTail` can honestly say `complete`, and a reader of a guide
  expects to know where they are in it. The count is only shown when the server
  has said `complete`; until then the position alone is shown, because a
  denominator we were not told is a number we would be making up.
*/
(function (Lab) {
  "use strict";
  var el = Lab.el;
  var fmt = Lab.fmt;

  Lab.register({
    id: "02",
    group: "studies",
    name: "Field Notes",
    tagline: "The reel as a plate on a page, with nothing written on it",
    hypothesis:
      "A travel feed should read as a published guide rather than a social stream. The most complete answer to 'the reel is covered' is that nothing is drawn on it at all.",
    /* Nothing is written on the picture, so nothing needs darkening. */
    scrim: "none",
    inset: true,
    /* The mark moves into the page's own header rather than floating on a clip. */
    chrome: false,

    overlay: function (row, ctx) {
      var experience = row.experience;
      var operator = experience.operator;
      var avail = fmt.availability(experience);
      var price = fmt.price(experience);
      var duration = fmt.duration(experience.durationMinutes);

      /* The folio. A denominator only when the server has said `complete`. */
      var folio =
        Lab.TAIL === "complete"
          ? pad(ctx.index + 1) + " / " + pad(ctx.total)
          : pad(ctx.index + 1);

      /*
        The fact rule. Three facts, set as a typographic row with hairlines
        between them rather than as three chips. A chip is a container, and
        containers are what this system uses type to avoid.

        The order is not taste. It is how a traveller with three days actually
        triages: can I do it, how long does it take, what does it cost.
      */
      var factRow = el(
        "dl",
        { class: "fn-facts" },
        [
          [
            "When",
            avail.tone === "closed" ? "No dates in 90 days" : avail.text,
            avail.tone === "closed" ? "is-closed" : "",
          ],
          duration ? ["Takes", duration, ""] : null,
          [price.amount ? "From" : "Price", price.amount || price.absent, ""],
        ]
          .filter(Boolean)
          .reduce(function (acc, fact) {
            acc.push(
              el("div", { class: "fn-fact " + fact[2] }, [
                el("dt", { class: "label", text: fact[0] }),
                el("dd", { text: fact[1] }),
              ]),
            );
            return acc;
          }, []),
      );

      return el("div", { class: "fn-page" }, [
        /* The page's own head: the mark, and where the reader is. */
        el("header", { class: "fn-head" }, [
          el("img", {
            class: "fn-mark",
            src: "assets/yuvoy-mark-compact-on-dark.svg",
            alt: "Yuvoy",
          }),
          el("p", { class: "label fn-folio ink-60", text: folio }),
        ]),

        /*
          The plate.

          The media is RE-PARENTED into it rather than sitting behind the page:
          this concept letterboxes, so the clip has to be a box in the layout
          instead of a full-bleed ground with a frame drawn on top. The strip
          builds the media layer and the play control and hands both over on
          `ctx`, which is exactly the seam that makes this possible without the
          strip knowing anything about letterboxing.

          `fn-well` itself is a radius and a hairline. It is not a layer over
          the picture: nothing in this concept is.
        */
        el("div", { class: "fn-well" }, [
          ctx.mediaLayer,
          ctx.playButton || null,
          Lab.ui.disc({
            icon: ctx.api.isMuted() ? "volumeOff" : "volume",
            label: ctx.api.isMuted() ? "Unmute" : "Mute",
            variant: "onDark",
            class: "fn-sound",
            onclick: function (e) {
              e.stopPropagation();
              var muted = ctx.api.toggleMute();
              this.setAttribute("aria-label", muted ? "Unmute" : "Mute");
              this.replaceChild(
                Lab.icon(muted ? "volumeOff" : "volume"),
                this.firstChild,
              );
            },
          }),
        ]),

        /* The notes. */
        el("div", { class: "fn-notes" }, [
          experience.activityTypeLabel || experience.location
            ? el("p", { class: "fn-eyebrow label" }, [
                el("span", { class: "fn-marker", "aria-hidden": "true" }),
                el("span", {
                  text: [experience.activityTypeLabel, experience.location]
                    .filter(Boolean)
                    .join(" · "),
                }),
              ])
            : null,

          el("a", {
            class: "fn-title",
            href: ctx.href,
            text: experience.title,
            onclick: function (e) {
              e.preventDefault();
              ctx.api.open(ctx.href, row, "title");
            },
          }),

          factRow,

          /*
            Who runs it, and the evidence.

            Where a competitor writes "4.9 (312)" we write what was checked.
            This API publishes no rating and no review count on purpose, and the
            absence is what enforces the no-fabricated-claims rule. An operator
            who is not verified gets their name and nothing else: there is no
            "pending" state in the contract, so there is none here.
          */
          el("div", { class: "fn-operator" }, [
            el("p", { class: "fn-operator-name", text: operator.name }),
            operator.verified
              ? el("p", { class: "fn-evidence" }, [
                  Lab.icon("check", "fn-check"),
                  el("span", {
                    text:
                      (operator.credentialsSummary &&
                        operator.credentialsSummary[0]) ||
                      "Credentials checked and current",
                  }),
                ])
              : null,
          ]),

          /*
            The way forward, as a line of type with a rule under it rather than
            a filled bar. A full-width shouting button was removed from this
            screen on 13 September for cause, and this concept does not bring it
            back in a new colour.
          */
          el(
            "a",
            {
              class: "fn-open",
              href: ctx.href,
              onclick: function (e) {
                e.preventDefault();
                ctx.api.open(ctx.href, row, "cta");
              },
            },
            [
              el("span", {
                text: experience.nextAvailable ? "See dates" : "Have a look",
              }),
              Lab.icon("arrowRight", "fn-open-arrow"),
            ],
          ),
        ]),
      ]);
    },
  });

  function pad(n) {
    return n < 10 ? "0" + n : String(n);
  }
})(window.Lab || (window.Lab = {}));
