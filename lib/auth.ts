// Works out the signed-in athlete from the session cookie.

import { cookies } from "next/headers";
import { allowedAthleteIds, sessionSecret } from "./config";
import { SESSION_COOKIE, verifySession } from "./session";

/** Returns the signed-in athlete's ID, or null if not signed in. */
export async function currentAthleteId(): Promise<number | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const id = verifySession(token, sessionSecret());
  const allowed = allowedAthleteIds();
  const athleteId = id !== null && (allowed.size === 0 || allowed.has(id)) ? id : null;
  return athleteId;
}

/** Options for httpOnly cookies set by the app. */
export function cookieOptions(maxAgeS: number) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeS,
  };
  return options;
}
