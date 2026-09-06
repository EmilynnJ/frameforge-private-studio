CREATE TABLE `providerConnections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`providerKey` varchar(96) NOT NULL,
	`label` varchar(160) NOT NULL,
	`adapterType` varchar(96) NOT NULL DEFAULT 'http-json',
	`submitUrl` text NOT NULL,
	`statusUrlTemplate` text,
	`apiKeyEncrypted` text NOT NULL,
	`apiKeyHeader` varchar(120) NOT NULL DEFAULT 'Authorization',
	`apiKeyPrefix` varchar(80) NOT NULL DEFAULT 'Bearer ',
	`model` varchar(255),
	`modelField` varchar(160),
	`headersJson` text,
	`requestMapJson` text NOT NULL,
	`responseMapJson` text NOT NULL,
	`statusMapJson` text,
	`capabilitiesJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `providerConnections_id` PRIMARY KEY(`id`),
	CONSTRAINT `providerConnections_owner_provider_uq` UNIQUE(`ownerId`,`providerKey`)
);
--> statement-breakpoint
ALTER TABLE `providerConnections` ADD CONSTRAINT `providerConnections_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `providerConnections_owner_updated_idx` ON `providerConnections` (`ownerId`,`updatedAt`);