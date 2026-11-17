import { describe, expect, it } from "vitest";
import demoPlan from "../data/demo-plan.json";
import { matchPlan } from "../lib/matching";
import { exportActual, exportPlan, validatePlan } from "../lib/plan";
import type { Activity, Plan } from "../lib/types";

function clone(): Record<string, unknown> {
  const copy = structuredClone(demoPlan) as unknown as Record<string, unknown>;
  return copy;
}

describe("validatePlan", () => {
  it("accepts the demo plan and strips status and actual", () => {
    const result = validatePlan(clone());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sessions = result.plan.weeks.flatMap((w) => w.sessions);
    expect(sessions.every((s) => !("status" in s) && !("actual" in s))).toBe(true);
  });

  it("rejects a plan without weeks", () => {
    const result = validatePlan({ plan_id: "x", weeks: [] });
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate ids, bad dates and missing fields", () => {
    const raw = clone() as unknown as Plan;
    const sessions = raw.weeks[1].sessions;
    sessions[1].id = sessions[0].id;
    sessions[2].date = "2026-11-31";
    delete (sessions[3] as Record<string, unknown>).title;
    delete (sessions[4] as Record<string, unknown>).type;
    const result = validatePlan(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toMatch(/duplicate/);
    expect(result.errors.join("\n")).toMatch(/YYYY-MM-DD/);
    expect(result.errors.join("\n")).toMatch(/title/);
    expect(result.errors.join("\n")).toMatch(/type/);
  });

  it("rejects a week that doesn't start on a Monday", () => {
    const raw = clone() as unknown as Plan;
    raw.weeks[0].week_commencing = "2026-11-17";
    const result = validatePlan(raw);
    expect(result.ok).toBe(false);
  });
});

describe("exportPlan", () => {
  it("fills in status and actual from the matching", () => {
    const validated = validatePlan(clone());
    if (!validated.ok) throw new Error("invalid");
    const plan = validated.plan;
    const runs: Activity[] = [
      {
        id: 101,
        name: "Reps",
        date: "2026-11-19",
        startLocal: "2026-11-19T07:00:00",
        sportType: "Run",
        distanceKm: 6.2,
        movingTimeS: 2108,
        avgHr: 158,
      },
      {
        id: 102,
        name: "Long run",
        date: "2026-11-22", // Sunday: moved from Saturday
        startLocal: "2026-11-22T08:30:00",
        sportType: "Run",
        distanceKm: 12.6,
        movingTimeS: 4410,
        avgHr: 145,
      },
    ];
    const weeks = matchPlan(plan, runs, [], "2026-11-25");
    const exported = exportPlan(plan, weeks);
    const week0 = exported.weeks[0].sessions;
    const byId = new Map(week0.map((s) => [s.id, s]));
    expect(byId.get("w00-thu-tempo")?.status).toBe("done");
    expect(byId.get("w00-sat-long_run")?.status).toBe("moved");
    expect(byId.get("w00-wed-strength")?.status).toBe("skipped");
    expect(byId.get("w00-wed-strength")?.actual).toBeNull();
    expect(byId.get("w00-thu-tempo")?.actual).toEqual({
      date: "2026-11-19",
      distance_km: 6.2,
      duration_s: 2108,
      avg_pace_s_per_km: 340,
      avg_hr: 158,
      rpe: null,
      strava_activity_id: "101",
      notes: null,
    });
    expect(exported.weeks[1].sessions[0].status).toBe("planned");
    // The stored plan is not modified.
    expect(plan.weeks[0].sessions[0].status).toBeUndefined();
  });

  it("joins several activity ids for a split parkrun", () => {
    const actual = exportActual([
      {
        id: 1,
        name: "a",
        date: "2026-11-28",
        startLocal: "2026-11-28T08:30:00",
        sportType: "Run",
        distanceKm: 2,
        movingTimeS: 700,
        avgHr: null,
      },
      {
        id: 2,
        name: "b",
        date: "2026-11-28",
        startLocal: "2026-11-28T09:00:00",
        sportType: "Run",
        distanceKm: 5,
        movingTimeS: 1500,
        avgHr: 170,
      },
    ]);
    expect(actual?.strava_activity_id).toBe("1,2");
    expect(actual?.distance_km).toBe(7);
    expect(actual?.avg_hr).toBe(170);
  });
});
