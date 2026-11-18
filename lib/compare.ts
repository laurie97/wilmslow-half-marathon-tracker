// Side-by-side progress for every athlete using the app: runs done and distance.

import { addDays } from "./dates";
import { getStore } from "./db";
import { isRunSession } from "./matching";
import { computeWeeks, loadContext, today as todayDate } from "./progress";
import { countRuns, cumulativeDistance } from "./stats";
import type { WeekResult } from "./types";

export interface AthleteSeries {
  firstDate: string;
  lastDate: string;
  runsPct: Map<string, number>; // date -> % of the plan's runs done by then
  km: Map<string, number>; // date -> cumulative km run in the plan by then
}

export interface CompareAthlete {
  key: string; // never the Strava ID
  slot: number; // colour slot, from sign-up order
  name: string;
  isYou: boolean;
  runsDone: number; // done in full or partly
  runsDue: number;
  runsTotal: number;
  km: number;
  plannedToDateKm: number;
  runsPct: (number | null)[]; // aligned with CompareResponse.dates
  distanceKm: (number | null)[];
}

export interface CompareResponse {
  today: string;
  dates: string[]; // every day from the earliest plan start to the latest plan end
  athletes: CompareAthlete[];
  unavailable: string[]; // names of athletes whose Strava data couldn't be loaded
}

interface Loaded {
  id: number;
  order: number; // position in sign-up order, so colours stay put
  name: string;
  weeks: WeekResult[];
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; weeks: WeekResult[] }>();

/**
 * Daily cumulative runs-done % and km for one athlete, up to today. A run
 * counts on the day it was run (its first matched activity), or on its
 * planned date when ticked off by hand.
 */
export function athleteSeries(weeks: WeekResult[], today: string): AthleteSeries {
  const results = weeks
    .flatMap((w) => w.sessions)
    .filter((r) => isRunSession(r.session));
  const total = Math.max(results.length, 1);
  const ranByDay = new Map<string, number>();
  for (const r of results) {
    if (r.status === "done" || r.status === "partial") {
      const day = r.matched[0]?.date ?? r.session.date;
      ranByDay.set(day, (ranByDay.get(day) ?? 0) + 1);
    }
  }
  const firstDate = weeks[0]?.weekCommencing ?? today;
  const lastDate = weeks[weeks.length - 1]?.weekEnding ?? today;
  // Runs done early (before the plan starts) count from day one.
  let ran = [...ranByDay].filter(([d]) => d < firstDate).reduce((a, [, n]) => a + n, 0);
  const runsPct = new Map<string, number>();
  const km = new Map<string, number>();
  for (const point of cumulativeDistance(weeks, today)) {
    if (point.actualKm === null) {
      break;
    }
    ran += ranByDay.get(point.date) ?? 0;
    runsPct.set(point.date, Math.round((ran / total) * 1000) / 10);
    km.set(point.date, point.actualKm);
  }
  const series: AthleteSeries = { firstDate, lastDate, runsPct, km };
  return series;
}

/** Every date from `first` to `last`, inclusive. */
function dateRange(first: string, last: string): string[] {
  const dates: string[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

/** Lines up each athlete's figures on one shared calendar. */
export function buildComparison(
  loaded: Loaded[],
  viewerId: number,
  today: string,
  unavailable: string[] = [],
): CompareResponse {
  const withSeries = loaded
    .filter((a) => a.weeks.length > 0)
    .map((a) => ({ ...a, series: athleteSeries(a.weeks, today) }));
  const first = withSeries.map((a) => a.series.firstDate).sort()[0];
  const last = withSeries
    .map((a) => a.series.lastDate)
    .sort()
    .reverse()[0];
  const dates = first && last ? dateRange(first, last) : [];
  const athletes = withSeries.map((a) => {
    const counts = countRuns(a.weeks, today);
    const distance = cumulativeDistance(a.weeks, today);
    const beforeToday = distance.filter((p) => p.date < today);
    const upToToday = distance.filter((p) => p.date <= today);
    const athlete: CompareAthlete = {
      key: `a${a.order + 1}`,
      slot: a.order,
      name: a.name || "Runner",
      isYou: a.id === viewerId,
      runsDone: counts.done + counts.partial,
      runsDue: counts.due,
      runsTotal: counts.total,
      km: upToToday[upToToday.length - 1]?.actualKm ?? 0,
      plannedToDateKm: beforeToday[beforeToday.length - 1]?.expectedKm ?? 0,
      runsPct: dates.map((d) => a.series.runsPct.get(d) ?? null),
      distanceKm: dates.map((d) => a.series.km.get(d) ?? null),
    };
    return athlete;
  });
  const response: CompareResponse = { today, dates, athletes, unavailable };
  return response;
}

/** Matches one athlete's plan to their Strava runs, reusing a recent result. */
async function loadWeeks(
  athleteId: number,
  order: number,
  fresh: boolean,
): Promise<Loaded> {
  const ctx = await loadContext(athleteId);
  const name = ctx.athlete.firstname;
  const key = `${athleteId}:${ctx.today}:${ctx.planRecord?.updatedAt ?? ""}`;
  const hit = cache.get(key);
  let weeks: WeekResult[] = [];
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) {
    weeks = hit.weeks;
  } else if (ctx.planRecord) {
    weeks = await computeWeeks(ctx, ctx.planRecord.plan);
    cache.set(key, { at: Date.now(), weeks });
  }
  const loaded: Loaded = { id: athleteId, order, name, weeks };
  return loaded;
}

/**
 * Builds /api/compare: every athlete with a plan. The viewer's own data is
 * always fresh; other athletes' is cached for 10 minutes to spare Strava's
 * rate limit. Another athlete whose data fails to load is listed as
 * unavailable; a failure loading the viewer's own data is thrown.
 */
export async function loadComparison(viewerId: number): Promise<CompareResponse> {
  const store = await getStore();
  const ids = await store.listAthletesWithPlans();
  const settled = await Promise.allSettled(
    ids.map((id, order) => loadWeeks(id, order, id === viewerId)),
  );
  const loaded: Loaded[] = [];
  const unavailable: string[] = [];
  for (const [index, result] of settled.entries()) {
    if (result.status === "fulfilled") {
      loaded.push(result.value);
    } else if (ids[index] === viewerId) {
      throw result.reason;
    } else {
      const athlete = await store.getAthlete(ids[index]).catch(() => null);
      unavailable.push(athlete?.firstname || "A runner");
      console.error(result.reason);
    }
  }
  const comparison = buildComparison(loaded, viewerId, await todayDate());
  comparison.unavailable = unavailable;
  return comparison;
}
