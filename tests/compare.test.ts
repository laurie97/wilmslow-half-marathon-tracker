import { describe, expect, it } from "vitest";
import demoPlan from "../data/demo-plan.json";
import { athleteSeries, buildComparison } from "../lib/compare";
import { demoActivitiesFor } from "../lib/demo";
import { matchPlan } from "../lib/matching";
import { validatePlan } from "../lib/plan";
import { countRuns, countStrength } from "../lib/stats";
import type { Override, WeekResult } from "../lib/types";

const TODAY = "2026-12-03";

/** Matched weeks for one demo athlete, with the given strength sessions ticked. */
function demoWeeks(athleteId: number, strengthDone: string[] = []): WeekResult[] {
  const validated = validatePlan(structuredClone(demoPlan));
  if (!validated.ok) throw new Error(validated.errors.join("\n"));
  const plan = validated.plan;
  const overrides: Override[] = strengthDone.map((sessionId) => ({
    sessionId,
    status: "done",
    activityIds: null,
  }));
  const activities = demoActivitiesFor(athleteId, plan, TODAY);
  const weeks = matchPlan(plan, activities, overrides, TODAY);
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

describe("athleteSeries strength", () => {
  it("adds each ticked strength session on its planned day", () => {
    const weeks = demoWeeks(1, ["w00-wed-strength", "w00-fri-strength"]);
    const series = athleteSeries(weeks, TODAY);
    const total = countStrength(weeks, TODAY).total;
    const one = Math.round((1 / total) * 1000) / 10;
    expect(series.strengthPct.get("2026-11-17")).toBe(0);
    expect(series.strengthPct.get("2026-11-18")).toBe(one);
    expect(series.strengthPct.get("2026-11-20")).toBe(Math.round(2 * one * 10) / 10);
    expect(series.strengthPct.get(TODAY)).toBe(series.strengthPct.get("2026-11-20"));
    expect(series.strengthPct.has("2026-12-04")).toBe(false);
  });

  it("counts a session ticked ahead of its day from today", () => {
    const weeks = demoWeeks(1, ["w03-fri-strength"]);
    const series = athleteSeries(weeks, TODAY);
    expect(series.strengthPct.get(TODAY)).toBeGreaterThan(0);
    expect(series.strengthPct.get("2026-12-02")).toBe(0);
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
      expect(a.strengthPct).toHaveLength(result.dates.length);
      expect(a.distanceKm).toHaveLength(result.dates.length);
      expect(a.plannedTotalKm).toBeGreaterThan(a.plannedToDateKm);
    }
    const [alex, jordan] = result.athletes;
    expect(jordan.km).toBeLessThan(alex.km);
    expect(jordan.runsDone).toBeLessThan(alex.runsDone);
    expect(alex.plannedTotalKm).toBe(jordan.plannedTotalKm);
  });

  it("reports strength sessions done out of the plan's", () => {
    const loaded = [
      { id: 1, order: 0, name: "Alex", weeks: demoWeeks(1, ["w00-wed-strength"]) },
    ];
    const [alex] = buildComparison(loaded, 1, TODAY).athletes;
    expect(alex.strengthDone).toBe(1);
    expect(alex.strengthTotal).toBe(8);
    expect(alex.strengthDue).toBe(5);
  });
});
