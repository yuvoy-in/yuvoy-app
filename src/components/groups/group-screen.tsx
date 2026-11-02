"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { CLUB_WORDS } from "@/lib/groups/club-words";
import type { Club } from "@/lib/groups/clubs";
import { useClub } from "@/lib/groups/use-clubs";
import { Screen } from "@/components/chrome/screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { SheetPresence } from "@/components/ui/sheet";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from "@/components/states";
import { ClubLabel } from "./club-card";
import { ClaimSheet } from "./claim-sheet";
import { ClubRemovalSheet } from "./club-removal-sheet";
import { ClubReportSheet } from "./club-report-sheet";
import {
  NOT_FOUND_WORDS,
  PeopleClosed,
  groupsHref,
  isNotFound,
  isPeopleClosed,
  signInHref,
} from "./form-parts";

type Form = "claim" | "remove" | "report";

const BACK = { href: "/groups", label: "groups" };

/** The group's own page, when it is an https address; else none. */
function sourceLink(url: string): string | null {
  try {
    return new URL(url).protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * `/groups/{slug}` (yuvoy-mobile#386): one group. Its emoji and name, what it
 * does, when it meets and where (a line left out when blank), "From
 * {sourceName}" linking to the group's own page, and the label. Then "Run
 * this group? Claim it" (only while the group is not on Yuvoy), "Remove this
 * listing" and "Something wrong? Tell us". Nothing here shows a phone
 * number, an email, or who follows the group.
 *
 * The session is read first, so the page knows which read to make. On a 404
 * the release is read again: closed to this reader is People closed; still
 * open (hidden, removed, unknown) is the app's not-found screen. Any other
 * failure is an error with a retry.
 *
 * Claim and report need a sign-in: signed out, they go to sign in and come
 * back here. Removal works for anyone. A form that finds the group gone, or
 * a removal that hid it, ends with Done, which opens the directory on the
 * group's place, read again. While a form is open the page stays as it was
 * read, so the 404 the form's own re-read brings does not take the form away
 * before its message is seen.
 */
export function GroupScreen({ slug }: { slug: string }) {
  const { signedIn } = useTravellerSession();
  const club = useClub(slug);
  const [form, setForm] = useState<Form | null>(null);

  if (signedIn !== undefined && club.data && form !== null) {
    return (
      <GroupBody
        club={club.data}
        signedIn={signedIn}
        form={form}
        setForm={setForm}
        onReadAgain={() => void club.refetch()}
      />
    );
  }

  if (signedIn === undefined || club.isPending) {
    return (
      <Screen back={BACK}>
        <LoadingState label={CLUB_WORDS.loadingPage}>
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="mt-4 h-4 w-1/2" />
          <Skeleton className="mt-2 h-4 w-1/3" />
        </LoadingState>
      </Screen>
    );
  }

  if (!club.data || club.isRefetchError) {
    return (
      <Screen back={BACK}>
        {isPeopleClosed(club.error) ? (
          <PeopleClosed />
        ) : isNotFound(club.error) ? (
          <EmptyState
            title={NOT_FOUND_WORDS.title}
            body={NOT_FOUND_WORDS.body}
            action={<ButtonLink href="/">{NOT_FOUND_WORDS.action}</ButtonLink>}
          />
        ) : (
          <ErrorState
            error={club.error}
            onRetry={() => void club.refetch()}
            retrying={club.isFetching}
          />
        )}
      </Screen>
    );
  }

  return (
    <GroupBody
      club={club.data}
      signedIn={signedIn}
      form={form}
      setForm={setForm}
      onReadAgain={() => void club.refetch()}
    />
  );
}

function GroupBody({
  club,
  signedIn,
  form,
  setForm,
  onReadAgain,
}: {
  club: Club;
  signedIn: boolean;
  form: Form | null;
  setForm: (next: Form | null) => void;
  onReadAgain: () => void;
}) {
  const router = useRouter();
  const close = () => setForm(null);
  const back = { href: groupsHref(club.destinationKey), label: "groups" };
  // Back to the directory on this group's place, read again as it opens. The
  // form stays open until the page goes, so the not-found state never flashes.
  const leave = () => router.replace(groupsHref(club.destinationKey));

  const from = CLUB_WORDS.from(club.sourceName);
  const source = sourceLink(club.sourceUrl);
  const meets = club.meets?.trim() || null;
  const area = club.area?.trim() || null;
  const signIn = signInHref(club.slug);

  return (
    <Screen back={back}>
      <div className="flex flex-col gap-3 pt-2">
        <span aria-hidden="true" className="text-5xl leading-none">
          {club.emoji}
        </span>
        <h1 className="font-display tracking-display leading-display text-3xl text-balance break-words">
          {club.name}
        </h1>
        <p className="text-body text-pretty break-words">{club.what}</p>
        {meets ? (
          <p className="text-forest/70 text-body break-words">{meets}</p>
        ) : null}
        {area ? (
          <p className="text-forest/70 text-body break-words">{area}</p>
        ) : null}
        {source ? (
          <a
            href={source}
            target="_blank"
            rel="noopener noreferrer"
            className="text-forest tap-target self-start text-sm font-bold break-words underline underline-offset-4"
          >
            {from}
          </a>
        ) : (
          <p className="text-forest/70 text-sm break-words">{from}</p>
        )}
        <span>
          <ClubLabel club={club} />
        </span>

        <div className="mt-5 flex flex-col gap-3">
          {!club.onYuvoy ? (
            signedIn ? (
              <Button block onClick={() => setForm("claim")}>
                {CLUB_WORDS.claim}
              </Button>
            ) : (
              <ButtonLink href={signIn} block>
                {CLUB_WORDS.claim}
              </ButtonLink>
            )
          ) : null}
          <Button block variant="outline" onClick={() => setForm("remove")}>
            {CLUB_WORDS.remove}
          </Button>
          {signedIn ? (
            <Button block variant="ghost" onClick={() => setForm("report")}>
              {CLUB_WORDS.report}
            </Button>
          ) : (
            <ButtonLink href={signIn} block variant="ghost">
              {CLUB_WORDS.report}
            </ButtonLink>
          )}
        </div>
      </div>

      <SheetPresence open={form === "claim"}>
        <ClaimSheet
          clubId={club.clubId}
          name={club.name}
          onClose={close}
          onLeave={leave}
          onClaimed={onReadAgain}
        />
      </SheetPresence>
      <SheetPresence open={form === "remove"}>
        <ClubRemovalSheet
          clubId={club.clubId}
          name={club.name}
          onClose={close}
          onLeave={leave}
        />
      </SheetPresence>
      <SheetPresence open={form === "report"}>
        <ClubReportSheet
          clubId={club.clubId}
          name={club.name}
          onClose={close}
          onLeave={leave}
        />
      </SheetPresence>
    </Screen>
  );
}
