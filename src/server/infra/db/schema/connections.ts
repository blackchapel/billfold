import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { ConnectionConfig } from "@/domain/value-objects/connection";
import { createdAt, id, updatedAt } from "./common";
import { orgs, users } from "./identity";

/** Linked Gmail / Drive / mail-server accounts. Secrets are sealed with the org's data key before they reach this table. */
export const connections = pgTable("connections", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  label: text("label").notNull(),
  accountEmail: text("account_email").notNull(),
  config: jsonb("config").$type<ConnectionConfig>().notNull().default({}),
  secretCiphertext: text("secret_ciphertext").notNull(),
  status: text("status").notNull().default("active"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("connections_org_kind_account_uq").on(t.orgId, t.kind, t.accountEmail),
  index("connections_org_idx").on(t.orgId),
  check("connections_kind_ck", sql`${t.kind} in ('google_drive','gmail','imap','smtp')`),
  check("connections_status_ck", sql`${t.status} in ('active','needs_attention')`),
]);
