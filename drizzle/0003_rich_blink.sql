CREATE TABLE "run_config_sources" (
	"run_config_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	CONSTRAINT "run_config_sources_run_config_id_source_id_pk" PRIMARY KEY("run_config_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "run_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"drive_connection_id" uuid NOT NULL,
	"drive_folder" text DEFAULT 'Billfold' NOT NULL,
	"period_mode" text DEFAULT 'previous_month' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_configs_period_mode_ck" CHECK ("run_configs"."period_mode" in ('previous_month','current_month'))
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"connection_id" uuid NOT NULL,
	"senders" jsonb NOT NULL,
	"subject_contains" text,
	"attachment_name_contains" text,
	"require_attachment" boolean DEFAULT true NOT NULL,
	"password_mode" text DEFAULT 'none' NOT NULL,
	"password_pattern" text,
	"password_ciphertext" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_password_mode_ck" CHECK ("sources"."password_mode" in ('none','static','subject_brackets','subject_pattern'))
);
--> statement-breakpoint
ALTER TABLE "run_config_sources" ADD CONSTRAINT "run_config_sources_run_config_id_run_configs_id_fk" FOREIGN KEY ("run_config_id") REFERENCES "public"."run_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_config_sources" ADD CONSTRAINT "run_config_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_configs" ADD CONSTRAINT "run_configs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_configs" ADD CONSTRAINT "run_configs_drive_connection_id_connections_id_fk" FOREIGN KEY ("drive_connection_id") REFERENCES "public"."connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_configs" ADD CONSTRAINT "run_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_config_sources_source_idx" ON "run_config_sources" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "run_configs_org_name_uq" ON "run_configs" USING btree ("org_id",lower("name"));--> statement-breakpoint
CREATE INDEX "run_configs_org_idx" ON "run_configs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "run_configs_drive_idx" ON "run_configs" USING btree ("drive_connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_org_name_uq" ON "sources" USING btree ("org_id",lower("name"));--> statement-breakpoint
CREATE INDEX "sources_org_idx" ON "sources" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sources_connection_idx" ON "sources" USING btree ("connection_id");
--> statement-breakpoint
-- Deny by default, same as every other table: no policies, so the public Supabase roles can read nothing.
ALTER TABLE "sources" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "run_configs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "run_config_sources" ENABLE ROW LEVEL SECURITY;
