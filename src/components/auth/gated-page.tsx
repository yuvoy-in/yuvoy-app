"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Screen, type BackTarget } from "@/components/chrome/screen";
import { useStanding } from "@/lib/auth/use-access";
import {
  accessOfStanding,
  screenOf,
  type Access,
  type Standing,
} from "@/lib/site/access";
import {
  InviteGate,
  type GatePurpose,
  type GateView,
} from "@/components/auth/invite-gate";

/**
 * A gated route's page, kept in step with what this device knows
 * (yuvoy-api#195).
 *
 * The server decides what a gated route renders (`gatedRoute`), and the
 * browser can learn something newer: somebody signs in on the page, redeems a
 * code, signs out on Account, or comes back to a page the router kept from
 * thirty seconds ago (`staleTimes.dynamic`), or through Back. Whenever the
 * device knows the page should be a different SCREEN from the one the HTML
 * shows, this asks the server again with `router.refresh()`, which renders the
 * page they asked for, in place: no redirect, and the URL is kept.
 *
 * ## It never hides what the server rendered
 *
 * Only the server decides to show content, and only the server decides to
 * take it away. A session read that failed on an island connection must not
 * blank a feed somebody was reading; it costs one refresh, the server reads
 * the cookie, and the feed stays. The one place a guest path must not survive
 * the device's own sign-out (checkout) refuses a guest submission itself.
 *
 * ## One refresh per disagreement
 *
 * A server that still disagrees after asking (a `GET /me` it could not make,
 * so it failed open) is not asked again for the same pair of answers, and
 * nothing is asked while a refresh is already in flight. Either would be a
 * loop on a slow connection.
 */

interface PageRefresh {
  /** Ask the server for this page again. */
  refresh: () => void;
  /** A refresh is in flight. */
  refreshing: boolean;
}

const PageRefreshContext = createContext<PageRefresh>({
  refresh: () => {},
  refreshing: false,
});

export function usePageRefresh(): PageRefresh {
  return useContext(PageRefreshContext);
}

export function GatedPage({
  rendered,
  children,
}: {
  /** What the server decided for this request. */
  rendered: Access;
  children: ReactNode;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const client = useStanding(true);
  /** The last disagreement this page asked about, as `client|rendered`. */
  const asked = useRef<string | null>(null);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    if (refreshing) return;
    // Not known, or known to be unknown: the device has nothing to add.
    if (client === undefined || client === "unknown") return;
    if (screenOf(accessOfStanding(client)) === screenOf(rendered)) return;
    const disagreement = `${client}|${rendered}`;
    if (asked.current === disagreement) return;
    asked.current = disagreement;
    refresh();
  }, [client, rendered, refreshing, refresh]);

  const value = useMemo(() => ({ refresh, refreshing }), [refresh, refreshing]);
  return <PageRefreshContext value={value}>{children}</PageRefreshContext>;
}

/**
 * Which view of the gate a page draws.
 *
 * The server's answer until this device knows better, and never on the
 * strength of `unknown`: a `GET /me` the browser could not make says nothing
 * about the number. `admitted` draws `in` while the page is asked for again.
 */
export function gateViewFor(
  client: Standing | undefined,
  rendered: "signed-out" | "not-admitted",
): GateView {
  const standing =
    client === undefined || client === "unknown" ? rendered : client;
  if (standing === "signed-out") return "signed-out";
  if (standing === "not-admitted") return "code";
  return "in";
}

/**
 * The gate as a whole route: the invite landing, or the code screen.
 *
 * Framed like the page it stands in for (a tab root keeps the bar; a focused
 * route keeps its way back), so arriving at a gate reads as arriving at the
 * page, which is what it is, and admission turns it into that page in place.
 */
export function InviteGatePage({
  rendered,
  phone,
  purpose,
  back,
  stageLabel,
  width,
}: {
  rendered: "signed-out" | "not-admitted";
  phone: string | null;
  purpose: GatePurpose;
  back?: BackTarget;
  stageLabel?: string;
  width?: "md" | "lg";
}) {
  const client = useStanding(true);
  const { refresh, refreshing } = usePageRefresh();

  return (
    <Screen back={back} stageLabel={stageLabel} width={width}>
      <InviteGate
        view={gateViewFor(client, rendered)}
        variant="page"
        purpose={purpose}
        phone={phone}
        onSignedIn={refresh}
        onAdmitted={refresh}
        refreshing={refreshing}
        onContinue={refresh}
      />
    </Screen>
  );
}
