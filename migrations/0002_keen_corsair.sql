CREATE TABLE `backups` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`is_successful` integer DEFAULT 0 NOT NULL,
	`is_locked` integer DEFAULT 0 NOT NULL,
	`ignored_files` text DEFAULT '[]',
	`checksum` text,
	`bytes` integer DEFAULT 0 NOT NULL,
	`upload_id` text,
	`completed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backups_uuid_unique` ON `backups` (`uuid`);--> statement-breakpoint
CREATE INDEX `idx_backups_server` ON `backups` (`server_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category` text DEFAULT 'system' NOT NULL,
	`level` text DEFAULT 'info' NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`metadata` text DEFAULT '{}',
	`read_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_user` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_notifications_read` ON `notifications` (`user_id`,`read_at`);--> statement-breakpoint
CREATE INDEX `idx_notifications_created` ON `notifications` (`created_at`);--> statement-breakpoint
CREATE TABLE `port_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`node_id` integer NOT NULL,
	`start_port` integer NOT NULL,
	`end_port` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_port_alloc_user` ON `port_allocations` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_port_alloc_node` ON `port_allocations` (`node_id`);--> statement-breakpoint
CREATE TABLE `user_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cpu` integer DEFAULT 0 NOT NULL,
	`memory` integer DEFAULT 0 NOT NULL,
	`disk` integer DEFAULT 0 NOT NULL,
	`servers` integer DEFAULT 0 NOT NULL,
	`databases` integer DEFAULT 0 NOT NULL,
	`backups` integer DEFAULT 0 NOT NULL,
	`allocations` integer DEFAULT 0 NOT NULL,
	`allow_overprovision` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_allocations_user_id_unique` ON `user_allocations` (`user_id`);--> statement-breakpoint
ALTER TABLE `servers` ADD `backup_limit` integer DEFAULT 3 NOT NULL;