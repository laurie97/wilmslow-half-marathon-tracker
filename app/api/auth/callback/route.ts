import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions } from "@/lib/auth";
import { allowedAthleteIds, sessionSecret } from "@/lib/config";
import { getStore } from "@/lib/db";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  STATE_COOKIE,
  safeEqual,
  signSession,
} from "@/lib/session";
import { exchangeCode, hasActivityScope } from "@/lib/strava";

/**
 * Strava redirects here after the athlete approves (or declines) access.
 * Checks state, exchanges the code, checks the allowlist and scope, saves the
 * tokens and sets the session cookie.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const fail = (code: string) => {
    const failure = NextResponse.redirect(new URL(`/?error=${code}`, url.origin));
    failure.cookies.delete(STATE_COOKIE);
    return failure;
  };

  if (url.searchParams.get("error")) {
    const early = fail("denied");
    return early;
  }
  const state = url.searchParams.get("state") ?? "";
  const expected = request.cookies.get(STATE_COOKIE)?.value ?? "";
  const code = url.searchParams.get("code");
  if (!state || !expected || !safeEqual(state, expected) || !code) {
    const early = fail("state");
    return early;
  }
  if (!hasActivityScope(url.searchParams.get("scope"))) {
    const early = fail("scope");
    return early;
  }

  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch (error) {
    console.error(error);
    const early = fail("strava");
    return early;
  }
  const athleteId = Number(tokens.athlete?.id);
  if (!Number.isFinite(athleteId) || athleteId <= 0) {
    const early = fail("strava");
    return early;
  }
  const allowed = allowedAthleteIds();
  if (allowed.size > 0 && !allowed.has(athleteId)) {
    const early = fail("not_allowed");
    return early;
  }

  const store = await getStore();
  await store.upsertAthlete({
    id: athleteId,
    firstname: tokens.athlete?.firstname ?? "",
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_at,
  });

  const response = NextResponse.redirect(new URL("/", url.origin));
  response.cookies.set(
    SESSION_COOKIE,
    signSession(athleteId, sessionSecret()),
    cookieOptions(SESSION_MAX_AGE_S),
  );
  response.cookies.delete(STATE_COOKIE);
  return response;
}
