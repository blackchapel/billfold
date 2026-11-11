CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"account_email" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_kind_ck" CHECK ("connections"."kind" in ('google_drive','gmail','imap','smtp')),
	CONSTRAINT "connections_status_ck" CHECK ("connections"."status" in ('active','needs_attention'))
);
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connections_org_kind_account_uq" ON "connections" USING btree ("org_id","kind","account_email");--> statement-breakpoint
CREATE INDEX "connections_org_idx" ON "connections" USING btree ("org_id");
--> statement-breakpoint
-- Deny by default, same as every other table: no policies, so the public Supabase roles can read nothing.
ALTER TABLE "connections" ENABLE ROW LEVEL SECURITY;
