import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appOrigin } from "../lib/origin";

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(url: string, headers: Record<string, string> = {}): NextRequest {
  const req = new NextRequest(url, { headers });
  return req;
}

describe("appOrigin", () => {
  it("prefers APP_URL over a branch deploy address", () => {
    vi.stubEnv("APP_URL", "https://wilmslow-half-tracker.netlify.app/");
    const req = request(
      "https://main--wilmslow-half-tracker.netlify.app/api/auth/login",
    );
    expect(appOrigin(req)).toBe("https://wilmslow-half-tracker.netlify.app");
  });

  it("uses the forwarded host when APP_URL is not set", () => {
    vi.stubEnv("APP_URL", "");
    const req = request("https://main--site.netlify.app/api/auth/login", {
      "x-forwarded-host": "site.netlify.app",
      "x-forwarded-proto": "https",
    });
    expect(appOrigin(req)).toBe("https://site.netlify.app");
  });

  it("falls back to the request URL, ignoring an invalid APP_URL", () => {
    vi.stubEnv("APP_URL", "not a url");
    const req = request("http://localhost:3000/api/auth/login");
    expect(appOrigin(req)).toBe("http://localhost:3000");
  });
});
