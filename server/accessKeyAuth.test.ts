import { beforeEach, describe, expect, it } from "vitest";
import {
  ACCESS_SESSION_COOKIE,
  createAccessSessionToken,
  getAccessCookieOptions,
  hasAccessSession,
  verifyAccessKey,
  verifyAccessSessionToken,
} from "./accessKeyAuth";

beforeEach(() => {
  process.env.STUDIO_ACCESS_KEY = "frameforge-test-key";
  process.env.JWT_SECRET = "frameforge-test-jwt-secret";
});

describe("private access-key authentication", () => {
  it("accepts the configured key and rejects a wrong key", () => {
    expect(verifyAccessKey("frameforge-test-key")).toBe(true);
    expect(verifyAccessKey("wrong-key")).toBe(false);
  });

  it("creates a signed session token that authenticates through the cookie", () => {
    const token = createAccessSessionToken();
    expect(verifyAccessSessionToken(token)).toBe(true);
    expect(hasAccessSession({ headers: { cookie: `${ACCESS_SESSION_COOKIE}=${encodeURIComponent(token)}` } } as never)).toBe(true);
  });

  it("rejects tampered sessions and emits a secure production cookie shape", () => {
    const token = createAccessSessionToken();
    expect(verifyAccessSessionToken(`${token}tampered`)).toBe(false);
    const options = getAccessCookieOptions({ protocol: "https", headers: {} } as never);
    expect(options).toMatchObject({ httpOnly: true, path: "/", sameSite: "none", secure: true });
    expect(options.maxAge).toBeGreaterThan(0);
  });
});
