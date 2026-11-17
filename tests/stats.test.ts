import { describe, expect, it } from "vitest";
import { matchPlan } from "../lib/matching";
import {
  countRuns,
  cumulativeDistance,
  fastestSession,
  longestRun,
  seasonStats,
} from "../lib/stats";
import type { Activity, Plan, PlanSession } from "../lib/types";

function s(id: string, date: string, type: string, km?: number): PlanSession {
  const session: PlanSession = {
    id,
    date,
    day: "",
    type,
    title: id,
    est_distance_km: km,
  };
  return session;
}

let nextId = 1;
function run(date: string, km: number, paceS = 330): Activity {
  const activity: Activity = {
    id: nextId++,
    name: `Run ${date}`,
    date,
    startLocal: `${date}T07:00:00`,
    sportType: "Run",
    distanceKm: km,
    movingTimeS: Math.round(km * paceS),
    avgHr: 150,
  };
  return activity;
}

// Two weeks from Mon 16 Nov 2026.
const plan: Plan = {
  weeks: [
    {
      week: 1,
      week_commencing: "2026-11-16",
      phase: "base",
      sessions: [
        s("w1-strength", "2026-11-16", "strength"),
        s("w1-intervals", "2026-11-17", "intervals", 7),
        s("w1-tempo", "2026-11-19", "tempo", 8),
        s("w1-long", "2026-11-22", "long_run", 12),
      ],
    },
    {
      week: 2,
      week_commencing: "2026-11-23",
      phase: "base",
      sessions: [
        s("w2-intervals", "2026-11-24", "intervals", 7),
        s("w2-tempo", "2026-11-26", "tempo", 8),
        s("w2-long", "2026-11-29", "long_run", 14),
      ],
    },
  ],
};

const TODAY = "2026-11-25";
const activities = [
  run("2026-11-17", 7.2, 300), // intervals, 5:00/km
  run("2026-11-19", 5, 290), // tempo, short: partial
  run("2026-11-22", 12.4, 360), // long run
  run("2026-11-24", 7.1, 280), // intervals, 4:40/km
];
const weeks = matchPlan(plan, activities, [], TODAY);

describe("countRuns", () => {
  it("counts run sessions only, with done, partial and due", () => {
    const counts = countRuns(weeks, TODAY);
    expect(counts).toEqual({ total: 6, due: 4, done: 3, partial: 1 });
  });
});

describe("cumulativeDistance", () => {
  const points = cumulativeDistance(weeks, TODAY);

  it("has one point per day of the plan", () => {
    expect(points).toHaveLength(14);
    expect(points[0].date).toBe("2026-11-16");
    expect(points[13].date).toBe("2026-11-29");
  });

  it("adds planned km on each session's date", () => {
    expect(points[0].expectedKm).toBe(0);
    expect(points[1].expectedKm).toBe(7);
    expect(points[13].expectedKm).toBe(56);
  });

  it("adds actual km up to today, then stops", () => {
    const today = points.find((p) => p.date === TODAY);
    expect(today?.actualKm).toBe(31.7);
    expect(points.find((p) => p.date === "2026-11-26")?.actualKm).toBeNull();
  });
});

describe("best runs", () => {
  it("finds the fastest session of a type by average pace", () => {
    const best = fastestSession(weeks, "intervals");
    expect(best?.title).toBe("w2-intervals");
    expect(best?.paceSPerKm).toBeCloseTo(280, 0);
  });

  it("returns null when no session of that type has been run", () => {
    expect(fastestSession(weeks, "race")).toBeNull();
  });

  it("finds the longest run and names its session", () => {
    const longest = longestRun(weeks);
    expect(longest?.distanceKm).toBe(12.4);
    expect(longest?.title).toBe("w1-long");
  });
});

describe("seasonStats", () => {
  it("summarises distance to date and for the whole plan", () => {
    const stats = seasonStats(weeks, TODAY);
    expect(stats.actualToDateKm).toBe(31.7);
    expect(stats.expectedToDateKm).toBe(34);
    expect(stats.plannedTotalKm).toBe(56);
    expect(stats.fastestTempo?.title).toBe("w1-tempo");
  });

  it("copes with an empty plan", () => {
    const stats = seasonStats([], TODAY);
    expect(stats.distance).toEqual([]);
    expect(stats.longestRun).toBeNull();
    expect(stats.runs.total).toBe(0);
  });
});

describe("planned distance to date", () => {
  it("leaves out today's session until the day is over", () => {
    const stats = seasonStats(weeks, "2026-11-24");
    expect(stats.expectedToDateKm).toBe(27);
    expect(stats.actualToDateKm).toBe(31.7);
  });
});
