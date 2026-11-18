// Demo mode: a fixture plan, generated fake runs and a fake "today".
// Only used when DEMO_MODE=1 and not in a hosted deployment (see config.isDemo).

import demoPlan from "../data/demo-plan.json";
import { addDays } from "./dates";
import type { Store, StoredLap } from "./db";
import { isRunSession } from "./matching";
import { validatePlan } from "./plan";
import { repTargets } from "./reps";
import type { Activity, Plan, PlanSession } from "./types";

export const DEMO_ATHLETE_ID = 1;

// Other demo athletes on the same plan, for the compare page: each runs a
// different share of the planned distance, skips every nth run and ticks off
// every nth strength session.
const DEMO_FRIENDS = [
  { id: 2, firstname: "Sam", scale: 0.9, skipEvery: 4, strengthEvery: 2 },
  { id: 3, firstname: "Priya", scale: 1.12, skipEvery: 9, strengthEvery: 1 },
  { id: 4, firstname: "Jordan", scale: 0.75, skipEvery: 3, strengthEvery: 3 },
];
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
  for (const friend of DEMO_FRIENDS) {
    await store.upsertAthlete({
      id: friend.id,
      firstname: friend.firstname,
      accessToken: "demo",
      refreshToken: "demo",
      expiresAt: 4102444800,
    });
    await store.savePlan(friend.id, plan);
  }
  const today = demoToday();
  for (const [index, week] of plan.weeks.slice(0, 3).entries()) {
    const strength = week.sessions.filter(
      (s) => s.type === "strength" && s.date < today,
    );
    // Tick the first strength session every week (the one in week 2 only
    // partly), and the second only in week 1.
    const ticks = index === 0 ? strength : strength.slice(0, 1);
    for (const session of ticks) {
      await store.setOverride(DEMO_ATHLETE_ID, {
        sessionId: session.id,
        status: index === 1 ? "partial" : "done",
        activityIds: null,
      });
    }
  }
  const pastStrength = plan.weeks
    .flatMap((w) => w.sessions)
    .filter((s) => s.type === "strength" && s.date < today);
  for (const friend of DEMO_FRIENDS) {
    for (const [index, session] of pastStrength.entries()) {
      if (index % friend.strengthEvery === 0) {
        await store.setOverride(friend.id, {
          sessionId: session.id,
          status: "done",
          activityIds: null,
        });
      }
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
  long_run: "Long run",
  race: "Race",
};

/**
 * Generates fake activities for every run session before `today`, with a few
 * deliberate quirks: in the second week the intervals are missed, the tempo is
 * moved, a time trial (if any) is split in three and the long run is short; later weeks get a short
 * extra jog. Rides and walks are thrown in to check they are ignored. The eight
 * weeks before the plan get easy runs and a weekly parkrun, for the prediction.
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
    paceS?: number,
  ): void => {
    const pace = paceS ?? PACE_S_PER_KM[type] ?? 390;
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

  const start = plan.weeks[0].week_commencing;
  for (let ago = 8; ago >= 1; ago--) {
    const monday = addDays(start, -7 * ago);
    const parkrunS = 1325 + ago * 5; // a few seconds quicker each week
    add(addDays(monday, 1), "07:00", 6.1, "easy", "Morning Run");
    add(addDays(monday, 3), "07:00", 5.4, "tempo", "Morning Run", "Run", 290);
    add(addDays(monday, 5), "09:00", 5.0, "time_trial", "parkrun", "Run", parkrunS / 5);
    add(addDays(monday, 6), "09:30", ago % 2 ? 8.2 : 10.1, "easy", "Sunday run");
  }

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
  if (messy && session.type === "intervals") {
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

/**
 * Demo activities for any demo athlete: the main athlete gets
 * `demoActivities` as is; the others get a scaled copy with some runs skipped.
 */
export function demoActivitiesFor(
  athleteId: number,
  plan: Plan,
  today: string,
): Activity[] {
  const base = demoActivities(plan, today);
  const friend = DEMO_FRIENDS.find((f) => f.id === athleteId);
  if (!friend) {
    return base;
  }
  const activities = base
    .filter((a, i) => a.sportType !== "Run" || (i + 1) % friend.skipEvery !== 0)
    .map((a) => ({
      ...a,
      distanceKm: Math.round(a.distanceKm * friend.scale * 100) / 100,
      movingTimeS: Math.round(a.movingTimeS * friend.scale),
    }));
  return activities;
}

/**
 * Fake laps for an interval or tempo run: a warm-up lap, each rep a few
 * seconds either side of its target with a jog recovery lap after it, and a
 * cool-down lap. Varies with the activity ID so each run looks different.
 */
export function demoLaps(session: PlanSession, activity: Activity): StoredLap[] {
  const laps: StoredLap[] = [];
  const lap = (distanceM: number, timeS: number, hr: number): void => {
    laps.push({
      distanceM: Math.round(distanceM * 10) / 10,
      movingTimeS: Math.round(timeS),
      avgHr: hr,
    });
  };
  const warmUpM = (session.warm_up_km ?? 1.5) * 1000;
  lap(warmUpM, (warmUpM / 1000) * 365, 138);
  let n = activity.id % 7;
  for (const block of session.structure ?? []) {
    const [target] = repTargets({ ...session, structure: [block] });
    if (!target || target.distanceM === null) continue;
    const pace = target.paceSPerKm ?? 280;
    const recovery = (block as { recovery?: { duration_s?: number } }).recovery;
    for (let rep = 0; rep < target.reps; rep++) {
      n += 1;
      const wobble = ((n * 37) % 9) - 5; // -5 to +3 s/km, mostly on target
      const distanceM = target.distanceM + ((n * 13) % 11) - 5;
      lap(distanceM, (distanceM / 1000) * (pace + wobble), 162 + (rep % 4));
      if (recovery?.duration_s && rep < target.reps - 1) {
        lap((recovery.duration_s / 400) * 1000, recovery.duration_s, 148);
      }
    }
  }
  const coolDownM = (session.cool_down_km ?? 1) * 1000;
  lap(coolDownM, (coolDownM / 1000) * 375, 142);
  return laps;
}
