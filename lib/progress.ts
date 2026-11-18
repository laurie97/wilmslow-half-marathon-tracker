// Loads everything needed to show (or export) one athlete's progress.

import { appTimezone, isDemo } from "./config";
import { addDays, epochSeconds, todayIn } from "./dates";
import {
  getStore,
  type AthleteRecord,
  type PlanRecord,
  type Store,
  type StoredLap,
} from "./db";
import { isRunActivity, matchPlan } from "./matching";
import { WINDOW_DAYS } from "./prediction";
import { REP_SESSION_TYPES, summariseReps, type Lap } from "./reps";
import { StravaError, fetchActivities, fetchLaps, validAccessToken } from "./strava";
import type {
  Activity,
  Exercise,
  Override,
  Plan,
  PlanSession,
  WeekResult,
} from "./types";

const MAX_LAP_FETCHES = 40; // per page load; any left over are fetched next time
const LAP_FETCH_CONCURRENCY = 4;

export interface PlanSummary {
  planId: string | null;
  athleteName: string | null;
  raceName: string;
  raceDate: string | null;
  goalTime: string | null;
  updatedAt: string;
  warmUp: { appliesTo: string[]; description: string } | null;
  coolDown: { appliesTo: string[]; description: string } | null;
  strengthRoutines: Record<string, { name: string; exercises: Exercise[] }>;
}

export interface ProgressResponse {
  athlete: { firstname: string };
  today: string;
  demo: boolean;
  plan: PlanSummary | null;
  weeks: WeekResult[];
  earlierRuns: Activity[]; // runs in the 8 weeks before the plan, for the prediction
}

export interface AthleteContext {
  store: Store;
  athlete: AthleteRecord;
  planRecord: PlanRecord | null;
  overrides: Override[];
  today: string;
}

export class UnknownAthleteError extends Error {}

/** Today's date in the app time zone (or DEMO_TODAY in demo mode). */
export async function today(): Promise<string> {
  let date = todayIn(appTimezone());
  if (isDemo()) {
    const { demoToday } = await import("./demo");
    date = demoToday();
  }
  return date;
}

/** Loads the athlete, plan and overrides. Throws if the athlete is unknown. */
export async function loadContext(athleteId: number): Promise<AthleteContext> {
  const store = await getStore();
  const athlete = await store.getAthlete(athleteId);
  if (!athlete) {
    throw new UnknownAthleteError(`Unknown athlete ${athleteId}`);
  }
  const [planRecord, overrides, date] = await Promise.all([
    store.getPlan(athleteId),
    store.getOverrides(athleteId),
    today(),
  ]);
  const context: AthleteContext = {
    store,
    athlete,
    planRecord,
    overrides,
    today: date,
  };
  return context;
}

/**
 * Fetches the athlete's activities live from Strava for the plan's date range,
 * plus the 8 weeks before it so the race prediction has history from day one.
 */
export async function loadActivities(
  ctx: AthleteContext,
  plan: Plan,
): Promise<Activity[]> {
  let activities: Activity[];
  if (isDemo()) {
    const { demoActivitiesFor } = await import("./demo");
    activities = demoActivitiesFor(ctx.athlete.id, plan, ctx.today);
  } else {
    const first = plan.weeks[0].week_commencing;
    const last = addDays(plan.weeks[plan.weeks.length - 1].week_commencing, 6);
    const token = await validAccessToken(ctx.athlete, ctx.store);
    // Pad by a day each side: Strava filters on UTC start time.
    activities = await fetchActivities(
      token,
      epochSeconds(addDays(first, -WINDOW_DAYS - 1)),
      epochSeconds(addDays(last, 2)),
    );
  }
  return activities;
}

export async function computeWeeks(
  ctx: AthleteContext,
  plan: Plan,
): Promise<WeekResult[]> {
  const activities = await loadActivities(ctx, plan);
  const weeks = matchPlan(plan, activities, ctx.overrides, ctx.today);
  return weeks;
}

/** Every run matched to an interval or tempo session, with its session. */
function repRuns(weeks: WeekResult[]): { session: PlanSession; activity: Activity }[] {
  const runs = weeks
    .flatMap((w) => w.sessions)
    .filter((r) => REP_SESSION_TYPES.has(r.session.type))
    .flatMap((r) => r.matched.map((activity) => ({ session: r.session, activity })));
  return runs;
}

/**
 * Laps for every interval and tempo run: from the 7-day cache where possible,
 * otherwise from Strava (one call per run, at most MAX_LAP_FETCHES per load).
 * Never throws: without laps, sessions just show their whole-run pace.
 */
export async function loadLaps(
  ctx: AthleteContext,
  weeks: WeekResult[],
): Promise<Map<number, StoredLap[]>> {
  const runs = repRuns(weeks);
  let laps = new Map<number, StoredLap[]>();
  if (isDemo()) {
    const { demoLaps } = await import("./demo");
    runs.forEach(({ session, activity }) =>
      laps.set(activity.id, demoLaps(session, activity)),
    );
    return laps;
  }
  try {
    const ids = [...new Set(runs.map((r) => r.activity.id))];
    laps = await ctx.store.getLaps(ctx.athlete.id, ids);
    const missing = ids.filter((id) => !laps.has(id)).slice(0, MAX_LAP_FETCHES);
    if (missing.length === 0) {
      return laps;
    }
    const token = await validAccessToken(ctx.athlete, ctx.store);
    let stop = false;
    const worker = async (): Promise<void> => {
      while (!stop && missing.length > 0) {
        const id = missing.shift() as number;
        try {
          const fetched = await fetchLaps(token, id);
          laps.set(id, fetched);
          await ctx.store.saveLaps(ctx.athlete.id, id, fetched);
        } catch (error) {
          // A rate limit or revoked token won't clear up mid-load: stop asking.
          stop = error instanceof StravaError && error.code !== "error";
        }
      }
    };
    await Promise.all(Array.from({ length: LAP_FETCH_CONCURRENCY }, worker));
  } catch (error) {
    console.error("Couldn't load laps", error);
  }
  return laps;
}

/** Fills in each interval and tempo session's rep pace from its runs' laps. */
export function attachReps(
  weeks: WeekResult[],
  laps: Map<number, StoredLap[]>,
): WeekResult[] {
  const withReps = weeks.map((week) => ({
    ...week,
    sessions: week.sessions.map((result) => {
      if (!REP_SESSION_TYPES.has(result.session.type)) {
        return result;
      }
      const runLaps: Lap[] = [...result.matched]
        .sort((a, b) => a.startLocal.localeCompare(b.startLocal))
        .flatMap((a) =>
          (laps.get(a.id) ?? []).map((lap) => ({ ...lap, activityId: a.id })),
        );
      const reps = runLaps.length > 0 ? summariseReps(result.session, runLaps) : null;
      const updated = { ...result, reps };
      return updated;
    }),
  }));
  return withReps;
}

/** Picks the "a" goal time, or the first goal with a time. */
function goalTime(plan: Plan): string | null {
  const goals = plan.race?.goals ?? {};
  const time =
    goals.a_goal?.time ?? Object.values(goals).find((g) => g?.time)?.time ?? null;
  return time;
}

/** Normalises a warm-up or cool-down block. */
function block(value: Plan["warm_up"]): PlanSummary["warmUp"] {
  const result = value?.description
    ? {
        appliesTo: value.applies_to ?? ["intervals", "tempo"],
        description: value.description,
      }
    : null;
  return result;
}

/** "race_week" -> "Race week". */
function routineName(key: string): string {
  const words = key.replace(/_/g, " ");
  const name = words.charAt(0).toUpperCase() + words.slice(1);
  return name;
}

/** The plan details the page shows (race, goal, routines, warm-up text). */
export function summarisePlan(record: PlanRecord): PlanSummary {
  const plan = record.plan;
  const routines: PlanSummary["strengthRoutines"] = {};
  for (const [key, routine] of Object.entries(plan.strength?.routines ?? {})) {
    routines[key] = {
      name: routine?.name ?? routineName(key),
      exercises: routine?.exercises ?? [],
    };
  }
  const summary: PlanSummary = {
    planId: plan.plan_id ?? null,
    athleteName: plan.athlete?.name ?? null,
    raceName: plan.race?.name ?? "Race day",
    raceDate: plan.race?.date ?? null,
    goalTime: goalTime(plan),
    updatedAt: record.updatedAt,
    warmUp: block(plan.warm_up),
    coolDown: block(plan.cool_down),
    strengthRoutines: routines,
  };
  return summary;
}

/** Builds the full /api/progress response for one athlete. */
export async function buildProgress(athleteId: number): Promise<ProgressResponse> {
  const ctx = await loadContext(athleteId);
  const record = ctx.planRecord;
  let weeks: WeekResult[] = [];
  let earlierRuns: Activity[] = [];
  if (record) {
    const activities = await loadActivities(ctx, record.plan);
    weeks = matchPlan(record.plan, activities, ctx.overrides, ctx.today);
    weeks = attachReps(weeks, await loadLaps(ctx, weeks));
    const start = record.plan.weeks[0].week_commencing;
    earlierRuns = activities.filter((a) => isRunActivity(a) && a.date < start);
  }
  const progress: ProgressResponse = {
    athlete: { firstname: ctx.athlete.firstname },
    today: ctx.today,
    demo: isDemo(),
    plan: record ? summarisePlan(record) : null,
    weeks,
    earlierRuns,
  };
  return progress;
}
