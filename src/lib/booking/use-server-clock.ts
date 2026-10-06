import { useEffect, useState } from "react";
import { clockOffsetMs } from "./clock";

/** How often a screen that shows the time reads it again. */
const TICK_MS = 30_000;

/**
 * The server's clock, kept current while a screen is open.
 *
 * Read on an interval, never during render (an impure read the React compiler
 * refuses), and never earlier than `from`: the instant the screen was drawn or
 * its data was read, by the same clock. Thirty seconds is fine enough for
 * everything that reads it: a cutoff passing, "Tomorrow" becoming "Today" at
 * midnight, a trip that has left.
 */
export function useServerClock(from: number): number {
  const [ticked, setTicked] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setTicked(Date.now() + clockOffsetMs()),
      TICK_MS,
    );
    return () => clearInterval(id);
  }, []);
  return Math.max(from, ticked);
}
