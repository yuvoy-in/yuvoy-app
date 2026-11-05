import { describe, it, expect, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { qk } from "@/lib/query/policy";
import { useTrigoChat, useTrigoConsent, useTrigoConversations } from "./api";
import { server } from "../../../mocks/server";

/*
  A 401 on a Trigo read reads the session again, so the sheet shows the
  sign-in rather than a failure. The client throws on any answer that is not
  2xx, so this has to happen where the throw lands, not in an `if (error)`
  after the call (that branch never ran).
*/

const CHAT = "6f1c2d3e-4a5b-4c6d-8e7f-8091a2b3c4d5";

function Consent() {
  useTrigoConsent(true);
  return null;
}
function Conversations() {
  useTrigoConversations(true);
  return null;
}
function Chat() {
  useTrigoChat(CHAT, true);
  return null;
}

const signedOut = () =>
  HttpResponse.json(
    { error: { code: "unauthorized", message: "Sign in again." } },
    { status: 401 },
  );

describe("the Trigo reads on a 401", () => {
  it.each([
    ["consent", "*/api/v1/trigo/consent", Consent],
    ["conversations", "*/api/v1/trigo/conversations", Conversations],
    ["a conversation", "*/api/v1/trigo/conversations/:id", Chat],
  ])("the %s read reads the session again", async (_, route, Probe) => {
    server.use(http.get(route, signedOut));
    const { client } = renderWithQuery(<Probe />);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.session() }),
    );
  });

  it("leaves the session alone on any other refusal", async () => {
    server.use(
      http.get("*/api/v1/trigo/consent", () =>
        HttpResponse.json(
          { error: { code: "forbidden", message: "Not for you." } },
          { status: 403 },
        ),
      ),
    );
    const { client } = renderWithQuery(<Consent />);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await waitFor(() =>
      expect(client.getQueryState(qk.trigoConsent())?.status).toBe("error"),
    );
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: qk.session() });
  });
});
