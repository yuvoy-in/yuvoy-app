import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { ADD_WAY_WORDS as A, WAYS_IN_WORDS as W } from "@/lib/auth/use-add-way";
import { AccountScreen } from "./account-screen";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";

/**
 * Ways in tests on a number-only account (yuvoy-app#229). The test file
 * mocks `next/navigation` and resets the app route mocks itself.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
export const ADDRESS = "asha@example.com";

/**
 * A number-only account, signed in, with the email door open. A test sets
 * `door` or `provenEmail` as the API would change them.
 */
export function numberOnly() {
  const api = {
    door: true,
    configReads: 0,
    provenEmail: null as string | null,
  };
  server.use(
    http.get(`${BASE}/app-config`, () => {
      api.configReads += 1;
      return HttpResponse.json({
        minimumVersion: { ios: "0.0.0", android: "0.0.0" },
        features: {
          payments: "coming_soon",
          inviteOnly: false,
          signIn: { email: api.door, google: false, apple: false },
        },
        support: { whatsappE164: null, hours: "" },
        deliveryHost: null,
        releases: {},
      });
    }),
    http.get(`${BASE}/me`, () =>
      HttpResponse.json({
        phone: "+919000000000",
        name: "Asha Menon",
        email: null,
        emailProven: api.provenEmail !== null,
        provenEmail: api.provenEmail,
        googleSignIn: false,
        interests: [],
        onboardingRequired: false,
        memberSince: null,
        trips: { total: 0, upcoming: 0, completed: 0 },
        reviews: { count: 0 },
        support: { whatsappE164: null, hours: "" },
        admitted: true,
        ageConfirmed: true,
      }),
    ),
    http.post(`${BASE}/me/sign-in/request`, () =>
      HttpResponse.json({ sent: true, devCode: "123456" }, { status: 202 }),
    ),
  );
  __signInAppRouteMock("sess_test");
  return api;
}

/**
 * Add an email up to the code, then send the code to a link answering
 * `reply`. `shown` runs once the screen is up, before anything is typed.
 */
export async function addEmail(
  reply: () => Response,
  shown?: (client: ReturnType<typeof renderWithQuery>["client"]) => void,
) {
  server.use(http.post("*/api/session/link", () => reply()));
  const user = userEvent.setup();
  const { client } = renderWithQuery(<AccountScreen />);
  const region = await screen.findByRole("region", { name: W.title });
  shown?.(client);
  await user.click(
    await within(region).findByRole("button", { name: W.addEmail }),
  );
  await user.type(within(region).getByLabelText(A.emailLabel), ADDRESS);
  await user.click(
    within(region).getByRole("button", { name: "Send me a code" }),
  );
  await user.type(await within(region).findByLabelText(A.codeLabel), "123456");
  await user.click(
    within(region).getByRole("button", { name: A.submit.email }),
  );
  return { user, region, client };
}
