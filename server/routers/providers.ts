import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { ownerProcedure, router } from "../_core/trpc";
import { loadVideoProviders, redactedConnection } from "../providers/config";
import { encryptProviderCredential } from "../providers/credentialVault";

const optionalPath = z.string().trim().max(200).optional().or(z.literal(""));
const connectionSchema = z.object({
  label: z.string().trim().min(2).max(160),
  submitUrl: z.string().trim().url().max(2000),
  statusUrlTemplate: z.string().trim().max(2000).optional().or(z.literal("")),
  apiKey: z.string().min(1).max(20_000),
  apiKeyHeader: z.string().trim().min(1).max(120).default("Authorization"),
  apiKeyPrefix: z.string().max(80).default("Bearer "),
  model: z.string().trim().max(255).optional().or(z.literal("")),
  modelField: optionalPath,
  headers: z.record(z.string(), z.string()).default({}),
  requestMap: z.object({
    prompt: optionalPath, negativePrompt: optionalPath, referenceImages: optionalPath,
    durationSeconds: optionalPath, aspectRatio: optionalPath, width: optionalPath,
    height: optionalPath, seed: optionalPath, settings: optionalPath,
  }),
  responseMap: z.object({
    idPath: z.string().trim().min(1).max(200),
    statusPath: z.string().trim().min(1).max(200),
    progressPath: optionalPath, outputUrlPath: optionalPath, errorPath: optionalPath,
  }),
  statusMap: z.object({
    queued: z.array(z.string().trim().min(1)).max(20), running: z.array(z.string().trim().min(1)).max(20),
    completed: z.array(z.string().trim().min(1)).max(20), failed: z.array(z.string().trim().min(1)).max(20),
  }),
  capabilities: z.object({
    aspectRatios: z.array(z.literal("9:16")).min(1).max(1).default(["9:16"]),
    minDurationSeconds: z.number().int().min(1).max(60),
    maxDurationSeconds: z.number().int().min(1).max(60),
    maxReferenceImages: z.number().int().min(0).max(20),
    supportsSeed: z.boolean(), supportsNegativePrompt: z.boolean(), supportsNativeAudio: z.boolean(),
  }).refine(value => value.maxDurationSeconds >= value.minDurationSeconds, "Maximum duration must be at least the minimum."),
});

function serializable(input: z.infer<typeof connectionSchema>) {
  const requestMap = Object.fromEntries(Object.entries(input.requestMap).filter(([, value]) => value));
  const responseMap = Object.fromEntries(Object.entries(input.responseMap).filter(([, value]) => value));
  return {
    label: input.label,
    submitUrl: input.submitUrl,
    statusUrlTemplate: input.statusUrlTemplate || null,
    apiKeyHeader: input.apiKeyHeader,
    apiKeyPrefix: input.apiKeyPrefix,
    model: input.model || null,
    modelField: input.modelField || null,
    headersJson: JSON.stringify(input.headers),
    requestMapJson: JSON.stringify(requestMap),
    responseMapJson: JSON.stringify(responseMap),
    statusMapJson: JSON.stringify(input.statusMap),
    capabilitiesJson: JSON.stringify(input.capabilities),
  };
}

export const providersRouter = router({
  list: ownerProcedure.query(async ({ ctx }) => {
    const registry = await loadVideoProviders(ctx.user.id);
    const [providers, preferences, connections] = await Promise.all([
      registry.publicSummaries(), db.listProviderPreferences(ctx.user.id), db.listProviderConnections(ctx.user.id),
    ]);
    const preferenceMap = new Map(preferences.map(item => [item.providerKey, item]));
    const connectionMap = new Map(connections.map(item => [item.providerKey, redactedConnection(item)]));
    return providers.map((provider, index) => ({
      ...provider,
      enabled: preferenceMap.get(provider.id)?.enabled ?? true,
      priority: preferenceMap.get(provider.id)?.priority ?? index,
      editable: connectionMap.has(provider.id),
      connection: connectionMap.get(provider.id) ?? null,
    })).sort((a, b) => a.priority - b.priority);
  }),
  create: ownerProcedure.input(connectionSchema).mutation(async ({ ctx, input }) => {
    const slug = input.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "provider";
    const providerKey = `${slug}-${randomUUID().slice(0, 8)}`;
    const connection = await db.createProviderConnection({
      ownerId: ctx.user.id, providerKey, adapterType: "http-json",
      apiKeyEncrypted: encryptProviderCredential(input.apiKey), ...serializable(input),
    });
    const preferences = await db.listProviderPreferences(ctx.user.id);
    await db.replaceProviderPreferences(ctx.user.id, [
      ...preferences.map(item => ({ providerKey: item.providerKey, label: item.label, enabled: item.enabled, priority: item.priority })),
      { providerKey, label: input.label, enabled: true, priority: preferences.length },
    ]);
    return redactedConnection(connection!);
  }),
  update: ownerProcedure.input(connectionSchema.extend({ providerKey: z.string().trim().min(1).max(96), apiKey: z.string().max(20_000).optional() })).mutation(async ({ ctx, input }) => {
    const existing = (await db.listProviderConnections(ctx.user.id)).find(item => item.providerKey === input.providerKey);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Provider connection not found." });
    const connection = await db.updateProviderConnection(ctx.user.id, input.providerKey, {
      ...serializable({ ...input, apiKey: input.apiKey || "unchanged" }),
      ...(input.apiKey ? { apiKeyEncrypted: encryptProviderCredential(input.apiKey) } : {}),
    });
    const preferences = await db.listProviderPreferences(ctx.user.id);
    await db.replaceProviderPreferences(ctx.user.id, preferences.map(item => ({
      providerKey: item.providerKey, label: item.providerKey === input.providerKey ? input.label : item.label,
      enabled: item.enabled, priority: item.priority,
    })));
    return redactedConnection(connection!);
  }),
  remove: ownerProcedure.input(z.object({ providerKey: z.string().trim().min(1).max(96) })).mutation(async ({ ctx, input }) => {
    const existing = (await db.listProviderConnections(ctx.user.id)).some(item => item.providerKey === input.providerKey);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Only in-app provider connections can be removed here." });
    return db.deleteProviderConnection(ctx.user.id, input.providerKey);
  }),
  saveOrder: ownerProcedure.input(z.object({
    providers: z.array(z.object({ providerKey: z.string().trim().min(1).max(96), label: z.string().trim().min(1).max(160), enabled: z.boolean() })).max(30),
  })).mutation(async ({ ctx, input }) => {
    const registered = new Set((await loadVideoProviders(ctx.user.id)).ids());
    return db.replaceProviderPreferences(ctx.user.id, input.providers.filter(item => registered.has(item.providerKey)).map((item, priority) => ({ ...item, priority })));
  }),
});
