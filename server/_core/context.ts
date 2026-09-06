import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, upsertUser } from "../db";
import { hasAccessSession } from "../accessKeyAuth";

const ACCESS_KEY_OWNER_OPEN_ID = "frameforge-access-key-owner";

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
    const persistedOwnerOpenId = process.env.OWNER_OPEN_ID || ACCESS_KEY_OWNER_OPEN_ID;
    user = await getUserByOpenId(persistedOwnerOpenId) ?? null;
    if (!user) {
      await upsertUser({
        openId: persistedOwnerOpenId,
        name: "FrameForge Owner",
        loginMethod: "access-key",
        role: "admin",
      });
      user = await getUserByOpenId(persistedOwnerOpenId) ?? null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    accessKeyAuthenticated,
  };
}
