import { bigint, boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, id, updatedAt } from "./common";
import { connections } from "./connections";
import { orgs, users } from "./identity";

/** People a summary can be sent to. A name and an address, nothing else. */
export const recipients = pgTable("recipients", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("recipients_org_email_uq").on(t.orgId, sql`lower(${t.email})`), index("recipients_org_idx").on(t.orgId)]);

/** The wording of a summary email. Placeholders such as {{month}} are filled in when it is prepared. */
export const emailTemplates = pgTable("email_templates", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  intro: text("intro").notNull().default(""),
  signoff: text("signoff").notNull().default(""),
  isDefault: boolean("is_default").notNull().default(false),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("email_templates_org_name_uq").on(t.orgId, sql`lower(${t.name})`),
  // At most one default template per organisation.
  uniqueIndex("email_templates_one_default_uq").on(t.orgId).where(sql`${t.isDefault}`),
]);

/**
 * One "send summary" action. The finished subject and bodies are stored as they went out, so the log shows exactly what people
 * received and a retry sends the same message, even if bills or the template change later.
 */
export const sends = pgTable("sends", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  periodKey: text("period_key").notNull(),
  templateName: text("template_name").notNull(),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text").notNull(),
  // Set null so the mail connection can be removed later; the account name stays for the record.
  fromConnectionId: uuid("from_connection_id").references(() => connections.id, { onDelete: "set null" }),
  fromAccount: text("from_account").notNull(),
  attachmentFileIds: jsonb("attachment_file_ids").$type<string[]>().notNull().default([]),
  attachmentBytes: integer("attachment_bytes").notNull().default(0),
  billCount: integer("bill_count").notNull().default(0),
  totalMinor: bigint("total_minor", { mode: "bigint" }).notNull(),
  isTest: boolean("is_test").notNull().default(false),
  status: text("status").notNull().default("sending"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("sends_org_created_idx").on(t.orgId, t.createdAt),
  check("sends_status_ck", sql`${t.status} in ('sending','sent','sent_with_errors','failed','cancelled')`),
  check("sends_period_ck", sql`${t.periodKey} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
]);

/** One recipient of one send. The name and address are copied, so deleting a recipient later does not rewrite history. */
export const sendItems = pgTable("send_items", {
  id: id(),
  sendId: uuid("send_id").notNull().references(() => sends.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  recipientName: text("recipient_name").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  status: text("status").notNull().default("pending"),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("send_items_send_email_uq").on(t.sendId, sql`lower(${t.recipientEmail})`),
  index("send_items_send_status_idx").on(t.sendId, t.status),
  check("send_items_status_ck", sql`${t.status} in ('pending','processing','sent','failed','skipped')`),
]);
