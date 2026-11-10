"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSIONS } from "@/constants/permissions";
import { isRole, type PermissionOverrides } from "@/domain/policies/permissions";
import type { ActionState } from "@/types/action";
import { container } from "../../composition-root/container";
import { runAction } from "../action-result";
import { requireOrg } from "../session";

export async function changeRoleAction(slug: string, targetUserId: string, _p: ActionState | null, form: FormData): Promise<ActionState> {
  const { user, membership } = await requireOrg(slug);
  const role = String(form.get("role") ?? "");
  if (!isRole(role)) return { ok: false, message: "Choose a role.", code: "validation" };
  const result = await runAction(() => container().changeMemberRole.execute({ actorId: user.id, orgId: membership.orgId, targetUserId, role }));
  revalidatePath(`/${slug}/members`);
  return result;
}

const overridesSchema = z.record(z.string(), z.enum(["grant", "revoke", "default"]));

export async function setOverridesAction(slug: string, targetUserId: string, _p: ActionState | null, form: FormData): Promise<ActionState> {
  const { user, membership } = await requireOrg(slug);
  const parsed = overridesSchema.safeParse(Object.fromEntries([...form.entries()].filter(([k]) => k.startsWith("perm:")).map(([k, v]) => [k.slice(5), v])));
  if (!parsed.success) return { ok: false, message: "Invalid permissions.", code: "validation" };
  const overrides: PermissionOverrides = {};
  for (const [perm, state] of Object.entries(parsed.data)) {
    if (!(PERMISSIONS as readonly string[]).includes(perm) || state === "default") continue;
    overrides[perm as (typeof PERMISSIONS)[number]] = state === "grant";
  }
  const result = await runAction(() => container().setMemberOverrides.execute({ actorId: user.id, orgId: membership.orgId, targetUserId, overrides }));
  revalidatePath(`/${slug}/members`);
  return result;
}

export async function removeMemberAction(slug: string, targetUserId: string): Promise<void> {
  const { user, membership } = await requireOrg(slug);
  await container().removeMember.execute({ actorId: user.id, orgId: membership.orgId, targetUserId });
  revalidatePath(`/${slug}/members`);
}
