// Demo mode: a fixture plan, generated fake runs and a fake "today".
// Only used when DEMO_MODE=1 and not running on Vercel (see config.isDemo).

import demoPlan from "../data/demo-plan.json";
import { addDays } from "./dates";
import type { Store } from "./db";
import { isRunSession } from "./matching";
import { validatePlan } from "./plan";
import type { Activity, Plan, PlanSession } from "./types";

export const DEMO_ATHLETE_ID = 1;
const DEFAULT_DEMO_TODAY = "2026-12-03";

export function demoToday(): string {
  const today = process.env.DEMO_TODAY || DEFAULT_DEMO_TODAY;
  return today;
}

/** Fills a fresh in-memory store with the demo athlete, plan and strength ticks. */
export async function seedDemoStore(store: Store): Promise<void> {
  await store.upsertAthlete({
    id: DEMO_ATHLETE_ID,
    firstname: "Alex",
    accessToken: "demo",
    refreshToken: "demo",
    expiresAt: 4102444800,
  });
  const validated = validatePlan(demoPlan as unknown);
  if (!validated.ok) {
    throw new Error(`Demo plan is invalid: ${validated.errors.join(" ")}`);
  }
  const plan = validated.plan;
  await store.savePlan(DEMO_ATHLETE_ID, plan);
  const today = demoToday();
  for (const [index, week] of plan.weeks.slice(0, 3).entries()) {
    const strength = week.sessions.filter(
      (s) => s.type === "strength" && s.date < today,
    );
    // Tick Monday strength every week, and Friday's only in week 1.
    const ticks = index === 0 ? strength : strength.slice(0, 1);
    for (const session of ticks) {
      await store.setOverride(DEMO_ATHLETE_ID, {
        sessionId: session.id,
        status: "done",
        activityIds: null,
      });
    }
  }
}

const PACE_S_PER_KM: Record<string, number> = {
  intervals: 340,
  tempo: 330,
  easy: 380,
  long_run: 375,
  time_trial: 300,
  race: 300,
};
const AVG_HR: Record<string, number> = {
  intervals: 158,
  tempo: 163,
  easy: 141,
  long_run: 148,
  time_trial: 174,
  race: 172,
};
const NAMES: Record<string, string> = {
  intervals: "Track reps",
  tempo: "Tempo run",
  easy: "Morning Run",
  long_run: "Sunday long run",
  race: "Race",
};

/**
 * Generates fake activities for every run session before `today`, with a few
 * deliberate quirks: in the second week one run is missed, one is moved, the
 * parkrun is split in three and the long run is short; later weeks get a short
 * extra jog. Rides and walks are thrown in to check they are ignored.
 */
export function demoActivities(plan: Plan, today: string): Activity[] {
  const activities: Activity[] = [];
  let nextId = 16_200_000_000;
  const add = (
    date: string,
    time: string,
    km: number,
    type: string,
    name: string,
    sportType = "Run",
  ): void => {
    const pace = PACE_S_PER_KM[type] ?? 390;
    const activity: Activity = {
      id: nextId++,
      name,
      date,
      startLocal: `${date}T${time}:00`,
      sportType,
      distanceKm: Math.round(km * 100) / 100,
      movingTimeS: Math.round(km * (sportType === "Run" ? pace : 180)),
      avgHr: sportType === "Run" ? (AVG_HR[type] ?? 140) : null,
    };
    if (activity.date < today) {
      activities.push(activity);
    }
  };

  plan.weeks.forEach((week, index) => {
    const messy = index === 1;
    const runs = week.sessions.filter(isRunSession);
    for (const session of runs) {
      addSession(session, messy, add);
    }
    if (index === 0) {
      add(
        addDays(week.week_commencing, 6),
        "14:00",
        24.3,
        "ride",
        "Afternoon Ride",
        "Ride",
      );
    }
    if (messy) {
      add(addDays(week.week_commencing, 5), "15:00", 4.2, "walk", "Dog walk", "Walk");
    }
    if (index >= 2) {
      add(week.week_commencing, "18:30", 2.4, "easy", "Shakeout jog");
    }
  });
  return activities;
}

type AddFn = (
  date: string,
  time: string,
  km: number,
  type: string,
  name: string,
) => void;

/** Adds the fake run(s) for one planned session. */
function addSession(session: PlanSession, messy: boolean, add: AddFn): void {
  const km = session.est_distance_km ?? 5;
  const name = NAMES[session.type] ?? "Run";
  if (session.type === "time_trial") {
    if (messy) {
      add(session.date, "08:35", 2.1, "easy", "parkrun warm-up");
      add(session.date, "09:00", 5.02, "time_trial", "parkrun");
      add(session.date, "09:30", 1.4, "easy", "parkrun cool-down");
    } else {
      add(session.date, "09:00", 5.02, "time_trial", "parkrun");
    }
    return;
  }
  if (messy && session.type === "easy" && session.day === "Wednesday") {
    return; // missed
  }
  if (messy && session.type === "tempo") {
    add(addDays(session.date, 1), "07:10", km * 1.02, "tempo", name); // moved
    return;
  }
  if (messy && session.type === "long_run") {
    add(session.date, "08:30", km * 0.8, "long_run", name); // cut short
    return;
  }
  add(
    session.date,
    session.type === "long_run" ? "08:30" : "07:00",
    km * 1.03,
    session.type,
    name,
  );
}
