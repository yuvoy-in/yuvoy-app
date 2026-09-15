import { test, expect, type Page } from "@playwright/test";

/**
 * The session, in a cookie the browser cannot read (yuvoy-app#57).
 *
 * ## Why this suite exists and a unit test cannot replace it
 *
 * Everything here is a property of a REAL server talking to a REAL browser:
 * the cookie's attributes, whether script can see it, whether it survives a
 * reload, and whether an `Authorization` header ever leaves the page. Under
 * jsdom the route handlers do not run at all, and the app-route mocks that
 * stand in for them keep a flag where the server keeps a cookie. A mock of a
 * cookie proves nothing about a cookie.
 *
 * ## What went wrong that this is here to stop coming back
 *
 * The session used to live in IndexedDB. Safari on iPhone deletes a site's
 * script-written storage after seven days of use without a visit, so
 * travellers were signed out roughly weekly while the server thought they were
 * fine: on 14 September the owner's number had twelve live sessions from about
 * twenty-one hours, all valid, none revoked. The phone kept losing the token.
 */

const SIGN_IN_CODE = "123456";

async function signIn(page: Page, number = "9111111111") {
  await page.goto("/account");
  await page.getByLabel("Your WhatsApp number").fill(number);
  await page.getByRole("button", { name: "Send me a code" }).click();
  await page.getByLabel("The code we sent").fill(SIGN_IN_CODE);
  await page.getByRole("button", { name: "Show me my trips" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();
}

async function sessionCookie(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === "yv_session");
}

test("signing in sets an HttpOnly cookie, and script cannot read it", async ({
  page,
}) => {
  await signIn(page);

  const cookie = await sessionCookie(page);
  expect(cookie, "no yv_session cookie was set").toBeDefined();
  expect(cookie!.httpOnly).toBe(true);
  expect(cookie!.sameSite).toBe("Lax");
  expect(cookie!.path).toBe("/");
  expect(cookie!.value.length).toBeGreaterThan(0);

  /*
    Fourteen days, give or take the walk through the form. Asserted as a
    window rather than a number because the cookie's life is re-set from the
    API's own `session.expiresAt` on every proxied call, so an exact equality
    would break the first time the mock's clock moved.
  */
  const secondsLeft = cookie!.expires - Date.now() / 1000;
  expect(secondsLeft).toBeGreaterThan(13 * 24 * 60 * 60);
  expect(secondsLeft).toBeLessThanOrEqual(14 * 24 * 60 * 60 + 60);

  // The whole point: an injected script cannot lift the session.
  const visible = await page.evaluate(() => document.cookie);
  expect(visible).not.toContain("yv_session");
});

test("no session token is anywhere script can reach", async ({ page }) => {
  /*
    Not the same assertion as the one above. HttpOnly stops `document.cookie`;
    this checks that the old storage is genuinely gone rather than merely
    unused, and that no answer left a token lying in a page global.
  */
  await signIn(page);

  const leaked = await page.evaluate(async () => {
    const found: string[] = [];

    const scan = (where: string, value: unknown) => {
      if (typeof value === "string" && value.startsWith("sess_")) {
        found.push(`${where}: ${value}`);
      }
    };

    /*
      eslint-disable no-restricted-syntax --
      The rule bans `localStorage` in APP code, because booking tokens belong
      in IndexedDB. This runs inside `page.evaluate`, in the browser, and its
      whole job is to prove that nothing put a session token there. Reaching
      it through an alias to dodge the rule would be worse: the exemption
      would stop being visible in review.
    */
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)!;
      scan(`localStorage.${key}`, localStorage.getItem(key));
    }
    /* eslint-enable no-restricted-syntax */
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i)!;
      scan(`sessionStorage.${key}`, sessionStorage.getItem(key));
    }

    // idb-keyval writes into a database named `keyval-store`.
    const databases = (await indexedDB.databases?.()) ?? [];
    for (const { name } of databases) {
      if (!name) continue;
      const db = await new Promise<IDBDatabase | null>((resolve) => {
        const open = indexedDB.open(name);
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => resolve(null);
      });
      if (!db) continue;
      for (const store of Array.from(db.objectStoreNames)) {
        const rows = await new Promise<unknown[]>((resolve) => {
          const request = db
            .transaction(store, "readonly")
            .objectStore(store)
            .getAll();
          request.onsuccess = () => resolve(request.result as unknown[]);
          request.onerror = () => resolve([]);
        });
        for (const row of rows) {
          scan(`${name}.${store}`, row);
          if (row && typeof row === "object") {
            for (const [k, v] of Object.entries(row)) {
              scan(`${name}.${store}.${k}`, v);
            }
          }
        }
      }
      db.close();
    }

    return found;
  });

  expect(leaked, "a session token is readable by script").toEqual([]);
});

test("the browser never sends an Authorization header for the session", async ({
  page,
}) => {
  /*
    The change is only real if the calls moved. A cookie that is set while the
    page still sends `Authorization: Bearer sess_...` from script would pass
    every assertion above and change nothing.

    Per-booking STATUS tokens are a different credential and are explicitly out
    of scope for #57, so only `sess_` is refused here.
  */
  const offenders: string[] = [];
  page.on("request", (request) => {
    const auth = request.headers()["authorization"];
    if (auth?.includes("sess_")) {
      offenders.push(`${request.method()} ${request.url()}`);
    }
  });

  await signIn(page);
  await page.goto("/trips");
  await expect(page.getByText("YV-OTHERPH")).toBeVisible();

  expect(offenders, "the session token left the browser in a header").toEqual(
    [],
  );
});

test("the trips list is fetched through the app's own server, not the API", async ({
  page,
}) => {
  /*
    The other half of the same claim. Without this, deleting the header while
    leaving the call pointed at the API would look identical: the request would
    simply 401, and Trips would quietly show only this device's bookings.
  */
  const proxied: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/v1/")) proxied.push(url.pathname);
  });

  await signIn(page);
  await page.goto("/trips");
  await expect(page.getByText("YV-OTHERPH")).toBeVisible();

  expect(proxied).toContain("/api/v1/me/bookings");
});

test("the session survives a reload, which IndexedDB did not", async ({
  page,
}) => {
  await signIn(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sign out on this device" }),
  ).toBeVisible();

  // And on another route, so it is the cookie rather than a page's own state.
  await page.goto("/trips");
  await expect(page.getByText("YV-OTHERPH")).toBeVisible();
});

test("signing out clears the cookie and the next load shows the form", async ({
  page,
}) => {
  await signIn(page);
  expect(await sessionCookie(page)).toBeDefined();

  await page.getByRole("button", { name: "Sign out on this device" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  const cookie = await sessionCookie(page);
  /*
    Either gone from the jar, or present and empty. Both are a cleared cookie;
    which one a browser reports depends on how it treats `Max-Age=0`, and
    pinning one of them would make this fail on a browser change rather than
    on a defect.
  */
  expect(cookie === undefined || cookie.value === "").toBe(true);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("a revoked session shows the way back in, not an error", async ({
  page,
}) => {
  /*
    Signed out on another device, then reloaded here. The proxy gets a 401,
    drops the cookie, and the screen offers a way in. #57's own acceptance
    wording: "shows Login, not an error."
  */
  await signIn(page);

  // `?__scenario=session-expired` makes the API answer 401 for this number.
  await page.goto("/trips?__scenario=session-expired");

  /*
    The screen says the session ended and offers the way back. It must not say
    "Nothing on this number": the number's trips were refused, not read, and
    claiming they are gone is the worse of the two lies available here.

    The first draft of this test expected the ordinary signed-out prompt and
    failed, which is how that copy was found. With no device trips there was
    nothing for the "Your sign-in has expired" panel to sit under, so the empty
    state was the only thing on screen and it said the wrong thing.
  */
  await expect(page.getByText("Your sign-in has expired")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Sign in again/ }).first(),
  ).toBeVisible();
  await expect(page.getByText("YV-OTHERPH")).toHaveCount(0);

  /*
    And the cookie is gone, which is the part only #57 added. Leaving it would
    make every later call fail the same way with no way to recover: the page
    would keep believing it was signed in and keep being refused.
  */
  const cookie = await sessionCookie(page);
  expect(cookie === undefined || cookie.value === "").toBe(true);
});

test("the cookie is not Secure over plain http, or e2e could not sign in", async ({
  page,
}) => {
  /*
    A guard on the guard, and on a real trap. `Secure` is refused over plain
    HTTP, and this suite runs a production build over http://127.0.0.1:3100.
    A hardcoded `secure: true` would drop the cookie here and every test above
    would fail looking like a broken sign-in rather than a cookie attribute.

    On app.yuvoy.in the request arrives with `x-forwarded-proto: https` and the
    attribute is on. That half is unit-tested in `session-cookie.test.ts`,
    because no local server can produce it.
  */
  await signIn(page);
  const cookie = await sessionCookie(page);
  expect(cookie!.secure).toBe(false);
});
