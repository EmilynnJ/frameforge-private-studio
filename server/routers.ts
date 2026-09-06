import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { ACCESS_SESSION_COOKIE, createAccessSessionToken, getAccessCookieOptions, getExpiredAccessCookieOptions, verifyAccessKey } from "./accessKeyAuth";
import { generationRouter } from "./routers/generation";
import { exportsRouter } from "./routers/exports";
import { providersRouter } from "./routers/providers";
import { studioRouter } from "./routers/studio";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    access: publicProcedure.query(opts => ({
      authenticated: opts.ctx.accessKeyAuthenticated,
      isOwner: opts.ctx.accessKeyAuthenticated,
    })),
    unlock: publicProcedure.input(z.object({ accessKey: z.string().min(1).max(1024) })).mutation(({ ctx, input }) => {
      if (!verifyAccessKey(input.accessKey)) {
        throw new Error("Invalid studio access key.");
      }
      ctx.res.cookie(ACCESS_SESSION_COOKIE, createAccessSessionToken(), getAccessCookieOptions(ctx.req));
      return { success: true } as const;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(ACCESS_SESSION_COOKIE, getExpiredAccessCookieOptions(ctx.req));
      return {
        success: true,
      } as const;
    }),
  }),
  studio: studioRouter,
  providers: providersRouter,
  generation: generationRouter,
  exports: exportsRouter,
});

export type AppRouter = typeof appRouter;
