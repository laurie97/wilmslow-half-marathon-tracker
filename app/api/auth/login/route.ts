import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions } from "@/lib/auth";
import { isDemo, sessionSecret } from "@/lib/config";
import { appOrigin } from "@/lib/origin";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  STATE_COOKIE,
  signSession,
} from "@/lib/session";
import { authorizeUrl } from "@/lib/strava";

/** Redirects to Strava's authorize page with a random state saved in a cookie. */
export async function GET(request: NextRequest) {
  const origin = appOrigin(request);
  let response: NextResponse;
  if (isDemo()) {
    // Demo mode skips Strava and signs in as the demo athlete.
    const { DEMO_ATHLETE_ID } = await import("@/lib/demo");
    response = NextResponse.redirect(new URL("/", origin));
    response.cookies.set(
      SESSION_COOKIE,
      signSession(DEMO_ATHLETE_ID, sessionSecret()),
      cookieOptions(SESSION_MAX_AGE_S),
    );
    return response;
  }
  const state = randomBytes(16).toString("hex");
  const redirectUri = `${origin}/api/auth/callback`;
  response = NextResponse.redirect(authorizeUrl(redirectUri, state));
  response.cookies.set(STATE_COOKIE, state, cookieOptions(10 * 60));
  return response;
}
