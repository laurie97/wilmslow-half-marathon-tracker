import { describe, expect, it } from "vitest";
import { matchPlan, matchWeek } from "../lib/matching";
import type { Activity, Override, Plan, PlanSession, PlanWeek } from "../lib/types";

// Week of Mon 16 Nov 2026.
const MON = "2026-11-16";
const TUE = "2026-11-17";
const WED = "2026-11-18";
const THU = "2026-11-19";
const FRI = "2026-11-20";
const SAT = "2026-11-21";
const SUN = "2026-11-22";
const NEXT_TUE = "2026-11-24";

function s(
  id: string,
  date: string,
  type: string,
  km?: number,
  extra: Partial<PlanSession> = {},
): PlanSession {
  const session: PlanSession = {
    id,
    date,
    day: "",
    type,
    title: id,
    est_distance_km: km,
    ...extra,
  };
  return session;
}

let nextId = 1;
function run(date: string, km: number, extra: Partial<Activity> = {}): Activity {
  const activity: Activity = {
    id: nextId++,
    name: `Run ${date}`,
    date,
    startLocal: `${date}T07:00:00`,
    sportType: "Run",
    distanceKm: km,
    movingTimeS: Math.round(km * 330),
    avgHr: 150,
    ...extra,
  };
  return activity;
}

function standardWeek(): PlanWeek {
  const week: PlanWeek = {
    week: 1,
    week_commencing: MON,
    phase: "base",
    sessions: [
      s("mon-strength", MON, "strength"),
      s("tue-intervals", TUE, "intervals", 7),
      s("wed-easy", WED, "easy", 5),
      s("thu-tempo", THU, "tempo", 8),
      s("sun-long", SUN, "long_run", 12, {
        flexible_window: { start: SAT, end: SUN },
      }),
    ],
  };
  return week;
}

function match(
  week: PlanWeek,
  activities: Activity[],
  today = "2026-11-30",
  overrides: Override[] = [],
  pinnedElsewhere?: Set<number>,
) {
  const result = matchWeek({
    week,
    activities,
    overrides: new Map(overrides.map((o) => [o.sessionId, o])),
    today,
    pinnedElsewhere,
  });
  return result;
}

function byId(result: ReturnType<typeof match>, id: string) {
  const found = result.sessions.find((x) => x.session.id === id);
  if (!found) throw new Error(`no session ${id}`);
  return found;
}

describe("matchWeek", () => {
  it("matches a normal week", () => {
    const runs = [run(TUE, 7.2), run(WED, 5.1), run(THU, 8.3), run(SUN, 12.4)];
    const result = match(standardWeek(), runs);
    expect(byId(result, "tue-intervals").matched[0].id).toBe(runs[0].id);
    expect(byId(result, "wed-easy").matched[0].id).toBe(runs[1].id);
    expect(byId(result, "thu-tempo").matched[0].id).toBe(runs[2].id);
    expect(byId(result, "sun-long").matched[0].id).toBe(runs[3].id);
    for (const id of ["tue-intervals", "wed-easy", "thu-tempo", "sun-long"]) {
      expect(byId(result, id).status).toBe("done");
      expect(byId(result, id).moved).toBe(false);
    }
    expect(byId(result, "mon-strength").status).toBe("missed");
    expect(result.extras).toHaveLength(0);
    expect(result.actualKm).toBe(33);
    expect(result.completion).toBeCloseTo(4 / 5);
    expect(result.state).toBe("past");
  });

  it("flags a moved session and matches a long run on Sunday", () => {
    // Tempo done on Friday instead of Thursday; long run on Sunday.
    const runs = [run(TUE, 7), run(WED, 5), run(FRI, 8.1), run(SUN, 12)];
    const result = match(standardWeek(), runs);
    const tempo = byId(result, "thu-tempo");
    expect(tempo.matched[0].date).toBe(FRI);
    expect(tempo.status).toBe("done");
    expect(tempo.moved).toBe(true);
    const long = byId(result, "sun-long");
    expect(long.matched[0].date).toBe(SUN);
    expect(long.moved).toBe(false);
  });

  it("does not flag a long run moved within its flexible window", () => {
    const runs = [run(SAT, 12)];
    const result = match(standardWeek(), runs);
    const long = byId(result, "sun-long");
    expect(long.matched[0].date).toBe(SAT);
    expect(long.moved).toBe(false);
  });

  it("gives a lone Thursday run to tempo rather than intervals", () => {
    const runs = [run(THU, 7.5)];
    const result = match(standardWeek(), runs);
    expect(byId(result, "thu-tempo").matched).toHaveLength(1);
    expect(byId(result, "tue-intervals").matched).toHaveLength(0);
  });

  it("does not take a midweek run as the long run", () => {
    // Longest run is 8.5 km on Thursday: below 1.15 × the 8 km tempo.
    const runs = [run(TUE, 7), run(THU, 8.5)];
    const result = match(standardWeek(), runs);
    expect(byId(result, "sun-long").matched).toHaveLength(0);
    expect(byId(result, "thu-tempo").matched[0].id).toBe(runs[1].id);
    expect(byId(result, "tue-intervals").matched[0].id).toBe(runs[0].id);
  });

  it("marks a short long run as partial", () => {
    // 9.5 km: at least 50% of 12 and 1.15 × 8, but under 85% of 12.
    const runs = [run(SUN, 9.5)];
    const result = match(standardWeek(), runs);
    const long = byId(result, "sun-long");
    expect(long.matched).toHaveLength(1);
    expect(long.status).toBe("partial");
    expect(result.completion).toBeCloseTo(0.5 / 5);
  });

  it("leaves a short jog as an extra", () => {
    const runs = [run(MON, 2), run(TUE, 7), run(WED, 5)];
    const result = match(standardWeek(), runs);
    expect(result.extras.map((a) => a.id)).toEqual([runs[0].id]);
    expect(byId(result, "tue-intervals").matched[0].id).toBe(runs[1].id);
    expect(byId(result, "wed-easy").matched[0].id).toBe(runs[2].id);
    expect(result.actualKm).toBe(14);
  });

  it("ignores rides and walks", () => {
    const activities = [
      run(TUE, 20, { sportType: "Ride" }),
      run(WED, 5, { sportType: "Walk" }),
      run(SUN, 30, { sportType: "Ride" }),
      run(THU, 8, { sportType: "TrailRun" }),
    ];
    const result = match(standardWeek(), activities);
    expect(byId(result, "sun-long").matched).toHaveLength(0);
    expect(byId(result, "wed-easy").matched).toHaveLength(0);
    expect(byId(result, "tue-intervals").matched).toHaveLength(0);
    expect(byId(result, "thu-tempo").matched[0].sportType).toBe("TrailRun");
    expect(result.extras).toHaveLength(0);
    expect(result.actualKm).toBe(8);
  });

  it("counts a split parkrun as one time trial", () => {
    const week = standardWeek();
    week.sessions.push(s("sat-tt", SAT, "time_trial", 5));
    const runs = [
      run(SAT, 2, { startLocal: `${SAT}T08:35:00` }),
      run(SAT, 5, { startLocal: `${SAT}T09:00:00` }),
      run(SAT, 1.5, { startLocal: `${SAT}T09:30:00` }),
      run(SUN, 12),
    ];
    const result = match(week, runs);
    const tt = byId(result, "sat-tt");
    expect(tt.matched.map((a) => a.id)).toEqual(runs.slice(0, 3).map((a) => a.id));
    expect(tt.status).toBe("done");
    expect(byId(result, "sun-long").matched[0].id).toBe(runs[3].id);
    expect(result.extras).toHaveLength(0);
  });

  it("keeps sessions planned until the week ends", () => {
    const runs = [run(TUE, 7)];
    const midweek = match(standardWeek(), runs, WED);
    expect(byId(midweek, "tue-intervals").status).toBe("done");
    expect(byId(midweek, "wed-easy").isToday).toBe(true);
    expect(byId(midweek, "mon-strength").status).toBe("planned");
    expect(byId(midweek, "thu-tempo").status).toBe("planned");
    expect(midweek.state).toBe("current");

    const sunday = match(standardWeek(), runs, SUN);
    expect(byId(sunday, "thu-tempo").status).toBe("planned");

    const nextWeek = match(standardWeek(), runs, NEXT_TUE);
    expect(byId(nextWeek, "thu-tempo").status).toBe("missed");
    expect(byId(nextWeek, "mon-strength").status).toBe("missed");

    const before = match(standardWeek(), [], "2026-11-10");
    expect(before.state).toBe("future");
  });

  it("applies manual ticks, skips and pinned swaps", () => {
    const runs = [run(TUE, 7), run(THU, 8)];
    const overrides: Override[] = [
      { sessionId: "mon-strength", status: "done", activityIds: null },
      { sessionId: "wed-easy", status: "skipped", activityIds: null },
      // Swap: Tuesday's run was really the tempo.
      { sessionId: "thu-tempo", status: null, activityIds: [runs[0].id] },
    ];
    const result = match(standardWeek(), runs, WED, overrides);
    expect(byId(result, "mon-strength").status).toBe("done");
    expect(byId(result, "mon-strength").isManual).toBe(true);
    expect(byId(result, "wed-easy").status).toBe("skipped");
    expect(byId(result, "wed-easy").matched).toHaveLength(0);
    expect(byId(result, "thu-tempo").matched[0].id).toBe(runs[0].id);
    expect(byId(result, "thu-tempo").moved).toBe(true);
    expect(byId(result, "tue-intervals").matched[0].id).toBe(runs[1].id);
    expect(byId(result, "tue-intervals").isManual).toBe(false);
  });

  it("does not match a skipped session automatically", () => {
    const runs = [run(WED, 5)];
    const overrides: Override[] = [
      { sessionId: "wed-easy", status: "skipped", activityIds: null },
    ];
    const result = match(standardWeek(), runs, WED, overrides);
    expect(byId(result, "wed-easy").matched).toHaveLength(0);
    // The run falls to the next closest session instead.
    expect(byId(result, "tue-intervals").matched[0].id).toBe(runs[0].id);
  });

  it("supports 'no run' and manual status on a run session", () => {
    const runs = [run(TUE, 2)];
    const overrides: Override[] = [
      { sessionId: "tue-intervals", status: "done", activityIds: [] },
    ];
    const result = match(standardWeek(), runs, WED, overrides);
    const intervals = byId(result, "tue-intervals");
    expect(intervals.matched).toHaveLength(0);
    expect(intervals.status).toBe("done");
    expect(result.extras).toHaveLength(1);
  });
});

describe("matchPlan", () => {
  it("does not reuse a run pinned in another week", () => {
    const week1 = standardWeek();
    const week2: PlanWeek = {
      week: 2,
      week_commencing: "2026-11-23",
      phase: "base",
      sessions: [s("w2-tue-intervals", NEXT_TUE, "intervals", 7)],
    };
    const plan: Plan = {
      weeks: [week1, week2],
      phases: [{ id: "base", name: "Base", weeks: [1, 2] }],
    };
    // A week-2 run done late and pinned to week 1's tempo.
    const late = run(NEXT_TUE, 8);
    const overrides: Override[] = [
      { sessionId: "thu-tempo", status: null, activityIds: [late.id] },
    ];
    const [r1, r2] = matchPlan(plan, [late], overrides, "2026-11-25");
    expect(byId(r1, "thu-tempo").matched[0].id).toBe(late.id);
    expect(byId(r1, "thu-tempo").status).toBe("done");
    expect(byId(r2, "w2-tue-intervals").matched).toHaveLength(0);
    expect(r2.extras).toHaveLength(0);
    expect(r2.phaseName).toBe("Base");
  });

  it("ignores runs before the plan's start date", () => {
    const plan: Plan = { start_date: TUE, weeks: [standardWeek()] };
    const early = run(MON, 7);
    const onTime = run(TUE, 7);
    const [week] = matchPlan(plan, [early, onTime], [], WED);
    expect(byId(week, "tue-intervals").matched.map((a) => a.id)).toEqual([onTime.id]);
    expect(week.runs.map((a) => a.id)).toEqual([onTime.id]);
    expect(week.extras).toHaveLength(0);
  });

  it("uses the first week's Monday without a start date", () => {
    const plan: Plan = { weeks: [standardWeek()] };
    const [week] = matchPlan(plan, [run(MON, 7)], [], WED);
    expect(week.runs).toHaveLength(1);
  });
});
