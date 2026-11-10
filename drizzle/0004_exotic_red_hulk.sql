CREATE TABLE "bill_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"drive_connection_id" uuid,
	"drive_account" text NOT NULL,
	"drive_file_id" text NOT NULL,
	"drive_folder_id" text NOT NULL,
	"web_view_link" text NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"period_key" text NOT NULL,
	"source_id" uuid,
	"source_name" text NOT NULL,
	"biller_name" text NOT NULL,
	"amount_minor" bigint,
	"currency" char(3) NOT NULL,
	"bill_date" date,
	"due_date" date,
	"confidence" text NOT NULL,
	"method" text NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"note" text,
	"message_key" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bills_period_ck" CHECK ("bills"."period_key" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "bills_confidence_ck" CHECK ("bills"."confidence" in ('high','medium','low')),
	CONSTRAINT "bills_method_ck" CHECK ("bills"."method" in ('text','gemini'))
);
--> statement-breakpoint
CREATE TABLE "run_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"source_id" uuid,
	"source_name" text NOT NULL,
	"message_id" text NOT NULL,
	"message_date" timestamp with time zone NOT NULL,
	"from_address" text NOT NULL,
	"subject" text NOT NULL,
	"attachment_name" text,
	"item_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"bill_id" uuid,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_items_status_ck" CHECK ("run_items"."status" in ('pending','processing','done','failed','skipped'))
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"run_config_id" uuid,
	"config_name" text NOT NULL,
	"period_key" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"started_by" uuid NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runs_status_ck" CHECK ("runs"."status" in ('processing','completed','completed_with_errors','cancelled')),
	CONSTRAINT "runs_period_ck" CHECK ("runs"."period_key" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
ALTER TABLE "bill_files" ADD CONSTRAINT "bill_files_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_files" ADD CONSTRAINT "bill_files_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_files" ADD CONSTRAINT "bill_files_drive_connection_id_connections_id_fk" FOREIGN KEY ("drive_connection_id") REFERENCES "public"."connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_items" ADD CONSTRAINT "run_items_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_items" ADD CONSTRAINT "run_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_items" ADD CONSTRAINT "run_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_items" ADD CONSTRAINT "run_items_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_run_config_id_run_configs_id_fk" FOREIGN KEY ("run_config_id") REFERENCES "public"."run_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_files_org_bill_idx" ON "bill_files" USING btree ("org_id","bill_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bills_org_message_key_uq" ON "bills" USING btree ("org_id","message_key");--> statement-breakpoint
CREATE INDEX "bills_org_period_idx" ON "bills" USING btree ("org_id","period_key");--> statement-breakpoint
CREATE UNIQUE INDEX "run_items_run_key_uq" ON "run_items" USING btree ("run_id","item_key");--> statement-breakpoint
CREATE INDEX "run_items_run_status_idx" ON "run_items" USING btree ("run_id","status");--> statement-breakpoint
CREATE INDEX "runs_org_created_idx" ON "runs" USING btree ("org_id","created_at");
--> statement-breakpoint
-- Deny by default, same as every other table: no policies, so the public Supabase roles can read nothing.
ALTER TABLE "bills" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bill_files" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "run_items" ENABLE ROW LEVEL SECURITY;
