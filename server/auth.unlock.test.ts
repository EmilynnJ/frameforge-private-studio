import { beforeEach, describe, expect, it } from "vitest";
import { ACCESS_SESSION_COOKIE, verifyAccessSessionToken } from "./accessKeyAuth";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type CookieCall = { name: string; value: string; options: Record<string, unknown> };

function unauthenticatedContext() {
  const cookies: CookieCall[] = [];
  const ctx: TrpcContext = {
    user: null,
    accessKeyAuthenticated: false,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push({ name, value, options }) } as TrpcContext["res"],
  };
  return { ctx, cookies };
}

describe("auth.unlock", () => {
  beforeEach(() => {
    process.env.STUDIO_ACCESS_KEY = "studiocut-api-test-key";
    process.env.JWT_SECRET = "studiocut-api-test-signing-secret";
  });

  it("accepts only the configured key and issues a signed access cookie", async () => {
    const { ctx, cookies } = unauthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.auth.unlock({ accessKey: "wrong-key" })).rejects.toThrow("Invalid studio access key");
    await expect(caller.auth.unlock({ accessKey: "studiocut-api-test-key" })).resolves.toEqual({ success: true });
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatchObject({ name: ACCESS_SESSION_COOKIE, options: { httpOnly: true, secure: true, sameSite: "none" } });
    expect(verifyAccessSessionToken(cookies[0]!.value)).toBe(true);
  });
});
