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
  Organiser,
  OrganiserEvent,
  OrganiserEventInput,
  OrganiserHelper,
  OrganiserHelperListed,
  OrganiserInput,
} from "./types";

/**
 * Organiser pages for a signed-in adult (yuvoy-app#224, the web half of
 * yuvoy-mobile#393), read and changed through this app's proxy, which holds
 * the session: every organiser route is session only.
 *
 * A screen passes `enabled` only once the session says signed in (and the
 * `supply` release is open to the person), so a visitor calls nothing.
 *
 * Every read is `retry: false`: none of the refusals improve by asking again
 * at once. The client itself still retries a GET that never arrived, and a
 * GET that answered 503, up to three tries in all; `organisers_paused` is not
 * in its never-retry list, so a paused read is asked three times before it
 * reaches the screen.
 *
 * Any 401 reads the session entry again, so the screen falls to its sign-in
 * branch. What the screen says for a refusal comes from `organiserRefusal`.
 */

/** A 401 means the sign-in ended: the session entry is read again. */
function afterRefusal(qc: QueryClient, error: unknown) {
  if (error instanceof YuvoyError && error.status === 401) {
    void qc.invalidateQueries({ queryKey: qk.session() });
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

/** Removes everything organiser from the cache. Sign in and sign out call it. */
export function forgetOrganisers(qc: QueryClient) {
  qc.removeQueries({ queryKey: qk.myOrganisers() });
  qc.removeQueries({ queryKey: ["getOrganiser"] });
  qc.removeQueries({ queryKey: ["listOrganiserEvents"] });
  qc.removeQueries({ queryKey: ["getOrganiserEventNumbers"] });
  qc.removeQueries({ queryKey: ["listOrganiserHelpers"] });
}

/* ------------------------------------------------------------------ reads -- */

/** `GET /me/organisers`: the person's organisers. The groups to link are not used on the web. */
export function useMyOrganisers(enabled: boolean) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.myOrganisers(),
    enabled,
    retry: false,
    ...CACHE.organisers,
    queryFn: async ({ signal }): Promise<Organiser[]> => {
      const client = createProxyClient();
      const page = await asked(
        qc,
        () => client.GET("/me/organisers", { signal }),
        "GET /me/organisers",
      );
      return page.items;
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

/** `POST /organisers`: set up a page. The person becomes its owner, and it starts `pending`. */
export function useCreateOrganiser() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (body: OrganiserInput): Promise<Organiser> => {
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

/** `PATCH /organisers/{id}`: the whole page, every field sent (`organiserInput`). Owners only. */
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
    onError: (_error, change) => eventChanged(qc, id, change.postId),
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
