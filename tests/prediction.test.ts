import { describe, expect, it } from "vitest";
import { formatGap, formatRaceTime } from "../lib/format";
import {
  enduranceExponent,
  parseRaceTime,
  predictHalf,
  predictionSeries,
  riegel,
} from "../lib/prediction";
import { HALF_MARATHON_KM } from "../lib/stats";
import type { Activity } from "../lib/types";

let nextId = 1;
function run(date: string, km: number, timeS: number, sportType = "Run"): Activity {
  const activity: Activity = {
    id: nextId++,
    name: `Run ${date}`,
    date,
    startLocal: `${date}T07:00:00`,
    sportType,
    distanceKm: km,
    movingTimeS: timeS,
    avgHr: null,
  };
  return activity;
}

describe("riegel", () => {
  it("matches the plan's checkpoint: a 20:45 5k is about a 1:35:30 half", () => {
    const half = riegel(20 * 60 + 45, 5, HALF_MARATHON_KM);
    expect(formatRaceTime(half)).toBe("1:35:27");
  });
});

describe("enduranceExponent", () => {
  it("is 1.06 from 16 km, 1.09 at 8 km and below, linear between", () => {
    expect(enduranceExponent(16)).toBeCloseTo(1.06);
    expect(enduranceExponent(21)).toBeCloseTo(1.06);
    expect(enduranceExponent(12)).toBeCloseTo(1.075);
    expect(enduranceExponent(8)).toBeCloseTo(1.09);
    expect(enduranceExponent(3)).toBeCloseTo(1.09);
  });
});

describe("predictHalf", () => {
  const parkrun = run("2026-11-07", 5, 1341); // 22:21
  const tempo = run("2026-11-10", 8, 2400); // 5:00 /km
  const long = run("2026-11-14", 16.2, 5832); // 6:00 /km

  it("uses the fastest equivalent effort, with no allowance after a 16 km run", () => {
    const prediction = predictHalf([parkrun, tempo, long], "2026-11-15");
    expect(prediction?.basis.id).toBe(parkrun.id);
    expect(prediction?.longestKm).toBe(16.2);
    expect(prediction?.enduranceS).toBe(0);
    expect(formatRaceTime(prediction?.timeS ?? 0)).toBe("1:42:49");
  });

  it("adds an endurance allowance while the long run is short", () => {
    const prediction = predictHalf([parkrun, tempo], "2026-11-15");
    expect(prediction?.exponent).toBeCloseTo(1.06 + 0.03 * (8 / 8));
    expect(prediction?.enduranceS).toBeGreaterThan(0);
    expect(prediction?.timeS).toBeGreaterThan(riegel(1341, 5, HALF_MARATHON_KM));
  });

  it("ignores short runs, other sports, later runs and runs over 8 weeks old", () => {
    const activities = [
      run("2026-11-14", 2.5, 500), // too short to scale up
      run("2026-11-14", 20, 2400, "Ride"),
      run("2026-11-16", 5, 1100), // after the date
      run("2026-09-19", 5, 1200), // 57 days before
      tempo,
    ];
    const prediction = predictHalf(activities, "2026-11-15");
    expect(prediction?.basis.id).toBe(tempo.id);
    expect(prediction?.longestKm).toBe(8);
  });

  it("counts a run exactly 8 weeks back (56 days including the day itself)", () => {
    const old = run("2026-09-21", 5, 1200);
    expect(predictHalf([old], "2026-11-15")?.basis.id).toBe(old.id);
  });

  it("ignores runs faster than world-record pace (bad GPS or a mislabelled ride)", () => {
    const glitch = run("2026-11-12", 10, 1200); // 2:00 /km
    expect(predictHalf([glitch, tempo], "2026-11-15")?.basis.id).toBe(tempo.id);
  });

  it("returns null with no run of 3 km or more", () => {
    expect(predictHalf([run("2026-11-14", 2, 600)], "2026-11-15")).toBeNull();
    expect(predictHalf([], "2026-11-15")).toBeNull();
  });
});

describe("predictionSeries", () => {
  it("has one point per day and nothing after today", () => {
    const activities = [run("2026-11-17", 5, 1300), run("2026-11-21", 5, 1250)];
    const points = predictionSeries(
      activities,
      "2026-11-16",
      "2026-11-29",
      "2026-11-22",
    );
    expect(points).toHaveLength(14);
    expect(points[0].prediction).toBeNull(); // no run yet
    expect(points[1].prediction?.basis.id).toBe(activities[0].id);
    expect(points[5].prediction?.basis.id).toBe(activities[1].id); // faster run takes over
    expect(points[6].prediction).not.toBeNull();
    expect(points[7].prediction).toBeNull(); // after today
  });
});

describe("parseRaceTime", () => {
  it("reads h:mm:ss and mm:ss", () => {
    expect(parseRaceTime("1:35:00")).toBe(5700);
    expect(parseRaceTime("21:30")).toBe(1290);
  });

  it("returns null for anything else", () => {
    expect(parseRaceTime("fast")).toBeNull();
    expect(parseRaceTime("95")).toBeNull();
    expect(parseRaceTime(null)).toBeNull();
  });
});

describe("formatRaceTime", () => {
  it("shows hours only when needed", () => {
    expect(formatRaceTime(6169)).toBe("1:42:49");
    expect(formatRaceTime(192)).toBe("3:12");
    expect(formatRaceTime(-192)).toBe("3:12");
  });
});

describe("formatGap", () => {
  it("spells out minutes and seconds", () => {
    expect(formatGap(522)).toBe("8 min 42 s");
    expect(formatGap(-42)).toBe("42 s");
  });
});
