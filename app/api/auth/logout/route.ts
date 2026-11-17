import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/** Clears the session cookie. */
export async function POST(request: NextRequest) {
  // 303 so the browser follows with a GET after a form post.
  const response = NextResponse.redirect(new URL("/", request.nextUrl.origin), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
