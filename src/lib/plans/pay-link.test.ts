import { describe, it, expect } from "vitest";
import { checkedPayLink, upiAmount } from "./pay-link";

/**
 * The pay link check (yuvoy-app#193). Money between people: every way a link
 * can disagree with the UPI ID and the amount printed beside it must end in
 * no button, and the honest link must come back exactly as it was sent.
 */

const payee = { upiId: "asha.k@okaxis" };
const SHARE = 25000; // ₹250

/**
 * The link as the API writes it (internal/upi/upi.go): Go's
 * `url.QueryEscape` with spaces as `%20`. `encodeURIComponent` escapes the
 * same characters for every value used here.
 */
function apiLink(
  over: Partial<Record<"pa" | "pn" | "am" | "cu" | "tn", string>> = {},
): string {
  const v = {
    pa: payee.upiId,
    pn: "Asha K",
    am: "250.00",
    cu: "INR",
    tn: "Board games at Asha's: Pizza",
    ...over,
  };
  const enc = encodeURIComponent;
  return `upi://pay?pa=${enc(v.pa)}&pn=${enc(v.pn)}&am=${v.am}&cu=${v.cu}&tn=${enc(v.tn)}`;
}

describe("upiAmount", () => {
  it("writes paise as the API's %d.%02d, without dividing", () => {
    expect(upiAmount(25000)).toBe("250.00");
    expect(upiAmount(25050)).toBe("250.50");
    expect(upiAmount(25005)).toBe("250.05");
    expect(upiAmount(5)).toBe("0.05");
    expect(upiAmount(99)).toBe("0.99");
    expect(upiAmount(100)).toBe("1.00");
    expect(upiAmount(0)).toBe("0.00");
  });

  it("has no answer for a part paisa or a negative amount", () => {
    expect(upiAmount(250.5)).toBeNull();
    expect(upiAmount(-100)).toBeNull();
    expect(upiAmount(Number.NaN)).toBeNull();
  });
});

describe("checkedPayLink: the honest link", () => {
  it("returns the API's link exactly as sent", () => {
    const link = apiLink();
    expect(checkedPayLink(link, payee, SHARE)).toBe(link);
  });

  it("matches a UPI ID the API had to escape", () => {
    // `@` arrives as `%40` from Go; a plus in an ID arrives as `%2B`.
    const odd = { upiId: "asha+k@okaxis" };
    const link = apiLink({ pa: odd.upiId });
    expect(link).toContain("pa=asha%2Bk%40okaxis");
    expect(checkedPayLink(link, odd, SHARE)).toBe(link);
  });

  it("takes a link with no cu", () => {
    const link = `upi://pay?pa=${encodeURIComponent(payee.upiId)}&am=250.00`;
    expect(checkedPayLink(link, payee, SHARE)).toBe(link);
  });

  it("takes a share with paise in it", () => {
    const link = apiLink({ am: "83.33" });
    expect(checkedPayLink(link, payee, 8333)).toBe(link);
  });

  it("does not compare the name or the note", () => {
    const link = apiLink({ pn: "Someone else", tn: "anything" });
    expect(checkedPayLink(link, payee, SHARE)).toBe(link);
  });
});

describe("checkedPayLink: nothing to check against", () => {
  it("refuses with no link", () => {
    expect(checkedPayLink(undefined, payee, SHARE)).toBeNull();
    expect(checkedPayLink("", payee, SHARE)).toBeNull();
  });

  it("refuses with no payee, or a payee with no UPI ID", () => {
    expect(checkedPayLink(apiLink(), undefined, SHARE)).toBeNull();
    expect(checkedPayLink(apiLink(), { upiId: "" }, SHARE)).toBeNull();
  });

  it("refuses a zero, negative or part paisa share", () => {
    expect(checkedPayLink(apiLink({ am: "0.00" }), payee, 0)).toBeNull();
    expect(checkedPayLink(apiLink(), payee, -25000)).toBeNull();
    expect(checkedPayLink(apiLink(), payee, 25000.5)).toBeNull();
  });
});

describe("checkedPayLink: another scheme", () => {
  it.each([
    ["collect", apiLink().replace("upi://pay?", "upi://collect?")],
    ["capitals", apiLink().replace("upi://pay?", "UPI://PAY?")],
    ["capital scheme only", apiLink().replace("upi://", "UPI://")],
    ["https", apiLink().replace("upi://pay?", "https://pay.example/?")],
    ["intent", apiLink().replace("upi://pay?", "intent://pay?")],
    ["tez", apiLink().replace("upi://pay?", "tez://upi/pay?")],
    ["leading space", ` ${apiLink()}`],
    ["no query", "upi://pay"],
    ["path after pay", apiLink().replace("upi://pay?", "upi://pay/x?")],
  ])("refuses %s", (_, link) => {
    expect(checkedPayLink(link, payee, SHARE)).toBeNull();
  });
});

describe("checkedPayLink: pa is not the payee", () => {
  it.each([
    ["another ID", "ravi@okaxis"],
    ["another case", "Asha.K@okaxis"],
    ["a trailing space", "asha.k@okaxis "],
    ["a leading space", " asha.k@okaxis"],
    ["a longer ID", "asha.k@okaxis.evil"],
    ["empty", ""],
  ])("refuses %s", (_, pa) => {
    expect(checkedPayLink(apiLink({ pa }), payee, SHARE)).toBeNull();
  });

  it("refuses a link with no pa at all", () => {
    const link = "upi://pay?pn=Asha&am=250.00&cu=INR";
    expect(checkedPayLink(link, payee, SHARE)).toBeNull();
  });
});

describe("checkedPayLink: am is not the share", () => {
  it.each([
    ["no decimals", "250"],
    ["one decimal", "250.0"],
    ["three decimals", "250.000"],
    ["a rupee more", "251.00"],
    ["a paisa less", "249.99"],
    ["paise as rupees", "25000.00"],
    ["a leading zero", "0250.00"],
    ["a comma", "250%2C00"],
    ["a plus", "%2B250.00"],
    ["empty", ""],
  ])("refuses %s", (_, am) => {
    expect(checkedPayLink(apiLink({ am }), payee, SHARE)).toBeNull();
  });

  it("refuses a link with no am at all", () => {
    const link = `upi://pay?pa=${encodeURIComponent(payee.upiId)}&cu=INR`;
    expect(checkedPayLink(link, payee, SHARE)).toBeNull();
  });
});

describe("checkedPayLink: cu is not INR", () => {
  it.each([["USD"], ["inr"], [""]])("refuses cu=%s", (cu) => {
    expect(checkedPayLink(apiLink({ cu }), payee, SHARE)).toBeNull();
  });
});

describe("checkedPayLink: extra or repeated parameters", () => {
  it.each([
    ["a second pa", `${apiLink()}&pa=ravi%40okaxis`],
    ["a second am", `${apiLink()}&am=1.00`],
    ["a second pa that matches", `${apiLink()}&pa=asha.k%40okaxis`],
    ["PA beside pa", `${apiLink()}&PA=ravi%40okaxis`],
    ["Am beside am", `${apiLink()}&Am=1.00`],
    ["a minimum amount", `${apiLink()}&mam=1.00`],
    ["a transaction ref", `${apiLink()}&tr=ORDER1`],
    ["a merchant code", `${apiLink()}&mc=5411`],
    ["a url", `${apiLink()}&url=https%3A%2F%2Fexample.com`],
    ["a mode", `${apiLink()}&mode=02`],
    ["a signature", `${apiLink()}&sign=abc`],
  ])("refuses %s", (_, link) => {
    expect(checkedPayLink(link, payee, SHARE)).toBeNull();
  });

  it("refuses the right pa under a capitalised name", () => {
    const link = apiLink().replace("pa=", "PA=");
    expect(checkedPayLink(link, payee, SHARE)).toBeNull();
  });
});

describe("checkedPayLink: a link the API could not have written", () => {
  it.each([
    ["an empty part", apiLink().replace("&pn=", "&&pn=")],
    ["a trailing &", `${apiLink()}&`],
    ["a part with no =", `${apiLink()}&pa`],
    ["a part with no name", `${apiLink()}&=x`],
    ["bad percent encoding", apiLink({ tn: "x" }).replace("tn=x", "tn=%E0%A4")],
    ["a lone %", apiLink({ tn: "x" }).replace("tn=x", "tn=100%")],
    ["a raw space", apiLink().replace("pn=Asha%20K", "pn=Asha K")],
    ["a newline", `${apiLink()}\n`],
    ["a tab", apiLink().replace("&am=", "\t&am=")],
    ["a fragment", `${apiLink()}#pa=ravi`],
    ["a non-ASCII letter", apiLink().replace("pn=Asha%20K", "pn=Āsha")],
    ["a look-alike in pa", apiLink().replace("asha.k", "аsha.k")],
  ])("refuses %s", (_, link) => {
    expect(checkedPayLink(link, payee, SHARE)).toBeNull();
  });
});
