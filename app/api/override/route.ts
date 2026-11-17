import { NextResponse, type NextRequest } from "next/server";
import { currentAthleteId } from "@/lib/auth";
import { errorResponse, jsonError, unauthorized } from "@/lib/http";
import { findSession } from "@/lib/plan";
import { loadContext } from "@/lib/progress";
import type { ManualStatus, Override } from "@/lib/types";

const STATUSES = new Set(["done", "partial", "skipped"]);
const MAX_PINNED = 10;

/** Parses and checks the request body. Returns an error message if invalid. */
function parseOverride(body: unknown): Override | string {
  if (typeof body !== "object" || body === null) {
    return "Body must be a JSON object.";
  }
  const { sessionId, status, activityIds } = body as Record<string, unknown>;
  if (typeof sessionId !== "string" || !sessionId) {
    return "`sessionId` is required.";
  }
  if (status !== null && !(typeof status === "string" && STATUSES.has(status))) {
    return "`status` must be null, done, partial or skipped.";
  }
  let ids: number[] | null = null;
  if (activityIds !== null) {
    if (!Array.isArray(activityIds) || activityIds.length > MAX_PINNED) {
      return "`activityIds` must be null or a short array of activity IDs.";
    }
    ids = activityIds.map(Number);
    if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      return "`activityIds` must contain Strava activity IDs.";
    }
  }
  const override: Override = {
    sessionId,
    status: status as ManualStatus | null,
    activityIds: ids,
  };
  return override;
}

/** Saves (or clears) a manual override for one of the athlete's sessions. */
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
  const override = parseOverride(body);
  if (typeof override === "string") {
    const early = jsonError(400, "invalid_override", override);
    return early;
  }
  let response;
  try {
    const ctx = await loadContext(athleteId);
    const plan = ctx.planRecord?.plan;
    if (!plan || !findSession(plan, override.sessionId)) {
      const early = jsonError(
        404,
        "unknown_session",
        "That session isn't in your plan.",
      );
      return early;
    }
    await ctx.store.setOverride(athleteId, override);
    response = NextResponse.json({ ok: true });
  } catch (error) {
    response = errorResponse(error);
  }
  return response;
}
