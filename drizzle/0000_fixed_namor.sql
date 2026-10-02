CREATE TYPE "asset_kind" AS ENUM('reference_image', 'generated_clip', 'final_export');
--> statement-breakpoint
CREATE TYPE "clip_status" AS ENUM('planned', 'queued', 'running', 'completed', 'failed');
--> statement-breakpoint
CREATE TYPE "connection_kind" AS ENUM('script', 'voice', 'video');
--> statement-breakpoint
CREATE TYPE "job_kind" AS ENUM('planning', 'video', 'export');
--> statement-breakpoint
CREATE TYPE "job_status" AS ENUM('queued', 'running', 'completed', 'failed');
--> statement-breakpoint
CREATE TYPE "project_status" AS ENUM('draft', 'planning', 'ready', 'generating', 'assembling', 'completed', 'failed');
--> statement-breakpoint
CREATE TYPE "provider_mode" AS ENUM('automatic', 'manual');
--> statement-breakpoint
CREATE TYPE "user_role" AS ENUM('user', 'admin');
--> statement-breakpoint
CREATE TYPE "video_format" AS ENUM('vertical_9_16');
--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"clip_id" integer,
	"kind" "job_kind" NOT NULL,
	"provider_key" varchar(96),
	"adapter_type" varchar(96),
	"external_job_id" varchar(255),
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"request_json" text,
	"response_json" text,
	"error_code" varchar(96),
	"error_message" text,
	"fallback_eligible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "project_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"owner_id" integer NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"storage_key" text NOT NULL,
	"url" text NOT NULL,
	"width" integer,
	"height" integer,
	"duration_seconds" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"provider_key" varchar(96) NOT NULL,
	"kind" "connection_kind" DEFAULT 'video' NOT NULL,
	"preset" varchar(96) DEFAULT 'custom' NOT NULL,
	"label" varchar(160) NOT NULL,
	"adapter_type" varchar(96) DEFAULT 'http-json' NOT NULL,
	"submit_url" text NOT NULL,
	"status_url_template" text,
	"api_key_encrypted" text NOT NULL,
	"api_key_header" varchar(120) DEFAULT 'Authorization' NOT NULL,
	"api_key_prefix" varchar(80) DEFAULT 'Bearer ' NOT NULL,
	"model" varchar(255),
	"model_field" varchar(160),
	"headers_json" text,
	"request_map_json" text NOT NULL,
	"response_map_json" text NOT NULL,
	"status_map_json" text,
	"capabilities_json" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"provider_key" varchar(96) NOT NULL,
	"label" varchar(160) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"open_id" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"login_method" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_signed_in" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_open_id_unique" UNIQUE("open_id")
);
--> statement-breakpoint
CREATE TABLE "video_clips" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"title" varchar(180) NOT NULL,
	"prompt" text NOT NULL,
	"negative_prompt" text,
	"duration_seconds" integer NOT NULL,
	"seed" integer,
	"settings_json" text,
	"provider_key" varchar(96),
	"active_job_id" integer,
	"output_asset_id" integer,
	"status" "clip_status" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_exports" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"asset_id" integer,
	"job_id" integer,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"duration_seconds" integer NOT NULL,
	"width" integer DEFAULT 1080 NOT NULL,
	"height" integer DEFAULT 1920 NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "video_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"name" varchar(180) NOT NULL,
	"prompt" text NOT NULL,
	"format" "video_format" DEFAULT 'vertical_9_16' NOT NULL,
	"width" integer DEFAULT 1080 NOT NULL,
	"height" integer DEFAULT 1920 NOT NULL,
	"target_duration_seconds" integer DEFAULT 61 NOT NULL,
	"planning_provider_key" varchar(96),
	"video_provider_mode" "provider_mode" DEFAULT 'automatic' NOT NULL,
	"selected_video_provider_key" varchar(96),
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_project_id_video_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_project_id_video_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_connections" ADD CONSTRAINT "provider_connections_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_preferences" ADD CONSTRAINT "provider_preferences_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_clips" ADD CONSTRAINT "video_clips_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_clips" ADD CONSTRAINT "video_clips_project_id_video_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_exports" ADD CONSTRAINT "video_exports_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_exports" ADD CONSTRAINT "video_exports_project_id_video_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."video_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_projects" ADD CONSTRAINT "video_projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_jobs_project_status_idx" ON "generation_jobs" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "generation_jobs_clip_attempt_idx" ON "generation_jobs" USING btree ("clip_id","attempt");--> statement-breakpoint
CREATE INDEX "project_assets_project_kind_idx" ON "project_assets" USING btree ("project_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_connections_owner_provider_uq" ON "provider_connections" USING btree ("owner_id","provider_key");--> statement-breakpoint
CREATE INDEX "provider_connections_owner_kind_idx" ON "provider_connections" USING btree ("owner_id","kind");--> statement-breakpoint
CREATE INDEX "provider_connections_owner_updated_idx" ON "provider_connections" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_preferences_owner_provider_uq" ON "provider_preferences" USING btree ("owner_id","provider_key");--> statement-breakpoint
CREATE INDEX "provider_preferences_owner_priority_idx" ON "provider_preferences" USING btree ("owner_id","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "video_clips_project_sequence_uq" ON "video_clips" USING btree ("project_id","sequence");--> statement-breakpoint
CREATE INDEX "video_clips_project_status_idx" ON "video_clips" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "video_exports_project_created_idx" ON "video_exports" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "video_projects_owner_updated_idx" ON "video_projects" USING btree ("owner_id","updated_at");
