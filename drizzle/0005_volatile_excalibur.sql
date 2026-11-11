ALTER TABLE "bills" DROP CONSTRAINT "bills_method_ck";--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bills_org_due_idx" ON "bills" USING btree ("org_id","due_date");--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_method_ck" CHECK ("bills"."method" in ('text','gemini','manual'));