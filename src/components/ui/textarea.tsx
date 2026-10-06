"use client";

import { useId, useLayoutEffect, useState, type ComponentProps } from "react";
import { useHasMounted } from "@/lib/react/use-has-mounted";

/**
 * Every textarea in the app: a `<textarea>` that keeps what was typed into
 * it before the page hydrated.
 *
 * React keeps an input's value as it hydrates, with the server's default
 * beside it, so a change made before the script arrived can be found and
 * taken (`useChangedBeforeHydration`). A textarea's it throws away. Stable
 * React writes the server's text back over whatever the field holds as it
 * hydrates (`initTextarea`; only the experimental channel's `hydrateTextarea`
 * keeps it), and does it before any effect could read the field. The operator
 * portal lost a rewritten About to it, back to the old words the moment the
 * script arrived (the stability pass's stress run, 6 Oct 2026). No textarea
 * here is drawn by the server yet; this keeps the first one that is from
 * doing the same. A textarea drawn empty is spared: React only writes back
 * text that is there.
 *
 * So this reads the field in the render that hydrates it, the last moment it
 * holds what was typed, and draws that; then puts the server's text back as
 * its default, where React leaves an input's, for whoever owns the text to
 * take the change. It finds the field by its id (its own, given none): that
 * render comes before any ref.
 */
export function Textarea(given: ComponentProps<"textarea">) {
  const own = useId();
  const props = { ...given, id: given.id ?? own };
  const hydrated = useHasMounted();
  // Only in the render that hydrates the field: one drawn in the browser
  // holds nothing anybody typed.
  const [early] = useState(() => (hydrated ? null : typedInto(props)));

  useLayoutEffect(() => {
    if (!early) return;
    const field = document.getElementById(early.id);
    if (field instanceof HTMLTextAreaElement) field.defaultValue = early.drawn;
  }, [early]);

  if (!early || hydrated) return <textarea {...props} />;
  return props.value === undefined ? (
    <textarea {...props} defaultValue={early.typed} />
  ) : (
    <textarea {...props} value={early.typed} />
  );
}

/**
 * The field the server drew, if it holds something other than the server's
 * text. That text is what the props say, not the field's own default, which
 * is React's by now if an earlier try at this render got as far as the field.
 */
function typedInto({
  id,
  value,
  defaultValue,
}: {
  id: string;
  value?: unknown;
  defaultValue?: unknown;
}) {
  if (typeof document === "undefined") return null;
  const field = document.getElementById(id);
  if (!(field instanceof HTMLTextAreaElement)) return null;
  const drawn = String(value ?? defaultValue ?? "");
  if (lines(field.value) === lines(drawn)) return null;
  return { id, typed: field.value, drawn };
}

/** A textarea's value says `\n` wherever its markup said `\r\n`. */
function lines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
