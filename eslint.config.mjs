import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
      ],
    },
  },
]);

export default eslintConfig;
