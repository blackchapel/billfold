"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isRole } from "@/domain/policies/permissions";
import type { ActionState } from "@/types/action";
import { container } from "../../composition-root/container";
import { runAction } from "../action-result";
import { requireOrg } from "../session";

const schema = z.object({
  role: z.string().refine(isRole, "Choose a role"),
  maxUses: z.coerce.number().int().min(1).max(100),
  expiresInDays: z.coerce.number().int().min(1).max(90),
});

export async function createInviteAction(slug: string, _prev: ActionState<string> | null, form: FormData): Promise<ActionState<string>> {
  const { user, membership } = await requireOrg(slug);
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Check the role, uses and expiry.", code: "validation" };
  const result = await runAction(async () => {
    const { code } = await container().createInvite.execute({
      userId: user.id, orgId: membership.orgId, role: parsed.data.role as never,
      maxUses: parsed.data.maxUses, expiresInDays: parsed.data.expiresInDays,
    });
    return code;
  });
  revalidatePath(`/${slug}/invites`);
  return result;
}

export async function revokeInviteAction(slug: string, inviteId: string): Promise<void> {
  const { user, membership } = await requireOrg(slug);
  await container().revokeInvite.execute({ userId: user.id, orgId: membership.orgId, inviteId });
  revalidatePath(`/${slug}/invites`);
}
