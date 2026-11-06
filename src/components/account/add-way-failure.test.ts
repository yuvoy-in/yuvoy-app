import { describe, it, expect } from "vitest";
import { YuvoyError } from "@/lib/api/errors";
import { StalledError } from "@/lib/api/deadline";
import { addWayFailure, isPlainUnauthorized } from "./add-way-failure";

/**
 * What a refused add says on Ways in (yuvoy-app#229): the add-only answers
 * in the mobile app's words, then the sign-in's own for the rest.
 */

const refusal = (
  status: number,
  code: string,
  message = "No",
  details?: Record<string, unknown>,
) => new YuvoyError({ status, code, message, details });

const kinds = [
  { way: "email", what: "address", one: "an email" },
  { way: "phone", what: "number", one: "a number" },
] as const;

describe("addWayFailure, the add-only answers", () => {
  for (const { way, what, one } of kinds) {
    it(`409 identity_taken offers another ${what}`, () => {
      expect(
        addWayFailure(
          refusal(
            409,
            "identity_taken",
            "That already signs in to another account. Sign in with it there instead.",
          ),
          { way, stage: "code" },
        ),
      ).toEqual({
        title: `That ${what} is taken`,
        body: `That ${what} already signs in to another Yuvoy account. Nothing was changed.`,
        action: "change",
      });
    });

    it(`409 identity_kind_taken closes, naming ${one}`, () => {
      expect(
        addWayFailure(
          refusal(
            409,
            "identity_kind_taken",
            "This account already has one. An account holds one number and one email.",
          ),
          { way, stage: "code" },
        ),
      ).toEqual({
        title: "Nothing was added",
        body: `This account already has ${one}.`,
        action: "close",
      });
    });

    it(`401 fresh_sign_in_required offers signing out (${way})`, () => {
      expect(
        addWayFailure(
          refusal(
            401,
            "fresh_sign_in_required",
            "Sign in again, then add this.",
          ),
          { way, stage: "code" },
        ),
      ).toEqual({
        title: "Sign in again first",
        body: "Please sign in again, then add it.",
        action: "sign-out",
      });
    });

    it(`503 sign_in_unavailable says adding is closed (${way})`, () => {
      expect(
        addWayFailure(
          refusal(
            503,
            "sign_in_unavailable",
            "Signing in this way is not open yet. Sign in with your WhatsApp number.",
          ),
          { way, stage: "entry" },
        ),
      ).toEqual({
        title: "Adding a way in is closed right now",
        body: "Nothing was changed. Try again later.",
        action: "close",
      });
    });
  }

  it("is null when nothing went wrong", () => {
    expect(addWayFailure(null, { way: "email", stage: "code" })).toBeNull();
  });
});

describe("addWayFailure, the code and the connection", () => {
  it("puts a plain 401 on the code field", () => {
    const said = addWayFailure(
      refusal(
        401,
        "unauthorized",
        "That code did not work. Ask for a new one.",
      ),
      { way: "email", stage: "code" },
    );
    expect(said?.field).toBe("code");
    expect(said?.title).toBe("That code did not work");
    expect(said?.action).toBeUndefined();
  });

  it("says it could not confirm a code that stalled", () => {
    for (const error of [new StalledError(30_000), new TypeError("fetch")]) {
      const said = addWayFailure(error, { way: "phone", stage: "code" });
      expect(said?.title).toBe("We could not confirm that");
      expect(said?.body).toMatch(/Ways in shows it if it was added\./);
      expect(said?.field).toBeUndefined();
      expect(said?.action).toBeUndefined();
    }
  });

  it("does not say so for a stall before any code went", () => {
    const said = addWayFailure(new StalledError(30_000), {
      way: "email",
      stage: "entry",
    });
    expect(said?.title).toBe("We could not connect");
    // The sign-in's "Go to my trips" is not this panel's to offer.
    expect(said?.action).toBeUndefined();
  });
});

describe("addWayFailure, the sign-in's shared words", () => {
  it("429: too many tries, in the API's sentence", () => {
    const said = addWayFailure(
      refusal(429, "rate_limited", "Too many tries. Try again in an hour."),
      { way: "phone", stage: "code" },
    );
    expect(said?.title).toBe("Too many tries");
    expect(said?.body).toBe("Too many tries. Try again in an hour.");
  });

  it("403 account_deletion_pending: the API's sentence, with no sign-in control", () => {
    const said = addWayFailure(
      refusal(
        403,
        "account_deletion_pending",
        "This account is being closed. Contact support if that was a mistake.",
      ),
      { way: "email", stage: "code" },
    );
    expect(said?.title).toBe("This account is being closed");
    expect(said?.body).toBe(
      "This account is being closed. Contact support if that was a mistake.",
    );
    expect(said).not.toHaveProperty("action");
    expect(said).not.toHaveProperty("offer");
  });

  it("400 with details.email: on the address field", () => {
    const said = addWayFailure(
      refusal(
        400,
        "invalid_input",
        "Enter an email address, like name@example.com.",
        { email: "Enter an email address, like name@example.com." },
      ),
      { way: "email", stage: "entry" },
    );
    expect(said).toEqual({
      title: "That email did not go through",
      body: "That email looks incomplete. It should look like name@example.com.",
      field: "email",
    });
  });
});

describe("isPlainUnauthorized", () => {
  it("is true for a 401 unauthorized", () => {
    expect(
      isPlainUnauthorized(
        refusal(
          401,
          "unauthorized",
          "That code did not work. Ask for a new one.",
        ),
      ),
    ).toBe(true);
  });

  it("is false for fresh_sign_in_required, a 409 and a non-Yuvoy error", () => {
    expect(isPlainUnauthorized(refusal(401, "fresh_sign_in_required"))).toBe(
      false,
    );
    expect(isPlainUnauthorized(refusal(409, "identity_taken"))).toBe(false);
    expect(isPlainUnauthorized(new TypeError("Failed to fetch"))).toBe(false);
    expect(isPlainUnauthorized(new StalledError(30_000))).toBe(false);
  });
});
