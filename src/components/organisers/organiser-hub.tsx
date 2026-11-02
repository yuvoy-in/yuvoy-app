"use client";

import { Screen } from "@/components/chrome/screen";
import { ButtonLink } from "@/components/ui/button";
import Link from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import { organiserRefusal } from "@/lib/organisers/refusal";
import type { Organiser } from "@/lib/organisers/types";
import { useMyOrganisers } from "@/lib/organisers/use-organisers";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { OrganiserRefusalBlock } from "./organiser-gate";
import {
  BACK_TO_ACCOUNT,
  OrganiserHeading,
  OrganiserLoading,
  ROW_CLASS,
  RefetchNotice,
} from "./organiser-parts";

/**
 * `/organiser` (yuvoy-app#224, the phone's `organiser-hub.tsx`), from
 * Account's "Organiser pages": the person's organisers in the API's order,
 * each with its name, its state and the person's role, and with none the
 * setup prompt. Under `OrganiserGate`, so it reads only signed in with
 * `supply` open. Left out from the phone: the group cards (`clubsToLink`) and
 * "Check people in" (the door), which the web does not build.
 */
export function OrganiserHub() {
  const organisers = useMyOrganisers(true);

  if (organisers.isPending) {
    return (
      <OrganiserLoading
        label={W.loading}
        back={BACK_TO_ACCOUNT}
        title={W.title}
      />
    );
  }

  if (organisers.data === undefined) {
    return (
      <Screen back={BACK_TO_ACCOUNT}>
        <OrganiserHeading>{W.title}</OrganiserHeading>
        <OrganiserRefusalBlock
          refusal={organiserRefusal(organisers.error)}
          onRetry={() => void organisers.refetch()}
        />
      </Screen>
    );
  }

  const items = organisers.data;
  return (
    <Screen back={BACK_TO_ACCOUNT}>
      <OrganiserHeading>{W.title}</OrganiserHeading>
      <RefetchNotice query={organisers} />
      {items.length === 0 ? (
        <Panel
          tone="outline"
          className="mt-6 px-4 py-4"
          data-testid="organiser-hub-empty"
        >
          <p className="text-pretty">{W.empty}</p>
          <ButtonLink href="/organiser/new" block className="mt-4">
            {W.setUp}
          </ButtonLink>
        </Panel>
      ) : (
        <>
          <ul className="mt-6 space-y-3" data-testid="organiser-hub-list">
            {items.map((organiser) => (
              <li key={organiser.id}>
                <OrganiserRow organiser={organiser} />
              </li>
            ))}
          </ul>
          <ButtonLink
            href="/organiser/new"
            variant="outline"
            block
            className="mt-6"
          >
            {W.setUpAnother}
          </ButtonLink>
        </>
      )}
    </Screen>
  );
}

function OrganiserRow({ organiser }: { organiser: Organiser }) {
  return (
    <Link
      href={`/organiser/${encodeURIComponent(organiser.id)}`}
      aria-label={W.rowLabel(organiser.name, organiser.state, organiser.role)}
      className={ROW_CLASS}
    >
      <span className="block font-bold break-words">{organiser.name}</span>
      <span className="text-forest/75 mt-0.5 block text-sm">
        {`${W.stateLabel(organiser.state)} · ${W.roleLabel(organiser.role)}`}
      </span>
    </Link>
  );
}
