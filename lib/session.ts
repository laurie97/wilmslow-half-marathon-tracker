// HMAC-signed session cookie holding only the athlete ID and an expiry.

import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "wht_session";
export const STATE_COOKIE = "wht_oauth_state";
export const SESSION_MAX_AGE_S = 60 * 24 * 60 * 60; // 60 days

interface SessionPayload {
  aid: number; // Strava athlete ID
  exp: number; // expiry, seconds since the epoch
}

function hmac(secret: string, data: string): string {
  const digest = createHmac("sha256", secret).update(data).digest("base64url");
  return digest;
}

/** Equal-length, constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  const equal = bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  return equal;
}

export function signSession(
  athleteId: number,
  secret: string,
  nowS: number = Math.floor(Date.now() / 1000),
): string {
  const payload: SessionPayload = { aid: athleteId, exp: nowS + SESSION_MAX_AGE_S };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${body}.${hmac(secret, body)}`;
  return token;
}

/**
 * Checks a session token's signature and expiry. Returns the athlete ID, or
 * null if the token is missing, tampered with or expired.
 */
export function verifySession(
  token: string | undefined,
  secret: string,
  nowS: number = Math.floor(Date.now() / 1000),
): number | null {
  if (!token) {
    return null;
  }
  const [body, signature, ...rest] = token.split(".");
  if (
    !body ||
    !signature ||
    rest.length > 0 ||
    !safeEqual(signature, hmac(secret, body))
  ) {
    return null;
  }
  let athleteId: number | null = null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString(),
    ) as SessionPayload;
    if (Number.isFinite(payload.aid) && payload.exp > nowS) {
      athleteId = payload.aid;
    }
  } catch {
    athleteId = null;
  }
  return athleteId;
}
