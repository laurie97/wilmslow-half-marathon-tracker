// Matches a week's Strava runs to the week's planned sessions.
//
// Rules (agreed with Laurie and Rachel):
// - Match by session type within the week, not strictly by day.
// - Time trial / race: any run on that day counts as done.
// - Long run: the longest run of the week, if it is clearly longer than the
//   other planned runs.
// - Intervals, tempo and easy runs: matched in date order (first quality run is
//   intervals, second is tempo), preferring the closest day. A tap in the app
//   swaps them if it guesses wrong.
// - Strength: manual ticks only.
// - Runs that match nothing are shown as extras.

import { addDays, daysBetween } from "./dates";
import type {
  Activity,
  Override,
  Plan,
  PlanSession,
  PlanWeek,
  SessionResult,
  SessionStatus,
  WeekResult,
} from "./types";

const RUN_SESSION_TYPES = new Set([
  "intervals",
  "tempo",
  "long_run",
  "easy",
  "time_trial",
  "race",
]);
const DAY_BOUND_TYPES = new Set(["time_trial", "race"]);
const ORDERED_TYPES = new Set(["intervals", "tempo", "easy"]);
const RUN_SPORT_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);

export const DONE_RATIO = 0.85; // at least 85% of planned distance = done
export const MIN_RATIO = 0.5; // below 50% of planned distance = not this session
export const LONG_RUN_MARGIN = 1.15; // long run must beat other sessions by 15%

export function isRunSession(session: PlanSession): boolean {
  const result = RUN_SESSION_TYPES.has(session.type);
  return result;
}

export function isRunActivity(activity: Activity): boolean {
  const result = RUN_SPORT_TYPES.has(activity.sportType);
  return result;
}

function sumKm(activities: Activity[]): number {
  const total = activities.reduce((acc, a) => acc + a.distanceKm, 0);
  return total;
}

function inWindow(date: string, window?: { start: string; end: string }): boolean {
  const result = Boolean(window && date >= window.start && date <= window.end);
  return result;
}

function byStart(a: Activity, b: Activity): number {
  const order = a.startLocal.localeCompare(b.startLocal);
  return order;
}

function byDate(a: PlanSession, b: PlanSession): number {
  const order = a.date.localeCompare(b.date);
  return order;
}

interface MatchInput {
  week: PlanWeek;
  activities: Activity[];
  overrides: Map<string, Override>;
  today: string;
  phaseName?: string;
  pinnedElsewhere?: Set<number>;
}

/**
 * Order-preserving assignment of activities to sessions.
 *
 * Maximises the number of matches, then minimises the total number of days
 * between each run and its planned date. Both lists must be sorted by date.
 */
export function assignInOrder(
  sessions: PlanSession[],
  activities: Activity[],
): Map<string, Activity> {
  const n = sessions.length;
  const m = activities.length;
  const eligible = (i: number, j: number): boolean => {
    const est = sessions[i].est_distance_km;
    const ok = !est || activities[j].distanceKm >= MIN_RATIO * est;
    return ok;
  };

  type Cell = { matches: number; cost: number; move: "match" | "skipS" | "skipA" };
  const dp: Cell[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => ({
      matches: 0,
      cost: 0,
      move: "skipA" as const,
    })),
  );
  const better = (a: { matches: number; cost: number }, b: Cell): boolean =>
    a.matches > b.matches || (a.matches === b.matches && a.cost < b.cost);

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best: Cell = { ...dp[i - 1][j], move: "skipS" };
      const skipA = dp[i][j - 1];
      if (better(skipA, best)) best = { ...skipA, move: "skipA" };
      if (eligible(i - 1, j - 1)) {
        const prev = dp[i - 1][j - 1];
        const gap = Math.abs(daysBetween(sessions[i - 1].date, activities[j - 1].date));
        const candidate = { matches: prev.matches + 1, cost: prev.cost + gap };
        if (better(candidate, best)) best = { ...candidate, move: "match" };
      }
      dp[i][j] = best;
    }
  }

  const assignment = new Map<string, Activity>();
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const move = dp[i][j].move;
    if (move === "match") {
      assignment.set(sessions[i - 1].id, activities[j - 1]);
      i--;
      j--;
    } else if (move === "skipS") {
      i--;
    } else {
      j--;
    }
  }
  return assignment;
}

/**
 * Works out the status of one session from its matches and any manual override.
 */
export function sessionStatus(
  session: PlanSession,
  matched: Activity[],
  override: Override | undefined,
  today: string,
  weekEnding: string,
): SessionStatus {
  const weekOver = today > weekEnding;
  let status: SessionStatus = weekOver ? "missed" : "planned";
  if (override?.status) {
    status = override.status;
  } else if (isRunSession(session) && matched.length > 0) {
    const est = session.est_distance_km;
    const fullDistance =
      DAY_BOUND_TYPES.has(session.type) || !est || sumKm(matched) >= DONE_RATIO * est;
    status = fullDistance ? "done" : "partial";
  }
  return status;
}

/**
 * Matches one planned week against the athlete's activities.
 *
 * `activities` may contain runs from any week: only runs dated inside this week
 * are matched automatically, but a pinned run is looked up wherever it is.
 * `pinnedElsewhere` holds activity IDs pinned to sessions in other weeks; they
 * are never matched automatically here.
 */
export function matchWeek(input: MatchInput): WeekResult {
  const { week, overrides, today } = input;
  const weekCommencing = week.week_commencing;
  const weekEnding = addDays(weekCommencing, 6);
  const pinnedElsewhere = input.pinnedElsewhere ?? new Set<number>();
  const byId = new Map(input.activities.map((a) => [a.id, a]));
  const runs = input.activities
    .filter((a) => isRunActivity(a) && a.date >= weekCommencing && a.date <= weekEnding)
    .sort(byStart);

  const used = new Set<number>();
  const matches = new Map<string, Activity[]>();
  const claim = (session: PlanSession, activities: Activity[]): void => {
    activities.forEach((a) => used.add(a.id));
    matches.set(session.id, activities);
  };
  const free = (): Activity[] => {
    const available = runs.filter((a) => !used.has(a.id) && !pinnedElsewhere.has(a.id));
    return available;
  };

  // 1. Pinned runs win. Everything else that is a run session and not skipped
  //    is matched automatically.
  const auto: PlanSession[] = [];
  for (const session of week.sessions) {
    const override = overrides.get(session.id);
    if (override?.activityIds) {
      const pinned = override.activityIds
        .map((id) => byId.get(id))
        .filter((a): a is Activity => Boolean(a))
        .sort(byStart);
      claim(session, pinned);
    } else if (isRunSession(session) && override?.status !== "skipped") {
      auto.push(session);
    }
  }

  // 2. Time trial / race: every run that day (e.g. a parkrun split in three).
  for (const session of auto.filter((s) => DAY_BOUND_TYPES.has(s.type))) {
    const sameDay = free().filter((a) => a.date === session.date);
    if (sameDay.length > 0) {
      claim(session, sameDay);
    }
  }

  // 3. Long run: the longest remaining run, if it is clearly a long run.
  const otherLongest = Math.max(
    0,
    ...week.sessions
      .filter((s) => isRunSession(s) && s.type !== "long_run")
      .map((s) => s.est_distance_km ?? 0),
  );
  for (const session of auto.filter((s) => s.type === "long_run").sort(byDate)) {
    const candidates = free();
    if (candidates.length === 0) {
      continue;
    }
    const longest = candidates.reduce((best, a) =>
      a.distanceKm > best.distanceKm ? a : best,
    );
    const est = session.est_distance_km;
    const longEnough = !est || longest.distanceKm >= MIN_RATIO * est;
    const clearlyLongest = longest.distanceKm >= LONG_RUN_MARGIN * otherLongest;
    if (longEnough && clearlyLongest) {
      claim(session, [longest]);
    }
  }

  // 4. Intervals, tempo and easy runs: order-preserving assignment.
  const ordered = auto
    .filter((s) => ORDERED_TYPES.has(s.type) && !matches.has(s.id))
    .sort(byDate);
  const assignment = assignInOrder(ordered, free());
  for (const session of ordered) {
    const activity = assignment.get(session.id);
    if (activity) {
      claim(session, [activity]);
    }
  }

  const sessions: SessionResult[] = week.sessions.map((session) => {
    const override = overrides.get(session.id);
    const matched = matches.get(session.id) ?? [];
    const first = matched[0];
    const moved = Boolean(
      first &&
      first.date !== session.date &&
      !inWindow(first.date, session.flexible_window),
    );
    const isManual = Boolean(
      override && (override.status !== null || override.activityIds !== null),
    );
    const result: SessionResult = {
      session,
      status: sessionStatus(session, matched, override, today, weekEnding),
      matched,
      moved,
      isManual,
      isToday: session.date === today,
      override: override ?? null,
    };
    return result;
  });

  const extras = free();
  const score = sessions.reduce(
    (acc, s) => acc + (s.status === "done" ? 1 : s.status === "partial" ? 0.5 : 0),
    0,
  );
  const completion = sessions.length > 0 ? score / sessions.length : 0;
  const plannedFromSessions = week.sessions
    .filter(isRunSession)
    .reduce((acc, s) => acc + (s.est_distance_km ?? 0), 0);
  const plannedKm =
    week.est_running_km ?? (plannedFromSessions > 0 ? plannedFromSessions : null);
  const state =
    today < weekCommencing ? "future" : today > weekEnding ? "past" : "current";

  const result: WeekResult = {
    week: week.week,
    weekCommencing,
    weekEnding,
    phase: week.phase,
    phaseName: input.phaseName ?? week.phase,
    notes: week.notes ?? null,
    plannedKm,
    actualKm: Math.round(sumKm(runs) * 10) / 10,
    sessions,
    extras,
    runs,
    state,
    completion,
  };
  return result;
}

/**
 * Matches every week of a plan, sharing pinned runs across weeks so a run
 * pinned in one week is never reused automatically in another.
 */
export function matchPlan(
  plan: Plan,
  activities: Activity[],
  overrides: Override[],
  today: string,
): WeekResult[] {
  const overrideMap = new Map(overrides.map((o) => [o.sessionId, o]));
  const phaseNames = new Map((plan.phases ?? []).map((p) => [p.id, p.name]));
  const weekOfSession = new Map<string, number>();
  plan.weeks.forEach((w, index) => {
    w.sessions.forEach((s) => weekOfSession.set(s.id, index));
  });

  const results = plan.weeks.map((week, index) => {
    const pinnedElsewhere = new Set<number>();
    for (const override of overrides) {
      const owner = weekOfSession.get(override.sessionId);
      if (override.activityIds && owner !== undefined && owner !== index) {
        override.activityIds.forEach((id) => pinnedElsewhere.add(id));
      }
    }
    const weekResult = matchWeek({
      week,
      activities,
      overrides: overrideMap,
      today,
      phaseName: phaseNames.get(week.phase),
      pinnedElsewhere,
    });
    return weekResult;
  });
  return results;
}
