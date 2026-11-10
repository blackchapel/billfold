import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, check, char, smallint } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, id, updatedAt } from "./common";

export const platformAllowlist = pgTable("platform_allowlist", {
  id: id(),
  email: text("email").notNull(),
  addedBy: uuid("added_by"),
  note: text("note"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("platform_allowlist_email_uq").on(t.email)]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // equals the Supabase auth user id
  email: text("email").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  lastActiveOrgId: uuid("last_active_org_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

export const currencies = pgTable("currencies", {
  code: char("code", { length: 3 }).primaryKey(),
  minorUnits: smallint("minor_units").notNull(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const orgs = pgTable("orgs", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  defaultCurrency: char("default_currency", { length: 3 }).notNull().references(() => currencies.code),
  geminiModel: text("gemini_model"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("orgs_slug_uq").on(t.slug)]);

export const orgKeys = pgTable("org_keys", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  wrappedDataKey: text("wrapped_data_key").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [uniqueIndex("org_keys_org_version_uq").on(t.orgId, t.keyVersion)]);

export const orgMembers = pgTable("org_members", {
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  permissionOverrides: jsonb("permission_overrides").$type<Record<string, boolean>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  primaryKey({ columns: [t.orgId, t.userId] }),
  index("org_members_user_idx").on(t.userId),
  check("org_members_role_ck", sql`${t.role} in ('owner','admin','member','viewer')`),
]);

export const orgInvites = pgTable("org_invites", {
  id: id(),
  orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  role: text("role").notNull(),
  maxUses: integer("max_uses").notNull().default(1),
  useCount: integer("use_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("org_invites_code_hash_uq").on(t.codeHash),
  index("org_invites_org_idx").on(t.orgId),
  check("org_invites_role_ck", sql`${t.role} in ('admin','member','viewer')`),
]);

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  orgId: uuid("org_id").references(() => orgs.id, { onDelete: "set null" }),
  actorUserId: uuid("actor_user_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("audit_logs_org_created_idx").on(t.orgId, t.createdAt)]);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});
