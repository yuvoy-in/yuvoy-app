"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createProxyClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { qk } from "@/lib/query/policy";
import {
  normaliseCode,
  type CheckInAnswer,
  type CheckInVia,
} from "./check-in";

/** What one check-in sends: the code as shown or typed, and how it came. */
export interface CheckInVariables {
  code: string;
  via: CheckInVia;
}

/**
 * `POST /organiser-check-ins` through the proxy (yuvoy-app#226, the web half
 * of yuvoy-mobile#394): one code at a time, session only. Nothing is cached
 * and nothing is retried: a second send of a code that landed only answers
 * "already checked in", and the page decides when to send again.
 *
 * A 401 reads the session again, as `useConfirmAge` does, so the page falls
 * to its sign-in branch. What a refusal shows is `checkInRefusal`'s.
 */
export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation<CheckInAnswer, unknown, CheckInVariables>({
    retry: false,
    mutationFn: async ({ code, via }) => {
      const client = createProxyClient();
      const { data, error } = await client.POST("/organiser-check-ins", {
        body: { code: normaliseCode(code), via },
      });
      if (error) throw error;
      if (!data) throw new Error("POST /organiser-check-ins had no body.");
      return data;
    },
    onError: (error) => {
      if (error instanceof YuvoyError && error.status === 401) {
        void qc.invalidateQueries({ queryKey: qk.session() });
      }
    },
  });
}
