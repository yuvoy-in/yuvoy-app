/*
  Reading a frame: where is it quiet, and how much veil does writing there cost.

  Extracted from Concept 04 the moment a second concept needed it. Two copies of
  a scoring function are two answers to the same question, and the one that
  drifts is the one nobody is looking at.

  Nothing here draws anything. It answers two questions and leaves the rendering
  to whoever asked:

      choose(grid)              which region of this frame to write in
      Lab.posters.veilFor(...)  the smallest veil that makes paper legible there
*/
(function (Lab) {
  "use strict";

  /** The grid the engine reads. Nine columns by sixteen rows, one canvas draw. */
  var COLS = 9;
  var ROWS = 16;

  /** The contrast floor type is solved to. */
  var TEXT_TARGET = 7;

  /**
   * The floor a CONTROL is solved to.
   *
   * A solid paper disc carries its own glyph at 13.11:1 whatever is behind it,
   * so the only thing at risk is the disc's edge dissolving into white surf.
   * 3:1 is the non-text contrast minimum and it is the right number.
   */
  var CONTROL_TARGET = 3;

  /**
   * The candidate regions.
   *
   * `prior` is subtracted from the score, so a larger prior means "preferred on
   * a near tie". The foot wins ties because that is where the thumb is and
   * where a reader looks for a caption; the head is penalised because the mark
   * already lives there and because reading at the top of a phone is a stretch.
   */
  var ZONES = [
    { id: "foot", c0: 0, c1: 6, r0: 10, r1: 14, prior: 0.1 },
    { id: "footWide", c0: 0, c1: 9, r0: 11, r1: 15, prior: 0.06 },
    { id: "midLeft", c0: 0, c1: 5, r0: 6, r1: 11, prior: 0.0 },
    { id: "head", c0: 0, c1: 6, r0: 3, r1: 7, prior: -0.04 },
  ];

  /** Where a bottom-right control sits, in grid cells. */
  var CONTROL_ZONE = { c0: 6, c1: 9, r0: 12, r1: 15 };

  /** Mean, brightest and spread over one rectangle of cells. */
  function measure(grid, zone) {
    var sum = 0;
    var max = 0;
    var min = 1;
    var count = 0;
    var worst = [0, 0, 0];
    for (var r = zone.r0; r < zone.r1; r++) {
      for (var c = zone.c0; c < zone.c1; c++) {
        var i = r * grid.cols + c;
        var l = grid.lum[i];
        sum += l;
        if (l > max) {
          max = l;
          worst = [grid.rgb[i * 3], grid.rgb[i * 3 + 1], grid.rgb[i * 3 + 2]];
        }
        if (l < min) min = l;
        count++;
      }
    }
    return { mean: sum / count, max: max, spread: max - min, worst: worst };
  }

  /**
   * Pick the region, and solve both veils.
   *
   * Mean carries the weight. Spread is a real penalty rather than a tiebreak: a
   * caption crossing a bright edge is harder to read than the same caption on a
   * uniformly brighter field, because the eye reads the EDGE. The prior only
   * decides near ties.
   *
   * The veil is solved for the region's BRIGHTEST cell rather than its mean,
   * and composited per channel in sRGB the way the browser will actually
   * composite it. Solving for the mean is how a scrim passes a spreadsheet and
   * fails on the one bright corner the type happens to cross.
   */
  function choose(grid) {
    var best = null;
    ZONES.forEach(function (zone) {
      var m = measure(grid, zone);
      var score = m.mean + m.spread * 0.55 - zone.prior;
      if (!best || score < best.score) {
        best = { zone: zone, score: score, measured: m };
      }
    });

    var w = best.measured.worst;
    var control = measure(grid, CONTROL_ZONE);
    var cw = control.worst;

    return {
      zone: best.zone,
      measured: best.measured,
      /* What writing here costs. Zero on a frame that is already dark, which is
         the whole argument for reading the frame at all. */
      textVeil: Lab.posters.veilFor(w[0], w[1], w[2], TEXT_TARGET),
      /* What a control's edge costs. Drives a hairline, never a patch: a soft
         darkening under a disc has nothing to blend into on flat pale sand. */
      controlRing: Lab.posters.veilFor(cw[0], cw[1], cw[2], CONTROL_TARGET),
    };
  }

  /**
   * Read a poster and apply the answer to a surface, or leave the fallback.
   *
   * The FALLBACK IS TODAY'S DESIGN, and that is the property that makes any of
   * this shippable: a cross-origin poster taints the canvas, `getImageData`
   * throws, and the surface keeps the fixed foot layout with the full system
   * scrim. Against real Cloudflare Images this needs `crossOrigin="anonymous"`
   * and an `Access-Control-Allow-Origin` header, and without them the feature
   * quietly does nothing rather than breaking a screen.
   */
  function applyTo(surface, posterUrl, done) {
    surface.setAttribute("data-zone", "foot");
    surface.style.setProperty("--frame-text-veil", "0.88");
    surface.style.setProperty("--frame-control-ring", "0.25");
    surface.classList.add("frame-fallback");

    Lab.posters.luminanceGrid(posterUrl, COLS, ROWS, function (grid) {
      if (!grid) {
        if (done) done(null);
        return;
      }
      var pick = choose(grid);
      surface.classList.remove("frame-fallback");
      surface.setAttribute("data-zone", pick.zone.id);
      surface.style.setProperty("--frame-text-veil", String(pick.textVeil));
      surface.style.setProperty(
        "--frame-control-ring",
        String(pick.controlRing),
      );
      if (done) done(pick, grid);
    });
  }

  /**
   * The instrument: a cell per measurement, the winning region outlined, the
   * numbers printed.
   *
   * It exists so the choice can be argued with rather than admired. If a region
   * looks wrong on a frame, the grid says why.
   */
  function paintDebug(mount, grid, pick) {
    mount.innerHTML = "";
    var table = Lab.el("div", { class: "frame-grid" });
    for (var r = 0; r < grid.rows; r++) {
      for (var c = 0; c < grid.cols; c++) {
        var l = grid.lum[r * grid.cols + c];
        var inZone =
          c >= pick.zone.c0 &&
          c < pick.zone.c1 &&
          r >= pick.zone.r0 &&
          r < pick.zone.r1;
        table.appendChild(
          Lab.el("span", {
            class: "frame-cell" + (inZone ? " is-chosen" : ""),
            style:
              "background: rgba(255,255,255," +
              (0.05 + l * 0.75).toFixed(3) +
              ")",
          }),
        );
      }
    }
    mount.appendChild(table);
    mount.appendChild(
      Lab.el("p", {
        class: "frame-readout",
        text:
          pick.zone.id +
          "  mean " +
          pick.measured.mean.toFixed(3) +
          "  spread " +
          pick.measured.spread.toFixed(3) +
          "  veil " +
          Math.round(pick.textVeil * 100) +
          "%  ring " +
          Math.round(pick.controlRing * 100) +
          "%",
      }),
    );
  }

  Lab.frameRead = {
    COLS: COLS,
    ROWS: ROWS,
    choose: choose,
    applyTo: applyTo,
    paintDebug: paintDebug,
  };
})(window.Lab || (window.Lab = {}));
