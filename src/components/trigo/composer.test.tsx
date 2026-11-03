import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { TRIGO_DRAFT_MAX, readDraft, type TrigoDraft } from "@/lib/trigo/keys";
import { remainingLine } from "@/lib/trigo/words";
import { Composer } from "./composer";
import { COMPOSER_LABEL, SEND, charactersLeft } from "./ui-words";

/**
 * The composer (yuvoy-app#223): 1,000 characters at most, one key per text
 * typed (kept while the text is unchanged, so a retry is the same message),
 * and focus that stays in the field through a send.
 */

function Host({
  onSend,
  sendOff = false,
  busy = false,
  remaining = null,
}: {
  onSend: (draft: TrigoDraft) => void;
  sendOff?: boolean;
  busy?: boolean;
  remaining?: number | null;
}) {
  const [value, setValue] = useState("");
  const field = useRef<HTMLTextAreaElement | null>(null);
  return (
    <Composer
      value={value}
      onChange={setValue}
      onSend={onSend}
      sendOff={sendOff}
      busy={busy}
      remaining={remaining}
      fieldRef={field}
    />
  );
}

const field = () => screen.getByLabelText(COMPOSER_LABEL);
const send = () => screen.getByRole("button", { name: SEND });

beforeEach(() => sessionStorage.clear());

describe("Trigo composer", () => {
  it("holds 1,000 characters at most and counts down near the end", () => {
    render(<Host onSend={() => {}} />);
    expect(field()).toHaveAttribute("maxLength", String(TRIGO_DRAFT_MAX));
    fireEvent.change(field(), { target: { value: "a".repeat(1005) } });
    expect(field()).toHaveValue("a".repeat(TRIGO_DRAFT_MAX));
    expect(screen.getByText(charactersLeft(0))).toBeInTheDocument();
    expect(readDraft()?.text).toHaveLength(TRIGO_DRAFT_MAX);
  });

  it("sends the same key for the same text, and a new one once it changes", async () => {
    const sent: TrigoDraft[] = [];
    render(<Host onSend={(d) => sent.push(d)} />);
    const user = userEvent.setup();
    await user.type(field(), "Best time for Hampi?");
    await user.click(send());
    await user.click(send());
    expect(sent).toHaveLength(2);
    expect(sent[0]?.key).toBe(sent[1]?.key);
    expect(sent[0]?.key).toMatch(/^trg-web-/);

    await user.type(field(), " In March");
    await user.click(send());
    expect(sent[2]?.text).toBe("Best time for Hampi? In March");
    expect(sent[2]?.key).not.toBe(sent[0]?.key);
  });

  it("keeps the text and its key for a reload", async () => {
    render(<Host onSend={() => {}} />);
    await userEvent.setup().type(field(), "Ferry to Neil");
    expect(readDraft()?.text).toBe("Ferry to Neil");
  });

  it("Enter sends, Shift+Enter is a new line", async () => {
    const onSend = vi.fn();
    render(<Host onSend={onSend} />);
    const user = userEvent.setup();
    await user.type(field(), "Line one{Shift>}{Enter}{/Shift}line two");
    expect(onSend).not.toHaveBeenCalled();
    expect(field()).toHaveValue("Line one\nline two");
    await user.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("keeps focus in the field when Send is tapped", async () => {
    render(<Host onSend={() => {}} />);
    const user = userEvent.setup();
    await user.type(field(), "Hello");
    await user.click(send());
    expect(field()).toHaveFocus();
  });

  it("turns Send off while empty, off and in flight, and never the field", () => {
    const { rerender } = render(<Host onSend={() => {}} />);
    expect(send()).toBeDisabled();
    rerender(<Host onSend={() => {}} sendOff />);
    expect(send()).toBeDisabled();
    expect(field()).toBeEnabled();
  });

  it("is read-only while a turn is out", () => {
    render(<Host onSend={() => {}} busy />);
    expect(field()).toHaveAttribute("readonly");
    expect(field()).toBeEnabled();
  });

  it("says how many messages are left from 5 down, and not above", () => {
    const { rerender } = render(<Host onSend={() => {}} remaining={6} />);
    expect(screen.queryByText(remainingLine(6))).toBeNull();
    rerender(<Host onSend={() => {}} remaining={5} />);
    expect(screen.getByText(remainingLine(5))).toBeInTheDocument();
  });
});
