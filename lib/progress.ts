// Loads everything needed to show (or export) one athlete's progress.

import { appTimezone, isDemo } from "./config";
import { addDays, epochSeconds, todayIn } from "./dates";
import { getStore, type AthleteRecord, type PlanRecord, type Store } from "./db";
import { matchPlan } from "./matching";
import { fetchActivities, validAccessToken } from "./strava";
import type { Activity, Exercise, Override, Plan, WeekResult } from "./types";

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

/** Fetches the athlete's activities live from Strava for the plan's date range. */
export async function loadActivities(
  ctx: AthleteContext,
  plan: Plan,
): Promise<Activity[]> {
  let activities: Activity[];
  if (isDemo()) {
    const { demoActivities } = await import("./demo");
    activities = demoActivities(plan, ctx.today);
  } else {
    const first = plan.weeks[0].week_commencing;
    const last = addDays(plan.weeks[plan.weeks.length - 1].week_commencing, 6);
    const token = await validAccessToken(ctx.athlete, ctx.store);
    // Pad by a day each side: Strava filters on UTC start time.
    activities = await fetchActivities(
      token,
      epochSeconds(addDays(first, -1)),
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
  const weeks = record ? await computeWeeks(ctx, record.plan) : [];
  const progress: ProgressResponse = {
    athlete: { firstname: ctx.athlete.firstname },
    today: ctx.today,
    demo: isDemo(),
    plan: record ? summarisePlan(record) : null,
    weeks,
  };
  return progress;
}
