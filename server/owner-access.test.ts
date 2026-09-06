import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

function context(openId: string): TrpcContext {
  return {
    user: {
      id: 1,
      openId,
      name: "Studio Owner",
      email: "owner@example.com",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("private studio authorization", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OWNER_OPEN_ID = "private-owner";
  });

  it("allows the configured owner", async () => {
    const { ownerProcedure, router } = await import("./_core/trpc");
    const caller = router({ probe: ownerProcedure.query(() => "allowed") }).createCaller(context("private-owner"));
    await expect(caller.probe()).resolves.toBe("allowed");
  });

  it("rejects any other authenticated user", async () => {
    const { ownerProcedure, router } = await import("./_core/trpc");
    const caller = router({ probe: ownerProcedure.query(() => "allowed") }).createCaller(context("another-user"));
    await expect(caller.probe()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
