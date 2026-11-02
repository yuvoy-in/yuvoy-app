import { describe, it, expect } from "vitest";
import { YuvoyError } from "@/lib/api/errors";
import { signInFailure } from "./sign-in-failure";

/**
 * What a refused sign-in says (yuvoy-app#229): the email door's answers, and
 * the two that are steps rather than failures.
 */

const refusal = (
  status: number,
  code: string,
  message = "No",
  details?: Record<string, unknown>,
) => new YuvoyError({ status, code, message, details });

const email = { way: "email", stage: "entry" } as const;
const phone = { way: "phone", stage: "entry" } as const;

describe("the email door's failures", () => {
  it("offers the number when the door is shut", () => {
    const said = signInFailure(
      refusal(
        503,
        "sign_in_unavailable",
        "Signing in this way is not open yet.",
      ),
      email,
    );
    expect(said?.title).toBe("Signing in with email is closed right now");
    expect(said?.offer).toBe("use-number");
    expect(said?.field).toBeUndefined();
  });

  it("prints the API's sentence on a 429 for an address", () => {
    expect(
      signInFailure(
        refusal(
          429,
          "rate_limited",
          "Too many codes for this address. Try again in an hour.",
        ),
        email,
      )?.body,
    ).toBe("Too many codes for this address. Try again in an hour.");
  });

  it("keeps its own words on a 429 when the API's are not a sentence", () => {
    expect(
      signInFailure(refusal(429, "rate_limited", "rate limited"), email)?.body,
    ).toMatch(/^We have stopped sending codes to this address/);
  });

  it("prints the API's hour sentence on a 429 for a number too", () => {
    expect(
      signInFailure(
        refusal(429, "rate_limited", "Too many tries. Try again in an hour."),
        phone,
      )?.body,
    ).toBe("Too many tries. Try again in an hour.");
    expect(
      signInFailure(refusal(429, "rate_limited", "rate limited"), phone)?.body,
    ).toMatch(/^We have stopped sending codes to this number for a while\./);
  });

  it("puts a bad address on the email field", () => {
    const said = signInFailure(refusal(400, "invalid_input"), email);
    expect(said?.field).toBe("email");
    expect(said?.body).toMatch(/name@example\.com/);
  });

  it("says email, not number, when it cannot connect", () => {
    expect(signInFailure(new Error("offline"), email)?.body).toMatch(
      /not your email/,
    );
    expect(signInFailure(new Error("offline"), phone)?.body).toMatch(
      /not your number/,
    );
  });
});

describe("answers that are steps, not failures", () => {
  it("says nothing for under_age_sign_up, which ends on the under step", () => {
    expect(
      signInFailure(refusal(403, "under_age_sign_up"), {
        way: "email",
        stage: "year",
      }),
    ).toBeNull();
  });

  it("says nothing when the code step is asked for the year", () => {
    expect(
      signInFailure(
        refusal(400, "invalid_input", "x", {
          birthYear: "Tell us the year you were born.",
        }),
        { way: "email", stage: "code" },
      ),
    ).toBeNull();
  });

  it("puts the API's sentence on the birthday field on the year step", () => {
    const said = signInFailure(
      refusal(400, "invalid_input", "x", {
        birthdayPassed: "Tell us whether you have had your birthday this year.",
      }),
      { way: "phone", stage: "year" },
    );
    expect(said).toEqual({
      title: "One more answer",
      body: "Tell us whether you have had your birthday this year.",
      field: "birthday",
    });
  });

  it("does not read a code 400 on the year step as an address problem", () => {
    const said = signInFailure(refusal(400, "invalid_input"), {
      way: "email",
      stage: "year",
    });
    expect(said?.title).toBe("That does not look like the code");
    // The year step draws no code field, so it is said in the panel.
    expect(said?.field).toBeUndefined();
  });
});
