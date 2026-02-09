CREATE TABLE `chunkedUploadSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uploadId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`fileName` varchar(500) NOT NULL,
	`totalSize` bigint NOT NULL,
	`totalChunks` int NOT NULL,
	`receivedChunks` int NOT NULL DEFAULT 0,
	`receivedChunkIndices` text,
	`status` enum('active','finalizing','complete','expired') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chunkedUploadSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `chunkedUploadSessions_uploadId_unique` UNIQUE(`uploadId`)
);
--> statement-breakpoint
ALTER TABLE `chunkedUploadSessions` ADD CONSTRAINT `chunkedUploadSessions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;