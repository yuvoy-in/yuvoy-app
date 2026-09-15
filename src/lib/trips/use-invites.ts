"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createApiClient, createProxyClient } from "@/lib/api/client";
import { qk } from "@/lib/query/policy";
import type { components } from "@/lib/api/schema.gen";

export type TripGuest = components["schemas"]["TripGuest"];
export type CreatedTripInvite = components["schemas"]["CreatedTripInvite"];
export type TripInvitePreview = components["schemas"]["TripInvitePreview"];
export type InvitedTrip = components["schemas"]["InvitedTrip"];

/**
 * Inviting people onto a booking, and what a guest sees (yuvoy-app#38).
 *
 * ## Two audiences, two credentials, one file
 *
 * The BOOKER acts with the booking's status token: they are on the booking
 * page, which is reached by a link rather than by signing in, and the contract
 * authorises these calls by "the booking's status token (any issuer) ... A
 * share token is refused".
 *
 * The GUEST acts with a traveller session, through this app's own server, and
 * never sees a status token at all. That asymmetry is the security model
 * rather than an accident: a guest who could reach the booking's token could
 * cancel the trip.
 */

/** The guests on a booking, as the booker sees them. */
export function useTripGuests(token: string | null | undefined) {
  return useQuery({
    queryKey: ["listTripInvites", token] as const,
    enabled: Boolean(token),
    retry: false,
    queryFn: async ({ signal }) => {
      const client = createApiClient();
      const { data, error } = await client.GET("/bookings/invites", {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Offering a place, by number or as a link.
 *
 * The answer carries `inviteUrl`, and the contract says it is "Returned once".
 * So the caller has to keep it: a refetch of the guest list will not bring it
 * back, and a component that dropped it would leave the booker with an
 * invitation they cannot deliver.
 */
export function useInviteGuest(token: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (phone?: string) => {
      const client = createApiClient();
      const { data, error } = await client.POST("/bookings/invites", {
        headers: { Authorization: `Bearer ${token}` },
        body: phone ? { phone } : {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["listTripInvites", token] });
    },
  });
}

/** Withdrawing an invitation, or taking somebody off the trip. */
export function useRemoveGuest(token: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (id: string) => {
      const client = createApiClient();
      const { error } = await client.DELETE("/bookings/invites/{id}", {
        headers: { Authorization: `Bearer ${token}` },
        params: { path: { id } },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["listTripInvites", token] });
    },
  });
}

/* ------------------------------------------------------------- the guest -- */

/**
 * What an invitation link is for, with no credential at all.
 *
 * Deliberately NOT through the proxy: "Unauthenticated", and the whole shape
 * of the flow is that somebody signed out can see what they are being asked to
 * sign in for. Routing it through a server that attaches a session would make
 * the signed-out case the broken one.
 */
export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: ["previewTripInvite", token] as const,
    enabled: Boolean(token),
    retry: false,
    queryFn: async ({ signal }) => {
      const client = createApiClient();
      const { data, error } = await client.GET("/invites/{token}", {
        params: { path: { token } },
        signal,
      });
      if (error) throw error;
      return data;
    },
  });
}

/** Joining from an invitation link, as the signed-in number. */
export function useAcceptInviteLink() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async (token: string) => {
      const client = createProxyClient();
      const { data, error } = await client.POST("/invites/{token}/accept", {
        params: { path: { token } },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.invitedTrips() });
    },
  });
}

/** One trip somebody else booked, as a guest sees it. */
export function useInvitedTrip(id: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.invitedTrip(id),
    enabled: enabled && Boolean(id),
    retry: false,
    queryFn: async ({ signal }) => {
      const client = createProxyClient();
      const { data, error } = await client.GET("/me/invited-trips/{id}", {
        params: { path: { id } },
        signal,
      });
      if (error) throw error;
      return data;
    },
  });
}

/** Joining, or standing down, a trip already in the guest's own list. */
export function useAnswerInvitedTrip(id: string) {
  const qc = useQueryClient();

  const settle = () => {
    void qc.invalidateQueries({ queryKey: qk.invitedTrips() });
    void qc.invalidateQueries({ queryKey: qk.invitedTrip(id) });
  };

  const accept = useMutation({
    retry: false,
    mutationFn: async () => {
      const client = createProxyClient();
      const { data, error } = await client.POST(
        "/me/invited-trips/{id}/accept",
        { params: { path: { id } } },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: settle,
  });

  const decline = useMutation({
    retry: false,
    mutationFn: async () => {
      const client = createProxyClient();
      const { error } = await client.POST("/me/invited-trips/{id}/decline", {
        params: { path: { id } },
      });
      if (error) throw error;
    },
    onSuccess: settle,
  });

  return { accept, decline };
}

/* ------------------------------------------------------------------ copy -- */

/**
 * Where a guest's trip stands, in their words.
 *
 * `pending` is deliberately not "Pending": the traveller-facing sentence is
 * about the operator, who is the one who has not answered. And `called_off` is
 * separated from `cancelled` because a guest who reads "Cancelled" about a
 * departure the operator stood down will ask the person who booked it why they
 * cancelled.
 */
export const GUEST_TRIP_STATUS: Record<string, string> = {
  pending: "Waiting for the operator",
  confirmed: "Going ahead",
  completed: "Done",
  cancelled: "Cancelled",
  called_off: "Called off by the operator",
};

/** An invitation's own state, as the booker reads it. */
export const GUEST_STATE_LABEL: Record<string, string> = {
  invited: "Invited",
  joined: "Joined",
  declined: "Declined",
};
