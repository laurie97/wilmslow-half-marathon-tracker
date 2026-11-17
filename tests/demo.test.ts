import { describe, expect, it } from "vitest";
import demoPlan from "../data/demo-plan.json";
import { demoActivities } from "../lib/demo";
import { matchPlan } from "../lib/matching";
import { validatePlan } from "../lib/plan";

describe("demo data", () => {
  it("produces the intended mix of statuses", () => {
    const validated = validatePlan(structuredClone(demoPlan));
    if (!validated.ok) throw new Error(validated.errors.join("\n"));
    const today = "2026-12-03";
    const weeks = matchPlan(
      validated.plan,
      demoActivities(validated.plan, today),
      [],
      today,
    );
    const week2 = new Map(weeks[1].sessions.map((s) => [s.session.id, s]));
    expect(
      weeks[0].sessions.every(
        (s) => s.status === "done" || s.session.type === "strength",
      ),
    ).toBe(true);
    expect(week2.get("w01-tue-intervals")?.status).toBe("missed");
    expect(week2.get("w01-thu-tempo")?.moved).toBe(true);
    expect(week2.get("w01-sat-long_run")?.status).toBe("partial");
    expect(weeks[2].extras).toHaveLength(1);
    expect(weeks[2].state).toBe("current");
  });
});
