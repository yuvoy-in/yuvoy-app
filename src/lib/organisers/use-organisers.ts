"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { CACHE, qk } from "@/lib/query/policy";
import type {
  MyOrganisers,
  Organiser,
  OrganiserEvent,
  OrganiserEventInput,
  OrganiserHelper,
  OrganiserHelperListed,
  OrganiserFromClubInput,
  OrganiserInput,
} from "./types";

/**
 * Organiser pages for a signed-in adult (yuvoy-app#224, the web half of
 * yuvoy-mobile#393, with the group setup of yuvoy-app#225), read and changed through this app's proxy, which holds
 * the session: every organiser route is session only.
 *
 * A screen passes `enabled` only once the session says signed in (and the
 * `supply` release is open to the person), so a visitor calls nothing.
 *
 * Every read is `retry: false`: none of the refusals improve by asking again
 * at once. The client itself still retries a GET that never arrived, and a
 * GET that answered 503, up to three tries in all. `organisers_paused` is in
 * its never-retry list, so a paused read reaches the screen on the first
 * answer.
 *
 * Any 401 reads the session entry again, so the screen falls to its sign-in
 * branch. A 409 on a write the organiser's state decides reads the organiser
 * again (`afterConflict`). What the screen says for a refusal comes from
 * `organiserRefusal`.
 */

/** A 401 means the sign-in ended: the session entry is read again. */
function afterRefusal(qc: QueryClient, error: unknown) {
  if (error instanceof YuvoyError && error.status === 401) {
    void qc.invalidateQueries({ queryKey: qk.session() });
  }
}

/**
 * A 409 on a write: the organiser may have been suspended, closed or not yet
 * verified since it was read, so it and the person's list are read again and
 * the actions gated on the old state go. `alsoEvents` reads its events too.
 */
function afterConflict(
  qc: QueryClient,
  id: string,
  error: unknown,
  alsoEvents = false,
) {
  if (!(error instanceof YuvoyError) || error.status !== 409) return;
  void qc.invalidateQueries({ queryKey: qk.organiser(id) });
  void qc.invalidateQueries({ queryKey: qk.myOrganisers() });
  if (alsoEvents) {
    void qc.invalidateQueries({ queryKey: qk.organiserEvents(id) });
  }
}

/** Runs one call, turns an error answer into a throw, and reads the session again on a 401. */
async function asked<T>(
  qc: QueryClient,
  call: () => Promise<{ data?: T; error?: unknown }>,
  route: string,
): Promise<T> {
  try {
    const { data, error } = await call();
    if (error) throw error;
    if (data === undefined) throw new Error(`${route} had no body.`);
    return data;
  } catch (error) {
    afterRefusal(qc, error);
    throw error;
  }
}

/** The first key of every organiser read. */
const ORGANISER_READS = [
  qk.myOrganisers(),
  ["getOrganiser"],
  ["listOrganiserEvents"],
  ["getOrganiserEventNumbers"],
  ["listOrganiserHelpers"],
] as const;

/** Removes everything organiser from the cache. Sign in and sign out call it. */
export function forgetOrganisers(qc: QueryClient) {
  for (const queryKey of ORGANISER_READS) qc.removeQueries({ queryKey });
}

/**
 * Reads every organiser entry again. The age step calls it once the age is
 * confirmed: every read on screen may still hold the 403
 * `adult_confirmation_required`, and a screen still showing one would offer
 * the step again for an answer that is already kept.
 */
export function refreshOrganisers(qc: QueryClient) {
  for (const queryKey of ORGANISER_READS) {
    void qc.invalidateQueries({ queryKey });
  }
}

/* ------------------------------------------------------------------ reads -- */

/**
 * `GET /me/organisers`: the person's organisers, oldest first, and in
 * `clubsToLink` the groups they hold that have no organiser yet, by name. The
 * hub draws a card for each group (yuvoy-app#225); a group leaves the list
 * once its organiser is set up, on the next read.
 */
export function useMyOrganisers(enabled: boolean) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.myOrganisers(),
    enabled,
    retry: false,
    ...CACHE.organisers,
    queryFn: async ({ signal }): Promise<MyOrganisers> => {
      const client = createProxyClient();
      const page = await asked(
        qc,
        () => client.GET("/me/organisers", { signal }),
        "GET /me/organisers",
      );
      return {
        items: page.items,
        // An answer from before the groups were added has no list: no cards.
        clubsToLink: Array.isArray(page.clubsToLink) ? page.clubsToLink : [],
      };
    },
  });
}

/** `GET /organisers/{id}`: one organiser, with the person's role in it. */
export function useOrganiser(id: string, enabled: boolean) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.organiser(id),
    enabled: enabled && id !== "",
    retry: false,
    ...CACHE.organisers,
    queryFn: async ({ signal }): Promise<Organiser> => {
      const client = createProxyClient();
      return asked(
        qc,
        () =>
          client.GET("/organisers/{id}", {
            params: { path: { id } },
            signal,
          }),
        "GET /organisers/{id}",
      );
    },
  });
}

/** `GET /organisers/{id}/events`: its posted events, as the API orders them. */
export function useOrganiserEvents(id: string, enabled: boolean) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.organiserEvents(id),
    enabled: enabled && id !== "",
    retry: false,
    ...CACHE.organisers,
    queryFn: async ({ signal }): Promise<OrganiserEvent[]> => {
      const client = createProxyClient();
      const page = await asked(
        qc,
        () =>
          client.GET("/organisers/{id}/events", {
            params: { path: { id } },
            signal,
          }),
        "GET /organisers/{id}/events",
      );
      return page.items;
    },
  });
}

/**
 * `GET /organisers/{id}/events/{eventPostId}/numbers`: counts only, never a
 * name. With no `on` it is the current date; `lastWeekOn` gives the date for
 * a weekly event's last-week block.
 */
export function useOrganiserEventNumbers(
  id: string,
  postId: string,
  on: string | null | undefined,
  enabled: boolean,
) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.organiserEventNumbers(id, postId, on),
    enabled: enabled && id !== "" && postId !== "",
    retry: false,
    ...CACHE.organisers,
    queryFn: async ({ signal }) => {
      const client = createProxyClient();
      return asked(
        qc,
        () =>
          client.GET("/organisers/{id}/events/{eventPostId}/numbers", {
            params: {
              path: { id, eventPostId: postId },
              query: on ? { on } : {},
            },
            signal,
          }),
        "GET /organisers/{id}/events/{eventPostId}/numbers",
      );
    },
  });
}

/** `GET /organisers/{id}/helpers`. `travellerId` comes to an owner only. */
export function useOrganiserHelpers(id: string, enabled: boolean) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.organiserHelpers(id),
    enabled: enabled && id !== "",
    retry: false,
    ...CACHE.organisers,
    queryFn: async ({ signal }): Promise<OrganiserHelperListed[]> => {
      const client = createProxyClient();
      const page = await asked(
        qc,
        () =>
          client.GET("/organisers/{id}/helpers", {
            params: { path: { id } },
            signal,
          }),
        "GET /organisers/{id}/helpers",
      );
      return page.items;
    },
  });
}

/* ----------------------------------------------------------------- writes -- */

/** The event list with one event replaced where it is listed. */
function withEvent(
  list: OrganiserEvent[] | undefined,
  event: OrganiserEvent,
): OrganiserEvent[] | undefined {
  return list?.map((row) => (row.id === event.id ? event : row));
}

/** After any event write: the list and that event's numbers are read again. */
function eventChanged(qc: QueryClient, id: string, postId: string) {
  void qc.invalidateQueries({ queryKey: qk.organiserEvents(id) });
  void qc.invalidateQueries({
    queryKey: ["getOrganiserEventNumbers", id, postId],
  });
}

/**
 * `POST /organisers`: set up a page. The person becomes its owner. A page of
 * its own (`OrganiserInput`) starts `pending` with a code; one for a group the
 * person holds (`OrganiserFromClubInput`, with `clubId`) starts `verified`,
 * with the group's name and place and no code. The API tells the two apart by
 * `clubId`. The hub's list is read again, so the group's card goes.
 */
export function useCreateOrganiser() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (
      body: OrganiserInput | OrganiserFromClubInput,
    ): Promise<Organiser> => {
      const client = createProxyClient();
      return asked(
        qc,
        () => client.POST("/organisers", { body }),
        "POST /organisers",
      );
    },
    onSuccess: (organiser) => {
      qc.setQueryData(qk.organiser(organiser.id), organiser);
      void qc.invalidateQueries({ queryKey: qk.myOrganisers() });
    },
  });
}

/**
 * `PATCH /organisers/{id}`: the whole page, every field sent (`organiserInput`).
 * Owners only. A group's organiser (`clubId` set) sends its name and place back
 * exactly as read: a changed one is 400 under that field.
 */
export function useUpdateOrganiser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (body: OrganiserInput): Promise<Organiser> => {
      const client = createProxyClient();
      return asked(
        qc,
        () =>
          client.PATCH("/organisers/{id}", {
            params: { path: { id } },
            body,
          }),
        "PATCH /organisers/{id}",
      );
    },
    onSuccess: (organiser) => {
      qc.setQueryData(qk.organiser(organiser.id), organiser);
      void qc.invalidateQueries({ queryKey: qk.myOrganisers() });
    },
    // 409 `conflict`: the page was closed since it was read.
    onError: (error) => afterConflict(qc, id, error),
  });
}

/**
 * `POST /organisers/{id}/helpers` with the email they sign in with. Somebody
 * already a helper is answered as they are, so the list never holds them
 * twice.
 */
export function useAddOrganiserHelper(id: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (email: string): Promise<OrganiserHelper> => {
      const client = createProxyClient();
      return asked(
        qc,
        () =>
          client.POST("/organisers/{id}/helpers", {
            params: { path: { id } },
            body: { email: email.trim() },
          }),
        "POST /organisers/{id}/helpers",
      );
    },
    onSuccess: (helper) => {
      qc.setQueryData<OrganiserHelperListed[]>(
        qk.organiserHelpers(id),
        (list) =>
          list && !list.some((row) => row.travellerId === helper.travellerId)
            ? [...list, helper]
            : list,
      );
      void qc.invalidateQueries({ queryKey: qk.organiserHelpers(id) });
    },
    // 409 `conflict`: the organiser is no longer verified.
    onError: (error) => afterConflict(qc, id, error),
  });
}

/** `DELETE /organisers/{id}/helpers/{travellerId}`: 204, and the row goes. */
export function useRemoveOrganiserHelper(id: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (travellerId: string): Promise<void> => {
      const client = createProxyClient();
      try {
        const { error } = await client.DELETE(
          "/organisers/{id}/helpers/{travellerId}",
          { params: { path: { id, travellerId } } },
        );
        if (error) throw error;
      } catch (error) {
        afterRefusal(qc, error);
        throw error;
      }
    },
    onSuccess: (_none, travellerId) => {
      qc.setQueryData<OrganiserHelperListed[]>(
        qk.organiserHelpers(id),
        (list) => list?.filter((row) => row.travellerId !== travellerId),
      );
      void qc.invalidateQueries({ queryKey: qk.organiserHelpers(id) });
    },
    onError: (error) => {
      // Removed elsewhere already: the list is read again.
      if (error instanceof YuvoyError && error.status === 404) {
        void qc.invalidateQueries({ queryKey: qk.organiserHelpers(id) });
      }
    },
  });
}

/** `POST /organisers/{id}/events`: `in_checking`, or `live` at once with self-publish. */
export function usePostOrganiserEvent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (body: OrganiserEventInput): Promise<OrganiserEvent> => {
      const client = createProxyClient();
      return asked(
        qc,
        () =>
          client.POST("/organisers/{id}/events", {
            params: { path: { id } },
            body,
          }),
        "POST /organisers/{id}/events",
      );
    },
    onSuccess: (event) => {
      void qc.invalidateQueries({ queryKey: qk.organiserEvents(id) });
      void qc.invalidateQueries({
        queryKey: ["getOrganiserEventNumbers", id, event.id],
      });
    },
    // 409 `conflict`: the organiser was suspended or closed since it was read.
    onError: (error) => afterConflict(qc, id, error, true),
  });
}

/** `PATCH /organisers/{id}/events/{eventPostId}`: the whole event (`eventInput`). */
export function useEditOrganiserEvent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (change: {
      postId: string;
      body: OrganiserEventInput;
    }): Promise<OrganiserEvent> => {
      const client = createProxyClient();
      return asked(
        qc,
        () =>
          client.PATCH("/organisers/{id}/events/{eventPostId}", {
            params: { path: { id, eventPostId: change.postId } },
            body: change.body,
          }),
        "PATCH /organisers/{id}/events/{eventPostId}",
      );
    },
    onSuccess: (event, change) => {
      qc.setQueryData<OrganiserEvent[]>(qk.organiserEvents(id), (list) =>
        withEvent(list, event),
      );
      eventChanged(qc, id, change.postId);
    },
    onError: (error, change) => {
      eventChanged(qc, id, change.postId);
      // A suspended or closed organiser is a 409 here too.
      afterConflict(qc, id, error);
    },
  });
}

/**
 * `POST /organisers/{id}/events/{eventPostId}/cancel`. Taken while paused
 * too, and a second cancel answers 200 cancelled as it is.
 */
export function useCancelOrganiserEvent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (postId: string): Promise<OrganiserEvent> => {
      const client = createProxyClient();
      return asked(
        qc,
        () =>
          client.POST("/organisers/{id}/events/{eventPostId}/cancel", {
            params: { path: { id, eventPostId: postId } },
          }),
        "POST /organisers/{id}/events/{eventPostId}/cancel",
      );
    },
    onSuccess: (event, postId) => {
      qc.setQueryData<OrganiserEvent[]>(qk.organiserEvents(id), (list) =>
        withEvent(list, event),
      );
      eventChanged(qc, id, postId);
    },
    onError: (_error, postId) => eventChanged(qc, id, postId),
  });
}
