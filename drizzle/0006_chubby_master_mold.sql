CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"signoff" text DEFAULT '' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "send_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"send_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "send_items_status_ck" CHECK ("send_items"."status" in ('pending','processing','sent','failed','skipped'))
);
--> statement-breakpoint
CREATE TABLE "sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"period_key" text NOT NULL,
	"template_name" text NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text NOT NULL,
	"from_connection_id" uuid,
	"from_account" text NOT NULL,
	"attachment_file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"attachment_bytes" integer DEFAULT 0 NOT NULL,
	"bill_count" integer DEFAULT 0 NOT NULL,
	"total_minor" bigint NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'sending' NOT NULL,
	"created_by" uuid NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sends_status_ck" CHECK ("sends"."status" in ('sending','sent','sent_with_errors','failed','cancelled')),
	CONSTRAINT "sends_period_ck" CHECK ("sends"."period_key" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_items" ADD CONSTRAINT "send_items_send_id_sends_id_fk" FOREIGN KEY ("send_id") REFERENCES "public"."sends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_items" ADD CONSTRAINT "send_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sends" ADD CONSTRAINT "sends_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sends" ADD CONSTRAINT "sends_from_connection_id_connections_id_fk" FOREIGN KEY ("from_connection_id") REFERENCES "public"."connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sends" ADD CONSTRAINT "sends_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_org_name_uq" ON "email_templates" USING btree ("org_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_one_default_uq" ON "email_templates" USING btree ("org_id") WHERE "email_templates"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "recipients_org_email_uq" ON "recipients" USING btree ("org_id",lower("email"));--> statement-breakpoint
CREATE INDEX "recipients_org_idx" ON "recipients" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "send_items_send_email_uq" ON "send_items" USING btree ("send_id",lower("recipient_email"));--> statement-breakpoint
CREATE INDEX "send_items_send_status_idx" ON "send_items" USING btree ("send_id","status");--> statement-breakpoint
CREATE INDEX "sends_org_created_idx" ON "sends" USING btree ("org_id","created_at");
--> statement-breakpoint
-- Deny by default, same as every other table: no policies, so the public Supabase roles can read nothing.
ALTER TABLE "recipients" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "email_templates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sends" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "send_items" ENABLE ROW LEVEL SECURITY;
