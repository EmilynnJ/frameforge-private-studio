import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { ownerProcedure, router } from "../_core/trpc";
import { loadVideoProviders, redactedConnection } from "../providers/config";
import { decryptProviderCredential, encryptProviderCredential } from "../providers/credentialVault";
import { getPreset, publicPresets, type ConnectionKind } from "../providers/presets";

const optionalPath = z.string().trim().max(200).optional().or(z.literal(""));
const mappingSchema = z.object({
  requestMap: z.object({
    prompt: optionalPath, negativePrompt: optionalPath, referenceImages: optionalPath,
    durationSeconds: optionalPath, aspectRatio: optionalPath, width: optionalPath,
    height: optionalPath, seed: optionalPath, settings: optionalPath,
  }).default({}),
  responseMap: z.object({
    idPath: z.string().trim().min(1).max(200),
    statusPath: z.string().trim().min(1).max(200),
    progressPath: optionalPath, outputUrlPath: optionalPath, errorPath: optionalPath,
  }).default({ idPath: "id", statusPath: "status" }),
  statusMap: z.object({
    queued: z.array(z.string().trim().min(1)).max(20), running: z.array(z.string().trim().min(1)).max(20),
    completed: z.array(z.string().trim().min(1)).max(20), failed: z.array(z.string().trim().min(1)).max(20),
  }).default({ queued: ["queued", "pending", "created"], running: ["running", "processing", "in_progress"], completed: ["completed", "succeeded", "done"], failed: ["failed", "error", "canceled"] }),
  capabilities: z.object({
    aspectRatios: z.array(z.literal("9:16")).min(1).max(1).default(["9:16"]),
    minDurationSeconds: z.number().int().min(1).max(60).default(1),
    maxDurationSeconds: z.number().int().min(1).max(60).default(12),
    maxReferenceImages: z.number().int().min(0).max(20).default(4),
    supportsSeed: z.boolean().default(true), supportsNegativePrompt: z.boolean().default(true), supportsNativeAudio: z.boolean().default(false),
  }).default({ aspectRatios: ["9:16"], minDurationSeconds: 1, maxDurationSeconds: 12, maxReferenceImages: 4, supportsSeed: true, supportsNegativePrompt: true, supportsNativeAudio: false }),
});

const setupSchema = z.object({
  providerKey: z.string().trim().min(1).max(96).optional(),
  kind: z.enum(["script", "voice", "video"]),
  preset: z.string().trim().min(1).max(96),
  label: z.string().trim().min(2).max(160).optional(),
  baseUrl: z.string().trim().max(2000).optional(),
  apiKey: z.string().max(20_000).optional(),
  model: z.string().trim().max(255).optional(),
  headers: z.record(z.string(), z.string()).default({}),
  mapping: mappingSchema,
});

type Setup = z.infer<typeof setupSchema>;

function connectionKey(kind: ConnectionKind, preset: string) {
  return kind === "video" ? `${preset}-${randomUUID().slice(0, 8)}` : `${kind}-writer`;
}

function baseUrlFor(input: Setup) {
  const preset = getPreset(input.kind, input.preset);
  if (!preset.customBaseUrl) return preset.baseUrl;
  const value = input.baseUrl?.trim();
  if (!value) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a custom provider URL." });
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid provider URL." });
  }
}

function serializable(input: Setup, providerKey: string) {
  const preset = getPreset(input.kind, input.preset);
  if (input.kind === "video" && input.mapping.capabilities.maxDurationSeconds < input.mapping.capabilities.minDurationSeconds) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum clip duration must be at least the minimum." });
  }
  const requestMap = Object.fromEntries(Object.entries(input.mapping.requestMap).filter(([, value]) => value));
  const responseMap = Object.fromEntries(Object.entries(input.mapping.responseMap).filter(([, value]) => value));
  return {
    providerKey,
    kind: input.kind,
    preset: input.preset,
    label: input.label?.trim() || preset.label,
    adapterType: input.kind === "video" ? "http-json" : "openai-compatible",
    submitUrl: baseUrlFor(input),
    statusUrlTemplate: input.kind === "video" ? null : null,
    apiKeyHeader: preset.apiKeyHeader,
    apiKeyPrefix: preset.apiKeyPrefix,
    model: input.model?.trim() || null,
    modelField: input.kind === "video" ? "model" : null,
    headersJson: JSON.stringify(input.headers),
    requestMapJson: JSON.stringify(requestMap),
    responseMapJson: JSON.stringify(responseMap),
    statusMapJson: JSON.stringify(input.mapping.statusMap),
    capabilitiesJson: JSON.stringify(input.mapping.capabilities),
  };
}

async function existingConnection(ownerId: number, input: Setup) {
  const connections = await db.listProviderConnections(ownerId);
  if (input.providerKey) return connections.find(connection => connection.providerKey === input.providerKey);
  return input.kind === "video" ? undefined : connections.find(connection => connection.kind === input.kind);
}

function authHeaders(connection: { apiKeyHeader: string; apiKeyPrefix: string; apiKeyEncrypted: string; headersJson: string | null }) {
  let headers: Record<string, string> = {};
  try { headers = connection.headersJson ? JSON.parse(connection.headersJson) as Record<string, string> : {}; } catch { headers = {}; }
  return {
    "Content-Type": "application/json",
    ...headers,
    [connection.apiKeyHeader]: `${connection.apiKeyPrefix}${decryptProviderCredential(connection.apiKeyEncrypted)}`,
  };
}

async function runConnectionTest(connection: Awaited<ReturnType<typeof db.listProviderConnections>>[number]) {
  const headers = authHeaders(connection);
  const baseUrl = connection.submitUrl.replace(/\/$/, "");
  let response: Response;
  if (connection.kind === "script") {
    if (!connection.model) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a Script writer model before testing." });
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST", headers,
      body: JSON.stringify({ model: connection.model, max_tokens: 1, messages: [{ role: "user", content: "Reply OK" }] }),
    });
  } else if (connection.kind === "voice") {
    if (!connection.model) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a voice model or voice ID before testing." });
    const body = connection.preset === "elevenlabs"
      ? { text: "Connection test.", model_id: "eleven_multilingual_v2" }
      : { model: connection.model, input: "Connection test.", voice: "alloy", response_format: "mp3" };
    const path = connection.preset === "elevenlabs" ? `/v1/text-to-speech/${encodeURIComponent(connection.model)}` : "/audio/speech";
    response = await fetch(`${baseUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  } else {
    response = await fetch(baseUrl, { method: "OPTIONS", headers });
  }
  if (response.status === 401 || response.status === 403) throw new TRPCError({ code: "UNAUTHORIZED", message: "The provider rejected this API key." });
  if (!response.ok && response.status >= 500) throw new TRPCError({ code: "BAD_GATEWAY", message: `Provider test failed (${response.status}).` });
  if (!response.ok && response.status === 404) throw new TRPCError({ code: "BAD_REQUEST", message: "The provider URL or model path was not found." });
  return { success: true as const, message: "Connection responded successfully." };
}

export const providersRouter = router({
  presets: ownerProcedure.query(() => publicPresets()),
  list: ownerProcedure.query(async ({ ctx }) => {
    const registry = await loadVideoProviders(ctx.user.id);
    const [preferences, connections] = await Promise.all([db.listProviderPreferences(ctx.user.id), db.listProviderConnections(ctx.user.id)]);
    const preferenceMap = new Map(preferences.map(item => [item.providerKey, item]));
    const connectionMap = new Map(connections.filter(item => item.kind === "video").map(item => [item.providerKey, redactedConnection(item)]));
    return (await registry.publicSummaries()).map((provider, index) => ({
      ...provider,
      enabled: preferenceMap.get(provider.id)?.enabled ?? true,
      priority: preferenceMap.get(provider.id)?.priority ?? index,
      editable: connectionMap.has(provider.id),
      connection: connectionMap.get(provider.id) ?? null,
    })).sort((a, b) => a.priority - b.priority);
  }),
  settings: ownerProcedure.query(async ({ ctx }) => {
    const connections = await db.listProviderConnections(ctx.user.id);
    return connections.map(redactedConnection);
  }),
  saveSetup: ownerProcedure.input(setupSchema).mutation(async ({ ctx, input }) => {
    const existing = await existingConnection(ctx.user.id, input);
    if (existing && existing.kind !== input.kind) throw new TRPCError({ code: "BAD_REQUEST", message: "Provider type cannot be changed in place." });
    if (!existing && !input.apiKey?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a provider API key." });
    const providerKey = existing?.providerKey ?? input.providerKey ?? connectionKey(input.kind, input.preset);
    const data = serializable(input, providerKey);
    const connection = existing
      ? await db.updateProviderConnection(ctx.user.id, providerKey, { ...data, ...(input.apiKey?.trim() ? { apiKeyEncrypted: encryptProviderCredential(input.apiKey) } : {}) })
      : await db.createProviderConnection({ ownerId: ctx.user.id, ...data, apiKeyEncrypted: encryptProviderCredential(input.apiKey!) });
    if (input.kind === "video") {
      const preferences = await db.listProviderPreferences(ctx.user.id);
      if (!preferences.some(item => item.providerKey === providerKey)) {
        await db.replaceProviderPreferences(ctx.user.id, [...preferences, { providerKey, label: data.label, enabled: true, priority: preferences.length }]);
      }
    }
    return redactedConnection(connection!);
  }),
  testSetup: ownerProcedure.input(setupSchema).mutation(async ({ ctx, input }) => {
    const existing = await existingConnection(ctx.user.id, input);
    if (!existing && !input.apiKey?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter an API key before testing." });
    const providerKey = existing?.providerKey ?? input.providerKey ?? connectionKey(input.kind, input.preset);
    const data = serializable(input, providerKey);
    const transient = {
      ...data,
      id: 0,
      ownerId: ctx.user.id,
      apiKeyEncrypted: input.apiKey?.trim() ? encryptProviderCredential(input.apiKey) : existing!.apiKeyEncrypted,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return runConnectionTest(transient);
  }),
  remove: ownerProcedure.input(z.object({ providerKey: z.string().trim().min(1).max(96) })).mutation(async ({ ctx, input }) => db.deleteProviderConnection(ctx.user.id, input.providerKey)),
  saveOrder: ownerProcedure.input(z.object({ providers: z.array(z.object({ providerKey: z.string().trim().min(1).max(96), label: z.string().trim().min(1).max(160), enabled: z.boolean() })).max(30) })).mutation(async ({ ctx, input }) => {
    const registered = new Set((await loadVideoProviders(ctx.user.id)).ids());
    return db.replaceProviderPreferences(ctx.user.id, input.providers.filter(item => registered.has(item.providerKey)).map((item, priority) => ({ ...item, priority })));
  }),
});
