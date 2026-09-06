import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

function ownerContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "private-owner",
      name: "Studio Owner",
      email: "owner@example.com",
      loginMethod: "access-key",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    accessKeyAuthenticated: true,
  };
}

describe("studio project validation", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects target durations below 61 seconds before database work", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(ownerContext());
    await expect(caller.studio.create({
      name: "Too short",
      prompt: "A cinematic vertical story with consistent motion.",
      targetDurationSeconds: 60,
      videoProviderMode: "automatic",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires an explicit provider in manual mode", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller(ownerContext());
    await expect(caller.studio.create({
      name: "Manual provider",
      prompt: "A cinematic vertical story with consistent motion.",
      targetDurationSeconds: 61,
      videoProviderMode: "manual",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
