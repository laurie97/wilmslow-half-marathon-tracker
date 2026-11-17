// Plan JSON shapes (see data/demo-plan.json for an example).

export type SessionType =
  "intervals" | "tempo" | "long_run" | "easy" | "time_trial" | "race" | "strength";

export interface PlanSession {
  id: string;
  date: string; // YYYY-MM-DD
  day: string;
  type: SessionType | string;
  title: string;
  est_distance_km?: number;
  est_duration_min?: number;
  notes?: string;
  warm_up_km?: number;
  cool_down_km?: number;
  structure?: unknown[];
  routine?: string;
  sets?: number;
  flexible_window?: { start: string; end: string };
  goal_time?: string;
  status?: string;
  actual?: unknown;
  [key: string]: unknown;
}

export interface PlanWeek {
  week: number;
  week_commencing: string; // Monday, YYYY-MM-DD
  phase: string;
  pace_set?: string;
  est_running_km?: number;
  notes?: string;
  sessions: PlanSession[];
  [key: string]: unknown;
}

export interface Exercise {
  name: string;
  reps?: number | string;
  per_side?: boolean;
  duration_s?: number;
  cue?: string;
}

export interface Plan {
  schema_version?: string;
  plan_id?: string;
  athlete?: { name?: string };
  race?: { name?: string; date?: string; goals?: Record<string, { time?: string }> };
  start_date?: string;
  end_date?: string;
  phases?: { id: string; name: string; weeks: number[] }[];
  warm_up?: { applies_to?: string[]; description?: string };
  cool_down?: { applies_to?: string[]; description?: string };
  strength?: {
    routines?: Record<string, { name?: string; exercises?: Exercise[] }>;
    progression?: unknown;
  };
  rules?: unknown[];
  checkpoints?: unknown[];
  weeks: PlanWeek[];
  [key: string]: unknown;
}

// Strava activity, reduced to what the app needs. Not stored in the database.
export interface Activity {
  id: number;
  name: string;
  date: string; // local date, YYYY-MM-DD
  startLocal: string; // local ISO timestamp, for ordering
  sportType: string;
  distanceKm: number;
  movingTimeS: number;
  avgHr: number | null;
}

export type ManualStatus = "done" | "partial" | "skipped";

export interface Override {
  sessionId: string;
  status: ManualStatus | null; // null = automatic
  activityIds: number[] | null; // null = automatic, [] = no activity
}

export type SessionStatus = "done" | "partial" | "skipped" | "missed" | "planned";

export interface SessionResult {
  session: PlanSession;
  status: SessionStatus;
  matched: Activity[];
  moved: boolean; // matched run was on a different day from the plan
  isManual: boolean;
  isToday: boolean;
  override: Override | null;
}

export interface WeekResult {
  week: number;
  weekCommencing: string;
  weekEnding: string;
  phase: string;
  phaseName: string;
  notes: string | null;
  plannedKm: number | null;
  actualKm: number;
  sessions: SessionResult[];
  extras: Activity[];
  runs: Activity[]; // every run dated in this week, for the "which run?" picker
  state: "past" | "current" | "future";
  completion: number; // done = 1, partial = 0.5, averaged over sessions (0-1)
}
