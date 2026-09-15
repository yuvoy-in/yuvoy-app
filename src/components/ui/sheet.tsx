"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./icon-button";
import { CloseIcon } from "./icons";
import { cn } from "@/lib/cn";

/**
 * A sheet that rises from the foot of the screen, and a panel on a desktop.
 *
 * The one modal surface in the app. Three screens asked for it in the same
 * week — the search filters (yuvoy-app#37), the listing's date and party
 * pop-ups (#32) and the trips date filter (#38) — and the issue for the third
 * says "build it once", which is what this is.
 *
 * ## Built on `<dialog>`, not on a div with `role="dialog"`
 *
 * The browser gives four things away for free that are laborious and easy to
 * get subtly wrong by hand: the focus trap, Escape to close, inertness of
 * everything behind it, and a top-layer paint that no `z-index` on the page
 * can climb over. A hand-rolled modal that gets three of those right is the
 * usual outcome, and the one it misses is the focus trap.
 *
 * `showModal()` rather than the `open` attribute, because only the modal form
 * gives the top layer and the inertness. It is called from an effect rather
 * than during render: it is a DOM side effect, and calling it twice throws.
 *
 * ## The close button is not optional
 *
 * A sheet on a phone can be dismissed by Escape (no keyboard) or by the
 * backdrop (a target most people do not know exists). Neither is discoverable,
 * so the control is part of the component rather than each caller's problem.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  /** Names the dialog. Required: an unnamed dialog is an unnamed region. */
  title: string;
  children: ReactNode;
  /** Pinned to the foot, clear of the scrolling body: Apply, Clear. */
  footer?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      /*
        `showModal` is not implemented in jsdom, so every unit test rendering a
        sheet would throw on the first open. Guarded rather than mocked
        globally: the fallback still sets `open`, which is enough for the
        content to be in the document and for a test to assert on it, and a
        real browser never takes this branch. The e2e is what proves the modal
        behaviour, because only a real browser has a top layer.
      */
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  /*
    Escape closes the dialog itself, and the browser does that without telling
    React — so without this the component's `open` stays true, the parent still
    thinks the sheet is up, and the next attempt to open it does nothing.
  */
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handler = () => onClose();
    dialog.addEventListener("close", handler);
    return () => dialog.removeEventListener("close", handler);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      /*
        The backdrop. `::backdrop` cannot be styled by a utility class, so the
        tint lives in globals.css beside the sheet's entrance.

        Clicking it closes, and the test for "was the backdrop clicked" is that
        the target IS the dialog: the dialog's own box is the whole viewport in
        the top layer, and the visible sheet is a child of it. Comparing
        against a bounding box instead would be wrong the moment the sheet
        animates.
      */
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "app-sheet bg-paper text-forest w-full max-w-xl p-0",
        "rounded-t-sheet sm:rounded-sheet",
        className,
      )}
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div className="border-paper-line flex items-start justify-between gap-3 border-b px-5 py-4">
          <h2 className="pt-1.5 font-bold">{title}</h2>
          <IconButton
            label="Close"
            variant="onPaper"
            size="sm"
            onClick={onClose}
          >
            <CloseIcon className="size-4" />
          </IconButton>
        </div>

        {/* The only scrolling part, so the title and the footer stay put. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {children}
        </div>

        {footer ? (
          <div className="border-paper-line sheet-foot border-t px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
