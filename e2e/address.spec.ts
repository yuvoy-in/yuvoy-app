import { test, expect, type Page } from "@playwright/test";
import { chooseDeparture } from "./support/checkout";

/**
 * A choice made on a screen writes the address in place, and never asks the
 * server for the page again.
 *
 * Search and checkout keep their choices in the URL: a search survives Back,
 * a checkout survives a refresh. They used to put them there with
 * `router.replace`, and both routes are dynamic, so every keystroke, filter,
 * day and time was a navigation: a request for the whole page before the grid
 * could even ask for its reels, a tap that answered a round trip late, and,
 * offline, a full page load into the offline page with the typed name and
 * number gone. While that request was out, every render sent it again, which
 * could cancel a tab the traveller had just tapped.
 *
 * Counted here rather than asserted on the code, so a return to the router
 * fails on this machine and not on a jetty.
 */

/** The router's requests for the page at `pathname` itself. Prefetches of it are not a reload. */
function pageRequests(page: Page, pathname: string): string[] {
  const seen: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    const headers = request.headers();
    if (
      url.pathname === pathname &&
      headers["rsc"] === "1" &&
      !headers["next-router-prefetch"] &&
      !headers["next-router-segment-prefetch"]
    ) {
      seen.push(url.search);
    }
  });
  return seen;
}

const query = (page: Page, name: string) =>
  new URL(page.url()).searchParams.get(name);

test.describe("a search writes its address in place", () => {
  test("typing and filtering never ask the server for the page", async ({
    page,
  }) => {
    await page.goto("/search");
    const grid = page.getByRole("list", { name: "Search results" });
    await expect(grid.getByRole("link").first()).toBeVisible();
    const requests = pageRequests(page, "/search");

    // One key at a time, the way a thumb types.
    await page
      .getByRole("searchbox", { name: "Search experiences" })
      .pressSequentially("dive", { delay: 60 });
    await expect.poll(() => query(page, "q")).toBe("dive");

    await page.getByRole("button", { name: /^Filters/ }).click();
    const sheet = page.getByRole("dialog", { name: "Filters" });
    await sheet
      .getByRole("button", { name: "Havelock (Swaraj Dweep)" })
      .click();
    await sheet.getByRole("button", { name: "Show results" }).click();
    await expect.poll(() => query(page, "place")).toBe("andaman/havelock");
    // The word survived the filter, and the grid answered both.
    expect(query(page, "q")).toBe("dive");
    await expect(grid.getByRole("link").first()).toBeVisible();

    expect(requests).toEqual([]);
  });

  test("fast typing on a slow phone keeps every letter", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "CPU throttling is Chromium's");
    /*
      On a slow phone the router shows each write a render behind the typing,
      and the screen also takes a word the address gains from OUTSIDE (the
      Search tab, Back). Mistaking its own late write for one of those would
      put "div" back in a box that already says "dive". Six times slower than
      this machine is a mid-range Android.
    */
    await page.goto("/search");
    await expect(
      page
        .getByRole("list", { name: "Search results" })
        .getByRole("link")
        .first(),
    ).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });

    const box = page.getByRole("searchbox", { name: "Search experiences" });
    await box.pressSequentially("diving at havelock", { delay: 10 });
    await expect(box).toHaveValue("diving at havelock");
    await expect.poll(() => query(page, "q")).toBe("diving at havelock");
    // Settled, and still every letter.
    await expect(box).toHaveValue("diving at havelock");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  });

  test("the Search tab clears the word along with the filters", async ({
    page,
  }) => {
    /*
      The tab goes to `/search` with nothing on it. The box used to keep its
      own word and write it straight back, so the tab cleared the filters but
      not the word: neither a reset nor a no-op.
    */
    await page.goto("/search?q=dive&place=andaman%2Fhavelock");
    const box = page.getByRole("searchbox", { name: "Search experiences" });
    await expect(box).toHaveValue("dive");

    await page.locator('a[href="/search"]:visible').first().click();
    await expect.poll(() => new URL(page.url()).search).toBe("");
    await expect(box).toHaveValue("");
    await expect(
      page
        .getByRole("list", { name: "Search results" })
        .getByRole("link")
        .first(),
    ).toBeVisible();
    // And nothing wrote the word back once the grid had answered.
    expect(new URL(page.url()).search).toBe("");
  });

  test("Back to an earlier search brings its word back into the box", async ({
    page,
  }) => {
    await page.goto("/search?q=dive");
    const box = page.getByRole("searchbox", { name: "Search experiences" });
    await expect(box).toHaveValue("dive");

    await page.locator('a[href="/search"]:visible').first().click();
    await expect(box).toHaveValue("");

    await page.goBack();
    await expect.poll(() => query(page, "q")).toBe("dive");
    await expect(box).toHaveValue("dive");
  });
});

test.describe("a checkout writes its address in place", () => {
  test("choosing a day and a time never asks the server for the page", async ({
    page,
  }) => {
    const path = "/e/try-dive-nemo-reef/book";
    await page.goto(path);
    const requests = pageRequests(page, path);

    await chooseDeparture(page);
    await expect.poll(() => query(page, "date")).not.toBeNull();
    await expect.poll(() => query(page, "slot")).not.toBeNull();

    // A second day is a second change, still in place.
    const first = query(page, "date");
    const days = page
      .getByRole("region", { name: "Pick a day" })
      .locator("button[aria-pressed]:not([disabled])");
    if ((await days.count()) > 1) {
      await days.nth(1).click();
      await expect.poll(() => query(page, "date")).not.toBe(first);
    }

    expect(requests).toEqual([]);
  });
});
