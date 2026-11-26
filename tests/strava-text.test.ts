import { describe, expect, it } from "vitest";
import type { Lap, RepSummary } from "../lib/reps";
import { sessionLine, stravaText } from "../lib/strava-text";
import type { PlanSession } from "../lib/types";

/** A lap of `metres` at `paceS` seconds per km. */
function lap(metres: number, paceS: number): Lap {
  const result: Lap = {
    activityId: 1,
    distanceM: metres,
    movingTimeS: Math.round((metres / 1000) * paceS),
    avgHr: null,
  };
  return result;
}

/** A rep summary from laps, as summariseReps would build it. */
function summary(laps: Lap[], extra: Partial<RepSummary> = {}): RepSummary {
  const distanceM = laps.reduce((acc, l) => acc + l.distanceM, 0);
  const movingTimeS = laps.reduce((acc, l) => acc + l.movingTimeS, 0);
  const result: RepSummary = {
    method: "plan",
    laps,
    plannedReps: laps.length,
    distanceKm: distanceM / 1000,
    movingTimeS,
    paceSPerKm: movingTimeS / (distanceM / 1000),
    targetPaceSPerKm: null,
    targetLabel: null,
    ...extra,
  };
  return result;
}

function session(title: string, type: string): PlanSession {
  const result: PlanSession = { id: "s1", date: "2026-11-24", day: "Tue", type, title };
  return result;
}

describe("sessionLine", () => {
  it("keeps a pace that's already in the title and adds /km", () => {
    const reps = summary([lap(1200, 278)], { targetLabel: "4:40" });
    const line = sessionLine(session("4 x 1.2 km @ 4:40", "tempo"), reps);
    expect(line).toBe("Tempo: 4 x 1.2 km @ 4:40/km");
  });

  it("adds the target pace when the title has none", () => {
    const reps = summary([lap(400, 246)], { targetLabel: "4:05-4:10" });
    const line = sessionLine(session("8 x 400 m", "intervals"), reps);
    expect(line).toBe("Intervals: 8 x 400 m @ 4:05-4:10/km");
  });

  it("falls back to the target pace when there's no label", () => {
    const reps = summary([lap(800, 250)], { targetPaceSPerKm: 252 });
    const line = sessionLine(session("5 x 800 m", "intervals"), reps);
    expect(line).toBe("Intervals: 5 x 800 m @ 4:12/km");
  });

  it("doesn't add /km after a pace that isn't a clock", () => {
    const reps = summary([lap(1000, 270)]);
    const line = sessionLine(session("3 x 1 km @ HMP", "tempo"), reps);
    expect(line).toBe("Tempo: 3 x 1 km @ HMP");
  });
});

describe("stravaText", () => {
  it("lists the session, average rep pace and each rep", () => {
    const laps = [lap(1200, 278), lap(1200, 276), lap(1200, 279), lap(1200, 275)];
    const reps = summary(laps, { targetLabel: "4:40" });
    const text = stravaText(session("4 x 1.2 km @ 4:40", "tempo"), reps);
    expect(text).toBe(
      [
        "Tempo: 4 x 1.2 km @ 4:40/km",
        "Average: 4:37/km",
        "Reps: 4:38 · 4:36 · 4:39 · 4:35",
      ].join("\n"),
    );
  });

  it("says how many reps were found when some are missing", () => {
    const laps = [lap(400, 246), lap(400, 248), lap(400, 244)];
    const reps = summary(laps, { plannedReps: 8, targetLabel: "4:05-4:10" });
    const text = stravaText(session("8 x 400 m", "intervals"), reps);
    expect(text.split("\n")[1]).toBe("Average: 4:06/km (3 of 8 reps)");
  });

  it("leaves the count out when reps were found by pace alone", () => {
    const laps = [lap(400, 246), lap(400, 248)];
    const reps = summary(laps, { method: "pace", plannedReps: 8 });
    const text = stravaText(session("8 x 400 m", "intervals"), reps);
    expect(text.split("\n")[1]).toBe("Average: 4:06/km");
  });
});
