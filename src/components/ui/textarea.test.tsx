import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useRef, useState, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { Textarea } from "./textarea";
import { useChangedBeforeHydration } from "@/lib/react/use-changed-before-hydration";

/*
  A textarea the server drew with text in it, typed into before the page
  hydrated (the operator portal lost a rewritten About to it in the stability
  pass, 6 Oct 2026).
*/

let root: Root | null = null;
let page: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  page?.remove();
  page = null;
  vi.restoreAllMocks();
});

/** Server HTML in a page, typed into, then hydrated without a complaint. */
async function hydrate(ui: ReactNode, typed: string) {
  page = document.createElement("div");
  page.innerHTML = renderToString(ui);
  document.body.appendChild(page);
  page.querySelector("textarea")!.value = typed;
  const complaints = vi.spyOn(console, "error");
  const recoverable = vi.fn();
  await act(async () => {
    root = hydrateRoot(page!, ui, { onRecoverableError: recoverable });
  });
  expect(recoverable).not.toHaveBeenCalled();
  expect(complaints).not.toHaveBeenCalled();
  return page;
}

const area = (p: HTMLElement) => p.querySelector("textarea")!;

/** The About box: text the owner holds, and a count that reads it. */
function About() {
  const [text, setText] = useState("Two instructors.");
  const [, setTick] = useState(0);
  const box = useRef<HTMLTextAreaElement>(null);
  useChangedBeforeHydration(box, ([field]) => setText(field.value));
  return (
    <>
      <Textarea
        ref={box}
        id="about"
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

describe("Textarea", () => {
  it("is needed: React writes the server's text back over what was typed", async () => {
    // If a React upgrade keeps it, this fails, and the component can go.
    const p = await hydrate(
      <textarea id="plain" defaultValue="Two instructors." />,
      "Two instructors and a boat.",
    );
    expect(area(p).value).toBe("Two instructors.");
  });

  it("keeps what was typed into one the form reads on submit", async () => {
    const p = await hydrate(
      <Textarea id="description" name="description" defaultValue="Old." />,
      "New words.",
    );
    expect(area(p).value).toBe("New words.");
    // The server's text is the default again, as an input's is.
    expect(area(p).defaultValue).toBe("Old.");
  });

  it("finds one given no id by an id of its own", async () => {
    const p = await hydrate(<Textarea defaultValue="Old." />, "New words.");
    expect(area(p).value).toBe("New words.");
  });

  it("hands one somebody owns to its owner, and it stays", async () => {
    const p = await hydrate(<About />, "Two instructors and a boat.");
    expect(area(p).value).toBe("Two instructors and a boat.");
    expect(p.querySelector("output")!.textContent).toBe(
      "Two instructors and a boat.",
    );
    act(() => p.querySelector("button")!.click());
    expect(area(p).value).toBe("Two instructors and a boat.");
  });

  it("leaves one nobody typed into as the server drew it", async () => {
    const p = await hydrate(
      <Textarea id="description" defaultValue={"One\r\ntwo."} />,
      "One\ntwo.",
    );
    expect(area(p).value).toBe("One\ntwo.");
  });

  it("reads nothing into one drawn in the browser", () => {
    // Another field of the same name still on the page as this one mounts,
    // the screen before it on its way out.
    document.body.insertAdjacentHTML(
      "beforeend",
      `<textarea id="about" data-old>Somebody else's words.</textarea>`,
    );
    const { container } = render(<Textarea id="about" defaultValue="Ours." />);
    expect(container.querySelector("textarea")!.value).toBe("Ours.");
    document.querySelector("[data-old]")!.remove();
  });
});
