import { describe, expect, it } from "vitest";
import demoPlan from "../data/demo-plan.json";
import { athleteSeries, buildComparison } from "../lib/compare";
import { demoActivitiesFor } from "../lib/demo";
import { matchPlan } from "../lib/matching";
import { validatePlan } from "../lib/plan";
import { countRuns } from "../lib/stats";
import type { WeekResult } from "../lib/types";

const TODAY = "2026-12-03";

/** Matched weeks for one demo athlete. */
function demoWeeks(athleteId: number): WeekResult[] {
  const validated = validatePlan(structuredClone(demoPlan));
  if (!validated.ok) throw new Error(validated.errors.join("\n"));
  const plan = validated.plan;
  const weeks = matchPlan(plan, demoActivitiesFor(athleteId, plan, TODAY), [], TODAY);
  return weeks;
}

describe("athleteSeries", () => {
  it("rises to today's runs-done share and stops there", () => {
    const weeks = demoWeeks(1);
    const series = athleteSeries(weeks, TODAY);
    const counts = countRuns(weeks, TODAY);
    const expected =
      Math.round(((counts.done + counts.partial) / counts.total) * 1000) / 10;
    expect(series.runsPct.get(TODAY)).toBe(expected);
    expect(series.runsPct.has("2026-12-04")).toBe(false);
    const values = [...series.runsPct.values()];
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});

describe("buildComparison", () => {
  it("lines athletes up on one calendar without exposing their IDs", () => {
    const loaded = [
      { id: 1, order: 0, name: "Alex", weeks: demoWeeks(1) },
      { id: 4, order: 3, name: "Jordan", weeks: demoWeeks(4) },
      { id: 9, order: 1, name: "No plan", weeks: [] },
    ];
    const result = buildComparison(loaded, 4, TODAY);
    expect(result.athletes.map((a) => a.name)).toEqual(["Alex", "Jordan"]);
    expect(result.athletes.map((a) => a.key)).toEqual(["a1", "a4"]);
    expect(result.athletes.map((a) => a.slot)).toEqual([0, 3]);
    expect(result.athletes.map((a) => a.isYou)).toEqual([false, true]);
    expect(JSON.stringify(result)).not.toContain('"id"');
    for (const a of result.athletes) {
      expect(a.runsPct).toHaveLength(result.dates.length);
      expect(a.distanceKm).toHaveLength(result.dates.length);
    }
    const [alex, jordan] = result.athletes;
    expect(jordan.km).toBeLessThan(alex.km);
    expect(jordan.runsDone).toBeLessThan(alex.runsDone);
  });
});

describe("loadComparison sharing", () => {
  it("shows others only to athletes who share, and only those who share", async () => {
    process.env.DEMO_MODE = "1";
    process.env.DEMO_TODAY = TODAY;
    const { getStore } = await import("../lib/db");
    const { loadComparison } = await import("../lib/compare");
    const store = await getStore();

    const before = await loadComparison(1);
    expect(before.sharing).toBe(false);
    expect(before.othersSharing).toBe(3);
    expect(before.athletes.map((a) => a.name)).toEqual(["Alex"]);

    await store.setSharing(1, true);
    const after = await loadComparison(1);
    expect(after.sharing).toBe(true);
    expect(after.athletes.map((a) => a.name)).toEqual([
      "Alex",
      "Sam",
      "Priya",
      "Jordan",
    ]);

    await store.setSharing(3, false);
    const optedOut = await loadComparison(1);
    expect(optedOut.athletes.map((a) => a.name)).toEqual(["Alex", "Sam", "Jordan"]);
    expect(optedOut.othersSharing).toBe(2);
  });
});
