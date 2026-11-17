import { NextResponse, type NextRequest } from "next/server";
import { currentAthleteId } from "@/lib/auth";
import { errorResponse, jsonError, unauthorized } from "@/lib/http";
import { exportPlan, sessionIds, validatePlan } from "@/lib/plan";
import { computeWeeks, loadContext } from "@/lib/progress";

export const dynamic = "force-dynamic";

/** Downloads the plan with `status` and `actual` filled in from the matching. */
export async function GET() {
  const athleteId = await currentAthleteId();
  if (athleteId === null) {
    const early = unauthorized();
    return early;
  }
  let response;
  try {
    const ctx = await loadContext(athleteId);
    if (!ctx.planRecord) {
      const early = jsonError(404, "no_plan", "No plan uploaded yet.");
      return early;
    }
    const plan = ctx.planRecord.plan;
    const weeks = await computeWeeks(ctx, plan);
    const exported = exportPlan(plan, weeks);
    const filename = `${(plan.plan_id || "plan").replace(/[^\w.-]+/g, "_")}.json`;
    response = new NextResponse(JSON.stringify(exported, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    response = errorResponse(error);
  }
  return response;
}

/** Uploads a plan. Progress (overrides) is kept, matched by session ID. */
export async function POST(request: NextRequest) {
  const athleteId = await currentAthleteId();
  if (athleteId === null) {
    const early = unauthorized();
    return early;
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    const early = jsonError(400, "invalid_json", "That file isn't valid JSON.");
    return early;
  }
  const validated = validatePlan(raw);
  if (!validated.ok) {
    const invalid = NextResponse.json(
      {
        error: "invalid_plan",
        message: "The plan has problems.",
        errors: validated.errors,
      },
      { status: 400 },
    );
    return invalid;
  }
  let response;
  try {
    const ctx = await loadContext(athleteId);
    const record = await ctx.store.savePlan(athleteId, validated.plan);
    const ids = sessionIds(validated.plan);
    const orphaned = ctx.overrides.map((o) => o.sessionId).filter((id) => !ids.has(id));
    const warning =
      orphaned.length > 0
        ? `These sessions have saved progress but are no longer in the plan: ${orphaned.join(", ")}.`
        : null;
    response = NextResponse.json({
      ok: true,
      updatedAt: record.updatedAt,
      warning,
      orphanedSessionIds: orphaned,
    });
  } catch (error) {
    response = errorResponse(error);
  }
  return response;
}
