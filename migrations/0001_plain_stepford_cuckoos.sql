ALTER TABLE `eggs` ADD `author` text DEFAULT '';--> statement-breakpoint
ALTER TABLE `eggs` ADD `docker_images` text DEFAULT '{}';--> statement-breakpoint
ALTER TABLE `eggs` ADD `tags` text DEFAULT '[]';