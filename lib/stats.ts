// Season-level progress figures for the progress page (pure, unit-tested).

import { addDays } from "./dates";
import { isRunSession } from "./matching";
import type { Activity, PlanSession, SessionResult, WeekResult } from "./types";

export interface RunCounts {
  total: number; // run sessions in the whole plan
  due: number; // run sessions dated before today, plus any already run early
  done: number;
  partial: number;
}

export interface DistancePoint {
  date: string;
  expectedKm: number; // cumulative planned distance up to and including this day
  actualKm: number | null; // cumulative distance run; null after today
}

export interface BestRun {
  title: string; // session title, or the activity name for the longest run
  date: string;
  distanceKm: number;
  movingTimeS: number;
  paceSPerKm: number;
  activities: Activity[];
  repCount: number | null; // set when the pace is the reps' (from laps), not the whole run's
}

export const HALF_MARATHON_KM = 21.0975;

export interface SeasonStats {
  runs: RunCounts;
  distance: DistancePoint[];
  expectedToDateKm: number;
  actualToDateKm: number;
  plannedTotalKm: number;
  fastestIntervals: BestRun | null;
  fastestTempo: BestRun | null;
  longestRun: BestRun | null;
  timeOnFeetS: number; // moving time of every run in the plan so far
}

function round1(km: number): number {
  const rounded = Math.round(km * 10) / 10;
  return rounded;
}

/** Counts run sessions that are due, done and partially done. */
export function countRuns(weeks: WeekResult[], today: string): RunCounts {
  const results = weeks
    .flatMap((w) => w.sessions)
    .filter((r) => isRunSession(r.session));
  const ran = (r: SessionResult): boolean =>
    r.status === "done" || r.status === "partial";
  const counts: RunCounts = {
    total: results.length,
    due: results.filter((r) => r.session.date < today || ran(r)).length,
    done: results.filter((r) => r.status === "done").length,
    partial: results.filter((r) => r.status === "partial").length,
  };
  return counts;
}

/**
 * Builds one point per day of the plan with cumulative planned and actual km.
 * Planned km comes from each run session's `est_distance_km` on its planned
 * date; actual km counts every run in the plan's weeks, matched or not.
 */
export function cumulativeDistance(
  weeks: WeekResult[],
  today: string,
): DistancePoint[] {
  if (weeks.length === 0) {
    const empty: DistancePoint[] = [];
    return empty;
  }
  const plannedByDay = new Map<string, number>();
  for (const result of weeks.flatMap((w) => w.sessions)) {
    const session = result.session;
    if (isRunSession(session) && session.est_distance_km) {
      const sofar = plannedByDay.get(session.date) ?? 0;
      plannedByDay.set(session.date, sofar + session.est_distance_km);
    }
  }
  const actualByDay = new Map<string, number>();
  for (const run of weeks.flatMap((w) => w.runs)) {
    actualByDay.set(run.date, (actualByDay.get(run.date) ?? 0) + run.distanceKm);
  }

  const points: DistancePoint[] = [];
  const last = weeks[weeks.length - 1].weekEnding;
  let expected = 0;
  let actual = 0;
  for (let date = weeks[0].weekCommencing; date <= last; date = addDays(date, 1)) {
    expected += plannedByDay.get(date) ?? 0;
    actual += actualByDay.get(date) ?? 0;
    points.push({
      date,
      expectedKm: round1(expected),
      actualKm: date <= today ? round1(actual) : null,
    });
  }
  return points;
}

/**
 * A session's effort: its reps (from laps) where found, otherwise its matched
 * runs combined into one.
 */
function sessionEffort(result: SessionResult): BestRun | null {
  const runs = result.matched;
  if (result.reps && runs.length > 0) {
    const fromReps: BestRun = {
      title: result.session.title,
      date: runs[0].date,
      distanceKm: result.reps.distanceKm,
      movingTimeS: result.reps.movingTimeS,
      paceSPerKm: result.reps.paceSPerKm,
      activities: runs,
      repCount: result.reps.laps.length,
    };
    return fromReps;
  }
  const distanceKm = runs.reduce((acc, a) => acc + a.distanceKm, 0);
  const movingTimeS = runs.reduce((acc, a) => acc + a.movingTimeS, 0);
  if (distanceKm <= 0 || movingTimeS <= 0) {
    return null;
  }
  const effort: BestRun = {
    title: result.session.title,
    date: runs[0].date,
    distanceKm,
    movingTimeS,
    paceSPerKm: movingTimeS / distanceKm,
    activities: runs,
    repCount: null,
  };
  return effort;
}

/**
 * The fastest (lowest average pace) completed session of a given type. Rep
 * paces are only compared with rep paces: whole-run paces count only when no
 * session of the type has reps from laps.
 */
export function fastestSession(weeks: WeekResult[], type: string): BestRun | null {
  const all = weeks
    .flatMap((w) => w.sessions)
    .filter((r) => r.session.type === type)
    .map(sessionEffort)
    .filter((e): e is BestRun => e !== null);
  const withReps = all.filter((e) => e.repCount !== null);
  const efforts = withReps.length > 0 ? withReps : all;
  const fastest = efforts.reduce<BestRun | null>(
    (best, e) => (best === null || e.paceSPerKm < best.paceSPerKm ? e : best),
    null,
  );
  return fastest;
}

/** The longest single run dated inside the plan. */
export function longestRun(weeks: WeekResult[]): BestRun | null {
  const runs = weeks.flatMap((w) => w.runs).filter((a) => a.distanceKm > 0);
  if (runs.length === 0) {
    return null;
  }
  const longest = runs.reduce((best, a) => (a.distanceKm > best.distanceKm ? a : best));
  const session: PlanSession | undefined = weeks
    .flatMap((w) => w.sessions)
    .find((r) => r.matched.some((a) => a.id === longest.id))?.session;
  const result: BestRun = {
    title: session?.title ?? longest.name,
    date: longest.date,
    distanceKm: longest.distanceKm,
    movingTimeS: longest.movingTimeS,
    paceSPerKm: longest.movingTimeS / longest.distanceKm,
    activities: [longest],
    repCount: null,
  };
  return result;
}

/** Everything the progress page shows. */
export function seasonStats(weeks: WeekResult[], today: string): SeasonStats {
  const distance = cumulativeDistance(weeks, today);
  // Planned km up to yesterday, so today's session isn't "behind" before it's run.
  const beforeToday = distance.filter((p) => p.date < today);
  const upToToday = distance.filter((p) => p.date <= today);
  const latest = upToToday[upToToday.length - 1];
  const stats: SeasonStats = {
    runs: countRuns(weeks, today),
    distance,
    expectedToDateKm: beforeToday[beforeToday.length - 1]?.expectedKm ?? 0,
    actualToDateKm: latest?.actualKm ?? 0,
    plannedTotalKm: distance[distance.length - 1]?.expectedKm ?? 0,
    fastestIntervals: fastestSession(weeks, "intervals"),
    fastestTempo: fastestSession(weeks, "tempo"),
    longestRun: longestRun(weeks),
    timeOnFeetS: weeks
      .flatMap((w) => w.runs)
      .reduce((acc, a) => acc + a.movingTimeS, 0),
  };
  return stats;
}

/** How many half marathons a distance is worth (e.g. 2.33). */
export function halfMarathons(km: number): number {
  const count = km / HALF_MARATHON_KM;
  return count;
}
