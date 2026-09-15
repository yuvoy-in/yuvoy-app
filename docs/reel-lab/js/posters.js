/*
  Procedural poster frames.

  No rights-cleared photography or footage exists yet (yuvoy-app#11), and the
  feed's own fixtures draw abstract palette gradients for that reason. A flat
  gradient is enough to prove the poster-first path and not enough to judge a
  composition: it cannot tell you whether a caption survives white surf, and it
  cannot exercise a layout that reads the frame.

  So these are synthetic frames with the luminance structure real footage has:
  a horizon, a bright band, a dark mass, a silhouette. Each archetype puts its
  quiet region somewhere different, deliberately, so a fixed-position overlay
  and a frame-aware one can be compared on the same screen.

  ## The colours

  Palette tokens wherever the frame allows one, plus a small, named set of
  FOOTAGE colours, because footage is not in the palette and pretending
  otherwise would defeat the purpose. The palest of them is `#E8E2D4`, which is
  not invented either: it is the surf highlight `globals.css` measures the
  caption scrim against.

  ## Why SVG data URIs

  Same-origin by definition, so a canvas that samples one is never tainted.
  Concept 04 reads these frames pixel by pixel; against a real Cloudflare
  poster that read needs `crossOrigin="anonymous"` and a fallback, which is
  documented where the concept uses it.
*/
(function (Lab) {
  "use strict";

  var PALETTE = {
    abyss: "#0a100e",
    forest: "#16362e",
    terra: "#be7149",
    paper: "#ffffff",
  };

  /*
    Footage colours. Named rather than inlined so the set is countable and a
    frame cannot quietly grow a sixth blue.

    `surf` is the measured highlight from the scrim's own contrast proof. The
    rest sit on a line between it and `abyss`, which is what stops these frames
    reading as a different product to the one they sit inside.
  */
  var FOOTAGE = {
    surf: "#e8e2d4",
    haze: "#c9cfc4",
    shallow: "#5d9a92",
    reef: "#2f6d68",
    deep: "#123b3f",
    canopy: "#1d3a26",
    dusk: "#7a5340",
    ember: "#c98a58",
  };

  var W = 360;
  var H = 640;

  function svg(body, defs) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      W +
      '" height="' +
      H +
      '" viewBox="0 0 ' +
      W +
      " " +
      H +
      '">' +
      "<defs>" +
      (defs || "") +
      "</defs>" +
      body +
      "</svg>"
    );
  }

  function vertical(id, stops) {
    return (
      '<linearGradient id="' +
      id +
      '" x1="0" y1="0" x2="0" y2="1">' +
      stops
        .map(function (s) {
          return (
            '<stop offset="' +
            s[0] +
            '" stop-color="' +
            s[1] +
            '"' +
            (s[2] === undefined ? "" : ' stop-opacity="' + s[2] + '"') +
            "/>"
          );
        })
        .join("") +
      "</linearGradient>"
    );
  }

  function radial(id, stops, cx, cy, r) {
    return (
      '<radialGradient id="' +
      id +
      '" cx="' +
      cx +
      '" cy="' +
      cy +
      '" r="' +
      r +
      '">' +
      stops
        .map(function (s) {
          return (
            '<stop offset="' +
            s[0] +
            '" stop-color="' +
            s[1] +
            '" stop-opacity="' +
            (s[2] === undefined ? 1 : s[2]) +
            '"/>'
          );
        })
        .join("") +
      "</radialGradient>"
    );
  }

  /** A band of moving light, the thing that makes a frame hard to write on. */
  function caustics(y, height, opacity) {
    var out = "";
    for (var i = 0; i < 7; i++) {
      var cy = y + (height / 7) * i + (i % 2 ? 6 : 0);
      var rx = 60 + ((i * 37) % 90);
      var cx = 30 + ((i * 97) % 320);
      out +=
        '<ellipse cx="' +
        cx +
        '" cy="' +
        cy +
        '" rx="' +
        rx +
        '" ry="' +
        (6 + (i % 3) * 4) +
        '" fill="' +
        FOOTAGE.surf +
        '" opacity="' +
        (opacity * (0.5 + ((i * 13) % 7) / 14)).toFixed(3) +
        '"/>';
    }
    return out;
  }

  /**
   * The archetypes.
   *
   * Each returns finished SVG. The comment on each names where its quiet region
   * is, because that is the property the set exists to vary.
   */
  var FRAMES = {
    /* Quiet region: the foot. The ordinary case, and the one a fixed bottom
       caption was designed for. */
    "reef-shallow": function () {
      return svg(
        '<rect width="360" height="640" fill="url(#g)"/>' +
          caustics(40, 240, 0.16) +
          '<path d="M0 470 C 90 440, 150 500, 230 466 S 330 430, 360 452 L360 640 L0 640Z" fill="' +
          PALETTE.abyss +
          '" opacity="0.55"/>' +
          '<ellipse cx="252" cy="300" rx="34" ry="18" fill="' +
          PALETTE.abyss +
          '" opacity="0.4"/>',
        vertical("g", [
          [0, FOOTAGE.shallow],
          [0.34, FOOTAGE.reef],
          [0.72, FOOTAGE.deep],
          [1, PALETTE.abyss],
        ]),
      );
    },

    /*
      Quiet region: the HEAD. White surf across the lower two thirds, which is
      the case that breaks a bottom caption and the reason Concept 04 exists.
    */
    "surf-bright": function () {
      return svg(
        '<rect width="360" height="640" fill="url(#g)"/>' +
          '<path d="M0 300 C 80 276, 140 318, 214 296 S 320 268, 360 288 L360 640 L0 640Z" fill="' +
          FOOTAGE.surf +
          '" opacity="0.82"/>' +
          '<path d="M0 372 C 96 350, 168 392, 250 368 S 336 344, 360 360 L360 640 L0 640Z" fill="' +
          FOOTAGE.surf +
          '" opacity="0.9"/>' +
          caustics(430, 180, 0.5) +
          '<ellipse cx="180" cy="600" rx="240" ry="70" fill="' +
          FOOTAGE.haze +
          '" opacity="0.5"/>',
        vertical("g", [
          [0, FOOTAGE.deep],
          [0.26, FOOTAGE.reef],
          [0.46, FOOTAGE.shallow],
          [1, FOOTAGE.surf],
        ]),
      );
    },

    /* Quiet region: the foot. Bright sky, dark sea, a hard horizon at 46%. */
    "open-sea": function () {
      return svg(
        '<rect width="360" height="300" fill="url(#sky)"/>' +
          '<rect y="294" width="360" height="346" fill="url(#sea)"/>' +
          '<circle cx="268" cy="120" r="30" fill="' +
          FOOTAGE.surf +
          '" opacity="0.55"/>' +
          caustics(310, 120, 0.1) +
          '<path d="M96 296 l14 -34 l10 34 Z" fill="' +
          PALETTE.abyss +
          '" opacity="0.7"/>',
        vertical("sky", [
          [0, FOOTAGE.haze],
          [1, FOOTAGE.surf],
        ]) +
          vertical("sea", [
            [0, FOOTAGE.reef],
            [0.5, FOOTAGE.deep],
            [1, PALETTE.abyss],
          ]),
      );
    },

    /* Quiet region: the left and the foot. A dark canopy mass with a dawn
       sliver at the top right. */
    "mangrove-dawn": function () {
      return svg(
        '<rect width="360" height="640" fill="url(#g)"/>' +
          '<ellipse cx="300" cy="96" rx="120" ry="80" fill="' +
          FOOTAGE.ember +
          '" opacity="0.35"/>' +
          '<path d="M0 0 L150 0 C 120 120, 170 220, 120 330 S 60 520, 90 640 L0 640Z" fill="' +
          PALETTE.abyss +
          '" opacity="0.72"/>' +
          '<path d="M360 150 C 300 220, 320 330, 280 420 S 300 560, 360 640 Z" fill="' +
          FOOTAGE.canopy +
          '" opacity="0.8"/>' +
          '<rect y="430" width="360" height="210" fill="' +
          PALETTE.abyss +
          '" opacity="0.5"/>',
        vertical("g", [
          [0, FOOTAGE.dusk],
          [0.3, FOOTAGE.canopy],
          [1, PALETTE.abyss],
        ]),
      );
    },

    /* Quiet region: everywhere. Night. The case where a scrim is almost pure
       cost, and a concept that sizes its scrim to the frame can skip it. */
    "night-water": function () {
      return svg(
        '<rect width="360" height="640" fill="' +
          PALETTE.abyss +
          '"/>' +
          '<rect width="360" height="640" fill="url(#glow)"/>' +
          caustics(380, 200, 0.07) +
          '<circle cx="118" cy="188" r="3" fill="' +
          FOOTAGE.surf +
          '" opacity="0.7"/>' +
          '<circle cx="243" cy="150" r="2" fill="' +
          FOOTAGE.surf +
          '" opacity="0.5"/>',
        radial(
          "glow",
          [
            [0, FOOTAGE.reef, 0.5],
            [1, PALETTE.abyss, 0],
          ],
          "0.7",
          "0.32",
          "0.6",
        ),
      );
    },

    /* Quiet region: the foot and the edges. A vignette with one lit centre. */
    "reef-deep": function () {
      return svg(
        '<rect width="360" height="640" fill="url(#g)"/>' +
          caustics(80, 200, 0.1) +
          '<ellipse cx="180" cy="270" rx="120" ry="150" fill="' +
          FOOTAGE.shallow +
          '" opacity="0.22"/>' +
          '<path d="M0 520 C 70 470, 150 560, 240 512 S 330 470, 360 500 L360 640 L0 640Z" fill="' +
          PALETTE.abyss +
          '" opacity="0.8"/>',
        vertical("g", [
          [0, FOOTAGE.reef],
          [0.42, FOOTAGE.deep],
          [1, PALETTE.abyss],
        ]),
      );
    },

    /* Quiet region: the head and the foot. A hot band across the middle, which
       is where a centred layout would put its type. */
    "sunset-cliff": function () {
      return svg(
        '<rect width="360" height="640" fill="url(#g)"/>' +
          '<circle cx="196" cy="318" r="46" fill="' +
          FOOTAGE.surf +
          '" opacity="0.75"/>' +
          '<rect y="300" width="360" height="76" fill="' +
          FOOTAGE.ember +
          '" opacity="0.4"/>' +
          '<path d="M0 392 C 80 372, 150 412, 236 390 S 330 366, 360 384 L360 640 L0 640Z" fill="' +
          PALETTE.abyss +
          '" opacity="0.88"/>',
        vertical("g", [
          [0, FOOTAGE.deep],
          [0.32, FOOTAGE.dusk],
          [0.52, FOOTAGE.ember],
          [0.66, FOOTAGE.dusk],
          [1, PALETTE.abyss],
        ]),
      );
    },

    /* Quiet region: the LEFT. Dappled light down the right side, which no
       horizontal full-width caption can avoid. */
    "jungle-trail": function () {
      var shafts = "";
      for (var i = 0; i < 5; i++) {
        shafts +=
          '<path d="M' +
          (180 + i * 44) +
          " 0 L" +
          (250 + i * 44) +
          " 0 L" +
          (150 + i * 30) +
          " 640 L" +
          (110 + i * 30) +
          ' 640 Z" fill="' +
          FOOTAGE.surf +
          '" opacity="' +
          (0.1 + i * 0.05).toFixed(2) +
          '"/>';
      }
      return svg(
        '<rect width="360" height="640" fill="url(#g)"/>' +
          shafts +
          '<rect width="150" height="640" fill="' +
          PALETTE.abyss +
          '" opacity="0.55"/>',
        vertical("g", [
          [0, FOOTAGE.canopy],
          [0.5, "#25462c"],
          [1, "#16301f"],
        ]),
      );
    },

    /*
      Quiet region: a vertical band down the LEFT.

      A hull in the foreground with water beyond it: bright at the head and
      bright at the foot, dark down one side. It is here because Concept 04's
      `midLeft` zone never won on any other frame in the set, and a placement
      rule that cannot win is dead logic dressed as intelligence. Either the
      zone earns a frame or it comes out; this is a real composition, so it
      earns one.
    */
    "boat-side": function () {
      return svg(
        '<rect width="360" height="640" fill="url(#g)"/>' +
          caustics(120, 240, 0.28) +
          '<rect y="470" width="360" height="170" fill="' +
          FOOTAGE.surf +
          '" opacity="0.55"/>' +
          '<path d="M0 0 L138 0 C 150 160, 146 380, 132 520 C 120 600, 96 630, 0 640 Z" fill="' +
          PALETTE.abyss +
          '" opacity="0.9"/>' +
          '<path d="M132 250 C 150 258, 156 300, 146 330 Z" fill="' +
          FOOTAGE.dusk +
          '" opacity="0.5"/>',
        vertical("g", [
          [0, FOOTAGE.haze],
          [0.28, FOOTAGE.shallow],
          [0.66, FOOTAGE.reef],
          [1, FOOTAGE.surf],
        ]),
      );
    },

    /* Quiet region: none. Bright everywhere, brightest at the foot. The worst
       frame in the set and the one every concept is judged on. */
    "shore-noon": function () {
      return svg(
        '<rect width="360" height="640" fill="url(#g)"/>' +
          '<path d="M0 250 C 90 232, 160 268, 244 246 S 332 224, 360 240 L360 640 L0 640Z" fill="' +
          FOOTAGE.surf +
          '" opacity="0.55"/>' +
          '<rect y="430" width="360" height="210" fill="' +
          FOOTAGE.surf +
          '" opacity="0.78"/>' +
          caustics(300, 120, 0.4),
        vertical("g", [
          [0, FOOTAGE.haze],
          [0.3, FOOTAGE.shallow],
          [0.62, FOOTAGE.surf],
          [1, "#ded6c4"],
        ]),
      );
    },
  };

  var cache = {};

  /** The data URI for one archetype. Built once, reused for every card. */
  function build(name) {
    if (!cache[name]) {
      var make = FRAMES[name] || FRAMES["reef-shallow"];
      cache[name] = "data:image/svg+xml;utf8," + encodeURIComponent(make());
    }
    return cache[name];
  }

  /**
   * Mean colour and relative luminance over a grid of cells.
   *
   * Returns `{ cols, rows, lum: Float32Array, rgb: Uint8ClampedArray }` in
   * row-major order, or null when the canvas could not be read.
   *
   * **Both are returned on purpose.** Luminance answers "how bright is this
   * region"; the raw channels are what a correct composite needs, because CSS
   * blends in sRGB gamma space rather than in linear light. Sizing a scrim from
   * luminance alone is an approximation that runs about a tenth of a stop
   * optimistic on saturated footage, and optimistic is the wrong direction for
   * a contrast floor.
   *
   * The read is one small draw. Against a real Cloudflare poster the image
   * needs `crossOrigin="anonymous"` or the canvas is tainted and `getImageData`
   * throws, which is caught here and answered with null so the caller falls
   * back to a fixed layout rather than breaking.
   */
  function luminanceGrid(src, cols, rows, done) {
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () {
      try {
        var c = document.createElement("canvas");
        c.width = cols;
        c.height = rows;
        var ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, cols, rows);
        var d = ctx.getImageData(0, 0, cols, rows).data;
        var count = cols * rows;
        var lum = new Float32Array(count);
        var rgb = new Uint8ClampedArray(count * 3);
        for (var i = 0; i < count; i++) {
          var r = d[i * 4];
          var g = d[i * 4 + 1];
          var b = d[i * 4 + 2];
          rgb[i * 3] = r;
          rgb[i * 3 + 1] = g;
          rgb[i * 3 + 2] = b;
          lum[i] = relativeLuminance(r, g, b);
        }
        done({ cols: cols, rows: rows, lum: lum, rgb: rgb });
      } catch {
        /* Tainted canvas, or a browser that refuses the read. The caller
           falls back rather than breaking. */
        done(null);
      }
    };
    img.onerror = function () {
      done(null);
    };
    img.src = src;
  }

  var ABYSS_RGB = [10, 16, 14];

  /**
   * The smallest abyss veil that brings paper to `target` over this colour.
   *
   * Composited the way the browser actually will: per channel in sRGB, then
   * luminance from the result. Stepped rather than solved because the function
   * is monotonic and twenty five steps of 4% is both exact enough for a scrim
   * and cheaper than the algebra is to get right.
   *
   * Returns 0 when the colour already clears the target, which is the whole
   * point: a night frame should pay nothing for a scrim it does not need.
   */
  function veilFor(r, g, b, target) {
    for (var a = 0; a <= 0.92; a += 0.04) {
      var lr = r * (1 - a) + ABYSS_RGB[0] * a;
      var lg = g * (1 - a) + ABYSS_RGB[1] * a;
      var lb = b * (1 - a) + ABYSS_RGB[2] * a;
      if (paperContrast(relativeLuminance(lr, lg, lb)) >= target) {
        return Math.round(a * 100) / 100;
      }
    }
    return 0.92;
  }

  function channel(v) {
    var s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }

  function relativeLuminance(r, g, b) {
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }

  /** Contrast of paper (#FFFFFF) over a surface of the given luminance. */
  function paperContrast(luminance) {
    var paper = relativeLuminance(255, 255, 255);
    var hi = Math.max(paper, luminance);
    var lo = Math.min(paper, luminance);
    return (hi + 0.05) / (lo + 0.05);
  }

  Lab.posters = {
    build: build,
    names: Object.keys(FRAMES),
    luminanceGrid: luminanceGrid,
    relativeLuminance: relativeLuminance,
    paperContrast: paperContrast,
    veilFor: veilFor,
  };

  /* Resolve every row's poster once, at load. */
  Lab.resolvePosters = function () {
    Lab.DATA.forEach(function (row) {
      row.media.posterUrl = build(row.media.frame);
    });
  };
})(window.Lab || (window.Lab = {}));
