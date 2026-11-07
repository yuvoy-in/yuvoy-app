"use client";

import { Screen } from "@/components/chrome/screen";
import { ButtonLink } from "@/components/ui/button";
import Link from "@/components/ui/link";
import { Panel } from "@/components/ui/panel";
import { organiserRefusal } from "@/lib/organisers/refusal";
import type { ClubToLink, Organiser } from "@/lib/organisers/types";
import { useMyOrganisers } from "@/lib/organisers/use-organisers";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { DoorLink } from "./door-screen-parts";
import { OrganiserRefusalBlock } from "./organiser-gate";
import {
  BACK_TO_ACCOUNT,
  OrganiserHeading,
  OrganiserLoading,
  ROW_CLASS,
  RefetchNotice,
  refusedAgain,
} from "./organiser-parts";

/**
 * `/organiser` (yuvoy-app#224, the phone's `organiser-hub.tsx`), from
 * Account's "Organiser pages": the person's organisers in the API's order,
 * each with its name, its state and the person's role, and with none the
 * setup prompt. Under `OrganiserGate`, so it reads only signed in with
 * `supply` open. "Check people in" (the door, yuvoy-app#226) leads the page
 * while the person is a member of a verified organiser: every organiser in
 * the list is one they own or help at. Above the setup, one card for each
 * group the person holds with no organiser yet (`clubsToLink`,
 * yuvoy-app#225), which opens the form for that group; with none, nothing
 * more shows.
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

  if (organisers.data === undefined || refusedAgain(organisers)) {
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

  const { items, clubsToLink } = organisers.data;
  const clubs = <ClubCards clubs={clubsToLink} />;
  const door = items.some((organiser) => organiser.state === "verified");
  return (
    <Screen back={BACK_TO_ACCOUNT}>
      <OrganiserHeading>{W.title}</OrganiserHeading>
      <RefetchNotice query={organisers} />
      {door ? <DoorLink className="mt-6" /> : null}
      {items.length === 0 ? (
        <>
          {clubs}
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
        </>
      ) : (
        <>
          <ul className="mt-6 space-y-3" data-testid="organiser-hub-list">
            {items.map((organiser) => (
              <li key={organiser.id}>
                <OrganiserRow organiser={organiser} />
              </li>
            ))}
          </ul>
          {clubs}
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

/** One card per group held with no organiser: its name, its place, and the way to set it up. */
function ClubCards({ clubs }: { clubs: ClubToLink[] }) {
  if (clubs.length === 0) return null;
  return (
    <ul className="mt-6 space-y-3" data-testid="organiser-club-cards">
      {clubs.map((club) => {
        return (
          <li key={club.clubId}>
            <Panel
              tone="outline"
              className="px-4 py-4"
              data-testid="organiser-club-card"
            >
              <p className="font-bold text-pretty break-words">
                {W.clubCard(club.name)}
              </p>
              <p className="text-forest/75 mt-0.5 text-sm">{club.placeName}</p>
              <ButtonLink
                href={`/organiser/new?club=${encodeURIComponent(club.clubId)}`}
                block
                className="mt-4"
              >
                {W.clubCardButton}
              </ButtonLink>
            </Panel>
          </li>
        );
      })}
    </ul>
  );
}
