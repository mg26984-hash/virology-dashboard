CREATE TABLE `uploadTokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`used` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `uploadTokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `uploadTokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
ALTER TABLE `uploadTokens` ADD CONSTRAINT `uploadTokens_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;