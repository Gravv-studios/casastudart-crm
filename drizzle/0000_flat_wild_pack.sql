CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`label` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_activity_created_at` ON `activity` (`created_at`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_records_kind` ON `records` (`kind`);