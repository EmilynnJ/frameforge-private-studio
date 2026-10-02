import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const roleEnum = pgEnum("user_role", ["user", "admin"]);
const formatEnum = pgEnum("video_format", ["vertical_9_16"]);
const projectStatusEnum = pgEnum("project_status", ["draft", "planning", "ready", "generating", "assembling", "completed", "failed"]);
const providerModeEnum = pgEnum("provider_mode", ["automatic", "manual"]);
const assetKindEnum = pgEnum("asset_kind", ["reference_image", "generated_clip", "final_export"]);
const connectionKindEnum = pgEnum("connection_kind", ["script", "voice", "video"]);
const jobKindEnum = pgEnum("job_kind", ["planning", "video", "export"]);
const jobStatusEnum = pgEnum("job_status", ["queued", "running", "completed", "failed"]);
const clipStatusEnum = pgEnum("clip_status", ["planned", "queued", "running", "completed", "failed"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in").defaultNow().notNull(),
});

export const videoProjects = pgTable(
  "video_projects",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 180 }).notNull(),
    prompt: text("prompt").notNull(),
    format: formatEnum("format").default("vertical_9_16").notNull(),
    width: integer("width").default(1080).notNull(),
    height: integer("height").default(1920).notNull(),
    targetDurationSeconds: integer("target_duration_seconds").default(61).notNull(),
    planningProviderKey: varchar("planning_provider_key", { length: 96 }),
    videoProviderMode: providerModeEnum("video_provider_mode").default("automatic").notNull(),
    selectedVideoProviderKey: varchar("selected_video_provider_key", { length: 96 }),
    status: projectStatusEnum("status").default("draft").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  table => [index("video_projects_owner_updated_idx").on(table.ownerId, table.updatedAt)],
);

export const projectAssets = pgTable(
  "project_assets",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").notNull().references(() => videoProjects.id, { onDelete: "cascade" }),
    ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: assetKindEnum("kind").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    sizeBytes: integer("size_bytes").default(0).notNull(),
    storageKey: text("storage_key").notNull(),
    url: text("url").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: integer("duration_seconds"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [index("project_assets_project_kind_idx").on(table.projectId, table.kind)],
);

export const providerPreferences = pgTable(
  "provider_preferences",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    providerKey: varchar("provider_key", { length: 96 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    priority: integer("priority").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("provider_preferences_owner_provider_uq").on(table.ownerId, table.providerKey),
    index("provider_preferences_owner_priority_idx").on(table.ownerId, table.priority),
  ],
);

export const providerConnections = pgTable(
  "provider_connections",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    providerKey: varchar("provider_key", { length: 96 }).notNull(),
    kind: connectionKindEnum("kind").default("video").notNull(),
    preset: varchar("preset", { length: 96 }).default("custom").notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    adapterType: varchar("adapter_type", { length: 96 }).default("http-json").notNull(),
    submitUrl: text("submit_url").notNull(),
    statusUrlTemplate: text("status_url_template"),
    apiKeyEncrypted: text("api_key_encrypted").notNull(),
    apiKeyHeader: varchar("api_key_header", { length: 120 }).default("Authorization").notNull(),
    apiKeyPrefix: varchar("api_key_prefix", { length: 80 }).default("Bearer ").notNull(),
    model: varchar("model", { length: 255 }),
    modelField: varchar("model_field", { length: 160 }),
    headersJson: text("headers_json"),
    requestMapJson: text("request_map_json").notNull(),
    responseMapJson: text("response_map_json").notNull(),
    statusMapJson: text("status_map_json"),
    capabilitiesJson: text("capabilities_json").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("provider_connections_owner_provider_uq").on(table.ownerId, table.providerKey),
    index("provider_connections_owner_kind_idx").on(table.ownerId, table.kind),
    index("provider_connections_owner_updated_idx").on(table.ownerId, table.updatedAt),
  ],
);

export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: integer("project_id").notNull().references(() => videoProjects.id, { onDelete: "cascade" }),
    clipId: integer("clip_id"),
    kind: jobKindEnum("kind").notNull(),
    providerKey: varchar("provider_key", { length: 96 }),
    adapterType: varchar("adapter_type", { length: 96 }),
    externalJobId: varchar("external_job_id", { length: 255 }),
    status: jobStatusEnum("status").default("queued").notNull(),
    progress: integer("progress").default(0).notNull(),
    attempt: integer("attempt").default(1).notNull(),
    requestJson: text("request_json"),
    responseJson: text("response_json"),
    errorCode: varchar("error_code", { length: 96 }),
    errorMessage: text("error_message"),
    fallbackEligible: boolean("fallback_eligible").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  table => [
    index("generation_jobs_project_status_idx").on(table.projectId, table.status),
    index("generation_jobs_clip_attempt_idx").on(table.clipId, table.attempt),
  ],
);

export const videoClips = pgTable(
  "video_clips",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: integer("project_id").notNull().references(() => videoProjects.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    prompt: text("prompt").notNull(),
    negativePrompt: text("negative_prompt"),
    durationSeconds: integer("duration_seconds").notNull(),
    seed: integer("seed"),
    settingsJson: text("settings_json"),
    providerKey: varchar("provider_key", { length: 96 }),
    activeJobId: integer("active_job_id"),
    outputAssetId: integer("output_asset_id"),
    status: clipStatusEnum("status").default("planned").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("video_clips_project_sequence_uq").on(table.projectId, table.sequence),
    index("video_clips_project_status_idx").on(table.projectId, table.status),
  ],
);

export const videoExports = pgTable(
  "video_exports",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: integer("project_id").notNull().references(() => videoProjects.id, { onDelete: "cascade" }),
    assetId: integer("asset_id"),
    jobId: integer("job_id"),
    status: jobStatusEnum("status").default("queued").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    width: integer("width").default(1080).notNull(),
    height: integer("height").default(1920).notNull(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  table => [index("video_exports_project_created_idx").on(table.projectId, table.createdAt)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type VideoProject = typeof videoProjects.$inferSelect;
export type ProjectAsset = typeof projectAssets.$inferSelect;
export type ProviderPreference = typeof providerPreferences.$inferSelect;
export type ProviderConnection = typeof providerConnections.$inferSelect;
export type GenerationJob = typeof generationJobs.$inferSelect;
export type VideoClip = typeof videoClips.$inferSelect;
export type VideoExport = typeof videoExports.$inferSelect;
