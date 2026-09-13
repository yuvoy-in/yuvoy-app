import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { BookingQuestions } from "./booking-questions";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";
import type { components } from "@/lib/api/schema.gen";

type PartyQuestion = components["schemas"]["PartyQuestion"];

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const dived: PartyQuestion = {
  questionId: "q_dived",
  text: "Has everyone dived before?",
  answerType: "yes_no",
  required: true,
  current: true,
  answered: true,
  answer: "yes",
};
const hotel: PartyQuestion = {
  questionId: "q_hotel",
  text: "Which hotel should we collect you from?",
  answerType: "short_text",
  required: false,
  current: true,
  answered: false,
};
const retired: PartyQuestion = {
  questionId: "q_old",
  text: "Do you own a wetsuit?",
  answerType: "yes_no",
  required: false,
  current: false,
  answered: true,
  answer: "no",
};

describe("BookingQuestions", () => {
  it("shows an answer this party gave, and says plainly when one is missing", () => {
    renderWithQuery(
      <BookingQuestions
        token="t"
        questions={[dived, hotel]}
        answersOpen={false}
      />,
    );

    expect(screen.getByText("Has everyone dived before?")).toBeInTheDocument();
    expect(screen.getByText("yes")).toBeInTheDocument();
    // A skipped question reads as not answered, never as blank.
    expect(
      screen.getByText("Not answered, and this one is closed now."),
    ).toBeInTheDocument();
  });

  /*
    `answersOpen` is told rather than inferred, "so a form is never offered
    that would be refused". Once the departure has left the server answers
    `409 answers_closed`, and a Save button here would be a tap that can only
    fail.
  */
  it("offers no way to answer once answers are closed", () => {
    renderWithQuery(
      <BookingQuestions
        token="t"
        questions={[dived, hotel]}
        answersOpen={false}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /save answers/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("offers a control for every question the listing still asks", () => {
    renderWithQuery(
      <BookingQuestions token="t" questions={[dived, hotel]} answersOpen />,
    );

    // Prefilled from what is recorded, because an answer REPLACES and a
    // correction should cost no more than a first answer.
    expect(screen.getByRole("radio", { name: "Yes" })).toBeChecked();
    expect(
      screen.getByLabelText(
        "Which hotel should we collect you from? (optional)",
      ),
    ).toHaveValue("");
  });

  it("saves nothing until something has actually changed", async () => {
    renderWithQuery(
      <BookingQuestions token="t" questions={[dived, hotel]} answersOpen />,
    );

    expect(
      screen.getByRole("button", { name: /save answers/i }),
    ).toBeDisabled();

    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(
        "Which hotel should we collect you from? (optional)",
      ),
      "Sea View",
    );
    expect(screen.getByRole("button", { name: /save answers/i })).toBeEnabled();
  });

  it("sends only the answers that changed", async () => {
    let sent: unknown = null;
    server.use(
      http.post(`${BASE}/bookings/answers`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({
          questions: [dived, { ...hotel, answered: true, answer: "Sea View" }],
        });
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(
      <BookingQuestions token="t" questions={[dived, hotel]} answersOpen />,
    );

    await user.type(
      screen.getByLabelText(
        "Which hotel should we collect you from? (optional)",
      ),
      "Sea View",
    );
    await user.click(screen.getByRole("button", { name: /save answers/i }));

    // `q_dived` is left out, because "questions left out keep what they had"
    // and resending an identical answer is a write that means nothing.
    await waitFor(() =>
      expect(sent).toEqual({
        answers: [{ questionId: "q_hotel", answer: "Sea View" }],
      }),
    );
    expect(await screen.findByText(/Saved\./)).toBeInTheDocument();
  });

  /*
    A question the listing has stopped asking. `current: false` means "it
    cannot be answered again", and the answer is still this party's, so it
    stays on screen with the words they were asked and no control.
  */
  it("keeps an answer to a question the trip no longer asks, read only", () => {
    renderWithQuery(
      <BookingQuestions token="t" questions={[dived, retired]} answersOpen />,
    );

    expect(screen.getByText("Do you own a wetsuit?")).toBeInTheDocument();
    expect(screen.getByText("no")).toBeInTheDocument();
    expect(
      screen.getByText(/This trip no longer asks these/i),
    ).toBeInTheDocument();
    // One control, for the current question only.
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("says what a closed booking said, rather than 'Something went wrong'", async () => {
    server.use(
      http.post(`${BASE}/bookings/answers`, () =>
        HttpResponse.json(
          { error: { code: "answers_closed", message: "raw" } },
          { status: 409 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(
      <BookingQuestions token="t" questions={[dived, hotel]} answersOpen />,
    );

    await user.type(
      screen.getByLabelText(
        "Which hotel should we collect you from? (optional)",
      ),
      "Sea View",
    );
    await user.click(screen.getByRole("button", { name: /save answers/i }));

    expect(
      await screen.findByText("This booking is no longer taking answers"),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Something went wrong/);
  });

  it("offers a fresh link rather than a retry when the token behind it is dead", async () => {
    server.use(
      http.post(`${BASE}/bookings/answers`, () =>
        HttpResponse.json(
          { error: { code: "token_expired", message: "raw" } },
          { status: 401 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(
      <BookingQuestions token="t" questions={[dived, hotel]} answersOpen />,
    );

    await user.type(
      screen.getByLabelText(
        "Which hotel should we collect you from? (optional)",
      ),
      "Sea View",
    );
    await user.click(screen.getByRole("button", { name: /save answers/i }));

    expect(
      await screen.findByText("This link has expired"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Get a new link" }),
    ).toHaveAttribute("href", "/trips/recover");
  });
});
