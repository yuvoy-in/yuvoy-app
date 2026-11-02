import { describe, expect, it } from "vitest";
import { DOOR_WORDS as D } from "./door-words";

describe("door words", () => {
  it("keeps the phone's words for the page", () => {
    expect(D.title).toBe("Check people in");
    expect(D.entry).toBe("Check people in");
    expect(D.field).toBe("Code from their phone");
    expect(D.button).toBe("Check in");
    expect(D.tryAgain).toBe("Try again");
    expect(D.offline).toBe("No signal. Try again when the signal is back.");
  });

  it("names the person when there is a name, and says Checked in when not", () => {
    expect(D.checkedIn("Asha")).toBe("Asha is checked in");
    expect(D.checkedIn("")).toBe(D.checkedInNoName);
    expect(D.checkedInNoName).toBe("Checked in");
  });

  it("says when a code was already used, with or without its time", () => {
    expect(D.already("19:42")).toBe("Already checked in at 19:42");
    expect(D.already("")).toBe("Already checked in");
  });

  it("writes the not today line with its day", () => {
    expect(D.notToday("Sat 24 Oct")).toBe("This code is for Sat 24 Oct.");
  });

  it("keeps the API's sentences word for word", () => {
    expect(D.notFound).toBe("This code is not for one of your events.");
    expect(D.ownCode).toBe(
      "You can't check yourself in. Ask another helper at the door.",
    );
    expect(D.paused).toBe(
      "Door check-in is paused for a moment. Try again soon.",
    );
  });
});
