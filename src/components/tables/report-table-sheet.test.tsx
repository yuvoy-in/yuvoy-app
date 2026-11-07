import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { ReportTableSheet } from "./report-table-sheet";
import { server } from "../../../mocks/server";
import { __signInAppRouteMock } from "../../../mocks/app-route-handlers";
import { TABLE_ID } from "../../../mocks/fixtures";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/**
 * Reporting a table (yuvoy-app#194).
 *
 * The server reads the body strictly, so what matters is exactly what is
 * sent: three fields at most, trimmed, the optional two left out when empty,
 * and nothing at all until a reason is picked.
 */

/** Keeps each body sent, and answers with `respond`. */
function reports(
  respond: () => Response = () => new HttpResponse(null, { status: 202 }),
) {
  const bodies: unknown[] = [];
  server.use(
    http.post(`${BASE}/tables/:id/reports`, async ({ request }) => {
      bodies.push(await request.json());
      return respond();
    }),
  );
  return bodies;
}

function open() {
  __signInAppRouteMock();
  return renderWithQuery(<ReportTableSheet id={TABLE_ID} onClose={() => {}} />);
}

afterEach(() => cleanup());

describe("reporting a table", () => {
  it("sends nothing until a reason is picked", async () => {
    const bodies = reports();
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Send report" }));
    expect(
      await screen.findByText("Pick what it is about."),
    ).toBeInTheDocument();
    expect(bodies).toEqual([]);
  });

  it("sends the reason alone when nothing else is typed", async () => {
    const bodies = reports();
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Spam" }));
    await user.click(screen.getByRole("button", { name: "Send report" }));

    await waitFor(() => expect(bodies).toEqual([{ reason: "spam" }]));
  });

  it("sends the three fields, trimmed, and no other", async () => {
    const bodies = reports();
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Harassment" }));
    await user.type(
      screen.getByLabelText("Who is it about? (first name, optional)"),
      "  Ravi  ",
    );
    await user.type(
      screen.getByLabelText("Anything else we should know (optional)"),
      "  He kept asking for my number.  ",
    );
    await user.click(screen.getByRole("button", { name: "Send report" }));

    await waitFor(() =>
      expect(bodies).toEqual([
        {
          reason: "harassment",
          personName: "Ravi",
          note: "He kept asking for my number.",
        },
      ]),
    );
  });

  it("holds the two boxes to the contract's lengths", () => {
    open();
    expect(
      screen.getByLabelText("Who is it about? (first name, optional)"),
    ).toHaveAttribute("maxLength", "30");
    expect(
      screen.getByLabelText("Anything else we should know (optional)"),
    ).toHaveAttribute("maxLength", "300");
  });

  it("says who reads it once it is in", async () => {
    reports();
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Something else" }));
    await user.click(screen.getByRole("button", { name: "Send report" }));

    expect(
      await screen.findByText(
        "Thanks. A person at Yuvoy reads every report within one working day.",
      ),
    ).toBeInTheDocument();
  });

  it("asks for it again in a moment when sent too fast", async () => {
    // A 429 with no Retry-After: no countdown to show.
    reports(() =>
      HttpResponse.json(
        { error: { code: "rate_limited", message: "Too fast." } },
        { status: 429 },
      ),
    );
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Unsafe" }));
    await user.click(screen.getByRole("button", { name: "Send report" }));

    expect(
      await screen.findByText(
        "That was sent too fast. Send it again in a moment.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/within one working day/)).toBeNull();
  });
});
