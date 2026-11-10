import { bigint, boolean, char, check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, id, updatedAt } from "./common";
import { connections } from "./connections";
import { currencies, orgs, users } from "./identity";
import { runConfigs, sources } from "./sources";

/** One bill read from one email. `message_key` makes sure the same email is never filed twice, even in a later run. */
export const bills = pgTable("bills", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  periodKey: text("period_key").notNull(),
  sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
  sourceName: text("source_name").notNull(),
  billerName: text("biller_name").notNull(),
  amountMinor: bigint("amount_minor", { mode: "bigint" }),
  currency: char("currency", { length: 3 }).notNull().references(() => currencies.code),
  billDate: date("bill_date", { mode: "string" }),
  dueDate: date("due_date", { mode: "string" }),
  confidence: text("confidence").notNull(),
  method: text("method").notNull(),
  needsReview: boolean("needs_review").notNull().default(false),
  note: text("note"),
  messageKey: text("message_key").notNull(),
  // Set when someone checks or corrects the bill. A bill that only the reader has seen has these empty.
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  // Soft delete: the row stays so the same email is not filed again by the next run, and it can be restored.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: uuid("deleted_by").references(() => users.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("bills_org_message_key_uq").on(t.orgId, t.messageKey),
  index("bills_org_period_idx").on(t.orgId, t.periodKey),
  index("bills_org_due_idx").on(t.orgId, t.dueDate),
  // Match the page queries: month lists and counts only look at bills that are not deleted, and the reports also pick out the
  // unpaid and the flagged ones from every month. Small partial indexes keep those lookups fast however many old bills exist.
  index("bills_org_live_period_idx").on(t.orgId, t.periodKey).where(sql`${t.deletedAt} is null`),
  index("bills_org_attention_idx").on(t.orgId).where(sql`${t.deletedAt} is null and (${t.paidAt} is null or ${t.needsReview})`),
  check("bills_period_ck", sql`${t.periodKey} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  check("bills_confidence_ck", sql`${t.confidence} in ('high','medium','low')`),
  check("bills_method_ck", sql`${t.method} in ('text','gemini','manual')`),
]);

/** The PDF copy in Google Drive. Only ids, a link and a hash are kept here; the bytes live in Drive. */
export const billFiles = pgTable("bill_files", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  billId: uuid("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  // Set null so a Drive connection can still be removed; the account name is kept for the record.
  driveConnectionId: uuid("drive_connection_id").references(() => connections.id, { onDelete: "set null" }),
  driveAccount: text("drive_account").notNull(),
  driveFileId: text("drive_file_id").notNull(),
  driveFolderId: text("drive_folder_id").notNull(),
  webViewLink: text("web_view_link").notNull(),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(),
  createdAt: createdAt(),
}, (t) => [index("bill_files_org_bill_idx").on(t.orgId, t.billId)]);

export const runs = pgTable("runs", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  runConfigId: uuid("run_config_id").references(() => runConfigs.id, { onDelete: "set null" }),
  configName: text("config_name").notNull(),
  periodKey: text("period_key").notNull(),
  // Copied from the run configuration when the run starts, so changing or deleting the configuration cannot break a run in progress.
  driveConnectionId: uuid("drive_connection_id").references(() => connections.id, { onDelete: "set null" }),
  driveFolder: text("drive_folder").notNull(),
  status: text("status").notNull().default("processing"),
  startedBy: uuid("started_by").notNull().references(() => users.id),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("runs_org_created_idx").on(t.orgId, t.createdAt),
  check("runs_status_ck", sql`${t.status} in ('processing','completed','completed_with_errors','cancelled')`),
  check("runs_period_ck", sql`${t.periodKey} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
]);

/** One email (or one PDF in it) that a run has to file. Worked through one per request. */
export const runItems = pgTable("run_items", {
  id: id(),
  runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
  sourceName: text("source_name").notNull(),
  messageId: text("message_id").notNull(),
  messageDate: timestamp("message_date", { withTimezone: true }).notNull(),
  fromAddress: text("from_address").notNull(),
  subject: text("subject").notNull(),
  attachmentName: text("attachment_name"),
  itemKey: text("item_key").notNull(),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  billId: uuid("bill_id").references(() => bills.id, { onDelete: "set null" }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("run_items_run_key_uq").on(t.runId, t.itemKey),
  index("run_items_run_status_idx").on(t.runId, t.status),
  check("run_items_status_ck", sql`${t.status} in ('pending','processing','done','failed','skipped')`),
]);
