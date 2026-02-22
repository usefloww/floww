ALTER TABLE "provider_access" ADD COLUMN "policy_rules" jsonb;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "default_policy_rules" jsonb;