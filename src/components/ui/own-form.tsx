"use client";

import {
  createContext,
  useContext,
  useId,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useHasMounted } from "@/lib/react/use-has-mounted";

/**
 * A form that may be drawn inside another form, without being nested in it.
 *
 * HTML does not allow a form inside a form, and the browsers enforce it at the
 * one moment that matters. Blink and WebKit stop a `submit` event at any OUTER
 * form element it bubbles through (`HTMLFormElement::HandleLocalEvents`), so
 * it never reaches the document, which is where React listens. The inner form's
 * `onSubmit` never runs, nothing prevents the default, and the browser submits
 * the inner form natively: a GET to the page's own URL with the query replaced,
 * which is a full page load that throws away everything typed around it.
 *
 * That is what happened to checkout (yuvoy-api#195). The invite gate draws its
 * sign-in steps and its code form inside checkout's own form, and "Send me a
 * code" reloaded checkout onto its first step with the booking form gone. jsdom
 * does not model the browser rule, so the unit test passed; the end-to-end test
 * in a real browser is what failed.
 *
 * So inside `InsideAnotherForm`, `OwnForm` draws its controls in a plain
 * element and puts an EMPTY form at the end of `<body>`, and every control
 * joins that form through the HTML `form` attribute. The controls stay where
 * they are on screen, belong to their own form rather than to the one they sit
 * in, and their `submit` bubbles straight to the document. Everywhere else it
 * is an ordinary `<form>` around its controls.
 */
const Inside = createContext(false);

/** Wraps something drawn inside a `<form>` whose own forms must not nest. */
export function InsideAnotherForm({ children }: { children: ReactNode }) {
  return <Inside.Provider value>{children}</Inside.Provider>;
}

export function OwnForm({
  className,
  noValidate,
  onSubmit,
  children,
}: {
  className?: string;
  noValidate?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /**
   * The controls, given the value their `form` attribute must carry: the
   * detached form's id inside another form, `undefined` everywhere else.
   * Every control that submits or is submitted must take it, the submit
   * button above all, or it belongs to the outer form again.
   */
  children: (form: string | undefined) => ReactNode;
}) {
  const inside = useContext(Inside);
  const id = useId();
  const mounted = useHasMounted();

  if (!inside) {
    return (
      <form className={className} noValidate={noValidate} onSubmit={onSubmit}>
        {children(undefined)}
      </form>
    );
  }

  return (
    <>
      {/*
        Only once mounted: `document` is the browser's. Until then the
        controls name a form that does not exist yet, which gives them no form
        at all, and never the outer one; the browser associates them the
        moment this is inserted.
      */}
      {mounted
        ? createPortal(
            <form id={id} hidden noValidate={noValidate} onSubmit={onSubmit} />,
            document.body,
          )
        : null}
      <div className={className}>{children(id)}</div>
    </>
  );
}
