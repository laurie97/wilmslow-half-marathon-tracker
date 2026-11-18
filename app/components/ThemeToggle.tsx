"use client";

import { useEffect, useState } from "react";
import { DEFAULT_THEME, otherTheme, THEME_KEY, THEMES, type Theme } from "@/lib/theme";

const FACES = {
  day: {
    fur: "#8f8883",
    ears: "#4a4441",
    mask: "#3a3431",
    snout: "#efe8e1",
    eye: "#ffffff",
    pupil: "#1d1a19",
  },
  night: {
    fur: "#5c6168",
    ears: "#2c3035",
    mask: "#17191c",
    snout: "#a29b94",
    eye: "#f0b54a",
    pupil: "#f0b54a",
  },
};

/** Reads the theme the pre-paint script applied to <html>. */
function currentTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  const theme = THEMES.find((t) => t === value) ?? DEFAULT_THEME;
  return theme;
}

/** A small raccoon face with a sun (day) or crescent moon (night). */
function RaccoonFace({ time }: { time: "day" | "night" }) {
  const c = FACES[time];
  const sky =
    time === "day" ? (
      <g fill="#f5b83d" stroke="#f5b83d" strokeWidth="1" strokeLinecap="round">
        <circle cx="23.5" cy="4.5" r="2.2" stroke="none" />
        <path d="M23.5 0.6v0.8M23.5 7.6v0.8M19.6 4.5h0.8M26.6 4.5h0.8M20.7 1.7l0.5 0.5M25.8 6.8l0.5 0.5M20.7 7.3l0.5-0.5M25.8 2.2l0.5-0.5" />
      </g>
    ) : (
      <g>
        <mask id="moon-cut">
          <rect width="28" height="28" fill="#fff" />
          <circle cx="25.2" cy="3.4" r="2.4" fill="#000" />
        </mask>
        <circle cx="23.5" cy="4.6" r="2.8" fill="#f6e3a8" mask="url(#moon-cut)" />
        <circle cx="18.5" cy="2.4" r="0.55" fill="#f6e3a8" />
      </g>
    );
  const face = (
    <svg viewBox="0 0 28 28" width="29" height="29" aria-hidden="true">
      {sky}
      {/* ears */}
      <circle cx="6.8" cy="9.2" r="3.3" fill={c.ears} />
      <circle cx="19.2" cy="9.2" r="3.3" fill={c.ears} />
      <circle cx="6.9" cy="9.4" r="1.6" fill={c.snout} />
      <circle cx="19.1" cy="9.4" r="1.6" fill={c.snout} />
      {/* head */}
      <ellipse cx="13" cy="16" rx="8.8" ry="7.6" fill={c.fur} />
      {/* bandit mask */}
      <ellipse
        cx="9.4"
        cy="15.4"
        rx="3.3"
        ry="2.5"
        transform="rotate(18 9.4 15.4)"
        fill={c.mask}
      />
      <ellipse
        cx="16.6"
        cy="15.4"
        rx="3.3"
        ry="2.5"
        transform="rotate(-18 16.6 15.4)"
        fill={c.mask}
      />
      {/* eyes */}
      <circle cx="9.8" cy="15.2" r="1.1" fill={c.eye} />
      <circle cx="16.2" cy="15.2" r="1.1" fill={c.eye} />
      <circle cx="10" cy="15.3" r="0.55" fill={c.pupil} />
      <circle cx="16" cy="15.3" r="0.55" fill={c.pupil} />
      {/* snout and nose */}
      <ellipse cx="13" cy="20.2" rx="3.3" ry="2.4" fill={c.snout} />
      <ellipse cx="13" cy="19" rx="1.3" ry="0.85" fill="#2a1d1a" />
    </svg>
  );
  return face;
}

/** Day/night switch: flips between the Bandit and Midnight themes. */
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

  const night = theme === "midnight";
  const label = night ? "Switch to day theme" : "Switch to night theme";
  const button = (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      <span className={`theme-option theme-day${night ? "" : " active"}`}>
        <RaccoonFace time="day" />
      </span>
      <span className={`theme-option theme-night${night ? " active" : ""}`}>
        <RaccoonFace time="night" />
      </span>
    </button>
  );
  return button;
}
