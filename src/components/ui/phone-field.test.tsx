import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhoneField, splitDial, DEFAULT_DIAL_CODE } from "./phone-field";

afterEach(cleanup);

/**
 * The number field, with `+91` already in it — yuvoy-app#32, #34.
 *
 * It was a free-text field with a `+91…` PLACEHOLDER, which is a hint rather
 * than a value: it vanishes on the first keystroke, so somebody typing
 * `9000000000` sent a number with no country code and the API refused it with
 * a message about E.164.
 */
describe("splitDial", () => {
  it("takes the longest matching code, not the first", () => {
    /*
      `+1` is a prefix of `+91`. A shortest-first scan reads `+919000000000`
      as the United States and leaves a stray `9` on the front of the national
      number — a wrong country on a booking confirmation, and a number that
      cannot be dialled.
    */
    expect(splitDial("+919000000000")).toEqual({
      code: "+91",
      national: "9000000000",
    });
    expect(splitDial("+15551234567")).toEqual({
      code: "+1",
      national: "5551234567",
    });
  });

  it("falls back to the default for a code it does not offer", () => {
    // Not silently mangled into a wrong country: the digits survive and the
    // traveller can see and change the code.
    expect(splitDial("+35312345678").code).toBe(DEFAULT_DIAL_CODE);
  });

  it("reads an empty value as the default and nothing typed", () => {
    expect(splitDial("")).toEqual({ code: DEFAULT_DIAL_CODE, national: "" });
  });
});

describe("PhoneField", () => {
  it("hands up E.164, never the two halves", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PhoneField label="WhatsApp number" value="" onChange={onChange} />);

    await user.type(screen.getByLabelText("WhatsApp number"), "9");
    expect(onChange).toHaveBeenLastCalledWith("+919");
  });

  it("drops everything that is not a digit", async () => {
    /*
      `90000 00000` and `(900) 000-0000` are the same number and the API takes
      exactly one spelling of it. Cleaning at the field means no caller has to
      remember to.

      Driven through a stateful host, because the field is controlled: with a
      fixed `value` every keystroke would be typed into an empty field and the
      test would prove one character at a time rather than the accumulation.
    */
    function Host() {
      const [value, setValue] = useState("");
      return (
        <>
          <PhoneField
            label="WhatsApp number"
            value={value}
            onChange={setValue}
          />
          <output>{value}</output>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Host />);

    await user.type(screen.getByLabelText("WhatsApp number"), "9 0-0(0)");
    expect(screen.getByRole("status")).toHaveTextContent("+919000");
  });

  it("keeps the digits when the country changes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PhoneField
        label="WhatsApp number"
        value="+919000000000"
        onChange={onChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Country code"), "+44");
    expect(onChange).toHaveBeenLastCalledWith("+449000000000");
  });

  it("answers an empty national part with an empty value, not a bare code", () => {
    // `+91` alone is not a number, and handing it up would let a form treat a
    // blank field as filled in.
    const onChange = vi.fn();
    render(
      <PhoneField label="WhatsApp number" value="+91" onChange={onChange} />,
    );
    expect(screen.getByLabelText("WhatsApp number")).toHaveValue("");
  });

  it("defaults to India", () => {
    render(<PhoneField label="WhatsApp number" value="" onChange={() => {}} />);
    expect(screen.getByLabelText("Country code")).toHaveValue("+91");
  });
});
