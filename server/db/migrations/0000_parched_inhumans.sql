CREATE TYPE "public"."accessrole" AS ENUM('OWNER', 'USER');--> statement-breakpoint
CREATE TYPE "public"."devicecodestatus" AS ENUM('PENDING', 'APPROVED', 'DENIED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."executionstatus" AS ENUM('RECEIVED', 'STARTED', 'COMPLETED', 'FAILED', 'TIMEOUT', 'NO_DEPLOYMENT');--> statement-breakpoint
CREATE TYPE "public"."loglevel" AS ENUM('DEBUG', 'INFO', 'WARN', 'ERROR', 'LOG');--> statement-breakpoint
CREATE TYPE "public"."organizationrole" AS ENUM('OWNER', 'ADMIN', 'MEMBER');--> statement-breakpoint
CREATE TYPE "public"."principletype" AS ENUM('USER', 'WORKFLOW', 'FOLDER');--> statement-breakpoint
CREATE TYPE "public"."resourcetype" AS ENUM('WORKFLOW', 'FOLDER', 'PROVIDER');--> statement-breakpoint
CREATE TYPE "public"."runtimecreationstatus" AS ENUM('IN_PROGRESS', 'COMPLETED', 'FAILED', 'REMOVED');--> statement-breakpoint
CREATE TYPE "public"."subscriptionstatus" AS ENUM('ACTIVE', 'TRIALING', 'PAST_DUE', 'CANCELED', 'INCOMPLETE');--> statement-breakpoint
CREATE TYPE "public"."subscriptiontier" AS ENUM('FREE', 'HOBBY', 'TEAM');--> statement-breakpoint
CREATE TYPE "public"."usertype" AS ENUM('HUMAN', 'SERVICE_ACCOUNT');--> statement-breakpoint
CREATE TYPE "public"."workflowdeploymentstatus" AS ENUM('ACTIVE', 'INACTIVE', 'FAILED');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"hashed_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscription_id" uuid NOT NULL,
	"event_type" varchar(255) NOT NULL,
	"stripe_event_id" varchar(255),
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE "configurations" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"device_code" varchar(64) NOT NULL,
	"user_code" varchar(16) NOT NULL,
	"user_id" uuid,
	"status" "devicecodestatus" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_codes_device_code_unique" UNIQUE("device_code"),
	CONSTRAINT "device_codes_user_code_unique" UNIQUE("user_code")
);
--> statement-breakpoint
CREATE TABLE "execution_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workflow_id" uuid NOT NULL,
	"trigger_id" uuid,
	"deployment_id" uuid,
	"triggered_by_user_id" uuid,
	"status" "executionstatus" NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "execution_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"execution_history_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"log_level" "loglevel" NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incoming_webhooks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trigger_id" uuid,
	"provider_id" uuid,
	"path" text NOT NULL,
	"method" text DEFAULT 'POST' NOT NULL,
	CONSTRAINT "webhook_owner_check" CHECK (("trigger_id" IS NOT NULL AND "provider_id" IS NULL) OR ("trigger_id" IS NULL AND "provider_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "kv_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"table_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kv_table_permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"table_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"can_read" boolean DEFAULT true NOT NULL,
	"can_write" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kv_tables" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "namespaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_owner_id" uuid,
	"organization_owner_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chk_namespace_single_owner" CHECK ((("user_owner_id" IS NOT NULL)::int + ("organization_owner_id" IS NOT NULL)::int = 1))
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "organizationrole" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workos_organization_id" varchar(255),
	"display_name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_workos_organization_id_unique" UNIQUE("workos_organization_id")
);
--> statement-breakpoint
CREATE TABLE "provider_access" (
	"id" uuid PRIMARY KEY NOT NULL,
	"resource_type" "resourcetype" NOT NULL,
	"resource_id" uuid NOT NULL,
	"principle_type" "principletype" NOT NULL,
	"principle_id" uuid NOT NULL,
	"role" "accessrole" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"type" text NOT NULL,
	"alias" text NOT NULL,
	"encrypted_config" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"trigger_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"device_name" varchar(255),
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "runtimes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"config" jsonb,
	"config_hash" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"creation_status" "runtimecreationstatus" NOT NULL,
	"creation_logs" jsonb,
	CONSTRAINT "runtimes_config_hash_unique" UNIQUE("config_hash")
);
--> statement-breakpoint
CREATE TABLE "secrets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"provider" varchar(255) NOT NULL,
	"encrypted_value" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"stripe_customer_id" varchar(255),
	"stripe_subscription_id" varchar(255),
	"tier" "subscriptiontier" NOT NULL,
	"status" "subscriptionstatus" NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"grace_period_ends_at" timestamp with time zone,
	"cancel_at_period_end" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "subscriptions_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "triggers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workflow_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"trigger_type" text NOT NULL,
	"input" jsonb NOT NULL,
	"state" jsonb
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_type" "usertype" DEFAULT 'HUMAN' NOT NULL,
	"workos_user_id" varchar(255),
	"username" varchar(255),
	"email" varchar(255),
	"first_name" varchar(255),
	"last_name" varchar(255),
	"password_hash" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_workos_user_id_unique" UNIQUE("workos_user_id"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "workflow_deployments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workflow_id" uuid NOT NULL,
	"runtime_id" uuid NOT NULL,
	"deployed_by_id" uuid,
	"user_code" jsonb NOT NULL,
	"provider_definitions" jsonb,
	"trigger_definitions" jsonb,
	"deployed_at" timestamp DEFAULT now() NOT NULL,
	"status" "workflowdeploymentstatus" NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "workflow_folders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"parent_folder_id" uuid
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_by_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"triggers_metadata" jsonb,
	"active" boolean,
	"parent_folder_id" uuid
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_codes" ADD CONSTRAINT "device_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_history" ADD CONSTRAINT "execution_history_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_history" ADD CONSTRAINT "execution_history_trigger_id_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."triggers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_history" ADD CONSTRAINT "execution_history_deployment_id_workflow_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."workflow_deployments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_history" ADD CONSTRAINT "execution_history_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_logs" ADD CONSTRAINT "execution_logs_execution_history_id_execution_history_id_fk" FOREIGN KEY ("execution_history_id") REFERENCES "public"."execution_history"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_webhooks" ADD CONSTRAINT "incoming_webhooks_trigger_id_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."triggers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incoming_webhooks" ADD CONSTRAINT "incoming_webhooks_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kv_items" ADD CONSTRAINT "kv_items_table_id_kv_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."kv_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kv_table_permissions" ADD CONSTRAINT "kv_table_permissions_table_id_kv_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."kv_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kv_table_permissions" ADD CONSTRAINT "kv_table_permissions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kv_tables" ADD CONSTRAINT "kv_tables_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "namespaces" ADD CONSTRAINT "namespaces_user_owner_id_users_id_fk" FOREIGN KEY ("user_owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "namespaces" ADD CONSTRAINT "namespaces_organization_owner_id_organizations_id_fk" FOREIGN KEY ("organization_owner_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "providers_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_trigger_id_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."triggers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_deployments" ADD CONSTRAINT "workflow_deployments_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_deployments" ADD CONSTRAINT "workflow_deployments_runtime_id_runtimes_id_fk" FOREIGN KEY ("runtime_id") REFERENCES "public"."runtimes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_deployments" ADD CONSTRAINT "workflow_deployments_deployed_by_id_users_id_fk" FOREIGN KEY ("deployed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_folders" ADD CONSTRAINT "workflow_folders_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_folders" ADD CONSTRAINT "workflow_folders_parent_folder_id_workflow_folders_id_fk" FOREIGN KEY ("parent_folder_id") REFERENCES "public"."workflow_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_parent_folder_id_workflow_folders_id_fk" FOREIGN KEY ("parent_folder_id") REFERENCES "public"."workflow_folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_api_key_prefix" ON "api_keys" USING btree ("user_id","prefix");--> statement-breakpoint
CREATE INDEX "idx_billing_events_subscription" ON "billing_events" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "idx_billing_events_event_type" ON "billing_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_billing_events_created_at" ON "billing_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_device_codes_device_code" ON "device_codes" USING btree ("device_code");--> statement-breakpoint
CREATE INDEX "idx_device_codes_user_code" ON "device_codes" USING btree ("user_code");--> statement-breakpoint
CREATE INDEX "idx_device_codes_status" ON "device_codes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_device_codes_expires_at" ON "device_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_execution_history_workflow" ON "execution_history" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "idx_execution_history_trigger" ON "execution_history" USING btree ("trigger_id");--> statement-breakpoint
CREATE INDEX "idx_execution_history_deployment" ON "execution_history" USING btree ("deployment_id");--> statement-breakpoint
CREATE INDEX "idx_execution_history_status" ON "execution_history" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_execution_history_received_at" ON "execution_history" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "idx_execution_history_workflow_status" ON "execution_history" USING btree ("workflow_id","status");--> statement-breakpoint
CREATE INDEX "idx_execution_history_workflow_received" ON "execution_history" USING btree ("workflow_id","received_at");--> statement-breakpoint
CREATE INDEX "idx_execution_logs_execution_id" ON "execution_logs" USING btree ("execution_history_id");--> statement-breakpoint
CREATE INDEX "idx_execution_logs_timestamp" ON "execution_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_execution_logs_level" ON "execution_logs" USING btree ("log_level");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_table_key" ON "kv_items" USING btree ("table_id","key");--> statement-breakpoint
CREATE INDEX "idx_kv_items_table" ON "kv_items" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "idx_kv_items_table_key" ON "kv_items" USING btree ("table_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_table_workflow_permission" ON "kv_table_permissions" USING btree ("table_id","workflow_id");--> statement-breakpoint
CREATE INDEX "idx_kv_permissions_table" ON "kv_table_permissions" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "idx_kv_permissions_workflow" ON "kv_table_permissions" USING btree ("workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_provider_table_name" ON "kv_tables" USING btree ("provider_id","name");--> statement-breakpoint
CREATE INDEX "idx_kv_tables_provider" ON "kv_tables" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "idx_namespaces_user_owner" ON "namespaces" USING btree ("user_owner_id");--> statement-breakpoint
CREATE INDEX "idx_namespaces_organization_owner" ON "namespaces" USING btree ("organization_owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_organization_user" ON "organization_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_organization_members_organization" ON "organization_members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_organization_members_user" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_access_principal_resource" ON "provider_access" USING btree ("principle_type","principle_id","resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "idx_access_principal" ON "provider_access" USING btree ("principle_type","principle_id");--> statement-breakpoint
CREATE INDEX "idx_access_resource" ON "provider_access" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_token_hash" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_revoked_at" ON "refresh_tokens" USING btree ("revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_runtime_config_hash" ON "runtimes" USING btree ("config_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_namespace_secret" ON "secrets" USING btree ("namespace_id","name");--> statement-breakpoint
CREATE INDEX "idx_secrets_namespace" ON "secrets" USING btree ("namespace_id");--> statement-breakpoint
CREATE INDEX "idx_subscriptions_organization" ON "subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_deployments_workflow" ON "workflow_deployments" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_deployments_status" ON "workflow_deployments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_namespace_workflow" ON "workflows" USING btree ("namespace_id","name");--> statement-breakpoint
CREATE INDEX "idx_workflows_namespace" ON "workflows" USING btree ("namespace_id");--> statement-breakpoint
CREATE INDEX "idx_workflows_created_by" ON "workflows" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "idx_workflows_updated_at" ON "workflows" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_workflows_active" ON "workflows" USING btree ("active");