/*
  The laboratory shell.

  It is deliberately NOT drawn in the brand's colours. Everything inside the
  phone is the product and everything outside it is an instrument, and a tool
  painted in forest and cream would make it impossible to tell which of the two
  you were looking at. The chrome here is neutral grey and one monospace face,
  on purpose.

  Its job is four things and no more:
    1. hold the concept registry and swap between them without a reload,
    2. put each concept in a real phone-sized viewport, at several sizes,
    3. give an evaluator a direct route to every awkward case in the data,
    4. report what a tap or a swipe WOULD have opened, since there is no
       listing screen behind this.
*/
(function (Lab) {
  "use strict";
  var el = Lab.el;

  var concepts = [];
  Lab.register = function (concept) {
    concepts.push(concept);
  };

  /*
    The order the panel shows, and the order the number keys follow.

    The Column family leads and Concept 06 is what boots, because it is the
    screen the owner specified and the other three are it pushed further. The
    first five stay, grouped underneath, because the family only makes sense
    against what it came from.
  */
  var GROUPS = [
    {
      id: "column",
      title: "Column family",
      note: "The owner's concept, and three ways further",
    },
    {
      id: "studies",
      title: "Earlier studies",
      note: "The five it was chosen from",
    },
  ];

  function ordered() {
    var out = [];
    GROUPS.forEach(function (group) {
      concepts
        .filter(function (c) {
          return (c.group || "studies") === group.id;
        })
        .forEach(function (c) {
          out.push(c);
        });
    });
    return out;
  }

  /*
    Device presets.

    Real dimensions, not round numbers. The small one is an iPhone SE and is the
    case that actually breaks layouts; the large one is a Pro Max, where the top
    of the screen is out of a thumb's reach entirely. The Android is included
    because it is narrower than any iPhone in the list and width matters more
    than height for one-handed use.
  */
  var DEVICES = [
    {
      id: "se",
      label: "SE",
      w: 375,
      h: 667,
      note: "iPhone SE, the small case",
    },
    { id: "std", label: "Standard", w: 390, h: 844, note: "iPhone 15" },
    { id: "max", label: "Large", w: 430, h: 932, note: "iPhone 15 Pro Max" },
    { id: "android", label: "Narrow", w: 360, h: 800, note: "Pixel class" },
  ];

  /* Direct routes to the cases that break things. Index into `Lab.DATA`. */
  var STRESS = [
    { index: 5, label: "Long title" },
    { index: 3, label: "No price" },
    { index: 4, label: "No dates" },
    { index: 6, label: "Unclassified" },
    { index: 1, label: "Bright frame" },
    { index: 11, label: "Dark frame" },
    { index: 7, label: "No clip" },
    { index: 8, label: "No location" },
  ];

  var current = null;
  var mounted = null;
  var device = DEVICES[1];

  /* ---------------------------------------------------------------- mount */

  var stage = document.getElementById("stage");
  var screen = document.getElementById("screen");
  var hypothesis = document.getElementById("hypothesis");
  var toast = document.getElementById("toast");
  var toastTimer = null;

  function say(message) {
    toast.textContent = message;
    toast.classList.add("is-up");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("is-up");
    }, 2200);
  }

  function show(concept) {
    if (mounted) mounted.destroy();
    /* A card's overlay may have left the body in a concept's own state. Nothing
       here is allowed to outlive the concept that set it. */
    document.body.classList.remove("cc-open");
    if (current && current.reset) current.reset();
    current = concept;
    if (concept.reset) concept.reset();

    screen.className = "screen concept-" + concept.id;
    hypothesis.innerHTML = "";
    hypothesis.appendChild(
      el("p", { class: "hyp-name" }, [
        el("span", { class: "hyp-id", text: concept.id }),
        el("span", { text: concept.name }),
        concept.advanced
          ? el("span", { class: "hyp-badge", text: "advanced" })
          : null,
      ]),
    );
    hypothesis.appendChild(
      el("p", { class: "hyp-text", text: concept.hypothesis }),
    );

    mounted = Lab.Strip(screen, concept, Lab.DATA, {
      onOpen: function (href, row, via) {
        say("Opens " + href + "  (via " + via + ")");
      },
    });

    document.querySelectorAll(".switch-item").forEach(function (node) {
      var on = node.getAttribute("data-concept") === concept.id;
      node.classList.toggle("is-on", on);
      node.setAttribute("aria-selected", String(on));
    });
  }

  function applyDevice(next) {
    device = next;
    stage.style.setProperty("--device-w", next.w + "px");
    stage.style.setProperty("--device-h", next.h + "px");
    document.getElementById("device-note").textContent =
      next.w + " x " + next.h + "  " + next.note;
    document.querySelectorAll(".device-item").forEach(function (node) {
      node.classList.toggle(
        "is-on",
        node.getAttribute("data-device") === next.id,
      );
    });
  }

  /* --------------------------------------------------------------- chrome */

  function buildChrome() {
    var switcher = document.getElementById("switcher");
    var list = ordered();

    GROUPS.forEach(function (group) {
      var members = list.filter(function (c) {
        return (c.group || "studies") === group.id;
      });
      if (!members.length) return;

      switcher.appendChild(
        el("p", { class: "switch-group" }, [
          el("span", { class: "switch-group-title", text: group.title }),
          el("span", { class: "switch-group-note", text: group.note }),
        ]),
      );

      members.forEach(function (concept) {
        switcher.appendChild(
          el(
            "button",
            {
              class: "switch-item",
              type: "button",
              role: "tab",
              "aria-selected": "false",
              "data-concept": concept.id,
              onclick: function () {
                show(concept);
              },
            },
            [
              el("span", { class: "switch-id", text: concept.id }),
              el("span", { class: "switch-name", text: concept.name }),
              el("span", { class: "switch-tag", text: concept.tagline }),
              el("span", {
                class: "switch-key",
                text: String(list.indexOf(concept) + 1),
              }),
            ],
          ),
        );
      });
    });

    var devices = document.getElementById("devices");
    DEVICES.forEach(function (d) {
      devices.appendChild(
        el("button", {
          class: "device-item",
          type: "button",
          "data-device": d.id,
          text: d.label,
          onclick: function () {
            applyDevice(d);
          },
        }),
      );
    });

    var stressBar = document.getElementById("stress");
    STRESS.forEach(function (s) {
      stressBar.appendChild(
        el("button", {
          class: "stress-item",
          type: "button",
          text: s.label,
          onclick: function () {
            if (mounted) mounted.api.scrollTo(s.index);
          },
        }),
      );
    });

    /*
      The network, as a dial.

      Concept 07 is the only thing here that fetches, and its loading, failed
      and empty states are the reason the second detent is defensible at all. A
      state nobody can reproduce on demand is a state nobody builds, so it is a
      switch rather than a matter of luck.
    */
    var fetchBar = document.getElementById("fetchmode");
    [
      { id: "normal", label: "Normal" },
      { id: "slow", label: "Slow" },
      { id: "fail", label: "Fails" },
      { id: "empty", label: "Empty" },
    ].forEach(function (mode) {
      fetchBar.appendChild(
        el("button", {
          class: "device-item" + (mode.id === "normal" ? " is-on" : ""),
          type: "button",
          "data-fetch": mode.id,
          text: mode.label,
          onclick: function () {
            Lab.fetchMode = mode.id;
            document.querySelectorAll("[data-fetch]").forEach(function (node) {
              node.classList.toggle(
                "is-on",
                node.getAttribute("data-fetch") === mode.id,
              );
            });
            say("Departures fetch: " + mode.label.toLowerCase());
          },
        }),
      );
    });

    wireToggle("toggle-debug", "show-frame-debug", function (on) {
      if (on && current && current.id !== "04" && current.id !== "08") {
        say("The frame grid belongs to concepts 04 and 08.");
      }
    });
    wireToggle("toggle-zones", "show-thumb-zones");
    wireToggle("toggle-still", "freeze-motion");
  }

  function wireToggle(id, className, after) {
    var node = document.getElementById(id);
    node.addEventListener("change", function () {
      document.body.classList.toggle(className, node.checked);
      if (after) after(node.checked);
    });
  }

  /* ------------------------------------------------------------- keyboard */

  /*
    Number keys switch concepts. A laboratory is used by comparing, and comparing
    means going back and forth many times: a keystroke is the difference between
    a real comparison and three clicks that lose your place.
  */
  document.addEventListener("keydown", function (e) {
    if (e.target.matches("input, textarea")) return;
    var list = ordered();
    var n = Number(e.key);
    if (n >= 1 && n <= list.length) {
      show(list[n - 1]);
      return;
    }
    if (e.key === "d" || e.key === "D") {
      var box = document.getElementById("toggle-debug");
      box.checked = !box.checked;
      box.dispatchEvent(new Event("change"));
    }
  });

  /* ----------------------------------------------------------------- boot */

  Lab.boot = function () {
    Lab.resolvePosters();
    buildChrome();
    applyDevice(device);
    show(ordered()[0]);
  };
})(window.Lab || (window.Lab = {}));
