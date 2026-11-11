"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/types/action";
import { container } from "../../composition-root/container";
import { runAction } from "../action-result";
import { requireOrgFresh } from "../session";

const schema = z.object({
  name: z.string().trim().min(2, "Name must be 2 to 60 characters").max(60, "Name must be 2 to 60 characters"),
  subject: z.string().max(400, "The subject is too long."),
  intro: z.string().max(4000, "The opening text is too long."),
  signoff: z.string().max(1000, "The closing text is too long."),
});

export async function saveTemplateAction(slug: string, templateId: string | null, _p: ActionState | null, form: FormData): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const parsed = schema.safeParse({ name: form.get("name"), subject: form.get("subject") ?? "", intro: form.get("intro") ?? "", signoff: form.get("signoff") ?? "" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the details and try again.", code: "validation" };
  const result = await runAction(async () => {
    await container().saveTemplate.execute({ actorId: user.id, orgId: membership.orgId, ...(templateId ? { id: templateId } : {}), ...parsed.data });
  });
  if (result.ok) {
    revalidatePath(`/${slug}/templates`);
    redirect(`/${slug}/templates`);
  }
  return result;
}

/** `templateId` null goes back to the built-in wording. */
export async function setDefaultTemplateAction(slug: string, templateId: string | null, _prev: ActionState | null): Promise<ActionState> { // eslint-disable-line @typescript-eslint/no-unused-vars
  const { user, membership } = await requireOrgFresh(slug);
  const result = await runAction(async () => { await container().setDefaultTemplate.execute({ actorId: user.id, orgId: membership.orgId, templateId }); });
  revalidatePath(`/${slug}/templates`);
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function deleteTemplateAction(slug: string, templateId: string, _prev: ActionState | null): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const result = await runAction(async () => { await container().deleteTemplate.execute({ actorId: user.id, orgId: membership.orgId, templateId }); });
  revalidatePath(`/${slug}/templates`);
  return result;
}
