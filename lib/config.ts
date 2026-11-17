// Environment configuration.

export const DEFAULT_STRAVA_API_BASE = "https://www.strava.com/api/v3";
export const STRAVA_OAUTH_BASE = "https://www.strava.com/oauth";

/**
 * Demo mode: local only, never in a hosted deployment. Netlify and Vercel set
 * NETLIFY / VERCEL; next.config.ts also bakes them into the build, so the guard
 * holds even where a flag is only set at build time.
 */
export function isDemo(): boolean {
  const hosted = Boolean(process.env.VERCEL) || Boolean(process.env.NETLIFY);
  const demo = process.env.DEMO_MODE === "1" && !hosted;
  return demo;
}

export function appTimezone(): string {
  const tz = process.env.APP_TIMEZONE || "Europe/London";
  return tz;
}

export function stravaApiBase(): string {
  const base = (process.env.STRAVA_API_BASE || DEFAULT_STRAVA_API_BASE).replace(
    /\/+$/,
    "",
  );
  return base;
}

export function databaseUrl(): string | undefined {
  // NETLIFY_DATABASE_URL is set by Netlify's built-in database (Netlify DB).
  const url =
    process.env.DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL ||
    process.env.POSTGRES_URL;
  return url;
}

/** Strava athlete IDs allowed to sign in; an empty set means anyone. */
export function allowedAthleteIds(): Set<number> {
  const ids = new Set(
    (process.env.ALLOWED_ATHLETE_IDS || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n)),
  );
  return ids;
}

/** Reads a required environment variable, throwing if it is missing. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

/** Secret for signing session cookies. Demo mode falls back to a fixed value. */
export function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) {
    return secret;
  }
  if (isDemo()) {
    const demoSecret = "demo-mode-only-secret-not-for-production";
    return demoSecret;
  }
  throw new Error("Missing environment variable SESSION_SECRET");
}
