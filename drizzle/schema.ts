import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const videoProjects = mysqlTable(
  "videoProjects",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    prompt: text("prompt").notNull(),
    format: mysqlEnum("format", ["vertical_9_16"]).default("vertical_9_16").notNull(),
    width: int("width").default(1080).notNull(),
    height: int("height").default(1920).notNull(),
    targetDurationSeconds: int("targetDurationSeconds").default(61).notNull(),
    planningProviderKey: varchar("planningProviderKey", { length: 96 }),
    videoProviderMode: mysqlEnum("videoProviderMode", ["automatic", "manual"]).default("automatic").notNull(),
    selectedVideoProviderKey: varchar("selectedVideoProviderKey", { length: 96 }),
    status: mysqlEnum("status", [
      "draft",
      "planning",
      "ready",
      "generating",
      "assembling",
      "completed",
      "failed",
    ]).default("draft").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("videoProjects_owner_updated_idx").on(table.ownerId, table.updatedAt)],
);

export const projectAssets = mysqlTable(
  "projectAssets",
  {
    id: int("id").autoincrement().primaryKey(),
    projectId: int("projectId").notNull().references(() => videoProjects.id, { onDelete: "cascade" }),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: mysqlEnum("kind", ["reference_image", "generated_clip", "final_export"]).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 120 }).notNull(),
    sizeBytes: int("sizeBytes").default(0).notNull(),
    storageKey: text("storageKey").notNull(),
    url: text("url").notNull(),
    width: int("width"),
    height: int("height"),
    durationSeconds: int("durationSeconds"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("projectAssets_project_kind_idx").on(table.projectId, table.kind)],
);

export const providerPreferences = mysqlTable(
  "providerPreferences",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    providerKey: varchar("providerKey", { length: 96 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    priority: int("priority").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("providerPreferences_owner_provider_uq").on(table.ownerId, table.providerKey),
    index("providerPreferences_owner_priority_idx").on(table.ownerId, table.priority),
  ],
);

export const generationJobs = mysqlTable(
  "generationJobs",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => videoProjects.id, { onDelete: "cascade" }),
    clipId: int("clipId"),
    kind: mysqlEnum("kind", ["planning", "video", "export"]).notNull(),
    providerKey: varchar("providerKey", { length: 96 }),
    adapterType: varchar("adapterType", { length: 96 }),
    externalJobId: varchar("externalJobId", { length: 255 }),
    status: mysqlEnum("status", ["queued", "running", "completed", "failed"]).default("queued").notNull(),
    progress: int("progress").default(0).notNull(),
    attempt: int("attempt").default(1).notNull(),
    requestJson: text("requestJson"),
    responseJson: text("responseJson"),
    errorCode: varchar("errorCode", { length: 96 }),
    errorMessage: text("errorMessage"),
    fallbackEligible: boolean("fallbackEligible").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => [
    index("generationJobs_project_status_idx").on(table.projectId, table.status),
    index("generationJobs_clip_attempt_idx").on(table.clipId, table.attempt),
  ],
);

export const videoClips = mysqlTable(
  "videoClips",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => videoProjects.id, { onDelete: "cascade" }),
    sequence: int("sequence").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    prompt: text("prompt").notNull(),
    negativePrompt: text("negativePrompt"),
    durationSeconds: int("durationSeconds").notNull(),
    seed: int("seed"),
    settingsJson: text("settingsJson"),
    providerKey: varchar("providerKey", { length: 96 }),
    activeJobId: int("activeJobId"),
    outputAssetId: int("outputAssetId"),
    status: mysqlEnum("status", ["planned", "queued", "running", "completed", "failed"]).default("planned").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("videoClips_project_sequence_uq").on(table.projectId, table.sequence),
    index("videoClips_project_status_idx").on(table.projectId, table.status),
  ],
);

export const videoExports = mysqlTable(
  "videoExports",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: int("projectId").notNull().references(() => videoProjects.id, { onDelete: "cascade" }),
    assetId: int("assetId"),
    jobId: int("jobId"),
    status: mysqlEnum("status", ["queued", "running", "completed", "failed"]).default("queued").notNull(),
    durationSeconds: int("durationSeconds").notNull(),
    width: int("width").default(1080).notNull(),
    height: int("height").default(1920).notNull(),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => [index("videoExports_project_created_idx").on(table.projectId, table.createdAt)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type VideoProject = typeof videoProjects.$inferSelect;
export type ProjectAsset = typeof projectAssets.$inferSelect;
export type ProviderPreference = typeof providerPreferences.$inferSelect;
export type GenerationJob = typeof generationJobs.$inferSelect;
export type VideoClip = typeof videoClips.$inferSelect;
export type VideoExport = typeof videoExports.$inferSelect;
