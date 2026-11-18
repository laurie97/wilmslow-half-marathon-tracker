import { NextResponse, type NextRequest } from "next/server";
import { currentAthleteId } from "@/lib/auth";
import { errorResponse, jsonError, unauthorized } from "@/lib/http";
import { loadContext } from "@/lib/progress";

/** Turns sharing progress on the compare page on or off: `{ "share": true }`. */
export async function POST(request: NextRequest) {
  const athleteId = await currentAthleteId();
  if (athleteId === null) {
    const early = unauthorized();
    return early;
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const early = jsonError(400, "invalid_json", "Body must be JSON.");
    return early;
  }
  const share = (body as { share?: unknown } | null)?.share;
  if (typeof share !== "boolean") {
    const early = jsonError(400, "invalid_sharing", "`share` must be true or false.");
    return early;
  }
  let response;
  try {
    const ctx = await loadContext(athleteId);
    await ctx.store.setSharing(athleteId, share);
    response = NextResponse.json({ ok: true, share });
  } catch (error) {
    response = errorResponse(error);
  }
  return response;
}
