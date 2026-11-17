// Plan upload validation and download export.

import { addDays, isIsoDate, weekday } from "./dates";
import type { Activity, Plan, PlanSession, SessionResult, WeekResult } from "./types";

export type ValidationResult =
  { ok: true; plan: Plan } | { ok: false; errors: string[] };

function isObject(value: unknown): value is Record<string, unknown> {
  const result = typeof value === "object" && value !== null && !Array.isArray(value);
  return result;
}

function nonEmptyString(value: unknown): boolean {
  const result = typeof value === "string" && value.trim().length > 0;
  return result;
}

/**
 * Validates an uploaded plan and strips the progress fields (`status`,
 * `actual`) from every session, because progress lives in the database.
 */
export function validatePlan(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(raw)) {
    const result: ValidationResult = {
      ok: false,
      errors: ["Plan must be a JSON object."],
    };
    return result;
  }
  if (!Array.isArray(raw.weeks) || raw.weeks.length === 0) {
    const result: ValidationResult = {
      ok: false,
      errors: ["Plan must have a non-empty `weeks` array."],
    };
    return result;
  }

  for (const key of ["start_date", "end_date"]) {
    if (raw[key] !== undefined && !isIsoDate(raw[key])) {
      errors.push(`\`${key}\` must be a YYYY-MM-DD date.`);
    }
  }
  if (isObject(raw.race) && raw.race.date !== undefined && !isIsoDate(raw.race.date)) {
    errors.push("`race.date` must be a YYYY-MM-DD date.");
  }

  const seen = new Set<string>();
  raw.weeks.forEach((week: unknown, wi: number) => {
    const label = `Week ${wi + 1}`;
    if (!isObject(week)) {
      errors.push(`${label} must be an object.`);
      return;
    }
    const monday = week.week_commencing;
    if (!isIsoDate(monday)) {
      errors.push(`${label}: \`week_commencing\` must be a YYYY-MM-DD date.`);
    } else if (weekday(monday) !== 1) {
      errors.push(`${label}: \`week_commencing\` (${monday}) must be a Monday.`);
    }
    if (!Array.isArray(week.sessions)) {
      errors.push(`${label}: \`sessions\` must be an array.`);
      return;
    }
    week.sessions.forEach((session: unknown, si: number) => {
      if (!isObject(session)) {
        errors.push(`${label}, session ${si + 1} must be an object.`);
        return;
      }
      const id = session.id;
      const where = nonEmptyString(id)
        ? `Session ${id}`
        : `${label}, session ${si + 1}`;
      if (!nonEmptyString(id)) {
        errors.push(`${where}: missing \`id\`.`);
      } else if (seen.has(id as string)) {
        errors.push(`${where}: duplicate session id.`);
      } else {
        seen.add(id as string);
      }
      if (!isIsoDate(session.date)) {
        errors.push(`${where}: \`date\` must be a YYYY-MM-DD date.`);
      } else if (
        isIsoDate(monday) &&
        (session.date < monday || session.date > addDays(monday, 6))
      ) {
        errors.push(`${where}: date ${session.date} is outside its week.`);
      }
      if (!nonEmptyString(session.type)) {
        errors.push(`${where}: missing \`type\`.`);
      }
      if (!nonEmptyString(session.title)) {
        errors.push(`${where}: missing \`title\`.`);
      }
      const window = session.flexible_window;
      if (
        window !== undefined &&
        (!isObject(window) || !isIsoDate(window.start) || !isIsoDate(window.end))
      ) {
        errors.push(`${where}: \`flexible_window\` needs YYYY-MM-DD start and end.`);
      }
    });
  });

  if (errors.length > 0) {
    const result: ValidationResult = { ok: false, errors };
    return result;
  }

  const plan = structuredClone(raw) as unknown as Plan;
  for (const week of plan.weeks) {
    for (const session of week.sessions) {
      delete session.status;
      delete session.actual;
    }
  }
  const result: ValidationResult = { ok: true, plan };
  return result;
}

export function sessionIds(plan: Plan): Set<string> {
  const ids = new Set(plan.weeks.flatMap((w) => w.sessions.map((s) => s.id)));
  return ids;
}

/** Finds a session by ID anywhere in the plan. */
export function findSession(plan: Plan, sessionId: string): PlanSession | undefined {
  const session = plan.weeks.flatMap((w) => w.sessions).find((s) => s.id === sessionId);
  return session;
}

/** Maps a computed session result to the status written into the exported plan. */
export function exportStatus(result: SessionResult): string {
  let status: string = result.status;
  if (result.status === "missed") {
    status = "skipped";
  } else if (result.status === "done" && result.moved) {
    status = "moved";
  }
  return status;
}

/** Builds the `actual` block for a session from its matched runs. */
export function exportActual(matched: Activity[]): Record<string, unknown> | null {
  if (matched.length === 0) {
    return null;
  }
  const distanceKm = matched.reduce((acc, a) => acc + a.distanceKm, 0);
  const durationS = matched.reduce((acc, a) => acc + a.movingTimeS, 0);
  const withHr = matched.filter((a) => a.avgHr !== null);
  const hrTime = withHr.reduce((acc, a) => acc + a.movingTimeS, 0);
  const avgHr =
    withHr.length > 0 && hrTime > 0
      ? Math.round(
          withHr.reduce((acc, a) => acc + (a.avgHr ?? 0) * a.movingTimeS, 0) / hrTime,
        )
      : null;
  const ids = matched.map((a) => a.id);
  const actual = {
    date: matched[0].date,
    distance_km: Math.round(distanceKm * 100) / 100,
    duration_s: durationS,
    avg_pace_s_per_km: distanceKm > 0 ? Math.round(durationS / distanceKm) : null,
    avg_hr: avgHr,
    rpe: null,
    strava_activity_id: ids.length === 1 ? ids[0] : ids.join(","),
    notes: null,
  };
  return actual;
}

/** Returns a copy of the plan with `status` and `actual` filled in. */
export function exportPlan(plan: Plan, weeks: WeekResult[]): Plan {
  const results = new Map<string, SessionResult>();
  weeks.forEach((w) => w.sessions.forEach((r) => results.set(r.session.id, r)));
  const copy = structuredClone(plan);
  for (const week of copy.weeks) {
    for (const session of week.sessions) {
      const result = results.get(session.id);
      session.status = result ? exportStatus(result) : "planned";
      session.actual = result ? exportActual(result.matched) : null;
    }
  }
  return copy;
}
