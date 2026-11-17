// Half marathon prediction from recent training (pure, unit-tested).
//
// How it works (an estimate, not a Strava figure):
// - Speed: every run of at least 3 km in the last 8 weeks is converted to a
//   half marathon time with Riegel's formula, T2 = T1 × (D2 / D1) ^ k, using
//   its moving time. The fastest result wins, so the prediction is set by your
//   best recent effort (usually a parkrun, time trial or tempo).
// - Endurance: Riegel's usual k = 1.06 assumes you're trained for the distance.
//   k rises towards 1.09 as your longest run in the same 8 weeks drops from
//   16 km to 8 km, so building the long run improves the prediction too.
// Paces are whole-run averages: only Strava's activity summaries are fetched.

import { addDays } from "./dates";
import { isRunActivity } from "./matching";
import { HALF_MARATHON_KM } from "./stats";
import type { Activity } from "./types";

export const WINDOW_DAYS = 56; // 8 weeks of runs count towards a prediction
export const MIN_EFFORT_KM = 3; // Riegel is unreliable from very short runs
export const RIEGEL_EXPONENT = 1.06;
export const ENDURANCE_FULL_KM = 16; // long run needing no endurance allowance
export const ENDURANCE_LOW_KM = 8; // long run at or below which it is largest
export const MAX_EXTRA_EXPONENT = 0.03;
const FASTEST_PACE_S_PER_KM = 150; // quicker than world-record pace: bad data

export interface Prediction {
  timeS: number; // predicted half marathon time
  basis: Activity; // the run the prediction comes from
  longestKm: number; // longest run in the window
  exponent: number; // Riegel exponent used
  enduranceS: number; // seconds added for endurance (0 at 16 km+)
}

export interface PredictionPoint {
  date: string;
  prediction: Prediction | null; // null after today, or with no recent runs
}

/** Riegel's formula: time over `toKm` from a time over `fromKm`. */
export function riegel(
  timeS: number,
  fromKm: number,
  toKm: number,
  exponent: number = RIEGEL_EXPONENT,
): number {
  const predicted = timeS * (toKm / fromKm) ** exponent;
  return predicted;
}

/** Riegel exponent for a given longest recent run (1.06 to 1.09). */
export function enduranceExponent(longestKm: number): number {
  const span = ENDURANCE_FULL_KM - ENDURANCE_LOW_KM;
  const shortfall = Math.min(Math.max((ENDURANCE_FULL_KM - longestKm) / span, 0), 1);
  const exponent = RIEGEL_EXPONENT + MAX_EXTRA_EXPONENT * shortfall;
  return exponent;
}

/** True for a run with a believable distance, time and pace. */
function usable(activity: Activity): boolean {
  const ok =
    isRunActivity(activity) &&
    activity.distanceKm > 0 &&
    activity.movingTimeS / activity.distanceKm >= FASTEST_PACE_S_PER_KM;
  return ok;
}

/**
 * Predicts a half marathon time on `date` from runs in the 8 weeks up to and
 * including that day. Returns null if none of them is at least 3 km.
 */
export function predictHalf(activities: Activity[], date: string): Prediction | null {
  const from = addDays(date, -(WINDOW_DAYS - 1));
  const recent = activities.filter(
    (a) => a.date >= from && a.date <= date && usable(a),
  );
  const efforts = recent.filter((a) => a.distanceKm >= MIN_EFFORT_KM);
  if (efforts.length === 0) {
    const none = null;
    return none;
  }
  const longestKm = Math.max(...recent.map((a) => a.distanceKm));
  const exponent = enduranceExponent(longestKm);
  const timeFor = (a: Activity): number =>
    riegel(a.movingTimeS, a.distanceKm, HALF_MARATHON_KM, exponent);
  const basis = efforts.reduce((best, a) => (timeFor(a) < timeFor(best) ? a : best));
  const timeS = timeFor(basis);
  const prediction: Prediction = {
    timeS,
    basis,
    longestKm,
    exponent,
    enduranceS: timeS - riegel(basis.movingTimeS, basis.distanceKm, HALF_MARATHON_KM),
  };
  return prediction;
}

/** One prediction per day from `first` to `last`; null after `today`. */
export function predictionSeries(
  activities: Activity[],
  first: string,
  last: string,
  today: string,
): PredictionPoint[] {
  const points: PredictionPoint[] = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    points.push({
      date,
      prediction: date <= today ? predictHalf(activities, date) : null,
    });
  }
  return points;
}

/** "1:35:00" or "21:30" to seconds; null if it isn't a time. */
export function parseRaceTime(text: string | null | undefined): number | null {
  const parts = (text ?? "").trim().split(":");
  const valid =
    parts.length >= 2 && parts.length <= 3 && parts.every((p) => /^\d+$/.test(p));
  const seconds = valid ? parts.reduce((acc, p) => acc * 60 + Number(p), 0) : null;
  return seconds;
}
