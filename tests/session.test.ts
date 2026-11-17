import { describe, expect, it } from "vitest";
import { SESSION_MAX_AGE_S, signSession, verifySession } from "../lib/session";

const SECRET = "test-secret";

describe("session cookie", () => {
  it("round-trips the athlete id", () => {
    const token = signSession(12345, SECRET, 1000);
    expect(verifySession(token, SECRET, 1001)).toBe(12345);
  });

  it("rejects a tampered token", () => {
    const token = signSession(12345, SECRET, 1000);
    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ aid: 999, exp: 99999999 })).toString(
      "base64url",
    );
    expect(verifySession(`${forged}.${signature}`, SECRET, 1001)).toBeNull();
    expect(verifySession(token, "other-secret", 1001)).toBeNull();
    expect(verifySession("garbage", SECRET, 1001)).toBeNull();
    expect(verifySession(undefined, SECRET, 1001)).toBeNull();
  });

  it("expires after 60 days", () => {
    const token = signSession(12345, SECRET, 1000);
    expect(verifySession(token, SECRET, 1000 + SESSION_MAX_AGE_S - 1)).toBe(12345);
    expect(verifySession(token, SECRET, 1000 + SESSION_MAX_AGE_S + 1)).toBeNull();
  });
});
