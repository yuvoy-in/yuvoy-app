"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { qk } from "@/lib/query/policy";
import { PLACES_REVALIDATE_SECONDS, type PlaceList } from "./places";

/**
 * The places list in the browser, for the picker (yuvoy-app#179).
 *
 * Seeded with the list the server render read (`myPlaces`), so the picker
 * opens on it with no request and no skeleton. It reads again only once that
 * answer is five minutes old, the API's own edge cache, and only while the
 * picker is open: a list nobody is looking at has no reason to be fetched.
 * With no list from the server it reads when the picker opens, which is when
 * the loading and error rows are seen.
 *
 * Signed in, `/me/places` through this app's proxy (the session is an
 * HttpOnly cookie the browser cannot read); a 401 there is somebody whose
 * session ended, and reads the public list. Signed out, `/places` straight
 * from the API, as every other public read.
 */
export function usePlaceList({
  initial,
  signedIn,
  enabled,
}: {
  initial: PlaceList | null;
  signedIn: boolean;
  enabled: boolean;
}) {
  /*
    When the seed was read: on this page's server render, so as near to the
    mount as the page is. Without it React Query reads the seed as stale at
    once and asks again the moment the picker opens (qa.mjs rule 9). The
    public list may be up to its five-minute revalidate older, which for a
    list of places is nothing a person would notice.
  */
  const [seededAt] = useState(() => Date.now());
  return useQuery({
    queryKey: qk.places(signedIn),
    queryFn: async ({ signal }): Promise<PlaceList> => {
      if (signedIn) {
        try {
          // The client throws a `YuvoyError` on any answer that is not 2xx.
          const { data } = await createProxyClient().GET("/me/places", {
            signal,
          });
          if (data) return data;
        } catch (cause) {
          if (!(cause instanceof YuvoyError && cause.status === 401))
            throw cause;
        }
      }
      const { data, error } = await api.GET("/places", { signal });
      if (error || !data)
        throw error ?? new Error("GET /places answered no list.");
      return data;
    },
    initialData: initial ?? undefined,
    initialDataUpdatedAt: initial ? seededAt : undefined,
    staleTime: PLACES_REVALIDATE_SECONDS * 1000,
    enabled,
    // A failed read keeps what was on screen; the picker offers Try again.
    retry: false,
  });
}
