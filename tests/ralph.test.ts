import { describe, expect, it } from "vitest";
import { ralphSays } from "../lib/ralph";

describe("ralphSays", () => {
  it("cheers you on before the first run is due", () => {
    const message = ralphSays({ total: 40, due: 0, done: 0, partial: 0 });
    expect(message).toMatch(/first run/);
  });

  it("is impressed at 90% or more of due runs", () => {
    const message = ralphSays({ total: 40, due: 10, done: 8, partial: 1 });
    expect(message).toBe("9 of 10 runs done so far. Ralph is seriously impressed!");
  });

  it("says you're on track from 70%", () => {
    const message = ralphSays({ total: 40, due: 10, done: 7, partial: 0 });
    expect(message).toMatch(/on track/);
  });

  it("encourages you when behind", () => {
    const message = ralphSays({ total: 40, due: 10, done: 3, partial: 1 });
    expect(message).toMatch(/every run counts/);
  });

  it("celebrates when every run is done", () => {
    const message = ralphSays({ total: 40, due: 40, done: 39, partial: 1 });
    expect(message).toMatch(/speechless/);
  });
});
