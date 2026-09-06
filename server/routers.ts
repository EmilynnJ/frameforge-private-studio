import { COOKIE_NAME } from "@shared/const";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
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
      authenticated: Boolean(opts.ctx.user),
      isOwner: Boolean(opts.ctx.user && ENV.ownerOpenId && opts.ctx.user.openId === ENV.ownerOpenId),
    })),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
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
