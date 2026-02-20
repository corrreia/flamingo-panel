ALTER TABLE `activity_logs` ADD `node_id` integer REFERENCES nodes(id);--> statement-breakpoint
CREATE INDEX `idx_activity_node` ON `activity_logs` (`node_id`);--> statement-breakpoint
CREATE INDEX `idx_activity_event` ON `activity_logs` (`event`);--> statement-breakpoint
CREATE INDEX `idx_activity_created` ON `activity_logs` (`created_at`);