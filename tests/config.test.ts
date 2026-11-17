import { afterEach, describe, expect, it, vi } from "vitest";
import { databaseUrl, isDemo } from "../lib/config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isDemo", () => {
  it("is on locally with DEMO_MODE=1", () => {
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("NETLIFY", "");
    vi.stubEnv("VERCEL", "");
    expect(isDemo()).toBe(true);
  });

  it("never switches on in a Netlify or Vercel deployment", () => {
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NETLIFY", "true");
    expect(isDemo()).toBe(false);
    vi.stubEnv("NETLIFY", "");
    vi.stubEnv("VERCEL", "1");
    expect(isDemo()).toBe(false);
  });

  it("is off without DEMO_MODE", () => {
    vi.stubEnv("DEMO_MODE", "");
    expect(isDemo()).toBe(false);
  });
});

describe("databaseUrl", () => {
  it("prefers DATABASE_URL, then Netlify DB, then POSTGRES_URL", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NETLIFY_DATABASE_URL", "");
    vi.stubEnv("POSTGRES_URL", "postgres://c");
    expect(databaseUrl()).toBe("postgres://c");
    vi.stubEnv("NETLIFY_DATABASE_URL", "postgres://b");
    expect(databaseUrl()).toBe("postgres://b");
    vi.stubEnv("DATABASE_URL", "postgres://a");
    expect(databaseUrl()).toBe("postgres://a");
  });
});
