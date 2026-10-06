import { useLayoutEffect, useRef, type RefObject } from "react";

export type FormField =
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const FIELDS = "input, textarea, select";

/**
 * Hands a component the fields somebody changed before the page hydrated.
 *
 * The server draws a form, and on a slow link it is there for seconds before
 * the script that owns it: long enough to type a number or a search, and for
 * the browser to autofill. React keeps all of that on screen as it hydrates,
 * but it replays no change for it (its own fix, `enableHydrationChangeEvent`,
 * is on only in React's experimental channel, and Next ships the stable one).
 * So the state the component keeps still holds what the server drew, and the
 * screen and the state disagree: a whole number over a "Send me a code" that
 * sends none, a search that searched nothing. The field's next render then
 * writes the state back over what was typed, and it is gone. The stability
 * pass's stress run caught it on the operator portal's sign-in (6 Oct 2026);
 * here the server draws trip recovery's number and both search boxes.
 *
 * Hydration leaves every field as it found it and its default where the
 * server drew it (`defaultValue`, `defaultChecked`, the option marked
 * `selected`), so a field whose two differ was changed by hand. Those go to
 * `onChanged` together, once, so a component can take several changes in one
 * update: the same state its own `onChange` sets. A radio counts only once
 * chosen, as a change event would. A field the browser drew holds its
 * default as it mounts, so it never reads as changed, and asking causes no
 * render: nothing happens unless somebody got there first.
 *
 * A textarea drawn with text never gets here on its own: React writes that
 * text back over what was typed as it hydrates. `Textarea` keeps it, and
 * leaves it to be found like an input's.
 *
 * `ref` is a field, or anything holding several (a country code and a
 * number, a group of radios).
 */
export function useChangedBeforeHydration(
  ref: RefObject<HTMLElement | null>,
  onChanged: (changed: FormField[]) => void,
) {
  // Asked once, at mount, with the handler that render had.
  const first = useRef(onChanged);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const fields = root.matches(FIELDS)
      ? [root as FormField]
      : Array.from(root.querySelectorAll<FormField>(FIELDS));
    const changed = fields.filter(changedByHand);
    if (changed.length > 0) first.current(changed);
  }, [ref]);
}

/** Whether a field holds something other than what the server drew. */
export function changedByHand(field: FormField): boolean {
  if (field instanceof HTMLSelectElement) {
    if (field.multiple) return false;
    // A select whose value matched no option drew none marked, and the
    // browser's own pick of the first is not somebody's choice.
    const marked = Array.from(field.options).find((o) => o.defaultSelected);
    return marked !== undefined && !marked.selected;
  }
  if (field instanceof HTMLTextAreaElement) {
    return lines(field.value) !== lines(field.defaultValue);
  }
  switch (field.type) {
    case "hidden":
    case "file":
    case "submit":
    case "button":
    case "reset":
    case "image":
      return false;
    case "checkbox":
      return field.checked !== field.defaultChecked;
    case "radio":
      return field.checked && !field.defaultChecked;
  }
  return field.value !== sanitised(field);
}

/**
 * The default as the field would hold it. A date, time or number field
 * cleans what it is given (`9:00` is not a time), so an unclean default
 * would otherwise read as somebody's change.
 */
function sanitised(field: HTMLInputElement): string {
  const probe = field.ownerDocument.createElement("input");
  probe.type = field.type;
  probe.value = field.defaultValue;
  return probe.value;
}

/** A textarea's value says `\n` wherever its markup said `\r\n`. */
function lines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
