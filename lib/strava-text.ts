// Copy-and-paste text for a Strava activity description: the session and the
// pace of each rep (pure, unit-tested).
//
// Example:
//   4 x 1.2 km @ 4:40/km
//   Reps: 4:38 · 4:39 · 4:40 · 4:41

import { paceClock } from "./format";
import type { RepSummary } from "./reps";
import type { PlanSession } from "./types";

/** "4:05-4:10" from the plan's label, or "4:07" from the target pace. */
function targetText(reps: RepSummary): string | null {
  const target =
    reps.targetLabel ??
    (reps.targetPaceSPerKm !== null ? paceClock(reps.targetPaceSPerKm) : null);
  return target;
}

/**
 * The session line, e.g. "8 x 400 m @ 4:05-4:10/km". Adds the target pace
 * when the title doesn't have one, and "/km" after a pace.
 */
export function sessionLine(session: PlanSession, reps: RepSummary): string {
  let line = session.title.trim();
  const target = targetText(reps);
  if (!line.includes("@") && target) line = `${line} @ ${target}`;
  if (/\d:\d{2}$/.test(line)) line = `${line}/km`;
  return line;
}

/** The full text to paste into Strava: the session, then each rep's pace. */
export function stravaText(session: PlanSession, reps: RepSummary): string {
  const splits = reps.laps.map((lap) =>
    paceClock(lap.movingTimeS / (lap.distanceM / 1000)),
  );
  const lines = [sessionLine(session, reps), `Reps: ${splits.join(" · ")}`];
  const text = lines.join("\n");
  return text;
}
