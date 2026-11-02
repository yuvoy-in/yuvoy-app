"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Screen } from "@/components/chrome/screen";
import { LoadingState, Skeleton } from "@/components/states";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { emptyOrganiserForm, organiserForm } from "@/lib/organisers/organisers";
import { clubPageForm } from "@/lib/organisers/organisers-club";
import { organiserRefusal } from "@/lib/organisers/refusal";
import type { ClubToLink } from "@/lib/organisers/types";
import { useMyOrganisers, useOrganiser } from "@/lib/organisers/use-organisers";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { useOpenClubOrganiser } from "./organiser-club-parts";
import { OrganiserFormBody } from "./organiser-form-body";
import { OrganiserRefusalBlock } from "./organiser-gate";
import {
  BACK_TO_HUB,
  OrganiserHeading,
  OrganiserLoading,
  RefetchNotice,
  backToOrganiser,
} from "./organiser-parts";

/**
 * The page form (yuvoy-app#224, the phone's `organiser-form.tsx`):
 *
 *   - `/organiser/new`, "Send for checking". After the 201 the new
 *     organiser's page opens with the thanks line (`?made=1`), in place of
 *     this form, so Back does not come back to a form already sent.
 *   - `/organiser/{id}/edit`, the same form filled, an owner's only. It sends
 *     the whole page: the contact email the owner was shown goes back to keep
 *     it, and a field emptied is left out, which clears it.
 *
 * What was typed stays when a save fails, the button is off while a save is
 * out, and the API's sentence for a field shows under that field.
 *
 * A group's page (yuvoy-app#225): `/organiser/new?club={clubId}` is the same
 * form for a group the person holds, found in the hub's `clubsToLink`, never
 * taken from the address alone (one set up already opens its page instead,
 * `organiser-club-parts.ts`). Its name and place are fixed text and are
 * not sent; after the 201 the page opens with `?made=club`, which says it is
 * checked already. A `409 club_already_linked` opens the group's organiser
 * with the API's sentence. The edit of a group's organiser (`clubId` set)
 * shows the name and place fixed too, and sends them back exactly as read.
 */

export function NewOrganiserForm() {
  return (
    <Screen back={BACK_TO_HUB}>
      <OrganiserHeading>{W.formTitle}</OrganiserHeading>
      {/* The group is read from the address in the browser, so the page stays static. */}
      <Suspense fallback={<FormLoading />}>
        <NewFormBody />
      </Suspense>
    </Screen>
  );
}

function NewFormBody() {
  const club = useSearchParams().get("club");
  return club ? (
    <ClubFormBody clubId={club} />
  ) : (
    <OrganiserFormBody start={emptyOrganiserForm()} />
  );
}

function FormLoading() {
  return (
    <LoadingState label={W.loading}>
      <div className="mt-6 space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </LoadingState>
  );
}

/** The group, from the hub's offer: a link to one no longer offered says so. */
function ClubFormBody({ clubId }: { clubId: string }) {
  const organisers = useMyOrganisers(true);
  const found =
    organisers.data?.clubsToLink.find((club) => club.clubId === clubId) ??
    null;
  /*
    Kept once found: after the 201 (or an answer lost on the way) the list is
    read again and no longer offers it, and it is the write's answer that
    says what happened, not the form going away under the person.
  */
  const [kept, setKept] = useState<ClubToLink | null>(null);
  if (found !== null && kept?.clubId !== found.clubId) setKept(found);
  const club = kept ?? found;
  const opening = useOpenClubOrganiser(
    clubId,
    club === null ? organisers.data?.items : undefined,
  );

  if (club !== null) {
    return (
      <OrganiserFormBody
        key={club.clubId}
        start={clubPageForm(club)}
        clubId={club.clubId}
        fixed={club}
      />
    );
  }

  if (organisers.isPending || opening) return <FormLoading />;

  if (organisers.data === undefined) {
    return (
      <OrganiserRefusalBlock
        refusal={organiserRefusal(organisers.error)}
        onRetry={() => void organisers.refetch()}
      />
    );
  }

  return (
    <Panel
      tone="outline"
      role="status"
      className="mt-6 px-4 py-4"
      data-testid="organiser-club-gone"
    >
      <p className="text-pretty">{W.noClub}</p>
      <ButtonLink href="/organiser" variant="outline" block className="mt-4">
        {W.title}
      </ButtonLink>
    </Panel>
  );
}

export function EditOrganiserForm({ id }: { id: string }) {
  const organiser = useOrganiser(id, true);
  const back = backToOrganiser(id);

  if (organiser.isPending) {
    return (
      <OrganiserLoading
        label={W.loadingOrganiser}
        back={back}
        title={W.editTitle}
      />
    );
  }

  if (organiser.data === undefined) {
    return (
      <Screen back={back}>
        <OrganiserHeading>{W.editTitle}</OrganiserHeading>
        <OrganiserRefusalBlock
          refusal={organiserRefusal(organiser.error)}
          onRetry={() => void organiser.refetch()}
        />
      </Screen>
    );
  }

  const page = organiser.data;
  return (
    <Screen back={back}>
      <OrganiserHeading>{W.editTitle}</OrganiserHeading>
      <RefetchNotice query={organiser} />
      {page.role !== "owner" ? (
        <OrganiserRefusalBlock
          refusal={{ kind: "notOwner", message: W.notOwner }}
          onRetry={() => void organiser.refetch()}
        />
      ) : page.state === "closed" ? (
        <Panel
          tone="outline"
          role="status"
          className="mt-6 px-4 py-4"
          data-testid="organiser-edit-closed"
        >
          <p className="text-pretty">{W.closed}</p>
        </Panel>
      ) : (
        // Keyed by the organiser: a read again never resets what the owner is typing.
        <OrganiserFormBody
          key={page.id}
          start={organiserForm(page)}
          id={page.id}
          fixed={page.clubId ? page : undefined}
        />
      )}
    </Screen>
  );
}
