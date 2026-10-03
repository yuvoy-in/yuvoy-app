import { describe, it, expect } from "vitest";
import { isStay, planDays, stayLength, MAX_STAY_DAYS } from "./stay";
import type { ServerTrip } from "./tabs";

const trip = (over: Partial<ServerTrip>): ServerTrip =>
  ({
    reference: "YV-1",
    reservationId: "res_1",
    experience: "Try-dive at Nemo Reef",
    state: "confirmed",
    localDate: "2026-10-16",
    localTime: "07:00",
    ...over,
  }) as ServerTrip;

describe("isStay", () => {
  it("takes two market dates in order, within a holiday's length", () => {
    expect(isStay({ from: "2026-10-15", to: "2026-10-18" })).toBe(true);
    expect(isStay({ from: "2026-10-15", to: "2026-10-15" })).toBe(true);
  });

  it("reads anything else back as no stay at all", () => {
    expect(isStay(null)).toBe(false);
    expect(isStay({ from: "2026-10-18", to: "2026-10-15" })).toBe(false);
    expect(isStay({ from: "15 Oct", to: "18 Oct" })).toBe(false);
    expect(isStay({ from: "2026-10-15" })).toBe(false);
    const long = new Date(Date.UTC(2026, 9, 15 + MAX_STAY_DAYS))
      .toISOString()
      .slice(0, 10);
    expect(isStay({ from: "2026-10-15", to: long })).toBe(false);
  });
});

describe("stayLength", () => {
  it("counts both ends", () => {
    expect(stayLength({ from: "2026-10-15", to: "2026-10-18" })).toBe(4);
    expect(stayLength({ from: "2026-10-31", to: "2026-11-01" })).toBe(2);
  });
});

describe("planDays", () => {
  const stay = { from: "2026-10-15", to: "2026-10-18" };

  it("lays out every day still to come, with what is on each, in time order", () => {
    const plan = planDays(
      stay,
      [
        trip({ reservationId: "late", localTime: "15:30" }),
        trip({ reservationId: "early", localTime: "07:00" }),
        trip({
          reservationId: "asked",
          localDate: "2026-10-17",
          state: "pending_request",
        }),
      ],
      "2026-10-15",
    );
    expect(plan.state).toBe("here");
    if (plan.state === "over") return;
    expect(plan.days.map((d) => d.date)).toEqual([
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    expect(plan.days.map((d) => d.label)).toEqual([
      "Today",
      "Tomorrow",
      "Sat 17 Oct",
      "Sun 18 Oct",
    ]);
    expect(plan.days[1].trips.map((t) => t.reservationId)).toEqual([
      "early",
      "late",
    ]);
    expect(plan.days[2].trips.map((t) => t.reservationId)).toEqual(["asked"]);
  });

  it("leaves out the days already gone", () => {
    const plan = planDays(stay, [], "2026-10-17");
    expect(plan.state === "over" ? [] : plan.days.map((d) => d.date)).toEqual([
      "2026-10-17",
      "2026-10-18",
    ]);
  });

  it("is ahead before arrival, and over after the last day", () => {
    expect(planDays(stay, [], "2026-10-10").state).toBe("ahead");
    expect(planDays(stay, [], "2026-10-19")).toEqual({ state: "over" });
  });

  it("puts nothing called off or turned down on a day", () => {
    const plan = planDays(
      stay,
      [
        trip({ state: "cancelled" }),
        trip({ state: "declined" }),
        trip({ state: "completed", localDate: "2026-10-15" }),
      ],
      "2026-10-15",
    );
    expect(
      plan.state === "over" ? [] : plan.days.flatMap((d) => d.trips),
    ).toHaveLength(0);
  });
});
