// Strava API client. Tokens always go in the Authorization: Bearer header.

import { STRAVA_OAUTH_BASE, requireEnv, stravaApiBase } from "./config";
import type { AthleteRecord, Store } from "./db";
import type { Activity } from "./types";

export const STRAVA_SCOPE = "read,activity:read_all";
const REFRESH_MARGIN_S = 5 * 60;
const PER_PAGE = 200;
const MAX_PAGES = 5;

export type StravaErrorCode = "unauthorized" | "rate_limited" | "error";

export class StravaError extends Error {
  constructor(
    public code: StravaErrorCode,
    message: string,
  ) {
    super(message);
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number; firstname?: string };
}

interface StravaActivity {
  id: number;
  name: string;
  sport_type?: string;
  type?: string;
  distance: number;
  moving_time: number;
  start_date_local: string;
  average_heartrate?: number;
}

/** Maps a Strava HTTP status to a StravaError. */
function errorFor(status: number): StravaError {
  let error: StravaError;
  if (status === 401) {
    error = new StravaError(
      "unauthorized",
      "Strava access has expired or was revoked.",
    );
  } else if (status === 429) {
    error = new StravaError("rate_limited", "Strava's rate limit has been reached.");
  } else {
    error = new StravaError("error", `Strava returned HTTP ${status}.`);
  }
  return error;
}

/** Strava's authorize URL for this app. */
export function authorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("STRAVA_CLIENT_ID"),
    response_type: "code",
    redirect_uri: redirectUri,
    approval_prompt: "auto",
    scope: STRAVA_SCOPE,
    state,
  });
  const url = `${STRAVA_OAUTH_BASE}/authorize?${params}`;
  return url;
}

/** Calls Strava's token endpoint (code exchange or refresh). */
async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: requireEnv("STRAVA_CLIENT_ID"),
    client_secret: requireEnv("STRAVA_CLIENT_SECRET"),
    ...params,
  });
  const response = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
    method: "POST",
    body,
    cache: "no-store",
  });
  if (!response.ok) {
    // A rejected code or refresh token means the user must reconnect.
    throw response.status === 400 ? errorFor(401) : errorFor(response.status);
  }
  const tokens = (await response.json()) as TokenResponse;
  return tokens;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const tokens = await tokenRequest({ code, grant_type: "authorization_code" });
  return tokens;
}

/**
 * Returns a valid access token, refreshing it (and saving the new tokens)
 * when it is within 5 minutes of expiry.
 */
export async function validAccessToken(
  athlete: AthleteRecord,
  store: Store,
  nowS: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  if (athlete.expiresAt - nowS > REFRESH_MARGIN_S) {
    return athlete.accessToken;
  }
  const tokens = await tokenRequest({
    grant_type: "refresh_token",
    refresh_token: athlete.refreshToken,
  });
  await store.updateTokens(
    athlete.id,
    tokens.access_token,
    tokens.refresh_token,
    tokens.expires_at,
  );
  const token = tokens.access_token;
  return token;
}

/** Converts a Strava activity to the app's reduced shape. */
export function toActivity(raw: StravaActivity): Activity {
  // start_date_local is local wall-clock time despite its "Z" suffix.
  const startLocal = raw.start_date_local.replace(/Z$/, "");
  const activity: Activity = {
    id: Number(raw.id),
    name: raw.name,
    date: raw.start_date_local.slice(0, 10),
    startLocal,
    sportType: raw.sport_type || raw.type || "Unknown",
    distanceKm: Math.round(raw.distance) / 1000,
    movingTimeS: raw.moving_time,
    avgHr: raw.average_heartrate ? Math.round(raw.average_heartrate) : null,
  };
  return activity;
}

/**
 * Fetches the athlete's activities between two epoch times. One page of 200
 * normally covers the whole plan; further pages are fetched only if needed.
 */
export async function fetchActivities(
  accessToken: string,
  afterS: number,
  beforeS: number,
): Promise<Activity[]> {
  const activities: Activity[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      after: String(afterS),
      before: String(beforeS),
      per_page: String(PER_PAGE),
      page: String(page),
    });
    const response = await fetch(`${stravaApiBase()}/athlete/activities?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) {
      throw errorFor(response.status);
    }
    const batch = (await response.json()) as StravaActivity[];
    activities.push(...batch.map(toActivity));
    if (batch.length < PER_PAGE) {
      break;
    }
  }
  return activities;
}

/** True if the granted scope lets the app read activities. */
export function hasActivityScope(scope: string | null): boolean {
  const scopes = (scope ?? "").split(/[,\s]+/);
  const ok = scopes.includes("activity:read_all") || scopes.includes("activity:read");
  return ok;
}
