// Shared JSON responses for the API routes.

import { NextResponse } from "next/server";
import { UnknownAthleteError } from "./progress";
import { StravaError } from "./strava";

export function jsonError(status: number, error: string, message: string) {
  const response = NextResponse.json({ error, message }, { status });
  return response;
}

export function unauthorized() {
  const response = jsonError(401, "signed_out", "Please sign in with Strava.");
  return response;
}

/** Turns an error thrown while loading data into a friendly JSON response. */
export function errorResponse(error: unknown) {
  let response;
  if (error instanceof UnknownAthleteError) {
    response = unauthorized();
  } else if (error instanceof StravaError && error.code === "unauthorized") {
    response = jsonError(
      401,
      "strava_reconnect",
      "Strava access has expired or was revoked. Please reconnect Strava.",
    );
  } else if (error instanceof StravaError && error.code === "rate_limited") {
    response = jsonError(
      429,
      "rate_limited",
      "Strava is busy right now (rate limit reached). Try again in 15 minutes.",
    );
  } else if (error instanceof StravaError) {
    response = jsonError(
      502,
      "strava_error",
      "Couldn't reach Strava. Try again shortly.",
    );
  } else {
    console.error(error);
    response = jsonError(500, "server_error", "Something went wrong.");
  }
  return response;
}
