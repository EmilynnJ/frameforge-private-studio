CREATE TABLE `generationJobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`projectId` int NOT NULL,
	`clipId` int,
	`kind` enum('planning','video','export') NOT NULL,
	`providerKey` varchar(96),
	`adapterType` varchar(96),
	`externalJobId` varchar(255),
	`status` enum('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
	`progress` int NOT NULL DEFAULT 0,
	`attempt` int NOT NULL DEFAULT 1,
	`requestJson` text,
	`responseJson` text,
	`errorCode` varchar(96),
	`errorMessage` text,
	`fallbackEligible` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `generationJobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projectAssets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`ownerId` int NOT NULL,
	`kind` enum('reference_image','generated_clip','final_export') NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`sizeBytes` int NOT NULL DEFAULT 0,
	`storageKey` text NOT NULL,
	`url` text NOT NULL,
	`width` int,
	`height` int,
	`durationSeconds` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `projectAssets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `providerPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`providerKey` varchar(96) NOT NULL,
	`label` varchar(160) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`priority` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `providerPreferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `providerPreferences_owner_provider_uq` UNIQUE(`ownerId`,`providerKey`)
);
--> statement-breakpoint
CREATE TABLE `videoClips` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`projectId` int NOT NULL,
	`sequence` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`prompt` text NOT NULL,
	`negativePrompt` text,
	`durationSeconds` int NOT NULL,
	`seed` int,
	`settingsJson` text,
	`providerKey` varchar(96),
	`activeJobId` int,
	`outputAssetId` int,
	`status` enum('planned','queued','running','completed','failed') NOT NULL DEFAULT 'planned',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `videoClips_id` PRIMARY KEY(`id`),
	CONSTRAINT `videoClips_project_sequence_uq` UNIQUE(`projectId`,`sequence`)
);
--> statement-breakpoint
CREATE TABLE `videoExports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`projectId` int NOT NULL,
	`assetId` int,
	`jobId` int,
	`status` enum('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
	`durationSeconds` int NOT NULL,
	`width` int NOT NULL DEFAULT 1080,
	`height` int NOT NULL DEFAULT 1920,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `videoExports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `videoProjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(180) NOT NULL,
	`prompt` text NOT NULL,
	`format` enum('vertical_9_16') NOT NULL DEFAULT 'vertical_9_16',
	`width` int NOT NULL DEFAULT 1080,
	`height` int NOT NULL DEFAULT 1920,
	`targetDurationSeconds` int NOT NULL DEFAULT 61,
	`planningProviderKey` varchar(96),
	`videoProviderMode` enum('automatic','manual') NOT NULL DEFAULT 'automatic',
	`selectedVideoProviderKey` varchar(96),
	`status` enum('draft','planning','ready','generating','assembling','completed','failed') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `videoProjects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `generationJobs` ADD CONSTRAINT `generationJobs_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `generationJobs` ADD CONSTRAINT `generationJobs_projectId_videoProjects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `videoProjects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projectAssets` ADD CONSTRAINT `projectAssets_projectId_videoProjects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `videoProjects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projectAssets` ADD CONSTRAINT `projectAssets_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `providerPreferences` ADD CONSTRAINT `providerPreferences_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `videoClips` ADD CONSTRAINT `videoClips_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `videoClips` ADD CONSTRAINT `videoClips_projectId_videoProjects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `videoProjects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `videoExports` ADD CONSTRAINT `videoExports_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `videoExports` ADD CONSTRAINT `videoExports_projectId_videoProjects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `videoProjects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `videoProjects` ADD CONSTRAINT `videoProjects_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `generationJobs_project_status_idx` ON `generationJobs` (`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `generationJobs_clip_attempt_idx` ON `generationJobs` (`clipId`,`attempt`);--> statement-breakpoint
CREATE INDEX `projectAssets_project_kind_idx` ON `projectAssets` (`projectId`,`kind`);--> statement-breakpoint
CREATE INDEX `providerPreferences_owner_priority_idx` ON `providerPreferences` (`ownerId`,`priority`);--> statement-breakpoint
CREATE INDEX `videoClips_project_status_idx` ON `videoClips` (`projectId`,`status`);--> statement-breakpoint
CREATE INDEX `videoExports_project_created_idx` ON `videoExports` (`projectId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `videoProjects_owner_updated_idx` ON `videoProjects` (`ownerId`,`updatedAt`);