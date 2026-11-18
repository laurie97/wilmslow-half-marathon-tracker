import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, otherTheme } from "../lib/theme";

describe("themes", () => {
  it("defaults to Midnight", () => {
    expect(DEFAULT_THEME).toBe("midnight");
  });

  it("toggles between Midnight and Bandit", () => {
    expect(otherTheme("midnight")).toBe("bandit");
    expect(otherTheme("bandit")).toBe("midnight");
  });
});
