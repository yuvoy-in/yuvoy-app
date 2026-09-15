/*
  The shared reel scroller.

  This is the laboratory's copy of `src/components/feed/reel-strip.tsx`, and the
  seam is deliberately in the same place: **the strip owns the scroll, the
  observers, the preload budget, the gesture and the tail; the concept owns only
  what is drawn over the picture.** Four surfaces already share `ReelStrip` in
  production (the feed, a shared reel, the search grid's reel view and a
  business's own reels), so a concept that fits this seam is a concept that can
  be extracted into `ExperienceCard` without touching any of them.

  Everything in here that looks like a magic number was measured somewhere else
  and is cited at its definition.

  ## What a concept implements

      {
        id, name, tagline, hypothesis,        // for the laboratory's own chrome
        scrim: "bottom" | "none" | "adaptive" // which scrim the STRIP paints
        inset: false,                         // true lets the concept letterbox
        overlay(reel, ctx) -> Element         // drawn inside the card
        onActive(ctx) / onInactive(ctx)       // optional lifecycle
        barExtra() -> Element                 // optional, docked above the bar
        chromeRight() -> Element              // optional, beside the mark
      }

  `ctx` carries `{ index, total, reel, href, card, surface, api }` where `api`
  exposes the strip's own state to a concept that needs it (`isMuted`,
  `toggleMute`, `isPlaying`, `dwellMs`, `open`).
*/
(function (Lab) {
  "use strict";

  var el = Lab.el;

  /* ------------------------------------------------------- gesture constants */
  /*
    Lifted from `src/lib/feed/use-swipe-to-open.ts`, value for value, because
    the gesture's feel is the thing being evaluated and a prototype that guesses
    at it is evaluating a different gesture.
  */

  /** How far a finger travels before the gesture commits to an axis. */
  var SLOP = 12;
  /** How much more horizontal than vertical a move must be to be a swipe.
      Above 1 on purpose: a thumb arcs, and at 1.0 those arcs open experiences
      nobody asked for. */
  var AXIS_BIAS = 1.4;
  /** Travel that opens the experience on release. */
  var COMMIT = 72;
  /** The furthest the card will move, however far the finger goes. */
  var MAX_TRAVEL = 96;
  /** The strip along the right edge left to the platform's own back gesture. */
  var EDGE_GUARD = 24;
  /** A flick this fast (px per ms, leftward) opens on less travel. */
  var FLICK_VELOCITY = 0.5;
  /** ...but never on a nudge. */
  var FLICK_TRAVEL = 40;
  /** The spring back. Inside the 250ms interaction budget. */
  var SETTLE_MS = 220;

  /** Active card plus one. Never more. */
  var PRELOAD_AHEAD = 1;

  /**
   * One-to-one up to the commit point, damped after it onto an asymptote at
   * MAX_TRAVEL. The two halves meet with the same slope, so there is no step at
   * the join: a rubber band that jerks where it starts resisting reads as a
   * dropped frame.
   */
  function swipeTravel(pulled) {
    if (pulled <= 0) return 0;
    if (pulled <= COMMIT) return pulled;
    var room = MAX_TRAVEL - COMMIT;
    return COMMIT + room * (1 - Math.exp(-(pulled - COMMIT) / room));
  }

  /** Two ways to say yes: a deliberate drag past the commit, and a flick. */
  function swipeOpens(pulled, velocity) {
    if (pulled >= COMMIT) return true;
    return pulled >= FLICK_TRAVEL && velocity <= -FLICK_VELOCITY;
  }

  /**
   * The strip.
   *
   * @param {Element} mount    where it goes
   * @param {Object}  concept  the concept module (see the header)
   * @param {Array}   data     rows shaped like `GET /reels`
   * @param {Object}  hooks    `{ onOpen(href, reel), onActiveChange(index) }`
   */
  function Strip(mount, concept, data, hooks) {
    hooks = hooks || {};

    var state = {
      activeIndex: 0,
      /* Muted by default, and remembered for the session once a traveller
         unmutes. Same rule as the real store. */
      muted: true,
      playing: true,
      /* When the active card became active. The dwell signal Concept 03 reads;
         kept on the strip rather than in a concept so two concepts cannot
         measure it differently. */
      activeSince: Date.now(),
    };

    var cards = [];
    var scroller = el("div", {
      class: "reel-strip" + (concept.inset ? " is-inset" : ""),
      role: "feed",
      "aria-label": "Experiences in the Andaman Islands",
      /*
        A scrollable region has to be operable from a keyboard.

        It normally is here by accident: every card carries links, so there is
        always something inside to tab to and the browser scrolls to it. Concept
        09 broke that assumption, because its panel is mounted at the FRAME and
        hides the card's own controls while it is open, leaving a scroll
        container with nothing focusable in it at all. axe reported it as a
        serious violation and it is a real one: a keyboard user could not move
        through the feed.

        Stated rather than inherited, so it cannot depend on what a concept
        happens to draw. The full ARIA feed pattern puts the tab stop on each
        article instead; that is a larger change and belongs in the production
        component, not in a prototype that has to stay comparable to it.
      */
      tabindex: "0",
    });

    /* ------------------------------------------------------------- the tail */
    /*
      Four things can be true at the bottom of an infinite list and they read
      differently, which is the point: more is coming, more failed to come, the
      list ended, or the server stopped without a cursor to follow. The
      completeness claim is the SERVER's, never inferred from a short page.
    */
    var tailNote =
      Lab.TAIL === "complete"
        ? "That is everything on sale right now."
        : Lab.TAIL === "server_stopped"
          ? "That is as far as we can load right now, not the end of what is on sale. Reload to try again."
          : "Loading more reels...";

    /* ---------------------------------------------------------- the surface */

    function buildCard(row, index) {
      var experience = row.experience;
      var media = row.media;
      /* Built ONCE and handed to all three ways in. The arrow, the title and the
         swipe are three routes to one screen; three string literals a hundred
         lines apart are how they quietly stop agreeing. */
      var href = "/e/" + experience.slug;

      var poster = el("img", {
        class: "reel-poster",
        src: media.posterUrl,
        alt: media.alt || "",
        decoding: "async",
        loading: index === 0 ? "eager" : "lazy",
      });

      var media_layer = el("div", { class: "reel-media" }, [poster]);

      var surface = el("div", { class: "reel-surface" }, [media_layer]);

      /* The scrim, if this concept wants the strip to paint one. A concept that
         says "adaptive" paints its own, sized to what is actually behind it. */
      if (concept.scrim === "bottom" || concept.scrim === undefined) {
        surface.appendChild(
          el("div", { class: "reel-scrim feed-scrim", "aria-hidden": "true" }),
        );
      }

      var card = el("article", {
        class: "reel-card",
        "data-feed-index": String(index),
        "aria-posinset": String(index + 1),
        /*
          `aria-setsize` is a CLAIM. `-1` is ARIA's own word for an unknown total
          and is the honest answer until the server says `complete`; this lab's
          feed does say so, so the real count is used.
        */
        "aria-setsize": Lab.TAIL === "complete" ? String(data.length) : "-1",
        "aria-label": experience.title,
      });
      card.appendChild(surface);

      var ctx = {
        index: index,
        total: data.length,
        reel: row,
        experience: experience,
        media: media,
        href: href,
        card: card,
        surface: surface,
        mediaLayer: media_layer,
        poster: poster,
        api: api,
      };

      /* The play control. Drawn whenever there is a clip on the card in view and
         it is not running, whether that is the connection heuristic, a
         reduced-motion preference, or a browser refusing the autoplay. All three
         used to end at the same still image with nothing to press. */
      if (media.hlsUrl) {
        var play = el(
          "button",
          {
            class: "reel-play",
            type: "button",
            "aria-label": "Play " + (media.alt || "this clip"),
            onclick: function (e) {
              e.stopPropagation();
              api.setPlaying(true);
            },
          },
          [Lab.icon("play", "reel-play-glyph")],
        );
        surface.appendChild(play);
        ctx.playButton = play;
      }

      var overlay = concept.overlay(row, ctx);
      if (overlay) {
        overlay.classList.add("reel-overlay");
        surface.appendChild(overlay);
      }
      ctx.overlay = overlay;

      attachSwipe(card, surface, href, row);
      attachTapToPlay(media_layer, ctx);

      cards.push(ctx);
      return card;
    }

    /* ------------------------------------------------------- tap to play */

    /**
     * Tap on the picture is play and pause, and nothing else is allowed to
     * claim it. It is the most discoverable tap on the screen and it belongs to
     * the media, which is why every concept's own reveal is on a different
     * gesture.
     */
    function attachTapToPlay(layer, ctx) {
      layer.addEventListener("click", function () {
        if (!ctx.media.hlsUrl) return;
        api.setPlaying(!state.playing);
      });
    }

    /* ---------------------------------------------------------- the gesture */

    /**
     * Right to left opens the experience.
     *
     * The handlers sit on the ARTICLE so the whole card is the target, and the
     * transform sits on the surface inside it so the snap child's own box is
     * never touched: a scroll-snap area is the TRANSFORMED border box, and
     * moving the element the scroller is snapping to is not a thing to find out
     * about in production.
     *
     * It refuses a mouse (dragging with a mouse is how a person selects text),
     * the last 24px of the right edge (the platform's own back gesture), a
     * second finger, and the vertical axis, which belongs to the feed. The axis
     * is decided ONCE per gesture and a gesture that goes to the scroller never
     * comes back.
     */
    function attachSwipe(card, surface, href, row) {
      var pointerId = null;
      var axis = "undecided";
      var startX = 0;
      var startY = 0;
      var lastX = 0;
      var lastAt = 0;
      var velocity = 0;
      var swallowClick = false;

      function paint(offset, animate) {
        surface.style.transition = animate
          ? "transform " + SETTLE_MS + "ms var(--ease-interaction)"
          : "none";
        surface.style.transform = offset
          ? "translate3d(" + offset.toFixed(2) + "px, 0, 0)"
          : "";
      }

      card.addEventListener("pointerdown", function (e) {
        swallowClick = false;
        axis = "undecided";
        pointerId = null;
        if (e.pointerType === "mouse" || !e.isPrimary) return;
        var rect = surface.getBoundingClientRect();
        if (rect.width > 0 && e.clientX > rect.right - EDGE_GUARD) return;
        pointerId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
        lastX = e.clientX;
        lastAt = e.timeStamp;
        velocity = 0;
      });

      card.addEventListener("pointermove", function (e) {
        if (pointerId !== e.pointerId || axis === "scroll") return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;

        if (axis === "undecided") {
          if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
          /* Decided once and never revisited. Re-deciding mid-gesture is what
             makes a swipe feel like it is fighting the scroll. Rightward is not
             ours either: there is nothing to the left of a reel to reveal. */
          if (dx < 0 && Math.abs(dx) > Math.abs(dy) * AXIS_BIAS) {
            axis = "swipe";
            swallowClick = true;
            try {
              card.setPointerCapture(e.pointerId);
            } catch {
              /* Already released, or a browser that will not capture. The
                 gesture still works; it just ends if the finger leaves. */
            }
          } else {
            axis = "scroll";
            pointerId = null;
            return;
          }
        }

        var dt = e.timeStamp - lastAt;
        if (dt > 0) velocity = (e.clientX - lastX) / dt;
        lastX = e.clientX;
        lastAt = e.timeStamp;
        paint(-swipeTravel(-dx), false);
      });

      function release(e) {
        if (pointerId !== e.pointerId || axis !== "swipe") {
          pointerId = null;
          axis = "undecided";
          return;
        }
        pointerId = null;
        axis = "undecided";
        var pulled = Math.max(0, startX - e.clientX);
        if (swipeOpens(pulled, velocity)) {
          paint(-MAX_TRAVEL, true);
          window.setTimeout(function () {
            paint(0, true);
          }, 320);
          api.open(href, row, "swipe");
        } else {
          paint(0, true);
        }
      }

      card.addEventListener("pointerup", release);
      card.addEventListener("pointercancel", function (e) {
        if (pointerId !== e.pointerId) return;
        pointerId = null;
        axis = "undecided";
        paint(0, true);
      });

      /*
        A drag that ends on a control still produces a `click`, and acting on it
        would fire a control the traveller was only resting a thumb on.
      */
      card.addEventListener(
        "click",
        function (e) {
          if (!swallowClick) return;
          swallowClick = false;
          e.preventDefault();
          e.stopPropagation();
        },
        true,
      );
    }

    /* ------------------------------------------------------------- the api */

    var api = {
      isMuted: function () {
        return state.muted;
      },
      toggleMute: function () {
        state.muted = !state.muted;
        sync();
        return state.muted;
      },
      isPlaying: function () {
        return state.playing;
      },
      setPlaying: function (next) {
        state.playing = next;
        sync();
      },
      activeIndex: function () {
        return state.activeIndex;
      },
      /** How long the traveller has been on the current card. The dwell signal. */
      dwellMs: function () {
        return Date.now() - state.activeSince;
      },
      /** The one way out of the feed, whichever route asked for it. */
      open: function (href, row, via) {
        if (hooks.onOpen) hooks.onOpen(href, row, via);
      },
      scrollTo: function (index) {
        scroller.scrollTop = scroller.clientHeight * index;
      },
      cards: function () {
        return cards;
      },
    };

    /* -------------------------------------------------------- the observers */

    /**
     * ONE observer for the whole strip.
     *
     * A per-card observer leaks one per card per mount and rebuilds on every
     * render, and this component re-renders on every scroll because that is how
     * the active index updates. One observer over the scroller's children
     * sidesteps all of it: the index travels on the DOM node as a data attribute
     * rather than through a closure.
     */
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var index = Number(entry.target.getAttribute("data-feed-index"));
          if (index >= 0 && index !== state.activeIndex) {
            var previous = cards[state.activeIndex];
            state.activeIndex = index;
            state.activeSince = Date.now();
            /* A new reel starts playing. Asked once, trusted from then on: a
               traveller who tapped play has answered the question, so the feed
               stops guessing. */
            state.playing = true;
            if (previous && concept.onInactive) concept.onInactive(previous);
            if (concept.onActive) concept.onActive(cards[index]);
            if (hooks.onActiveChange) hooks.onActiveChange(index);
            sync();
          }
        });
      },
      { threshold: 0.6, root: scroller },
    );

    /**
     * Paint whatever depends on active, muted and playing.
     *
     * One pass over the cards rather than a subscription per control: there are
     * twelve of them and the alternative is twelve listeners that have to be
     * torn down in the right order.
     */
    function sync() {
      cards.forEach(function (ctx, i) {
        var active = i === state.activeIndex;
        /* The preload budget: active card plus one, never more. Left to each
           card, "preload the next one" becomes every card preloading its
           neighbour, which on island 4G is the whole feed downloading at once. */
        var mounted =
          i >= state.activeIndex - 1 && i <= state.activeIndex + PRELOAD_AHEAD;
        ctx.card.classList.toggle("is-active", active);
        ctx.card.classList.toggle("is-mounted", mounted);
        ctx.mediaLayer.classList.toggle(
          "is-running",
          active && state.playing && Boolean(ctx.media.hlsUrl),
        );
        if (ctx.playButton) {
          /* Only on the ACTIVE card. A play button on a half-scrolled neighbour
             is a target somebody hits by accident, and it would start a clip
             they cannot see. */
          ctx.playButton.hidden = !(active && !state.playing);
        }
        if (concept.sync) concept.sync(ctx, { active: active, state: state });
      });
    }

    /* ---------------------------------------------------------------- build */

    data.forEach(function (row, index) {
      scroller.appendChild(buildCard(row, index));
    });

    scroller.appendChild(
      el("div", { class: "reel-tail" }, [
        el("p", { class: "reel-tail-note", text: tailNote }),
      ]),
    );

    var frame = el("div", { class: "reel-frame" }, [scroller]);

    /* The chrome that floats over the strip: the mark, and whatever the concept
       wants beside it. */
    if (concept.chrome !== false) {
      frame.appendChild(
        Lab.ui.masthead(concept.chromeRight ? concept.chromeRight(api) : null),
      );
    }

    /*
      A layer at the FRAME level, for a concept whose chrome outlives a card.

      Everything else a concept draws is per card, which is right for a caption
      and wrong for anything that has to survive a swipe. Concept 09 keeps one
      sheet open across reels and cross-fades its contents, and a per-card sheet
      cannot do that: the card holding it scrolls away.

      It sits above the strip and below the bar, so the bar is still the top of
      the stack and is still never covered.
    */
    if (concept.frameLayer) {
      var layer = concept.frameLayer(api);
      if (layer) {
        layer.classList.add("reel-frame-layer");
        frame.appendChild(layer);
      }
    }

    /* The bar, and anything a concept docks above it. The bar itself is never
       optional and never retracts. */
    frame.appendChild(
      Lab.ui.tabBar(concept.barExtra ? concept.barExtra(api) : null),
    );

    mount.appendChild(frame);

    cards.forEach(function (ctx) {
      observer.observe(ctx.card);
    });
    if (concept.onActive) concept.onActive(cards[0]);
    sync();

    return {
      api: api,
      scroller: scroller,
      destroy: function () {
        observer.disconnect();
        if (concept.destroy) concept.destroy();
        mount.innerHTML = "";
      },
    };
  }

  Lab.Strip = Strip;
  Lab.swipeTravel = swipeTravel;
  Lab.swipeOpens = swipeOpens;
})(window.Lab || (window.Lab = {}));
