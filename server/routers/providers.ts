import { z } from "zod";
import * as db from "../db";
import { ownerProcedure, router } from "../_core/trpc";
import { loadVideoProvidersFromServerConfig } from "../providers/config";

export const providersRouter = router({
  list: ownerProcedure.query(async ({ ctx }) => {
    const registry = loadVideoProvidersFromServerConfig();
    const [providers, preferences] = await Promise.all([
      registry.publicSummaries(),
      db.listProviderPreferences(ctx.user.id),
    ]);
    const preferenceMap = new Map(preferences.map(item => [item.providerKey, item]));
    return providers
      .map((provider, index) => ({
        ...provider,
        enabled: preferenceMap.get(provider.id)?.enabled ?? true,
        priority: preferenceMap.get(provider.id)?.priority ?? index,
      }))
      .sort((a, b) => a.priority - b.priority);
  }),
  saveOrder: ownerProcedure.input(z.object({
    providers: z.array(z.object({
      providerKey: z.string().trim().min(1).max(96),
      label: z.string().trim().min(1).max(160),
      enabled: z.boolean(),
    })).max(30),
  })).mutation(async ({ ctx, input }) => {
    const registered = new Set(loadVideoProvidersFromServerConfig().ids());
    const preferences = input.providers
      .filter(item => registered.has(item.providerKey))
      .map((item, priority) => ({ ...item, priority }));
    return db.replaceProviderPreferences(ctx.user.id, preferences);
  }),
});
