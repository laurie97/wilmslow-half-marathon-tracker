import { NextResponse } from "next/server";
import { currentAthleteId } from "@/lib/auth";
import { errorResponse, unauthorized } from "@/lib/http";
import { buildProgress } from "@/lib/progress";

export const dynamic = "force-dynamic";

/** Returns everything the page needs for the signed-in athlete. */
export async function GET() {
  const athleteId = await currentAthleteId();
  if (athleteId === null) {
    const early = unauthorized();
    return early;
  }
  let response;
  try {
    const progress = await buildProgress(athleteId);
    response = NextResponse.json(progress, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    response = errorResponse(error);
  }
  return response;
}
