CREATE TABLE `wings_activity_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`server_id` text,
	`node_id` integer,
	`event` text NOT NULL,
	`metadata` text DEFAULT '{}',
	`ip` text DEFAULT '',
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_wings_activity_server` ON `wings_activity_logs` (`server_id`);--> statement-breakpoint
CREATE INDEX `idx_wings_activity_node` ON `wings_activity_logs` (`node_id`);--> statement-breakpoint
CREATE INDEX `idx_wings_activity_event` ON `wings_activity_logs` (`event`);--> statement-breakpoint
CREATE INDEX `idx_wings_activity_created` ON `wings_activity_logs` (`created_at`);