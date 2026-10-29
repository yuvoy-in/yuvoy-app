"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { CACHE, qk } from "@/lib/query/policy";
import { withLink, type CreatorLink } from "./creator-words";

/**
 * A traveller's share links (yuvoy-app#207, R12-T2): the list on Account and
 * the one write on a past trip. Both through this app's proxy, which holds
 * the session, as every other `/me` call does.
 *
 * Behind the `creator` release. Outside it the API answers `404` to both, so
 * a `404` from the list is read as "closed to you" and the section is not
 * drawn, rather than as a list that failed.
 */

/** The list's `404`: the creator release is closed to this traveller. */
export function isReleaseClosed(error: unknown): boolean {
  return error instanceof YuvoyError && error.status === 404;
}

/**
 * `GET /me/creator-links`, newest first. Never cached (`CACHE`), so Account
 * reads it again every time it opens.
 *
 * `retry: false` because none of its failures improve by asking again at
 * once: a `401` is a sign-in that ended and a `404` is a release that is
 * closed. The client wrapper still retries a GET that never arrived.
 */
export function useMyCreatorLinks(enabled: boolean) {
  return useQuery({
    queryKey: qk.myCreatorLinks(),
    enabled,
    retry: false,
    ...CACHE.listMyCreatorLinks,
    queryFn: async ({ signal }) => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/me/creator-links", {
        signal,
      });
      if (error) throw error;
      return data;
    },
  });
}

/** What Get my link answers: the link, and whether it was made just now. */
export interface GotLink {
  link: CreatorLink;
  /** `201`, made by this tap. `200` is the one they already had. */
  made: boolean;
}

/**
 * Get my link, for an experience a trip names by its slug.
 *
 * A row of `GET /me/bookings` carries `experienceSlug` and not the
 * experience's id, and the write takes the id. So the listing is read first,
 * by the same key and freshness as the card page (`qk.experience`), and a
 * listing already in the cache costs nothing. Then `POST /me/creator-links`
 * with `{ experienceId }`.
 *
 * The answer goes straight into Your links: replaced where that code is
 * already listed, at the top where it is new. Only where the list is in the
 * cache, which is only while Account is open; Account opened later reads it.
 */
export function useGetMyCreatorLink() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (experienceSlug: string): Promise<GotLink> => {
      const experience = await qc.fetchQuery({
        queryKey: qk.experience(experienceSlug),
        queryFn: async ({ signal }) => {
          const { data, error } = await api.GET("/experiences/{slug}", {
            params: { path: { slug: experienceSlug } },
            signal,
          });
          if (error || !data) {
            throw error ?? new Error("GET /experiences/{slug} had no body.");
          }
          return data;
        },
        ...CACHE.getExperience,
      });
      const client = createProxyClient();
      const { data, error, response } = await client.POST("/me/creator-links", {
        body: { experienceId: experience.id },
      });
      if (error || !data) {
        throw error ?? new Error("POST /me/creator-links had no body.");
      }
      return { link: data, made: response.status === 201 };
    },
    onSuccess: ({ link }) => {
      qc.setQueryData<{ items: CreatorLink[] }>(qk.myCreatorLinks(), (old) =>
        old ? { ...old, items: withLink(old.items, link) } : old,
      );
    },
  });
}
