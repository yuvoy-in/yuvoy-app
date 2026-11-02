import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { renderWithQuery } from "@/test/render";
import { CheckoutForm } from "./checkout-form";
import { EXPERIENCE_DETAIL, availabilityFor } from "../../../mocks/fixtures";
import { server } from "../../../mocks/server";

/**
 * A `400` naming `contact.whatsapp` lands on the number field (yuvoy-app#229,
 * api-r1's low 2). "required" is a key, not a sentence, so it gets ours; any
 * other value is the API's sentence and is shown as sent.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

vi.mock("next/navigation", () => ({
  usePathname: () => "/e/mangrove-kayak-at-dawn/book",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const kayak = EXPERIENCE_DETAIL["mangrove-kayak-at-dawn"];
const kayakSlot = availabilityFor("mangrove-kayak-at-dawn")[0];

/** `POST /reservations` refuses the number with `said`. */
function refuseNumber(said: string) {
  server.use(
    http.post(`${BASE}/reservations`, () =>
      HttpResponse.json(
        {
          error: {
            code: "validation_failed",
            message: "Check the details and try again.",
            details: { "contact.whatsapp": said },
            requestId: "req_phone",
          },
        },
        { status: 400 },
      ),
    ),
  );
}

async function book() {
  const user = userEvent.setup();
  renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
  await user.type(await screen.findByLabelText("Your name"), "Asha Menon");
  await user.type(screen.getByLabelText("WhatsApp number"), "+919000000000");
  await user.click(screen.getByRole("checkbox", { name: /called off/i }));
  await user.click(screen.getByRole("button", { name: /^book now/i }));
}

describe("the number refused at checkout", () => {
  it('"required" shows our sentence on the field', async () => {
    refuseNumber("required");
    await book();

    expect(
      await screen.findByText(
        "Add a WhatsApp number so we can send your booking.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("required")).toBeNull();
    expect(screen.getByLabelText("WhatsApp number")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("any other value is the API's sentence, shown as sent", async () => {
    const said = "That number cannot get WhatsApp messages.";
    refuseNumber(said);
    await book();

    expect(await screen.findByText(said)).toBeInTheDocument();
    expect(screen.getByLabelText("WhatsApp number")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
