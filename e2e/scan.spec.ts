import { test, expect } from "@playwright/test";

/**
 * Arriving from a printed QR code — yuvoy-app#27.
 *
 * ## Why this is not in `audit.spec.ts`
 *
 * It was, for about an hour, and it broke the post-deploy production audit.
 *
 * `audit.spec.ts` is pointed at the LIVE origin after every production deploy
 * (`.github/workflows/audit.yml` runs that file and nothing else). These cases
 * depend on MOCK scan codes — `ISLAND-HAV-01`, `HAVELOCK-01` — which exist in
 * `mocks/handlers.ts` and nowhere else. Against production every one of them
 * resolves to `{"target":"/","known":false}`, the redirect lands on the feed,
 * and `waitForURL` times out.
 *
 * The audit's own docblock says it "runs against production", and its rule is
 * that everything in it must hold against real data. A test that needs a
 * fixture does not belong there — it belongs here, where the suite runs
 * against MSW.
 *
 * Still GET-only apart from `POST /scans`, which is a marketing counter with
 * no traveller-visible effect.
 */
test.describe("arriving from a QR code", () => {
  test("a card printed for a place opens Search on that place", async ({
    page,
  }) => {
    await page.goto("/go/ISLAND-HAV-01");
    await page.waitForURL(/\/search\?/);

    const url = new URL(page.url());
    // In Search's own spelling. `destinationKey` here was a name Search never
    // read, and this test, reading only the URL, passed over an unfiltered
    // Search until 6 Oct 2026. So the place is checked on the SCREEN too.
    expect(url.searchParams.get("place")).toBe("andaman/havelock");
    await expect(
      page
        .getByRole("group", { name: "Filters applied" })
        .getByText("Havelock (Swaraj Dweep)"),
    ).toBeVisible();
    // Attribution is untouched by this change and must stay on the URL.
    expect(url.searchParams.get("src")).toBe("qr");
    expect(url.searchParams.get("code")).toBe("ISLAND-HAV-01");
  });

  test("answers with a redirect, not a page that reloads itself", async ({
    request,
  }) => {
    /*
      It was a page under a loading boundary, which streams: the redirect
      became a meta refresh inside a skeleton, so a traveller saw a grey
      sheet and then a full reload of the document.
    */
    const response = await request.get("/go/ISLAND-HAV-01", {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toMatch(
      /^\/search\?place=andaman%2Fhavelock&src=qr&code=ISLAND-HAV-01$/,
    );
  });

  test("a card printed for one listing still opens that listing", async ({
    page,
  }) => {
    /*
      The specific target wins. Narrowing it to a whole island afterwards
      would be a worse answer than the one the operator paid to print.
    */
    await page.goto("/go/HAVELOCK-01");
    await page.waitForURL(/\/e\/try-dive-nemo-reef/);
    expect(new URL(page.url()).searchParams.get("src")).toBe("qr");
  });

  test("a card with no destination lands on the feed, unchanged", async ({
    page,
  }) => {
    // Absent means "no destination" — a market-wide card at the airport, or a
    // code we do not recognise. No guess, exactly as before.
    await page.goto("/go/UNKNOWN-CARD");
    await page.waitForURL(/\/\?/);
    const url = new URL(page.url());
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("destinationKey")).toBeNull();
    expect(url.searchParams.get("src")).toBe("qr");
  });
});
