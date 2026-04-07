CREATE TABLE `capabilities` (
	`provider_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT true NOT NULL,
	`source` text NOT NULL,
	`input_schema` text,
	`output_schema` text,
	`execution_method` text,
	`execution_url` text,
	`execution_headers` text,
	`execution_body_template` text,
	`pricing_model` text,
	`pricing_amount` real,
	`pricing_currency` text,
	`pricing_item_field` text,
	`floor` real,
	`ceiling` real,
	`customer_description` text,
	`source_hash` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`provider_id`, `name`),
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "source_check" CHECK(source IN ('openapi', 'mcp', 'manual', 'inferred')),
	CONSTRAINT "execution_method_check" CHECK(execution_method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE'))
);
--> statement-breakpoint
CREATE TABLE `decision_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` text NOT NULL,
	`action` text NOT NULL,
	`platform` text,
	`detail` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `inbound_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source` text NOT NULL,
	`channel` text,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`headers` text,
	`received_at` text NOT NULL,
	`delivered_at` text,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`capability_name` text NOT NULL,
	`platform` text NOT NULL,
	`platform_ref` text NOT NULL,
	`status` text NOT NULL,
	`input_hash` text,
	`output_hash` text,
	`payment_protocol` text,
	`payment_status` text,
	`payment_amount` real,
	`payment_currency` text,
	`llm_input_tokens` integer,
	`llm_output_tokens` integer,
	`llm_estimated_cost` real,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "job_status_check" CHECK(status IN ('pending', 'executing', 'completed', 'failed')),
	CONSTRAINT "payment_status_check" CHECK(payment_status IN ('none', 'required', 'pending', 'failed'))
);
--> statement-breakpoint
CREATE TABLE `llm_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider_id` text NOT NULL,
	`model` text NOT NULL,
	`prompt_tokens` integer NOT NULL,
	`completion_tokens` integer NOT NULL,
	`total_tokens` integer NOT NULL,
	`estimated_cost` real,
	`currency` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `platforms` (
	`provider_id` text NOT NULL,
	`base_url` text NOT NULL,
	`platform_name` text NOT NULL,
	`agent_id` text,
	`last_active_at` text,
	`metadata` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`provider_id`, `base_url`),
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`external_auth_id` text,
	`plan` text DEFAULT 'free' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `secrets` (
	`provider_id` text NOT NULL,
	`platform` text NOT NULL,
	`key` text NOT NULL,
	`encrypted_value` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`provider_id`, `platform`, `key`),
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `state` (
	`provider_id` text NOT NULL,
	`namespace` text NOT NULL,
	`key` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`provider_id`, `namespace`, `key`),
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `wallets` (
	`provider_id` text NOT NULL,
	`chain` text NOT NULL,
	`public_key` text NOT NULL,
	`encrypted_private_key` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`provider_id`, `chain`),
	FOREIGN KEY (`provider_id`) REFERENCES `providers`(`id`) ON UPDATE no action ON DELETE no action
);
