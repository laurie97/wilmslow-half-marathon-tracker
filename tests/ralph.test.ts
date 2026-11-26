import { describe, expect, it } from "vitest";
import {
  ALL_DONE_LINES,
  BEHIND_LINES,
  IMPRESSED_LINES,
  ON_TRACK_LINES,
  ralphSays,
} from "../lib/ralph";

const noStrength = { total: 0, due: 0, done: 0, partial: 0 };

describe("ralphSays", () => {
  it("cheers you on before the first run is due", () => {
    const message = ralphSays({ total: 40, due: 0, done: 0, partial: 0 });
    expect(message).toMatch(/first run/);
  });

  it("picks an impressed line at 90% or more of due runs", () => {
    const runs = { total: 40, due: 10, done: 8, partial: 1 };
    const message = ralphSays(runs);
    expect(IMPRESSED_LINES.map((line) => line(9, 10))).toContain(message);
    expect(message).toMatch(/^9 of 10/);
  });

  it("picks an on-track line from 70%", () => {
    const message = ralphSays({ total: 40, due: 10, done: 7, partial: 0 });
    expect(ON_TRACK_LINES.map((line) => line(7, 10))).toContain(message);
  });

  it("picks a behind line below 70%", () => {
    const message = ralphSays({ total: 40, due: 10, done: 3, partial: 1 });
    expect(BEHIND_LINES.map((line) => line(4, 10))).toContain(message);
  });

  it("celebrates when every run is done", () => {
    const message = ralphSays({ total: 40, due: 40, done: 39, partial: 1 });
    expect(ALL_DONE_LINES).toContain(message);
  });

  it("moves on to the next line after each run", () => {
    const first = ralphSays({ total: 40, due: 20, done: 18, partial: 0 });
    const second = ralphSays({ total: 40, due: 20, done: 19, partial: 0 });
    expect(first).not.toBe(second);
  });

  it("moves on after a strength session too", () => {
    const runs = { total: 40, due: 10, done: 10, partial: 0 };
    const before = ralphSays(runs, noStrength);
    const after = ralphSays(runs, { total: 20, due: 5, done: 1, partial: 0 });
    expect(before).not.toBe(after);
  });

  it("works through every line before repeating", () => {
    const seen = new Set<string>();
    for (let strength = 0; strength < IMPRESSED_LINES.length; strength++) {
      const counts = { total: 20, due: 10, done: strength, partial: 0 };
      seen.add(ralphSays({ total: 40, due: 10, done: 10, partial: 0 }, counts));
    }
    expect(seen.size).toBe(IMPRESSED_LINES.length);
  });
});
