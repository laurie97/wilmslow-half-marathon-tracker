import { describe, expect, it } from "vitest";
import { niceAxis } from "../app/components/chart";

describe("niceAxis", () => {
  it("tops a percentage axis at 100 in quarters", () => {
    expect(niceAxis(100)).toEqual({ step: 25, top: 100 });
  });

  it("keeps the top just above a plan's total distance", () => {
    expect(niceAxis(450)).toEqual({ step: 100, top: 500 });
    expect(niceAxis(64)).toEqual({ step: 25, top: 75 });
    expect(niceAxis(6)).toEqual({ step: 2, top: 6 });
  });

  it("never goes below the value", () => {
    for (const value of [1, 7, 33, 99, 101, 250, 412, 999, 1234]) {
      const { step, top } = niceAxis(value);
      expect(top).toBeGreaterThanOrEqual(value);
      expect(top / step).toBeGreaterThanOrEqual(3);
      expect(top / step).toBeLessThanOrEqual(6);
    }
  });
});
