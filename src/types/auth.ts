import type { Role, Permission } from "@/domain/policies/permissions";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
}

export interface OrgSummaryDto {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

export interface PermissionSetDto {
  role: Role;
  permissions: Permission[];
}
