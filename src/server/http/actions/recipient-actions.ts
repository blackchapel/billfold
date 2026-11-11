"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/types/action";
import { container } from "../../composition-root/container";
import { runAction } from "../action-result";
import { requireOrgFresh } from "../session";

const schema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(80, "Name must be 1 to 80 characters, on one line."),
  email: z.string().trim().min(3, "Enter a valid email address.").max(254, "Enter a valid email address."),
});

export async function saveRecipientAction(slug: string, recipientId: string | null, _p: ActionState | null, form: FormData): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const parsed = schema.safeParse({ name: form.get("name"), email: form.get("email") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the details and try again.", code: "validation" };
  const result = await runAction(async () => {
    await container().saveRecipient.execute({ actorId: user.id, orgId: membership.orgId, ...(recipientId ? { id: recipientId } : {}), ...parsed.data });
  });
  if (result.ok) {
    revalidatePath(`/${slug}/recipients`);
    if (recipientId) redirect(`/${slug}/recipients`);
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function deleteRecipientAction(slug: string, recipientId: string, _prev: ActionState | null): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const result = await runAction(async () => { await container().deleteRecipient.execute({ actorId: user.id, orgId: membership.orgId, recipientId }); });
  revalidatePath(`/${slug}/recipients`);
  return result;
}
