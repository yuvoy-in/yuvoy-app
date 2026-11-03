"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { YuvoyError } from "@/lib/api/errors";
import { qk } from "@/lib/query/policy";

/**
 * A read that answers 401 means the session ended: the proxy has dropped the
 * cookie, so the cached "signed in" is stale. Reading the session again lets
 * the screen fall to its sign-in branch rather than draw a failure only
 * signing in can fix. Runs once for each error a read gives.
 */
export function useSessionAfter401(error: unknown): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (error instanceof YuvoyError && error.status === 401) {
      void qc.invalidateQueries({ queryKey: qk.session() });
    }
  }, [error, qc]);
}
