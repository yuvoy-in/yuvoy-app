import { describe, it, expect } from "vitest";
import { YuvoyError } from "@/lib/api/errors";
import { closedBecause, describeSendRefusal, MESSAGE_MAX } from "./messages";

function refusal(
  code: string,
  message: string,
  details: Record<string, unknown>,
  status = 400,
) {
  return new YuvoyError({ code, message, status, details });
}

describe("why a message was refused", () => {
  /*
    The load-bearing case. `invalid_input` is in CLIENT_BUGS, so describeError
    renders "Something went wrong ... trying again often fixes it" with a retry
    button - and here the same text fails again, so that is both false and a
    loop. The branch is on `details.text`, which is a token, never on prose.
  */
  it("shows the server's sentence for contact details, not the generic panel", () => {
    expect(
      describeSendRefusal(
        refusal(
          "invalid_input",
          "Messages cannot include phone numbers, email addresses or links. This one looks like it has a phone number, from seven or more digits written close together. Take the number out and send the message again.",
          { text: "contact details", contactDetail: "phone" },
        ),
      ),
    ).toMatch(/looks like it has a phone number/);
  });

  it("falls back to our own words when the API sends the code and no prose", () => {
    expect(
      describeSendRefusal(
        refusal("invalid_input", "", {
          text: "contact details",
          contactDetail: "email",
        }),
      ),
    ).toMatch(/looks like it has an email address/);

    expect(
      describeSendRefusal(
        refusal("invalid_input", "", {
          text: "contact details",
          contactDetail: "link",
        }),
      ),
    ).toMatch(/looks like it has a link/);

    expect(
      describeSendRefusal(refusal("invalid_input", "", { text: "required" })),
    ).toBe("Write something before sending.");

    expect(
      describeSendRefusal(refusal("invalid_input", "", { text: "too long" })),
    ).toMatch(new RegExp(`up to ${MESSAGE_MAX} characters`));

    expect(
      describeSendRefusal(
        refusal("invalid_input", "", { text: "unprintable" }),
      ),
    ).toMatch(/characters that cannot be shown/);
  });

  /*
    An `invalid_input` that is NOT about the text really is our bug, and has to
    keep reading as one. Dressing every 400 up as the writer's fault would tell
    somebody to fix a sentence that was never the problem.
  */
  it("leaves an invalid_input that is not about the text to describeError", () => {
    expect(describeSendRefusal(refusal("invalid_input", "raw", {}))).toBeNull();
    expect(
      describeSendRefusal(refusal("invalid_input", "raw", { text: 7 })),
    ).toBeNull();
    expect(
      describeSendRefusal(
        refusal("invalid_input", "raw", { text: "something new" }),
      ),
    ).toBeNull();
  });

  it("says which kind of closed, from the reason rather than the prose", () => {
    expect(
      describeSendRefusal(
        refusal("messages_closed", "", { reason: "cancelled" }, 409),
      ),
    ).toMatch(/cancelled, so no more messages/);
    expect(
      describeSendRefusal(
        refusal("messages_closed", "", { reason: "not_booked" }, 409),
      ),
    ).toMatch(/Messages open once the booking is made/);
  });

  it("leaves a dead link, a rate limit and an outage alone", () => {
    expect(
      describeSendRefusal(refusal("token_expired", "raw", {}, 401)),
    ).toBeNull();
    expect(
      describeSendRefusal(refusal("rate_limited", "raw", {}, 429)),
    ).toBeNull();
    expect(describeSendRefusal(new Error("network"))).toBeNull();
    expect(describeSendRefusal(undefined)).toBeNull();
  });
});

describe("why the conversation is shut", () => {
  it("says the conversation can still be read, whichever reason it is", () => {
    for (const reason of ["cancelled", "declined", "window_closed"]) {
      expect(closedBecause(reason)).toMatch(/can still be read/);
    }
  });

  it("says when messages will open, for a link with no booking behind it yet", () => {
    // Not an error: the API answers an empty, complete conversation for this.
    expect(closedBecause("not_booked")).toMatch(
      /Messages open once the booking is made/,
    );
  });

  /*
    The set is the server's and can grow without a deploy here, so an unknown
    reason must not render blank and must not guess at which of the four it
    was. It says the part that is certainly true and stops.
  */
  it("has a sentence for a reason it has never seen", () => {
    const unknown = closedBecause("some_new_reason");
    expect(unknown).toMatch(/not taking new messages/);
    expect(unknown).toMatch(/can still be read/);
    expect(unknown).not.toMatch(/some_new_reason/);
    expect(closedBecause(undefined)).toBe(unknown);
  });
});
