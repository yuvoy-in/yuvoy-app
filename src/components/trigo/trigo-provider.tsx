"use client";

import dynamic from "next/dynamic";
import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useSearchParams } from "next/navigation";
import { EVENTS } from "@/lib/analytics/events";
import { captureEvent } from "@/lib/observability/report";
import { useRelease } from "@/lib/site/use-release";

/**
 * The Trigo chat sheet, mounted once in the shell (yuvoy-app#223, R5-T5).
 *
 * ## The address is the switch
 *
 * `?trigo=open`, `?trigo={conversationId}` and `?trigo=about:{cardId}` open
 * the sheet, so a notice link, a push and a sign-in that comes back all land
 * with it open. The buttons write that parameter in place with
 * `history.replaceState`, which Next folds into `useSearchParams` with no
 * navigation (the search screen's note on the same thing), and closing takes
 * it away. One source, so Back and a reload agree with what is on screen.
 *
 * ## The sheet's code waits for the first open
 *
 * `next/dynamic` with no server render, and only once the address has asked
 * for it: the feed's first download carries this provider and the buttons,
 * never the chat. Once loaded it stays mounted so the sheet can leave the way
 * it came (`SheetPresence`).
 */

export type TrigoEntry =
  "masthead" | "listing" | "found_card" | "account" | "notice";

export interface TrigoOpenParams {
  entry: TrigoEntry;
  /** `exp:{slug}` on a listing, `item:{uuid}` on a found item. */
  aboutCardId?: string;
  conversationId?: string;
  /** The destination the screen shows, such as `andaman/havelock`. */
  destinationKey?: string;
}

/** What the address asks the sheet to show. */
export interface TrigoRequest {
  conversationId: string | null;
  aboutCardId: string | null;
}

interface TrigoControls {
  open: (params: TrigoOpenParams) => void;
  close: () => void;
}

export const TRIGO_PARAM = "trigo";

const TrigoContext = createContext<TrigoControls | null>(null);

/** Null outside the provider: a button there draws nothing. */
export function useTrigo(): TrigoControls | null {
  return useContext(TrigoContext);
}

/** An id or card id the address may carry. Anything else is just "open". */
const SAFE_ID = /^[A-Za-z0-9_.:/-]{1,160}$/;

export function parseTrigoParam(value: string | null): TrigoRequest | null {
  if (!value) return null;
  if (value === "open") return { conversationId: null, aboutCardId: null };
  if (value.startsWith("about:")) {
    const card = value.slice("about:".length);
    return {
      conversationId: null,
      aboutCardId: SAFE_ID.test(card) ? card : null,
    };
  }
  return {
    conversationId: SAFE_ID.test(value) && !value.includes(":") ? value : null,
    aboutCardId: null,
  };
}

export function trigoParamFor(
  params: Pick<TrigoOpenParams, "aboutCardId" | "conversationId">,
): string {
  if (params.conversationId) return params.conversationId;
  if (params.aboutCardId) return `about:${params.aboutCardId}`;
  return "open";
}

/** The entry an address opened with, when no button said: a link from a notice or a push. */
export function entryForParam(value: string): TrigoEntry {
  if (value.startsWith("about:exp:")) return "listing";
  if (value.startsWith("about:item:")) return "found_card";
  if (value === "open") return "masthead";
  return "notice";
}

/** The current address with `trigo` set to `value`, or taken away for null. */
function writeAddress(value: string | null) {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(TRIGO_PARAM);
  else url.searchParams.set(TRIGO_PARAM, value);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const now = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  /*
    `null`, never `window.history.state`: Next's patched `replaceState` reads
    a state carrying its own `__NA` mark as the router's call and passes it
    through without updating `useSearchParams` (next/dist/client/components/
    app-router.js). Every page the router drew carries that mark, so passing
    the current state changed the address while the sheet never saw it.
    Search and checkout pass `null` for the same reason.
  */
  if (next !== now) window.history.replaceState(null, "", next);
}

const TrigoSheet = dynamic(
  () => import("./trigo-sheet").then((m) => m.TrigoSheet),
  { ssr: false },
);

export function TrigoProvider({ children }: { children: ReactNode }) {
  /** Set by a button, read once by the mount when the address follows. */
  const pending = useRef<TrigoEntry | null>(null);
  const [destinationKey, setDestinationKey] = useState<string | null>(null);

  const open = useCallback((params: TrigoOpenParams) => {
    pending.current = params.entry;
    setDestinationKey(params.destinationKey ?? null);
    writeAddress(trigoParamFor(params));
  }, []);

  const close = useCallback(() => writeAddress(null), []);

  const controls = useMemo(() => ({ open, close }), [open, close]);

  return (
    <TrigoContext.Provider value={controls}>
      {children}
      {/* `useSearchParams` needs its own boundary, or a static page bails to the client. */}
      <Suspense fallback={null}>
        <TrigoMount
          pendingRef={pending}
          destinationKey={destinationKey}
          onClose={close}
          onConversation={(id) => writeAddress(id)}
        />
      </Suspense>
    </TrigoContext.Provider>
  );
}

function TrigoMount({
  pendingRef,
  destinationKey,
  onClose,
  onConversation,
}: {
  pendingRef: RefObject<TrigoEntry | null>;
  destinationKey: string | null;
  onClose: () => void;
  onConversation: (id: string) => void;
}) {
  const search = useSearchParams();
  const value = search.get(TRIGO_PARAM);
  const request = parseTrigoParam(value);

  /*
    Loaded on the first open and kept: see the module note. Only once the
    release is open to this caller: with `releases.trigo` closed, a
    `?trigo=` address opens nothing and says nothing about Trigo
    (yuvoy-app#223, "With releases.trigo off, nothing new shows"). Once
    shown it stays, so a session that ends mid-chat (which closes a `staff`
    release with it) still gets the sheet's way back in.
  */
  const release = useRelease("trigo");
  const [loaded, setLoaded] = useState(false);
  if (request && !loaded && release.open) setLoaded(true);
  const shown = loaded && value !== null;

  /*
    `trigo_opened` once per opening, from the button that asked or, for an
    address that arrived on its own, from what the address says. A change
    from one conversation id to the next (the first answer writes its id)
    is the same opening and is not counted again.
  */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (shown && !wasOpen.current && value !== null) {
      const entry = pendingRef.current ?? entryForParam(value);
      captureEvent(EVENTS.trigoOpened, { entry });
    }
    if (shown || value === null) pendingRef.current = null;
    wasOpen.current = shown;
  }, [shown, value, pendingRef]);

  if (!loaded) return null;
  return (
    <TrigoSheet
      open={request !== null}
      request={request}
      destinationKey={destinationKey}
      onClose={onClose}
      onConversation={onConversation}
    />
  );
}
