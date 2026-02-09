CREATE TABLE `uploadBatches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`fileName` varchar(500) NOT NULL,
	`status` enum('extracting','processing','complete','error') NOT NULL DEFAULT 'extracting',
	`totalEntries` int NOT NULL DEFAULT 0,
	`processedEntries` int NOT NULL DEFAULT 0,
	`uploadedToS3` int NOT NULL DEFAULT 0,
	`skippedDuplicates` int NOT NULL DEFAULT 0,
	`failed` int NOT NULL DEFAULT 0,
	`errors` text,
	`startedAt` bigint NOT NULL,
	`completedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `uploadBatches_id` PRIMARY KEY(`id`),
	CONSTRAINT `uploadBatches_jobId_unique` UNIQUE(`jobId`)
);
--> statement-breakpoint
ALTER TABLE `uploadBatches` ADD CONSTRAINT `uploadBatches_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;