import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useRef, useState, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import {
  changedByHand,
  useChangedBeforeHydration,
  type FormField,
} from "./use-changed-before-hydration";

/*
  A form the server drew, changed before the page hydrated (the stability
  pass, 6 Oct 2026: trip recovery showed a whole number and asked for a code
  for "+91"). Each case draws on the server, changes the fields as a person
  would, hydrates, and reads what the component now holds.
*/

let root: Root | null = null;
let page: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  page?.remove();
  page = null;
});

/** Server HTML in a page, changed by `before`, then hydrated. */
async function hydrate(ui: ReactNode, before: (page: HTMLElement) => void) {
  page = document.createElement("div");
  page.innerHTML = renderToString(ui);
  document.body.appendChild(page);
  before(page);
  const recoverable = vi.fn();
  await act(async () => {
    root = hydrateRoot(page!, ui, { onRecoverableError: recoverable });
  });
  expect(recoverable).not.toHaveBeenCalled();
  return page;
}

const field = <T extends Element>(page: HTMLElement, selector: string) =>
  page.querySelector(selector) as unknown as T;

/** A search box whose state is what the list below it reads. */
function Search({ seen }: { seen?: (changed: FormField[]) => void }) {
  const [text, setText] = useState("");
  const [, setTick] = useState(0);
  const box = useRef<HTMLInputElement>(null);
  useChangedBeforeHydration(box, (changed) => {
    seen?.(changed);
    setText(changed[0].value);
  });
  return (
    <>
      <input
        ref={box}
        aria-label="Search"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <output>{text}</output>
      <button type="button" onClick={() => setTick((n) => n + 1)}>
        Redraw
      </button>
    </>
  );
}

describe("useChangedBeforeHydration", () => {
  it("hands over what was typed before the page hydrated", async () => {
    const seen = vi.fn();
    const p = await hydrate(<Search seen={seen} />, (p) => {
      field<HTMLInputElement>(p, "input").value = "asha";
    });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0]).toEqual([p.querySelector("input")]);
    expect(p.querySelector("output")!.textContent).toBe("asha");
    expect(field<HTMLInputElement>(p, "input").value).toBe("asha");
  });

  it("keeps it through the next render", async () => {
    const p = await hydrate(<Search />, (p) => {
      field<HTMLInputElement>(p, "input").value = "asha";
    });
    act(() => field<HTMLButtonElement>(p, "button").click());
    expect(field<HTMLInputElement>(p, "input").value).toBe("asha");
  });

  it("is needed: React itself keeps the text and tells nobody", async () => {
    // If a React upgrade starts replaying the change, this fails, and the
    // hook can go.
    const p = await hydrate(<Unadopted />, (p) => {
      field<HTMLInputElement>(p, "input").value = "asha";
    });
    expect(field<HTMLInputElement>(p, "input").value).toBe("asha");
    expect(p.querySelector("output")!.textContent).toBe("");
    // ...and the next render takes it away.
    act(() => field<HTMLButtonElement>(p, "button").click());
    expect(field<HTMLInputElement>(p, "input").value).toBe("");
  });

  it("asks nothing of a field nobody touched", async () => {
    const seen = vi.fn();
    await hydrate(<Search seen={seen} />, () => {});
    expect(seen).not.toHaveBeenCalled();
  });

  it("asks nothing of a form the browser drew", () => {
    const seen = vi.fn();
    render(<Choices seen={seen} />);
    render(<Search seen={seen} />);
    render(<Controlled seen={seen} />);
    expect(seen).not.toHaveBeenCalled();
  });

  it("takes several changes in one call", async () => {
    const seen = vi.fn();
    await hydrate(<Choices seen={seen} />, (p) => {
      field<HTMLSelectElement>(p, "select").value = "dates";
      field<HTMLInputElement>(p, "[type=checkbox]").checked = true;
      field<HTMLInputElement>(p, "[value=tomorrow]").checked = true;
    });
    expect(seen).toHaveBeenCalledTimes(1);
    const changed = seen.mock.calls[0][0] as FormField[];
    // The radio that was let go of is not a choice; the one picked is.
    expect(changed.map((f) => f.name)).toEqual(["sort", "paid", "day"]);
    expect(changed.map((f) => f.value)).toEqual(["dates", "yes", "tomorrow"]);
  });
});

/** The same box without the hook: what React does on its own. */
function Unadopted() {
  const [text, setText] = useState("");
  const [, setTick] = useState(0);
  return (
    <>
      <input
        aria-label="Search"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <output>{text}</output>
      <button type="button" onClick={() => setTick((n) => n + 1)}>
        Redraw
      </button>
    </>
  );
}

/** A select, a switch and a pair of radios, in one holder. */
function Choices({ seen }: { seen: (changed: FormField[]) => void }) {
  const box = useRef<HTMLFieldSetElement>(null);
  useChangedBeforeHydration(box, seen);
  return (
    <fieldset ref={box}>
      <select name="sort" defaultValue="names">
        <option value="names">Names</option>
        <option value="dates">Dates</option>
      </select>
      <input
        className="size-6"
        type="checkbox"
        name="paid"
        value="yes"
        defaultChecked={false}
      />
      <input
        className="size-6"
        type="radio"
        name="day"
        value="today"
        defaultChecked
      />
      <input className="size-6" type="radio" name="day" value="tomorrow" />
    </fieldset>
  );
}

/** Every kind of field, held by state, as the browser draws them. */
function Controlled({ seen }: { seen: (changed: FormField[]) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useChangedBeforeHydration(box, seen);
  const nothing = () => {};
  return (
    <div ref={box}>
      <select value="dates" onChange={nothing}>
        <option value="names">Names</option>
        <option value="dates">Dates</option>
      </select>
      <input className="size-6" type="checkbox" checked onChange={nothing} />
      <input
        className="size-6"
        type="radio"
        name="d"
        value="a"
        checked={false}
        onChange={nothing}
      />
      <input
        className="size-6"
        type="radio"
        name="d"
        value="b"
        checked
        onChange={nothing}
      />
      <input type="time" value="09:00" onChange={nothing} />
      <input type="number" value={8} onChange={nothing} />
      <textarea value={"one\ntwo"} onChange={nothing} />
    </div>
  );
}

describe("changedByHand", () => {
  function drawn(html: string) {
    page = document.createElement("div");
    page.innerHTML = html;
    document.body.appendChild(page);
    return page.firstElementChild as FormField;
  }

  it("does not take a default the field cleaned for a change", () => {
    // `9:00` is not a time, so the field holds "" from the start.
    expect(changedByHand(drawn(`<input type="time" value="9:00">`))).toBe(
      false,
    );
  });

  it("reads a time somebody set", () => {
    const time = drawn(`<input type="time" value="09:00">`) as HTMLInputElement;
    time.value = "10:30";
    expect(changedByHand(time)).toBe(true);
  });

  it("does not take a select with nothing marked for a choice", () => {
    expect(
      changedByHand(drawn(`<select><option>A</option><option>B</option>`)),
    ).toBe(false);
  });

  it("reads a textarea's line endings as the same text", () => {
    const area = drawn(`<textarea>one\r\ntwo</textarea>`);
    expect(changedByHand(area)).toBe(false);
  });

  it("never reads a file input", () => {
    expect(changedByHand(drawn(`<input type="file">`))).toBe(false);
  });
});
