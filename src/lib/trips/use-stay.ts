"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query/policy";
import { clearStay, readStay, writeStay, type Stay } from "./stay";

/**
 * The stay on this device, and the ways to change it. Read once and kept: it
 * only changes when this screen changes it, and every change writes the new
 * value into the cache rather than reading the store back.
 */
export function useStay() {
  const client = useQueryClient();
  const stay = useQuery({
    queryKey: qk.deviceStay(),
    queryFn: readStay,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const save = useMutation({
    mutationFn: async (next: Stay | null) => {
      if (next) await writeStay(next);
      else await clearStay();
      return next;
    },
    onSuccess: (next) => client.setQueryData(qk.deviceStay(), next),
  });

  return { stay, save };
}
