import { describe, expect, it } from "vitest";
import { hasActivityScope, toActivity } from "../lib/strava";

describe("toActivity", () => {
  it("takes the local date from start_date_local despite the Z suffix", () => {
    const activity = toActivity({
      id: 123,
      name: "Late run",
      sport_type: "Run",
      distance: 5012.3,
      moving_time: 1500,
      start_date_local: "2026-11-17T23:30:00Z",
      average_heartrate: 151.6,
    });
    expect(activity.date).toBe("2026-11-17");
    expect(activity.startLocal).toBe("2026-11-17T23:30:00");
    expect(activity.distanceKm).toBe(5.012);
    expect(activity.avgHr).toBe(152);
  });
});

describe("hasActivityScope", () => {
  it("requires activity read access", () => {
    expect(hasActivityScope("read,activity:read_all")).toBe(true);
    expect(hasActivityScope("read,activity:read")).toBe(true);
    expect(hasActivityScope("read")).toBe(false);
    expect(hasActivityScope(null)).toBe(false);
  });
});
