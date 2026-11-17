// Works out the app's public address, used for the Strava redirect_uri and for
// redirects after sign-in. On Netlify the request URL can carry the branch
// deploy address (main--site.netlify.app) instead of the address in the
// browser, which Strava rejects, so APP_URL (or the forwarded host) wins.

import type { NextRequest } from "next/server";

/** Origin from APP_URL, if it is set to a valid http(s) URL. */
function configuredOrigin(): string | null {
  const raw = process.env.APP_URL;
  let origin: string | null = null;
  if (raw) {
    try {
      const url = new URL(raw);
      origin =
        url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
    } catch {
      origin = null;
    }
  }
  return origin;
}

/**
 * The public origin of the app, e.g. https://wilmslow-half-tracker.netlify.app.
 * Uses APP_URL if set, then the forwarded host, then the request URL.
 */
export function appOrigin(request: NextRequest): string {
  const configured = configuredOrigin();
  if (configured) {
    return configured;
  }
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const origin = forwardedHost
    ? `${forwardedProto || request.nextUrl.protocol.replace(":", "")}://${forwardedHost}`
    : request.nextUrl.origin;
  return origin;
}
