import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const MOTION_IMPORTS = [
  {
    name: "next/link",
    message:
      "Import Link from @/components/ui/link: it gives the screen change its motion (lib/motion/route-motion.ts).",
  },
  {
    name: "react",
    importNames: ["ViewTransition", "addTransitionType"],
    message:
      "Import ViewTransition from @/lib/motion/view-transition: the project's react 19.2 has none, so the unit tests would crash.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated from contracts/openapi.yaml. Never hand-edited, never linted.
    "src/lib/api/schema.gen.ts",
    "public/sw.js",
    // MSW's generated worker. Vendored, never edited, and it carries its own
    // eslint directives that our config has no rules for.
    "public/mockServiceWorker.js",
    ".claude/**",
    /*
      Test and tooling output. Every one of these is gitignored, regenerated
      and never read as source.

      This is not tidiness. Playwright only copies its trace-viewer bundle
      into playwright-report/ when a test FAILS, so the first failing e2e run
      dropped ~500 KB of minified vendor JS into the lint path and `pnpm lint`
      then failed with 264 errors in code nobody wrote — which reads as the
      change having broken the lint, long after the actual test was fixed.
    */
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    "playwright/.cache/**",
    ".lighthouseci/**",
    ".memsearch/**",
  ]),
  {
    rules: {
      /*
        The two rules that exist because getting them wrong costs money or
        puts somebody on the wrong boat. Both are documented in
        docs/ERROR_MAP.md and Part 7 of the plan.
      */
      "no-restricted-syntax": [
        "error",
        {
          // A slot time rendered in the device's timezone is a missed boat.
          // Slots carry localDate / localStartTime already formatted for the
          // market; those are the only correct source.
          selector:
            "CallExpression[callee.property.name='toLocaleTimeString'], CallExpression[callee.property.name='toLocaleDateString'], CallExpression[callee.property.name='toLocaleString']",
          message:
            "Never format a slot time with toLocale*. Use slot.localDate / slot.localStartTime, or formatMarketTime() from @/lib/format/time.",
        },
        {
          // The status token is in the URL fragment. localStorage is
          // synchronous and the first place an XSS payload looks.
          selector:
            "MemberExpression[object.name='localStorage'], MemberExpression[object.object.name='window'][object.property.name='localStorage']",
          message:
            "Do not use localStorage. Booking tokens live in IndexedDB via @/lib/booking/token-store; see plan §4.4.",
        },
        {
          /*
            TanStack keeps a query's data when a background refetch fails, and
            still reports `isError`. Twenty branches tested it alone, so one
            dropped poll or reconnect swapped content already on screen for an
            error: checkout unmounted the form with the typed name in it, a
            conversation took its composer (and the keyboard) away mid-word,
            and Trips said "We could not load your trips" over trips it was
            showing (6 Oct 2026). Banned outright, so the choice is made by
            name every time.
          */
          selector: "MemberExpression[property.name='isError']",
          message:
            "isError is also true when a refetch fails with data on screen, so branching on it swaps that data for an error. Use isLoadingError for an error in place of content, isRefetchError for a note beside data that stays, isFetchNextPageError for a page that did not arrive, or error for a mutation.",
        },
      ],
      /*
        The motion system's two front doors (approved 4 Oct 2026). Every
        in-app link carries the type of its screen change, so a link straight
        from Next is a screen change that silently stops moving. And the
        project's own react (19.2, what the unit tests run) has no
        ViewTransition, so one imported from "react" is undefined there.
      */
      "no-restricted-imports": ["error", { paths: MOTION_IMPORTS }],
    },
  },
  {
    // The two modules those imports exist to go through.
    files: ["src/components/ui/link.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: MOTION_IMPORTS.filter((p) => p.name !== "next/link") },
      ],
    },
  },
  {
    files: ["src/lib/motion/view-transition.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: MOTION_IMPORTS.filter((p) => p.name !== "react") },
      ],
    },
  },
]);

export default eslintConfig;
