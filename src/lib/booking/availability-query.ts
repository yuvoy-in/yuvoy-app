import { api } from "@/lib/api/client";
import type { DateRange } from "./availability-window";

/**
 * The availability read, as one function for every screen that asks.
 *
 * Checkout's calendar and the listing's sticky bar (yuvoy-app#111) ask the
 * same question of the same endpoint over the same window, and the bar's
 * "next open" day has to be the day checkout then opens on. Two hand-written
 * copies of the call are how the picker and checkout drifted twice before
 * (see `availability-window.ts`), so there is one.
 *
 * The two screens deliberately do NOT share a cache entry: `qk` keeps
 * checkout's reads its own, so checkout never paints a seat count fetched on
 * an earlier screen. They share this function, the window and the rule that
 * turns slots into days, which is what makes their answers agree.
 */
export async function fetchAvailability(
  slug: string,
  range: DateRange,
  signal?: AbortSignal,
) {
  const { data, error } = await api.GET("/experiences/{slug}/availability", {
    params: { path: { slug }, query: { from: range.from, to: range.to } },
    signal,
  });
  if (error) throw error;
  return data;
}
