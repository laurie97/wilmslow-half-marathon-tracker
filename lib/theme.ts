/** Raccoon themes: Midnight (dark, the default) and Bandit (light). */
export const THEMES = ["midnight", "bandit"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "midnight";
export const THEME_KEY = "theme";

/** The other theme, for the day/night toggle. */
export function otherTheme(theme: Theme): Theme {
  const other = theme === "midnight" ? "bandit" : "midnight";
  return other;
}
