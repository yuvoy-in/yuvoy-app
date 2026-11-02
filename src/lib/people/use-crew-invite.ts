"use client";

import { useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { peopleShutByFollows } from "@/lib/groups/use-follows";
import { qk } from "@/lib/query/policy";
import {
  PeopleShutError,
  readCrewsAgain,
  releasesReadAgain,
} from "./people-stand-ins";

/**
 * Invite a crew to a plan, `POST /plans/{planId}/crew-invites`
 * (yuvoy-mobile#392, web half), through this app's proxy.
 *
 * A 404 is never success (decision A). The API answers 404 while People or
 * plans is closed to the caller and for a plan or crew that is not theirs.
 * So after one the releases are read again: People closed turns into
 * `PeopleShutError`; plans closed, or both open, stays the 404 and says the
 * plan is not there. When the releases cannot be read, the follows list
 * (which answers 404 only for People closed) is the People signal. Either
 * way the plans list and the crews are read again.
 */

export interface CrewInviteResult {
  invited: number;
  skipped: number;
}

export function useInviteCrewToPlan(crewId: string) {
  const qc = useQueryClient();
  const { signedIn } = useTravellerSession();
  const busy = useRef(false);

  const mutation = useMutation({
    retry: false,
    mutationFn: async (planId: string): Promise<CrewInviteResult> => {
      const client = createProxyClient();
      try {
        const { data, error } = await client.POST(
          "/plans/{planId}/crew-invites",
          { params: { path: { planId } }, body: { crewId } },
        );
        if (error || !data) {
          throw (
            error ?? new Error("POST /plans/{planId}/crew-invites had no body.")
          );
        }
        return data;
      } catch (error) {
        if (error instanceof YuvoyError && error.status === 404) {
          void qc.invalidateQueries({ queryKey: ["listMyPlans"] });
          void readCrewsAgain(qc);
          const open = await releasesReadAgain(qc, Boolean(signedIn), [
            "people",
            "plans",
          ]);
          if (open && !open("people")) throw new PeopleShutError();
          if (!open && (await peopleShutByFollows(qc))) {
            throw new PeopleShutError();
          }
          throw error;
        }
        throw error;
      }
    },
    onSuccess: () => {
      // The plan now has more people on it; the picker shows "going".
      void qc.invalidateQueries({ queryKey: ["listMyPlans"] });
    },
    onError: (error) => {
      if (!(error instanceof YuvoyError)) return;
      if (error.status === 401) {
        void qc.invalidateQueries({ queryKey: qk.session() });
      }
      if (error.status === 409 && error.code === "plan_closed") {
        // The picker offered a plan that has since closed; read it again.
        void qc.invalidateQueries({ queryKey: ["listMyPlans"] });
      }
    },
    onSettled: () => {
      busy.current = false;
    },
  });

  const { mutate } = mutation;
  /** One invite at a time: a burst of taps sends one request. */
  const invite = useCallback(
    (planId: string) => {
      if (busy.current) return;
      busy.current = true;
      mutate(planId);
    },
    [mutate],
  );

  return { ...mutation, invite };
}
