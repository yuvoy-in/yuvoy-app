"use client";

import { useLayoutEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { CACHE, qk } from "@/lib/query/policy";
import { setPeekContentReady } from "@/lib/feed/listing-peek";
import { ExperienceDetail } from "./experience-detail";
import { ListingPreviewContext } from "./preview-context";

/**
 * A listing drawn as the preview a reel's swipe brings in (T02 C).
 *
 * The real `ExperienceDetail`, inside the app shell's own column, so the page
 * that lands is the page that slid in, pixel for pixel; its live parts wait
 * until it is shown (`preview-context.ts`). Nothing at all until the listing
 * has been read: the swipe keeps its old behaviour for a listing that is not
 * ready, rather than bringing in a skeleton.
 *
 * Loaded on demand by `ListingPeek`, so none of this is in the feed's first
 * download.
 */
export function ListingPreview({
  slug,
  shown,
}: {
  slug: string;
  shown: boolean;
}) {
  const { data, isPending, isLoadingError, isRefetchError } = useQuery({
    queryKey: qk.experience(slug),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET("/experiences/{slug}", {
        params: { path: { slug } },
        signal,
      });
      if (error) throw error;
      return data;
    },
    ...CACHE.getExperience,
  });

  const preview = useMemo(() => ({ shown }), [shown]);

  /*
    Its loading and error states are the swipe's old behaviour. Until the
    listing has been read, and after a read that failed, nothing is brought
    in: the card nudges as it always did, the route's own transition carries
    the change, and the listing page shows its own loading or error. A read
    that fails AFTER one succeeded keeps the page it already drew, so a
    preview in a finger's hands never empties; it is just not offered again
    until it reads.
  */
  const ready = !isPending && !isLoadingError && !isRefetchError;
  useLayoutEffect(() => {
    setPeekContentReady(ready);
    return () => setPeekContentReady(false);
  }, [ready]);

  if (!data) return null;

  return (
    <ListingPreviewContext.Provider value={preview}>
      {/* The app shell's column on a phone, as the page sits in it. */}
      <div className="stage on-dark flex min-h-dvh flex-col">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 flex-1 flex-col">
            <ExperienceDetail experience={data} />
          </div>
        </div>
      </div>
    </ListingPreviewContext.Provider>
  );
}
