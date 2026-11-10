import { PERMISSIONS } from "@/constants/permissions";
import { ROLES } from "@/constants/roles";

export type Permission = (typeof PERMISSIONS)[number];
export type Role = (typeof ROLES)[number];

/** Per-member overrides: true grants, false revokes. */
export type PermissionOverrides = Partial<Record<Permission, boolean>>;

const ALL: readonly Permission[] = PERMISSIONS;
const READ_ONLY: readonly Permission[] = [];

export const ROLE_DEFAULTS: Record<Role, readonly Permission[]> = {
  owner: ALL,
  admin: ALL.filter((p) => p !== "org.delete" && p !== "org.transfer"),
  member: ["runs.execute", "bills.edit"],
  viewer: READ_ONLY,
};

export function effectivePermissions(role: Role, overrides: PermissionOverrides = {}): Permission[] {
  const set = new Set<Permission>(ROLE_DEFAULTS[role]);
  for (const [permission, allowed] of Object.entries(overrides) as [Permission, boolean][]) {
    if (!ALL.includes(permission)) continue;
    if (allowed) set.add(permission);
    else set.delete(permission);
  }
  // The owner can never be locked out of the essentials.
  if (role === "owner") ALL.forEach((p) => set.add(p));
  return [...set];
}

export function can(role: Role, overrides: PermissionOverrides, permission: Permission): boolean {
  return effectivePermissions(role, overrides).includes(permission);
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
