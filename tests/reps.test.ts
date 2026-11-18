import { describe, expect, it } from "vitest";
import { MemoryStore } from "../lib/db";
import { demoLaps } from "../lib/demo";
import { attachReps } from "../lib/progress";
import { lapScore, paceReps, repTargets, summariseReps, type Lap } from "../lib/reps";
import { fastestSession } from "../lib/stats";
import { toLap } from "../lib/strava";
import type { Activity, PlanSession, SessionResult, WeekResult } from "../lib/types";

/** A lap of `metres` at `paceS` seconds per km. */
function lap(metres: number, paceS: number, activityId = 1): Lap {
  const result: Lap = {
    activityId,
    distanceM: metres,
    movingTimeS: Math.round((metres / 1000) * paceS),
    avgHr: null,
  };
  return result;
}

function session(structure: unknown[], type = "tempo"): PlanSession {
  const result: PlanSession = {
    id: "s1",
    date: "2026-11-19",
    day: "Thu",
    type,
    title: "5 x 700 m @ 4:35",
    structure,
  };
  return result;
}

const FIVE_BY_700 = session([
  {
    kind: "reps",
    reps: 5,
    distance_m: 700,
    pace: { min_s: 275, max_s: 275, label: "4:35" },
    recovery: { kind: "jog", duration_s: 60 },
  },
]);

const jog = lap(150, 400); // 60 s recovery

describe("repTargets", () => {
  it("reads reps with an expected time from the target pace", () => {
    const [target] = repTargets(FIVE_BY_700);
    expect(target.reps).toBe(5);
    expect(target.distanceM).toBe(700);
    expect(target.timeS).toBeCloseTo(192.5);
    expect(target.paceLabel).toBe("4:35");
  });

  it("handles timed blocks and continuous blocks, and skips strides", () => {
    const targets = repTargets(
      session([
        { kind: "reps", reps: 6, duration_s: 180, pace: { min_s: 250, max_s: 260 } },
        { kind: "steady", duration_min: 20, pace: { min_s: 280, max_s: 280 } },
        { kind: "strides", reps: 4, distance_m: 100 },
      ]),
    );
    expect(targets).toHaveLength(2);
    expect(targets[0].reps).toBe(6);
    expect(targets[0].distanceM).toBeCloseTo((180 / 255) * 1000);
    expect(targets[1].reps).toBe(1);
    expect(targets[1].timeS).toBe(1200);
  });
});

describe("lapScore", () => {
  const [target] = repTargets(FIVE_BY_700);

  it("accepts a lap close in distance and time", () => {
    expect(lapScore(lap(705, 272), target)).not.toBeNull();
  });

  it("rejects a lap of the right distance run too slowly", () => {
    expect(lapScore(lap(700, 360), target)).toBeNull(); // a 700 m warm-up lap
  });

  it("rejects a lap of the wrong distance", () => {
    expect(lapScore(lap(1000, 275), target)).toBeNull();
  });
});

describe("summariseReps", () => {
  it("averages the planned reps, leaving out warm-up, recoveries and cool-down", () => {
    const reps = [270, 272, 275, 268, 271].map((p) => lap(700, p));
    const laps = [
      lap(1500, 360),
      reps[0],
      jog,
      reps[1],
      jog,
      reps[2],
      jog,
      reps[3],
      jog,
      reps[4],
      lap(1000, 370),
    ];
    const summary = summariseReps(FIVE_BY_700, laps);
    expect(summary?.method).toBe("plan");
    expect(summary?.laps).toEqual(reps);
    expect(summary?.distanceKm).toBeCloseTo(3.5);
    expect(summary?.paceSPerKm).toBeCloseTo(271.2, 0);
    expect(summary?.targetPaceSPerKm).toBe(275);
    expect(summary?.targetLabel).toBe("4:35");
  });

  it("ignores a 700 m warm-up lap that is too slow to be a rep", () => {
    const laps = [
      lap(700, 350),
      lap(700, 350),
      ...[1, 2, 3, 4, 5].map(() => lap(700, 272)),
    ];
    const summary = summariseReps(FIVE_BY_700, laps);
    expect(summary?.laps).toHaveLength(5);
    expect(summary?.paceSPerKm).toBeCloseTo(271.4, 0);
  });

  it("takes only the planned number of reps, the closest ones", () => {
    const laps = [lap(640, 275), ...[1, 2, 3, 4, 5].map(() => lap(700, 275))];
    const summary = summariseReps(FIVE_BY_700, laps);
    expect(summary?.laps.map((l) => l.distanceM)).toEqual([700, 700, 700, 700, 700]);
  });

  it("falls back to pace when the laps don't fit the plan", () => {
    // Tempo lapped as one block: warm-up, 3.5 km tempo, cool-down.
    const laps = [lap(1500, 360), lap(3500, 276), lap(1000, 370)];
    const summary = summariseReps(FIVE_BY_700, laps);
    expect(summary?.method).toBe("pace");
    expect(summary?.laps).toEqual([laps[1]]);
  });

  it("finds nothing in a run with no faster laps", () => {
    const laps = [lap(1000, 300), lap(1000, 305), lap(1000, 298)];
    expect(summariseReps(FIVE_BY_700, laps)).toBeNull();
    expect(paceReps(laps)).toEqual([]);
  });

  it("works by pace alone for a session with no structure", () => {
    const laps = [lap(1500, 360), lap(400, 245), jog, lap(400, 248), lap(1000, 370)];
    const summary = summariseReps(session([]), laps);
    expect(summary?.method).toBe("pace");
    expect(summary?.laps).toHaveLength(2);
    expect(summary?.plannedReps).toBeNull();
  });
});

function activity(id: number, paceS: number): Activity {
  const result: Activity = {
    id,
    name: "Tempo",
    date: "2026-11-19",
    startLocal: "2026-11-19T07:00:00",
    sportType: "Run",
    distanceKm: 6.5,
    movingTimeS: Math.round(6.5 * paceS),
    avgHr: null,
  };
  return result;
}

function week(results: SessionResult[]): WeekResult {
  const result: WeekResult = {
    week: 1,
    weekCommencing: "2026-11-16",
    weekEnding: "2026-11-22",
    phase: "base",
    phaseName: "Base",
    notes: null,
    plannedKm: null,
    actualKm: 0,
    sessions: results,
    extras: [],
    runs: [],
    state: "past",
    completion: 1,
  };
  return result;
}

function result(s: PlanSession, matched: Activity[]): SessionResult {
  const r: SessionResult = {
    session: s,
    status: "done",
    matched,
    moved: false,
    isManual: false,
    isToday: false,
    override: null,
    reps: null,
  };
  return r;
}

describe("attachReps and fastestSession", () => {
  it("ranks tempo sessions by rep pace, not whole-run pace", () => {
    // Session A: quicker overall, slower reps. Session B: the reverse.
    const a = activity(1, 300);
    const b = activity(2, 320);
    const weeks = [
      week([
        result({ ...FIVE_BY_700, id: "a" }, [a]),
        result({ ...FIVE_BY_700, id: "b" }, [b]),
      ]),
    ];
    const laps = new Map([
      [1, [1, 2, 3, 4, 5].map(() => lap(700, 280))],
      [2, [1, 2, 3, 4, 5].map(() => lap(700, 268))],
    ]);
    const withReps = attachReps(weeks, laps);
    expect(withReps[0].sessions[0].reps?.paceSPerKm).toBeCloseTo(280, 0);
    const fastest = fastestSession(withReps, "tempo");
    expect(fastest?.activities[0].id).toBe(2);
    expect(fastest?.repCount).toBe(5);
    expect(fastestSession(weeks, "tempo")?.activities[0].id).toBe(1); // no laps
  });
});

describe("demoLaps", () => {
  it("produces laps the plan matcher finds every rep in", () => {
    const laps = demoLaps(FIVE_BY_700, activity(16_200_000_000, 330)).map((l) => ({
      ...l,
      activityId: 1,
    }));
    const summary = summariseReps(FIVE_BY_700, laps);
    expect(summary?.method).toBe("plan");
    expect(summary?.laps).toHaveLength(5);
  });
});

describe("lap cache", () => {
  it("forgets laps after 7 days", async () => {
    const store = new MemoryStore();
    const day = 24 * 60 * 60 * 1000;
    await store.saveLaps(1, 99, [{ distanceM: 700, movingTimeS: 190, avgHr: null }], 0);
    expect((await store.getLaps(1, [99], 6 * day)).has(99)).toBe(true);
    expect((await store.getLaps(1, [99], 8 * day)).has(99)).toBe(false);
  });
});

describe("toLap", () => {
  it("keeps distance, moving time and heart rate", () => {
    const converted = toLap({
      distance: 701.4,
      moving_time: 0,
      elapsed_time: 193,
      average_heartrate: 164.6,
    });
    expect(converted).toEqual({ distanceM: 701.4, movingTimeS: 193, avgHr: 165 });
  });
});
