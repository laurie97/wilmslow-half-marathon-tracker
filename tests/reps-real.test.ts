import { describe, expect, it } from "vitest";
import { summariseReps, type Lap } from "../lib/reps";
import type { PlanSession } from "../lib/types";

// Real laps from a 3 × 1 km hill session (distance m, moving time s): warm-up,
// then each 1 km rep with a jog-back recovery lap, then a cool-down.
const LAPS: Lap[] = [
  [641.26, 213],
  [1000, 274],
  [451.47, 182],
  [1000, 277],
  [352.7, 178],
  [1000, 280],
  [612.36, 264],
].map(([distanceM, movingTimeS]) => ({
  activityId: 1,
  distanceM,
  movingTimeS,
  avgHr: null,
}));

function threeByOneK(paceS: number | null): PlanSession {
  const pace = paceS === null ? {} : { pace: { min_s: paceS, max_s: paceS } };
  const session: PlanSession = {
    id: "hill",
    date: "2026-10-14",
    day: "Wed",
    type: "intervals",
    title: "3 x 1 km",
    structure: [{ kind: "reps", reps: 3, distance_m: 1000, ...pace }],
  };
  return session;
}

describe("real 3 × 1 km hill session", () => {
  it("finds the three 1 km reps from the plan", () => {
    const summary = summariseReps(threeByOneK(277), LAPS);
    expect(summary?.method).toBe("plan");
    expect(summary?.laps.map((l) => l.movingTimeS)).toEqual([274, 277, 280]);
    expect(summary?.paceSPerKm).toBeCloseTo(277, 0); // 4:37 /km
  });

  it("still finds them by pace alone, without a plan structure", () => {
    const summary = summariseReps({ ...threeByOneK(null), structure: [] }, LAPS);
    expect(summary?.method).toBe("pace");
    expect(summary?.laps.map((l) => l.movingTimeS)).toEqual([274, 277, 280]);
  });
});
