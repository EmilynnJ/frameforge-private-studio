import { and, asc, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  generationJobs,
  InsertUser,
  projectAssets,
  providerConnections,
  providerPreferences,
  users,
  videoClips,
  videoExports,
  videoProjects,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await requireDb();
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await requireDb();
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

export async function createVideoProject(input: {
  ownerId: number;
  name: string;
  prompt: string;
  targetDurationSeconds: number;
  videoProviderMode: "automatic" | "manual";
  selectedVideoProviderKey?: string;
}) {
  const db = await requireDb();
  const inserted = await db.insert(videoProjects).values(input).$returningId();
  return getVideoProject(input.ownerId, inserted[0]!.id);
}

export async function listVideoProjects(ownerId: number) {
  const db = await requireDb();
  return db.select().from(videoProjects).where(eq(videoProjects.ownerId, ownerId)).orderBy(desc(videoProjects.updatedAt));
}

export async function getVideoProject(ownerId: number, projectId: number) {
  const db = await requireDb();
  return (
    await db
      .select()
      .from(videoProjects)
      .where(and(eq(videoProjects.id, projectId), eq(videoProjects.ownerId, ownerId)))
      .limit(1)
  )[0];
}

export async function getProjectBundle(ownerId: number, projectId: number) {
  const db = await requireDb();
  const project = await getVideoProject(ownerId, projectId);
  if (!project) return undefined;
  const [assets, clips, jobs, exports] = await Promise.all([
    db.select().from(projectAssets).where(and(eq(projectAssets.projectId, projectId), eq(projectAssets.ownerId, ownerId))).orderBy(desc(projectAssets.createdAt)),
    db.select().from(videoClips).where(and(eq(videoClips.projectId, projectId), eq(videoClips.ownerId, ownerId))).orderBy(asc(videoClips.sequence)),
    db.select().from(generationJobs).where(and(eq(generationJobs.projectId, projectId), eq(generationJobs.ownerId, ownerId))).orderBy(desc(generationJobs.createdAt)),
    db.select().from(videoExports).where(and(eq(videoExports.projectId, projectId), eq(videoExports.ownerId, ownerId))).orderBy(desc(videoExports.createdAt)),
  ]);
  return { project, assets, clips, jobs, exports };
}

export async function updateProject(ownerId: number, projectId: number, values: Partial<{
  name: string;
  prompt: string;
  targetDurationSeconds: number;
  status: "draft" | "planning" | "ready" | "generating" | "assembling" | "completed" | "failed";
  videoProviderMode: "automatic" | "manual";
  selectedVideoProviderKey: string | null;
}>) {
  const db = await requireDb();
  await db.update(videoProjects).set(values).where(and(eq(videoProjects.id, projectId), eq(videoProjects.ownerId, ownerId)));
  return getVideoProject(ownerId, projectId);
}

export async function addProjectAsset(input: typeof projectAssets.$inferInsert) {
  const db = await requireDb();
  const inserted = await db.insert(projectAssets).values(input).$returningId();
  return (
    await db.select().from(projectAssets).where(and(eq(projectAssets.id, inserted[0]!.id), eq(projectAssets.ownerId, input.ownerId))).limit(1)
  )[0];
}

export async function replaceProjectClips(ownerId: number, projectId: number, clips: Array<{
  sequence: number;
  title: string;
  prompt: string;
  negativePrompt?: string;
  durationSeconds: number;
  seed?: number;
  settingsJson?: string;
}>) {
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.delete(videoClips).where(and(eq(videoClips.projectId, projectId), eq(videoClips.ownerId, ownerId)));
    if (clips.length) await tx.insert(videoClips).values(clips.map(clip => ({ ...clip, ownerId, projectId })));
    await tx.update(videoProjects).set({ status: "ready" }).where(and(eq(videoProjects.id, projectId), eq(videoProjects.ownerId, ownerId)));
  });
  return db.select().from(videoClips).where(and(eq(videoClips.projectId, projectId), eq(videoClips.ownerId, ownerId))).orderBy(asc(videoClips.sequence));
}

export async function updateClip(ownerId: number, clipId: number, values: Partial<{
  sequence: number;
  durationSeconds: number;
  providerKey: string | null;
  activeJobId: number | null;
  outputAssetId: number | null;
  status: "planned" | "queued" | "running" | "completed" | "failed";
}>) {
  const db = await requireDb();
  await db.update(videoClips).set(values).where(and(eq(videoClips.id, clipId), eq(videoClips.ownerId, ownerId)));
  return (await db.select().from(videoClips).where(and(eq(videoClips.id, clipId), eq(videoClips.ownerId, ownerId))).limit(1))[0];
}

export async function updateProjectTimeline(
  ownerId: number,
  projectId: number,
  clips: Array<{ id: number; sequence: number; durationSeconds: number }>,
) {
  const db = await requireDb();
  await db.transaction(async tx => {
    for (const clip of clips) {
      await tx.update(videoClips).set({ sequence: -clip.sequence }).where(and(
        eq(videoClips.id, clip.id),
        eq(videoClips.projectId, projectId),
        eq(videoClips.ownerId, ownerId),
      ));
    }
    for (const clip of clips) {
      await tx.update(videoClips).set({ sequence: clip.sequence, durationSeconds: clip.durationSeconds }).where(and(
        eq(videoClips.id, clip.id),
        eq(videoClips.projectId, projectId),
        eq(videoClips.ownerId, ownerId),
      ));
    }
  });
  return db.select().from(videoClips).where(and(eq(videoClips.projectId, projectId), eq(videoClips.ownerId, ownerId))).orderBy(asc(videoClips.sequence));
}

export async function getClipContext(ownerId: number, clipId: number) {
  const db = await requireDb();
  const clip = (await db.select().from(videoClips).where(and(eq(videoClips.id, clipId), eq(videoClips.ownerId, ownerId))).limit(1))[0];
  if (!clip) return undefined;
  const project = await getVideoProject(ownerId, clip.projectId);
  const references = await db.select().from(projectAssets).where(and(eq(projectAssets.projectId, clip.projectId), eq(projectAssets.ownerId, ownerId), eq(projectAssets.kind, "reference_image")));
  return { clip, project, references };
}

export async function listProviderPreferences(ownerId: number) {
  const db = await requireDb();
  return db.select().from(providerPreferences).where(eq(providerPreferences.ownerId, ownerId)).orderBy(asc(providerPreferences.priority));
}

export async function replaceProviderPreferences(ownerId: number, preferences: Array<{ providerKey: string; label: string; enabled: boolean; priority: number }>) {
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.delete(providerPreferences).where(eq(providerPreferences.ownerId, ownerId));
    if (preferences.length) await tx.insert(providerPreferences).values(preferences.map(item => ({ ...item, ownerId })));
  });
  return listProviderPreferences(ownerId);
}

export async function listProviderConnections(ownerId: number) {
  const db = await requireDb();
  return db.select().from(providerConnections).where(eq(providerConnections.ownerId, ownerId)).orderBy(desc(providerConnections.updatedAt));
}

export async function createProviderConnection(input: typeof providerConnections.$inferInsert) {
  const db = await requireDb();
  const inserted = await db.insert(providerConnections).values(input).$returningId();
  return (await db.select().from(providerConnections).where(and(
    eq(providerConnections.id, inserted[0]!.id),
    eq(providerConnections.ownerId, input.ownerId),
  )).limit(1))[0];
}

export async function updateProviderConnection(
  ownerId: number,
  providerKey: string,
  values: Partial<typeof providerConnections.$inferInsert>,
) {
  const db = await requireDb();
  await db.update(providerConnections).set(values).where(and(
    eq(providerConnections.ownerId, ownerId),
    eq(providerConnections.providerKey, providerKey),
  ));
  return (await db.select().from(providerConnections).where(and(
    eq(providerConnections.ownerId, ownerId),
    eq(providerConnections.providerKey, providerKey),
  )).limit(1))[0];
}

export async function deleteProviderConnection(ownerId: number, providerKey: string) {
  const db = await requireDb();
  await db.transaction(async tx => {
    await tx.delete(providerPreferences).where(and(
      eq(providerPreferences.ownerId, ownerId),
      eq(providerPreferences.providerKey, providerKey),
    ));
    await tx.delete(providerConnections).where(and(
      eq(providerConnections.ownerId, ownerId),
      eq(providerConnections.providerKey, providerKey),
    ));
  });
  return { success: true as const };
}

export async function createGenerationJob(input: typeof generationJobs.$inferInsert) {
  const db = await requireDb();
  const inserted = await db.insert(generationJobs).values(input).$returningId();
  return inserted[0]!.id;
}

export async function updateGenerationJob(ownerId: number, jobId: number, values: Partial<typeof generationJobs.$inferInsert>) {
  const db = await requireDb();
  await db.update(generationJobs).set(values).where(and(eq(generationJobs.id, jobId), eq(generationJobs.ownerId, ownerId)));
  return (await db.select().from(generationJobs).where(and(eq(generationJobs.id, jobId), eq(generationJobs.ownerId, ownerId))).limit(1))[0];
}

export async function getGenerationJob(ownerId: number, jobId: number) {
  const db = await requireDb();
  return (await db.select().from(generationJobs).where(and(eq(generationJobs.id, jobId), eq(generationJobs.ownerId, ownerId))).limit(1))[0];
}

export async function createVideoExport(input: typeof videoExports.$inferInsert) {
  const db = await requireDb();
  const inserted = await db.insert(videoExports).values(input).$returningId();
  return inserted[0]!.id;
}

export async function updateVideoExport(ownerId: number, exportId: number, values: Partial<typeof videoExports.$inferInsert>) {
  const db = await requireDb();
  await db.update(videoExports).set(values).where(and(eq(videoExports.id, exportId), eq(videoExports.ownerId, ownerId)));
}
