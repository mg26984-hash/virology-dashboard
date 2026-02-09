ALTER TABLE `documents` ADD `retryCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `batchId` varchar(64);--> statement-breakpoint
ALTER TABLE `uploadBatches` ADD `manifest` text;