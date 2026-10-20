import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { server } from "../../../mocks/server";
import {
  __resetAppRouteMocks,
  __signInAppRouteMock,
} from "../../../mocks/app-route-handlers";
import { useRelease } from "./use-release";
import type { Cohort, ReleaseStage } from "./app-config";

/**
 * A release read in the browser (yuvoy-app#181): its stage from
 * `GET /app-config`, opened by the API's rule with the cohort on `GET /me`.
 * Shut until it is known, and shut when it cannot be read.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

function Probe() {
  const release = useRelease("explore");
  return (
    <p data-testid="release">
      {release.stage} {release.open ? "open" : "shut"}{" "}
      {release.pending ? "pending" : "known"}
    </p>
  );
}

function stage(explore: ReleaseStage | null) {
  server.use(
    http.get(`${BASE}/app-config`, () =>
      HttpResponse.json({
        minimumVersion: { ios: "0.0.0", android: "0.0.0" },
        features: { payments: "coming_soon", inviteOnly: false },
        support: { whatsappE164: null, hours: "" },
        deliveryHost: null,
        ...(explore ? { releases: { explore } } : {}),
      }),
    ),
  );
}

function cohort(value: Cohort) {
  const asked: number[] = [];
  server.use(
    http.get(`${BASE}/me`, () => {
      asked.push(1);
      return HttpResponse.json({
        phone: "+919000000000",
        name: "Asha Menon",
        email: null,
        interests: [],
        onboardingRequired: false,
        memberSince: null,
        trips: { total: 0, upcoming: 0, completed: 0 },
        reviews: { count: 0 },
        support: { whatsappE164: null, hours: "" },
        cohort: value,
      });
    }),
  );
  return asked;
}

const reads = async (text: string) =>
  waitFor(() => expect(screen.getByTestId("release")).toHaveTextContent(text));

beforeEach(() => __resetAppRouteMocks());
afterEach(cleanup);

describe("a release in the browser", () => {
  it("is shut while the config is out, then reads it", async () => {
    renderWithQuery(<Probe />);
    expect(screen.getByTestId("release")).toHaveTextContent("off shut pending");
    // The mock's config, as dev and production answer today.
    await reads("off shut known");
  });

  it("opens for everybody at all, and asks nobody who they are", async () => {
    stage("all");
    const asked = cohort("staff");
    renderWithQuery(<Probe />);
    await reads("all open known");
    expect(asked).toEqual([]);
  });

  it("stays shut at early for somebody signed out", async () => {
    stage("early");
    const asked = cohort("early");
    renderWithQuery(<Probe />);
    await reads("early shut known");
    expect(asked).toEqual([]);
  });

  it("opens at early for the early cohort, signed in", async () => {
    stage("early");
    __signInAppRouteMock();
    cohort("early");
    renderWithQuery(<Probe />);
    await reads("early open known");
  });

  it("stays shut at staff for the early cohort", async () => {
    stage("staff");
    __signInAppRouteMock();
    cohort("early");
    renderWithQuery(<Probe />);
    await reads("staff shut known");
  });

  it("reads a config with no releases, or none at all, as off", async () => {
    stage(null);
    renderWithQuery(<Probe />);
    await reads("off shut known");
    cleanup();

    server.use(
      http.get(`${BASE}/app-config`, () =>
        HttpResponse.json(
          { error: { code: "internal_error", message: "x" } },
          { status: 500 },
        ),
      ),
    );
    renderWithQuery(<Probe />);
    await reads("off shut known");
  });
});
