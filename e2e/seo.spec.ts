import { test, expect } from "@playwright/test";

/**
 * What the app claims about itself.
 *
 * The truthfulness rules are the point: nothing is published that is not backed
 * by a record, and structured data counts as a claim even though it is
 * invisible on the page.
 */

test("the app is noindex until it takes the root domain", async ({ page }) => {
  await page.goto("/");
  const robots = page.locator('meta[name="robots"]');
  await expect(robots).toHaveAttribute("content", /noindex/);
});

test("the booking screen is never indexable", async ({ page }) => {
  await page.goto("/booking");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("no page claims a rating or a review count", async ({ page }) => {
  await page.goto("/e/try-dive-nemo-reef");
  const html = await page.content();

  // There are no operator ratings anywhere, deliberately: a number nobody
  // earned is a fabricated claim.
  expect(html).not.toMatch(/aggregateRating|ratingValue|reviewCount/);
});

test("the experience page states the cancellation policy before payment", async ({
  page,
}) => {
  await page.goto("/e/try-dive-nemo-reef");
  await expect(page.getByText("If it is called off")).toBeVisible();
});

test("the experience page is in the HTML, not only the RSC payload", async ({
  request,
}) => {
  /*
    Regression. MswProvider used to return null until its worker was ready,
    which gated the ENTIRE tree — so every page server-rendered empty and the
    content existed only inside the RSC flight payload, which a crawler does
    not execute. The build passed, the unit tests passed, and the page looked
    perfect in a browser.

    Fetched with `request` rather than `page` on purpose: no JavaScript runs,
    which is exactly what a crawler does.
  */
  const res = await request.get("/e/try-dive-nemo-reef");
  const html = await res.text();
  const body = html.slice(html.indexOf("<body"));
  const visible = body.replace(/<script[\s\S]*?<\/script>/g, "");

  expect(visible).toContain("Try-dive at Nemo Reef");
  expect(visible).toContain("Who runs this");
  // The price is the claim most worth having in the HTML.
  expect(visible).toMatch(/₹4,500/);
});

test("the operator page is in the HTML, not only the RSC payload", async ({
  request,
}) => {
  /*
    The same defect as the test above, and it shipped: `OperatorScreen` is a
    client component that fetched the profile itself, so the served HTML for
    `/o/[slug]` carried a correct `<title>` and an empty body. The route had
    already fetched the profile for `generateMetadata` and the 404 — it just
    was not handing it over.

    This page is registered as indexable, so content that exists only after
    hydration is the one thing it must not be. Caught by curling production
    after the deploy, which is later than it should have been; this is the
    check that would have caught it first.

    Fetched with `request` rather than `page`: no JavaScript runs, which is
    what a crawler does.
  */
  const res = await request.get("/o/sample-boat-operator");
  const html = await res.text();
  const body = html.slice(html.indexOf("<body"));
  const visible = body.replace(/<script[\s\S]*?<\/script>/g, "");

  expect(visible).toContain("Sample Boat Operator");
  expect(visible).toContain("What they run");
  // And the listings themselves, which are the point of the page.
  expect(visible).toContain("Snorkel trip to Elephant Beach");
});

test("every route describes itself, rather than inheriting the homepage", async ({
  request,
}) => {
  /*
    The symptom this pins: routes defined their own <title> and description and
    inherited the ROOT's Open Graph, so a link shared from a guide or an
    experience previewed as the homepage. Right in the tab, wrong in the only
    surface anybody else sees — and an Open Graph tag is not somewhere a
    developer looks.

    Fetched with `request` so no JavaScript runs. This is what a crawler and a
    link unfurler both see.
  */
  const routes = [
    { path: "/", title: "Yuvoy" },
    { path: "/search", title: "Search" },
    { path: "/guides", title: "Guides to the Andamans" },
    { path: "/e/try-dive-nemo-reef", title: "Try-dive at Nemo Reef" },
    {
      path: "/guides/diving-in-havelock",
      title: "Diving in Havelock, and what a first dive involves",
    },
    /*
      A shared trip names the trip, not the word "trip" — yuvoy-app#16. It is
      `noindex`, so this is here for the tab rather than for a crawler: "The
      trip · Yuvoy" is the same tab however many are open, and the experience
      name is what the page's own heading already says.
    */
    { path: "/trip/shr_sample", title: "Try-dive at Nemo Reef" },
  ];

  const seen = new Set<string>();

  for (const route of routes) {
    const html = await (await request.get(route.path)).text();
    const meta = (property: string) =>
      html.match(
        new RegExp(`<meta property="${property}" content="([^"]*)"`, "i"),
      )?.[1] ??
      html.match(
        new RegExp(`<meta name="${property}" content="([^"]*)"`, "i"),
      )?.[1];

    expect(meta("og:title"), `${route.path} og:title`).toBe(route.title);
    // Next normalises the root to an origin with no trailing slash, so the
    // homepage is `https://host` rather than `https://host/`.
    expect(meta("og:url"), `${route.path} og:url`).toMatch(
      route.path === "/"
        ? /^https?:\/\/[^/]+\/?$/
        : new RegExp(`^https?://[^/]+${route.path}$`),
    );
    expect(meta("twitter:title"), `${route.path} twitter:title`).toBe(
      route.title,
    );
    expect(meta("og:site_name"), `${route.path} og:site_name`).toBe("Yuvoy");

    // og:image must be absolute and on this origin, not localhost from a
    // build machine or an ephemeral deployment host.
    expect(meta("og:image"), `${route.path} og:image`).toMatch(/^https?:\/\//);

    const description = meta("og:description");
    expect(description, `${route.path} og:description`).toBeTruthy();
    expect(
      seen.has(`${route.title}|${description}`),
      `${route.path} reuses another route's identity`,
    ).toBe(false);
    seen.add(`${route.title}|${description}`);
  }
});

test("checkout is never indexable", async ({ request }) => {
  // A URL with a `?slot=` on it, holding an idempotency key. It was inheriting
  // the app default, which flips to `index` at the domain cutover.
  const html = await (
    await request.get("/e/try-dive-nemo-reef/book?slot=slot-1")
  ).text();
  expect(html).toMatch(/<meta name="robots" content="[^"]*noindex/);
});

test("the site says who publishes it, once, with no unbacked claim", async ({
  request,
}) => {
  const html = await (await request.get("/guides/diving-in-havelock")).text();
  const blocks = [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ].map((m) => JSON.parse(m[1].replace(/\\u003c/g, "<")));

  const types = blocks.map((b) => b["@type"]);
  expect(types).toContain("Organization");
  expect(types).toContain("WebSite");
  expect(types).toContain("Article");
  expect(types).toContain("BreadcrumbList");
  // Exactly one publisher for the whole site, not one per page.
  expect(types.filter((t) => t === "Organization")).toHaveLength(1);

  expect(JSON.stringify(blocks)).not.toMatch(
    /"(aggregateRating|ratingValue|reviewCount|offers|price|availability)"/,
  );
});
