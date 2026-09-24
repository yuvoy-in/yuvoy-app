import type { ReactNode } from "react";
import type { BackTarget } from "@/components/chrome/screen";
import { INVITE_ONLY, showsContent } from "@/lib/site/access";
import { accessForRequest } from "@/lib/auth/request-access";
import { GatedPage, InviteGatePage } from "./gated-page";
import type { GatePurpose } from "./invite-gate";

/**
 * A route behind the invite gate, decided on the server (yuvoy-api#195).
 *
 * The feed, search, a search result, saves and checkout call this with their
 * content as a function, and the function is only called when the content is
 * going to be shown. That is the whole security of the gate: a crawler and a
 * signed-out visitor are served the invite landing, a number without a code
 * the code screen, and neither HTML carries the feed's first page, a search
 * result or a checkout form. The feed's own prefetch is inside that function,
 * so it is not even fetched for somebody who will not see it.
 *
 * With the switch off it returns the content and nothing else: no wrapper, no
 * cookie read and no `searchParams` read, so every one of these pages renders
 * exactly as it did before the gate existed, and `/saved` stays static.
 */
export async function gatedRoute({
  purpose,
  searchParams,
  back,
  stageLabel,
  width,
  content,
}: {
  purpose: GatePurpose;
  /** Read only with the switch on, and only for a mocked build's scenario. */
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  /** How the gate is framed on this route: the page's own way back. */
  back?: BackTarget;
  stageLabel?: string;
  width?: "md" | "lg";
  content: () => ReactNode | Promise<ReactNode>;
}): Promise<ReactNode> {
  if (!INVITE_ONLY) return content();

  const query = searchParams ? await searchParams : {};
  const raw = query.__scenario;
  const { access, phone } = await accessForRequest(
    typeof raw === "string" ? raw : undefined,
  );

  if (!showsContent(access)) {
    return (
      <GatedPage rendered={access}>
        <InviteGatePage
          rendered={access}
          phone={phone}
          purpose={purpose}
          back={back}
          stageLabel={stageLabel}
          width={width}
        />
      </GatedPage>
    );
  }

  return <GatedPage rendered={access}>{await content()}</GatedPage>;
}
