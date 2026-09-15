import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { InviteGuests } from "./invite-guests";
import { server } from "../../../mocks/server";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/**
 * Offering a place in the party (yuvoy-app#38 items 6 and 12).
 *
 * The rule worth defending is the count: "Live invitations (invited or joined)
 * may not exceed the party size less the booker", and `maxGuests` is that
 * number. Every test here that touches it uses the server's value rather than
 * counting rows, because a client-side count is a second copy of a rule the
 * API owns and gets the declined case wrong.
 */

const guests = (
  rows: Record<string, unknown>[],
  maxGuests = 2,
): ReturnType<typeof http.get> =>
  http.get(`${BASE}/bookings/invites`, () =>
    HttpResponse.json({ guests: rows, maxGuests }),
  );

afterEach(cleanup);

describe("who is coming", () => {
  it("lists a guest by name, and an unopened link as what it is", async () => {
    /*
      "At most one of `name` and `phoneMasked`; a link nobody accepted has
      neither." A row with neither would otherwise render as a blank line with
      a chip floating beside it.
    */
    server.use(
      guests([
        {
          id: "g1",
          name: "Ravi",
          state: "joined",
          delivery: "not_applicable",
          createdAt: "2026-08-20T00:00:00Z",
        },
        {
          id: "g2",
          phoneMasked: "••• 4321",
          state: "invited",
          delivery: "not_sent_no_channel",
          createdAt: "2026-08-20T00:00:00Z",
        },
      ]),
    );

    renderWithQuery(<InviteGuests token="tok" />);
    expect(await screen.findByText("Ravi")).toBeInTheDocument();
    expect(screen.getByText("Joined")).toBeInTheDocument();
    expect(screen.getByText("••• 4321")).toBeInTheDocument();
    expect(screen.getByText("Invited")).toBeInTheDocument();
  });

  it("names a link nobody has opened", async () => {
    server.use(
      guests([
        {
          id: "g3",
          state: "invited",
          delivery: "not_applicable",
          createdAt: "2026-08-20T00:00:00Z",
        },
      ]),
    );
    renderWithQuery(<InviteGuests token="tok" />);
    expect(await screen.findByText("A link you shared")).toBeInTheDocument();
  });

  it("keeps a declined invitation listed, so the booker knows", async () => {
    // "Declined invitations stay, so the booker knows." Dropping them would
    // leave somebody wondering whether the invitation ever arrived.
    server.use(
      guests([
        {
          id: "g4",
          name: "Ravi",
          state: "declined",
          delivery: "not_applicable",
          createdAt: "2026-08-20T00:00:00Z",
        },
      ]),
    );
    renderWithQuery(<InviteGuests token="tok" />);
    expect(await screen.findByText("Declined")).toBeInTheDocument();
  });
});

describe("inviting", () => {
  it("sends the number and offers the link to pass on", async () => {
    /*
      `delivery: not_sent_no_channel` is what the API answers today, because
      there is no WhatsApp sender. So the booker has to deliver it, and the
      copy has to say so rather than implying we messaged somebody.
    */
    let body: Record<string, unknown> | null = null;
    server.use(
      guests([]),
      http.post(`${BASE}/bookings/invites`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            id: "g9",
            state: "invited",
            delivery: "not_sent_no_channel",
            inviteUrl: "https://app.yuvoy.in/i/tok_invite",
          },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<InviteGuests token="tok" />);

    const field = await screen.findByLabelText("Invite by number");
    await user.type(field, "9000000001");
    await user.click(screen.getByRole("button", { name: "Invite" }));

    expect(await screen.findByText(/Saved\./)).toBeInTheDocument();
    expect(body).toEqual({ phone: "+919000000001" });
    expect(
      screen.getByRole("button", { name: "Copy link" }),
    ).toBeInTheDocument();
  });

  it("never prints the invitation link", async () => {
    /*
      Item 8, and it matters more here than anywhere: whoever opens this link
      TAKES the place. A printed one is a screenshot away from a stranger.
    */
    server.use(
      guests([]),
      http.post(`${BASE}/bookings/invites`, () =>
        HttpResponse.json(
          {
            id: "g9",
            state: "invited",
            delivery: "not_sent_no_channel",
            inviteUrl: "https://app.yuvoy.in/i/tok_secret",
          },
          { status: 201 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(<InviteGuests token="tok" />);
    await user.type(
      await screen.findByLabelText("Invite by number"),
      "9000000001",
    );
    await user.click(screen.getByRole("button", { name: "Invite" }));

    await screen.findByText(/Saved\./);
    expect(document.body.textContent).not.toContain("tok_secret");
  });

  it("says we are messaging them when a sender exists", async () => {
    server.use(
      guests([]),
      http.post(`${BASE}/bookings/invites`, () =>
        HttpResponse.json(
          {
            id: "g9",
            state: "invited",
            delivery: "queued",
            inviteUrl: "https://app.yuvoy.in/i/x",
          },
          { status: 201 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(<InviteGuests token="tok" />);
    await user.type(
      await screen.findByLabelText("Invite by number"),
      "9000000001",
    );
    await user.click(screen.getByRole("button", { name: "Invite" }));

    expect(
      await screen.findByText(/We are messaging them on WhatsApp/),
    ).toBeInTheDocument();
  });

  it("shows the server's own sentence when it refuses", async () => {
    server.use(
      guests([]),
      http.post(`${BASE}/bookings/invites`, () =>
        HttpResponse.json(
          {
            error: {
              code: "conflict",
              message: "Every place is already offered.",
            },
          },
          { status: 409 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(<InviteGuests token="tok" />);
    await user.type(
      await screen.findByLabelText("Invite by number"),
      "9000000001",
    );
    await user.click(screen.getByRole("button", { name: "Invite" }));

    expect(
      await screen.findByText("Every place is already offered."),
    ).toBeInTheDocument();
  });
});

describe("the count rule", () => {
  it("stops offering places once the party is full", async () => {
    server.use(
      guests(
        [
          {
            id: "g1",
            name: "Ravi",
            state: "joined",
            delivery: "not_applicable",
            createdAt: "2026-08-20T00:00:00Z",
          },
          {
            id: "g2",
            phoneMasked: "••• 4321",
            state: "invited",
            delivery: "not_sent_no_channel",
            createdAt: "2026-08-20T00:00:00Z",
          },
        ],
        2,
      ),
    );

    renderWithQuery(<InviteGuests token="tok" />);
    expect(
      await screen.findByText("Everyone in your party has a place."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Invite by number")).toBeNull();
  });

  it("does not count a declined invitation against the party", async () => {
    /*
      "Declined and removed invitations do not use a place." Counting rows
      instead of live ones would lock a booker out of re-inviting somebody who
      said no, which is the commonest reason to invite again.
    */
    server.use(
      guests(
        [
          {
            id: "g1",
            name: "Ravi",
            state: "joined",
            delivery: "not_applicable",
            createdAt: "2026-08-20T00:00:00Z",
          },
          {
            id: "g2",
            name: "Sam",
            state: "declined",
            delivery: "not_applicable",
            createdAt: "2026-08-20T00:00:00Z",
          },
        ],
        2,
      ),
    );

    renderWithQuery(<InviteGuests token="tok" />);
    expect(
      await screen.findByLabelText("Invite by number"),
    ).toBeInTheDocument();
  });

  it("renders nothing at all for a party of one", async () => {
    // `maxGuests` is the party size less the booker, so one means nobody to
    // invite. A panel with a permanently disabled field is a control that can
    // never be used.
    server.use(guests([], 0));
    const { container } = renderWithQuery(<InviteGuests token="tok" />);
    await waitFor(() => expect(container.textContent).not.toMatch(/Invite/));
  });
});

describe("removing", () => {
  it("withdraws an invitation and refetches the list", async () => {
    let removed: string | null = null;
    let calls = 0;
    server.use(
      http.get(`${BASE}/bookings/invites`, () => {
        calls += 1;
        return HttpResponse.json({
          guests:
            calls === 1
              ? [
                  {
                    id: "g1",
                    name: "Ravi",
                    state: "invited",
                    delivery: "not_applicable",
                    createdAt: "2026-08-20T00:00:00Z",
                  },
                ]
              : [],
          maxGuests: 2,
        });
      }),
      http.delete(`${BASE}/bookings/invites/:id`, ({ params }) => {
        removed = String(params.id);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<InviteGuests token="tok" />);

    const row = (await screen.findByText("Ravi")).closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(removed).toBe("g1"));
    await waitFor(() => expect(screen.queryByText("Ravi")).toBeNull());
  });
});
