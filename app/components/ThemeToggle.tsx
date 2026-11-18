"use client";

import { useEffect, useState } from "react";
import { DEFAULT_THEME, otherTheme, THEME_KEY, THEMES, type Theme } from "@/lib/theme";

/** Reads the theme the pre-paint script applied to <html>. */
function currentTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  const theme = THEMES.find((t) => t === value) ?? DEFAULT_THEME;
  return theme;
}

/** Sun/moon button that flips between the Midnight and Bandit themes. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  /** Applies the other theme and remembers it on this device. */
  function toggle() {
    const next = otherTheme(theme);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked (e.g. private mode): the switch still works this visit.
    }
    setTheme(next);
  }

  const label = theme === "midnight" ? "Switch to day theme" : "Switch to night theme";
  const button = (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">{theme === "midnight" ? "☀" : "☾"}</span>
    </button>
  );
  return button;
}
