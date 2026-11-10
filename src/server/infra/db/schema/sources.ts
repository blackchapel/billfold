import { boolean, check, index, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, id, updatedAt } from "./common";
import { connections } from "./connections";
import { orgs, users } from "./identity";

/** A rule set that picks out one kind of bill email. The static PDF password, if any, is sealed before it reaches this table. */
export const sources = pgTable("sources", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Restrict: a connection that sources still read from cannot be deleted out from under them.
  connectionId: uuid("connection_id").notNull().references(() => connections.id, { onDelete: "restrict" }),
  senders: jsonb("senders").$type<string[]>().notNull(),
  subjectContains: text("subject_contains"),
  attachmentNameContains: text("attachment_name_contains"),
  requireAttachment: boolean("require_attachment").notNull().default(true),
  passwordMode: text("password_mode").notNull().default("none"),
  passwordPattern: text("password_pattern"),
  passwordCiphertext: text("password_ciphertext"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("sources_org_name_uq").on(t.orgId, sql`lower(${t.name})`),
  index("sources_org_idx").on(t.orgId),
  index("sources_connection_idx").on(t.connectionId),
  check("sources_password_mode_ck", sql`${t.passwordMode} in ('none','static','subject_brackets','subject_pattern')`),
]);

/** A saved way of running: which sources to read, and the Drive account and folder to file into. */
export const runConfigs = pgTable("run_configs", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  driveConnectionId: uuid("drive_connection_id").notNull().references(() => connections.id, { onDelete: "restrict" }),
  driveFolder: text("drive_folder").notNull().default("Billfold"),
  periodMode: text("period_mode").notNull().default("previous_month"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("run_configs_org_name_uq").on(t.orgId, sql`lower(${t.name})`),
  index("run_configs_org_idx").on(t.orgId),
  index("run_configs_drive_idx").on(t.driveConnectionId),
  check("run_configs_period_mode_ck", sql`${t.periodMode} in ('previous_month','current_month')`),
]);

export const runConfigSources = pgTable("run_config_sources", {
  runConfigId: uuid("run_config_id").notNull().references(() => runConfigs.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.runConfigId, t.sourceId] }), index("run_config_sources_source_idx").on(t.sourceId)]);
