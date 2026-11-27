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
    expect(line).toBe("4 x 1.2 km @ 4:40/km");
  });

  it("adds the target pace when the title has none", () => {
    const reps = summary([lap(400, 246)], { targetLabel: "4:05-4:10" });
    const line = sessionLine(session("8 x 400 m", "intervals"), reps);
    expect(line).toBe("8 x 400 m @ 4:05-4:10/km");
  });

  it("falls back to the target pace when there's no label", () => {
    const reps = summary([lap(800, 250)], { targetPaceSPerKm: 252 });
    const line = sessionLine(session("5 x 800 m", "intervals"), reps);
    expect(line).toBe("5 x 800 m @ 4:12/km");
  });

  it("doesn't add /km after a pace that isn't a clock", () => {
    const reps = summary([lap(1000, 270)]);
    const line = sessionLine(session("3 x 1 km @ HMP", "tempo"), reps);
    expect(line).toBe("3 x 1 km @ HMP");
  });
});

describe("stravaText", () => {
  it("gives the session and each rep's pace for a tempo run", () => {
    const laps = [lap(1200, 278), lap(1200, 279), lap(1200, 280), lap(1200, 281)];
    const reps = summary(laps, { targetLabel: "4:40" });
    const text = stravaText(session("4 x 1.2 km @ 4:40", "tempo"), reps);
    expect(text).toBe(
      ["4 x 1.2 km @ 4:40/km", "Reps: 4:38 · 4:39 · 4:40 · 4:41"].join("\n"),
    );
  });

  it("gives the same form for intervals", () => {
    const laps = [lap(400, 245), lap(400, 248), lap(400, 250)];
    const reps = summary(laps, { plannedReps: 8, targetLabel: "4:05-4:10" });
    const text = stravaText(session("8 x 400 m", "intervals"), reps);
    expect(text).toBe(
      ["8 x 400 m @ 4:05-4:10/km", "Reps: 4:05 · 4:08 · 4:10"].join("\n"),
    );
  });
});
