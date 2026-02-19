CREATE TABLE `activity_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text,
	`server_id` text,
	`event` text NOT NULL,
	`metadata` text DEFAULT '{}',
	`ip` text DEFAULT '',
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_activity_server` ON `activity_logs` (`server_id`);--> statement-breakpoint
CREATE INDEX `idx_activity_user` ON `activity_logs` (`user_id`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`identifier` text NOT NULL,
	`token_hash` text NOT NULL,
	`memo` text DEFAULT '',
	`allowed_ips` text DEFAULT '[]',
	`last_used_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_identifier_unique` ON `api_keys` (`identifier`);--> statement-breakpoint
CREATE TABLE `egg_variables` (
	`id` text PRIMARY KEY NOT NULL,
	`egg_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '',
	`env_variable` text NOT NULL,
	`default_value` text DEFAULT '',
	`user_viewable` integer DEFAULT 0 NOT NULL,
	`user_editable` integer DEFAULT 0 NOT NULL,
	`rules` text DEFAULT 'required|string' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`egg_id`) REFERENCES `eggs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_egg_variables_egg` ON `egg_variables` (`egg_id`);--> statement-breakpoint
CREATE TABLE `eggs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '',
	`docker_image` text DEFAULT '' NOT NULL,
	`startup` text DEFAULT '' NOT NULL,
	`stop_command` text DEFAULT 'stop' NOT NULL,
	`stop_signal` text DEFAULT 'SIGTERM' NOT NULL,
	`config_startup` text DEFAULT '{}',
	`config_files` text DEFAULT '[]',
	`config_logs` text DEFAULT '{}',
	`script_install` text DEFAULT '',
	`script_container` text DEFAULT 'ghcr.io/pelican-dev/installer:latest',
	`script_entry` text DEFAULT 'bash',
	`file_denylist` text DEFAULT '[]',
	`features` text DEFAULT '{}',
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`token_id` text NOT NULL,
	`token` text NOT NULL,
	`memory` integer DEFAULT 0 NOT NULL,
	`memory_overallocate` integer DEFAULT 0 NOT NULL,
	`disk` integer DEFAULT 0 NOT NULL,
	`disk_overallocate` integer DEFAULT 0 NOT NULL,
	`upload_size` integer DEFAULT 100 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `server_variables` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`variable_id` text NOT NULL,
	`variable_value` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variable_id`) REFERENCES `egg_variables`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_server_variables_server` ON `server_variables` (`server_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_sv_unique` ON `server_variables` (`server_id`,`variable_id`);--> statement-breakpoint
CREATE TABLE `servers` (
	`id` text PRIMARY KEY NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '',
	`node_id` integer NOT NULL,
	`owner_id` text NOT NULL,
	`egg_id` text,
	`memory` integer DEFAULT 512 NOT NULL,
	`disk` integer DEFAULT 1024 NOT NULL,
	`cpu` integer DEFAULT 100 NOT NULL,
	`swap` integer DEFAULT 0 NOT NULL,
	`io` integer DEFAULT 500 NOT NULL,
	`threads` text,
	`oom_killer` integer DEFAULT 1 NOT NULL,
	`startup` text DEFAULT '' NOT NULL,
	`image` text DEFAULT '' NOT NULL,
	`default_allocation_ip` text DEFAULT '0.0.0.0' NOT NULL,
	`default_allocation_port` integer DEFAULT 25565 NOT NULL,
	`additional_allocations` text DEFAULT '[]',
	`status` text,
	`installed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`egg_id`) REFERENCES `eggs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `servers_uuid_unique` ON `servers` (`uuid`);--> statement-breakpoint
CREATE INDEX `idx_servers_node` ON `servers` (`node_id`);--> statement-breakpoint
CREATE INDEX `idx_servers_owner` ON `servers` (`owner_id`);--> statement-breakpoint
CREATE TABLE `subusers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`server_id` text NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_su_unique` ON `subusers` (`user_id`,`server_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);