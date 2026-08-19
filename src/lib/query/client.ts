import { QueryClient } from "@tanstack/react-query";
import { YuvoyError, NetworkError } from "@/lib/api/errors";

/**
 * The shared QueryClient.
 *
 * The retry rule is the important part. TanStack retries by default, and the
 * default is wrong for this API: a `booking_disabled` is a human's decision,
 * not a transient fault, and retrying it three times just asks again. The
 * client wrapper already retries transient GETs with backoff, so this layer
 * retries almost nothing.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The API client owns transport retry. Retrying here would multiply it.
        retry: (failureCount, error) => {
          if (error instanceof NetworkError) return failureCount < 1;
          if (error instanceof YuvoyError) return false;
          return false;
        },
        refetchOnWindowFocus: false, // opted into per query, not globally
        // A traveller who comes back to the tab after a ferry crossing should
        // see fresh data, not a spinner over stale data.
        refetchOnReconnect: true,
        staleTime: 30_000,
      },
      mutations: {
        // Never automatic. A replayed POST is how one checkout becomes two.
        retry: false,
      },
    },
  });
}
