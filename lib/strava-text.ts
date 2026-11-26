// Copy-and-paste text for a Strava activity description: the session and the
// pace of its reps (pure, unit-tested).
//
// Example:
//   Tempo: 4 x 1.2 km @ 4:40/km
//   Average: 4:37/km
//   Reps: 4:38 · 4:36 · 4:39 · 4:35

import { paceClock } from "./format";
import type { RepSummary } from "./reps";
import type { PlanSession } from "./types";

const TYPE_LABELS: Record<string, string> = {
  intervals: "Intervals",
  tempo: "Tempo",
};

/** "4:05-4:10" from the plan's label, or "4:07" from the target pace. */
function targetText(reps: RepSummary): string | null {
  const target =
    reps.targetLabel ??
    (reps.targetPaceSPerKm !== null ? paceClock(reps.targetPaceSPerKm) : null);
  return target;
}

/**
 * The session line, e.g. "Intervals: 8 x 400 m @ 4:05-4:10/km". Adds the
 * target pace when the title doesn't have one, and "/km" after a pace.
 */
export function sessionLine(session: PlanSession, reps: RepSummary): string {
  let line = session.title.trim();
  const target = targetText(reps);
  if (!line.includes("@") && target) line = `${line} @ ${target}`;
  if (/\d:\d{2}$/.test(line)) line = `${line}/km`;
  const label = TYPE_LABELS[session.type];
  const text = label ? `${label}: ${line}` : line;
  return text;
}

/** The full text to paste into Strava: session, average rep pace and each rep. */
export function stravaText(session: PlanSession, reps: RepSummary): string {
  const average = paceClock(reps.paceSPerKm);
  const shortOf =
    reps.method === "plan" &&
    reps.plannedReps !== null &&
    reps.laps.length < reps.plannedReps;
  const count = shortOf ? ` (${reps.laps.length} of ${reps.plannedReps} reps)` : "";
  const splits = reps.laps.map((lap) =>
    paceClock(lap.movingTimeS / (lap.distanceM / 1000)),
  );
  const lines = [
    sessionLine(session, reps),
    `Average: ${average}/km${count}`,
    `Reps: ${splits.join(" · ")}`,
  ];
  const text = lines.join("\n");
  return text;
}
