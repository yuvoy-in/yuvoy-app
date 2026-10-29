import { describe, it, expect, vi } from "vitest";
import { decidedPlanView, openPlanView } from "../../../mocks/plan-fixtures";
import {
  planLinkFor,
  shareMessage,
  sharePlan,
  whatsAppUrl,
} from "./guest-share";

/**
 * Share on the guest page (yuvoy-mobile#373): the share sheet first, and
 * WhatsApp only without one; the link is the plan's own, never the page's
 * address with whatever query it carries.
 */

const TOKEN = `yp_${"T".repeat(40)}a-_`;
const LINK = planLinkFor("https://app.yuvoy.in", TOKEN);
const SHARE = { title: "Dinner at the beach shack", message: "Dinner. Soon.", link: LINK };

describe("what is shared", () => {
  it("is the plan's link on this origin, the token after the #", () => {
    expect(LINK).toBe(`https://app.yuvoy.in/p/#${TOKEN}`);
  });

  it("says when, in the plan's zone, once a time is picked", () => {
    expect(shareMessage(decidedPlanView())).toBe(
      "Dinner at the beach shack. Sat, 22 Aug, 19:00. Reply here, no app needed:",
    );
  });

  it("says friends are choosing before that", () => {
    expect(shareMessage(openPlanView())).toBe(
      "Dinner at the beach shack. Friends are choosing a time. Reply here, no app needed:",
    );
  });

  it("goes to WhatsApp as one message, words then link", () => {
    expect(whatsAppUrl("Hi.", LINK)).toBe(
      `https://wa.me/?text=${encodeURIComponent(`Hi. ${LINK}`)}`,
    );
  });
});

describe("sharing", () => {
  it("uses the share sheet when there is one, and opens nothing else", async () => {
    const share = vi.fn(async () => {});
    const open = vi.fn(() => null);
    expect(await sharePlan(SHARE, { share }, open)).toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title: SHARE.title,
      text: SHARE.message,
      url: LINK,
    });
    expect(open).not.toHaveBeenCalled();
  });

  it("does nothing more when the share sheet is closed", async () => {
    const share = vi.fn(async () => {
      throw new DOMException("closed", "AbortError");
    });
    const open = vi.fn(() => null);
    expect(await sharePlan(SHARE, { share }, open)).toBe("closed");
    expect(open).not.toHaveBeenCalled();
  });

  it("opens WhatsApp when there is no share sheet, or it refused", async () => {
    const open = vi.fn(() => null);
    expect(await sharePlan(SHARE, undefined, open)).toBe("whatsapp");
    const refused = vi.fn(async () => {
      throw new DOMException("no", "NotAllowedError");
    });
    expect(await sharePlan(SHARE, { share: refused }, open)).toBe("whatsapp");
    expect(open).toHaveBeenCalledWith(whatsAppUrl(SHARE.message, LINK));
  });
});
