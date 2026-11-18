// Rep pace for interval and tempo sessions, worked out from Strava laps
// (pure, unit-tested).
//
// How the work laps are found (an estimate from your laps, not a Strava figure):
// 1. From the plan: each block in the session's `structure` (e.g. 5 × 700 m
//    @ 4:35) gives an expected distance and time per rep. A lap counts as a rep
//    only if it is close to both: within 15% of the distance, and no more than
//    20% slower (or 30% quicker) than the target time. The closest laps win,
//    up to the planned number of reps. Used when at least half the planned
//    reps are found.
// 2. Otherwise, from pace alone: laps of 200 m or more run within 10% of the
//    fastest lap's pace, provided some laps were clearly slower (so a run with
//    only even laps has no reps).
// Rep pace is the reps' total time over their total distance.

import type { PlanSession } from "./types";

export const DISTANCE_TOLERANCE = 0.15; // lap within ±15% of the rep distance
export const MAX_SLOWER = 0.2; // lap no more than 20% over the target time
export const MAX_QUICKER = 0.3; // nor more than 30% under it (likely a different lap)
export const FALLBACK_MIN_M = 200; // shorter laps are recoveries or strides
export const FALLBACK_MIN_S = 30;
export const FALLBACK_WITHIN = 1.1; // within 10% of the fastest lap's pace
export const FALLBACK_CONTRAST = 1.15; // some lap must be 15% slower than the fastest

export const REP_SESSION_TYPES = new Set(["intervals", "tempo"]);

/** One Strava lap, reduced to what rep matching needs. */
export interface Lap {
  activityId: number;
  distanceM: number;
  movingTimeS: number;
  avgHr: number | null;
}

/** What one block of the plan expects of each rep. */
export interface RepTarget {
  reps: number;
  distanceM: number | null;
  timeS: number | null;
  paceSPerKm: number | null; // middle of the target pace range
  paceLabel: string | null;
}

export interface RepSummary {
  method: "plan" | "pace"; // matched against the plan, or by pace alone
  laps: Lap[]; // the work laps, in order
  plannedReps: number | null;
  distanceKm: number;
  movingTimeS: number;
  paceSPerKm: number;
  targetPaceSPerKm: number | null;
  targetLabel: string | null;
}

interface PaceSpec {
  min_s?: number;
  max_s?: number;
  label?: string;
}

function num(value: unknown): number | null {
  const n =
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  return n;
}

function lapPace(lap: Lap): number {
  const pace = lap.movingTimeS / (lap.distanceM / 1000);
  return pace;
}

/**
 * Reads the work blocks from a session's `structure`. Reps blocks give one
 * target each; continuous blocks (e.g. `steady`, `tempo`) count as one rep.
 * Strides are left out.
 */
export function repTargets(session: PlanSession): RepTarget[] {
  const targets: RepTarget[] = [];
  for (const raw of session.structure ?? []) {
    if (typeof raw !== "object" || raw === null) continue;
    const block = raw as Record<string, unknown>;
    if (block.kind === "strides") continue;
    const pace = (block.pace ?? null) as PaceSpec | null;
    const min = num(pace?.min_s);
    const max = num(pace?.max_s) ?? min;
    const paceS = min !== null && max !== null ? (min + max) / 2 : null;
    const minutes = num(block.duration_min);
    let distanceM = num(block.distance_m) ?? (num(block.distance_km) ?? 0) * 1000;
    let timeS = num(block.duration_s) ?? (minutes !== null ? minutes * 60 : null);
    if (!distanceM && timeS !== null && paceS !== null) {
      distanceM = (timeS / paceS) * 1000;
    }
    if (distanceM && timeS === null && paceS !== null) {
      timeS = (distanceM / 1000) * paceS;
    }
    if (!distanceM && timeS === null) continue;
    targets.push({
      reps: block.kind === "reps" ? (num(block.reps) ?? 1) : 1,
      distanceM: distanceM || null,
      timeS,
      paceSPerKm: paceS,
      paceLabel: typeof pace?.label === "string" ? pace.label : null,
    });
  }
  return targets;
}

/** How far a lap is from a target (lower is closer), or null if it isn't a rep. */
export function lapScore(lap: Lap, target: RepTarget): number | null {
  let score = 0;
  if (target.distanceM !== null) {
    const error = (lap.distanceM - target.distanceM) / target.distanceM;
    if (Math.abs(error) > DISTANCE_TOLERANCE) return null;
    score += Math.abs(error);
  }
  if (target.timeS !== null) {
    const error = (lap.movingTimeS - target.timeS) / target.timeS;
    if (error > MAX_SLOWER || error < -MAX_QUICKER) return null;
    score += Math.abs(error);
  }
  return score;
}

/**
 * Picks the laps that match the plan's blocks, in order: each block takes its
 * closest laps (up to its number of reps) after the previous block's last rep.
 */
export function planReps(laps: Lap[], targets: RepTarget[]): Lap[] {
  const picked: number[] = [];
  let from = 0;
  for (const target of targets) {
    const candidates = laps
      .map((lap, index) => ({
        index,
        score: index >= from ? lapScore(lap, target) : null,
      }))
      .filter((c): c is { index: number; score: number } => c.score !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, target.reps)
      .map((c) => c.index)
      .sort((a, b) => a - b);
    if (candidates.length > 0) {
      picked.push(...candidates);
      from = candidates[candidates.length - 1] + 1;
    }
  }
  const reps = picked.map((index) => laps[index]);
  return reps;
}

/** Laps run within 10% of the fastest lap, if the run had clearly slower laps. */
export function paceReps(laps: Lap[]): Lap[] {
  const usable = laps.filter(
    (lap) => lap.distanceM >= FALLBACK_MIN_M && lap.movingTimeS >= FALLBACK_MIN_S,
  );
  const none: Lap[] = [];
  if (usable.length < 2) return none;
  const fastest = Math.min(...usable.map(lapPace));
  const slowest = Math.max(...usable.map(lapPace));
  if (slowest < fastest * FALLBACK_CONTRAST) return none;
  const reps = usable.filter((lap) => lapPace(lap) <= fastest * FALLBACK_WITHIN);
  return reps;
}

/** Time-weighted target pace over the planned blocks, with a label if there's one. */
function targetPace(targets: RepTarget[]): {
  pace: number | null;
  label: string | null;
} {
  const withPace = targets.filter((t) => t.paceSPerKm !== null && t.distanceM !== null);
  const metres = withPace.reduce((acc, t) => acc + t.reps * (t.distanceM ?? 0), 0);
  const seconds = withPace.reduce(
    (acc, t) => acc + t.reps * ((t.distanceM ?? 0) / 1000) * (t.paceSPerKm ?? 0),
    0,
  );
  const labels = [...new Set(targets.map((t) => t.paceLabel).filter(Boolean))];
  const result = {
    pace: metres > 0 ? seconds / (metres / 1000) : null,
    label: labels.length === 1 ? (labels[0] as string) : null,
  };
  return result;
}

/** Finds the work laps for a session and averages their pace. */
export function summariseReps(session: PlanSession, laps: Lap[]): RepSummary | null {
  const targets = repTargets(session);
  const planned = targets.reduce((acc, t) => acc + t.reps, 0);
  const fromPlan = planned > 0 ? planReps(laps, targets) : [];
  let method: RepSummary["method"] = "plan";
  let reps = fromPlan;
  if (fromPlan.length < Math.ceil(planned / 2) || fromPlan.length === 0) {
    const byPace = paceReps(laps);
    if (byPace.length > 0) {
      method = "pace";
      reps = byPace;
    }
  }
  if (reps.length === 0) return null;
  const distanceM = reps.reduce((acc, lap) => acc + lap.distanceM, 0);
  const movingTimeS = reps.reduce((acc, lap) => acc + lap.movingTimeS, 0);
  if (distanceM <= 0 || movingTimeS <= 0) return null;
  const target = targetPace(targets);
  const summary: RepSummary = {
    method,
    laps: reps,
    plannedReps: planned > 0 ? planned : null,
    distanceKm: distanceM / 1000,
    movingTimeS,
    paceSPerKm: movingTimeS / (distanceM / 1000),
    targetPaceSPerKm: target.pace,
    targetLabel: target.label,
  };
  return summary;
}
