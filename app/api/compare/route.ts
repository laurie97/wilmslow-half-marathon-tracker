import { NextResponse } from "next/server";
import { currentAthleteId } from "@/lib/auth";
import { loadComparison } from "@/lib/compare";
import { errorResponse, unauthorized } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Runs done and distance for every athlete with a plan. */
export async function GET() {
  const athleteId = await currentAthleteId();
  if (athleteId === null) {
    const early = unauthorized();
    return early;
  }
  let response;
  try {
    const comparison = await loadComparison(athleteId);
    response = NextResponse.json(comparison, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    response = errorResponse(error);
  }
  return response;
}
