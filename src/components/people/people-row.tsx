"use client";

import { useRelease } from "@/lib/site/use-release";
import type { components } from "@/lib/api/schema.gen";
import { PEOPLE_WORDS as W } from "@/lib/people/people-words";
import { ButtonLink } from "@/components/ui/button";

type PeopleSummary = components["schemas"]["PeopleSummary"];

/**
 * The People row on Account (yuvoy-app#222). Drawn only while the `people`
 * release is open to this traveller AND `GET /me` carries `people`: either
 * missing means People is not theirs yet, and nothing is drawn. A dot marks
 * friend requests waiting; a screen reader hears how many.
 */
export function PeopleRow({ people }: { people?: PeopleSummary }) {
  const release = useRelease("people");
  if (!release.open || !people) return null;
  const waiting = people.requestsWaiting;
  return (
    <ButtonLink href="/people" variant="outline" block className="mt-10">
      {W.row}
      {waiting > 0 ? (
        <>
          <span
            aria-hidden="true"
            data-testid="people-dot"
            className="bg-terra-deep ml-2 inline-block size-2.5 rounded-full"
          />
          <span className="sr-only">{`, ${W.rowWaiting(waiting)}`}</span>
        </>
      ) : null}
    </ButtonLink>
  );
}
