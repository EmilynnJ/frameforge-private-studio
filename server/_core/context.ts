import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, upsertUser } from "../db";
import { hasAccessSession } from "../accessKeyAuth";

const ACCESS_KEY_OWNER_HANDLE = "studiocut-access-key-owner";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  accessKeyAuthenticated: boolean;
};

/**
 * A valid server-issued access-key session resolves to the one persistent
 * account that owns the project's private records.
 */
export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const accessKeyAuthenticated = hasAccessSession(opts.req);
  let user: User | null = null;
  if (accessKeyAuthenticated) {
    user = await getUserByOpenId(ACCESS_KEY_OWNER_HANDLE) ?? null;
    if (!user) {
      await upsertUser({
        openId: ACCESS_KEY_OWNER_HANDLE,
        name: "StudioCut Owner",
        loginMethod: "access-key",
        role: "admin",
      });
      user = await getUserByOpenId(ACCESS_KEY_OWNER_HANDLE) ?? null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    accessKeyAuthenticated,
  };
}
