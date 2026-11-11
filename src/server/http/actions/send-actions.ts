"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/types/action";
import type { PreviewDto, SendStepDto } from "@/types/send";
import { container } from "../../composition-root/container";
import { runAction } from "../action-result";
import { toPreviewDto, toSendItemDto } from "../queries/send-queries";
import { requireOrgFresh } from "../session";

const optionsSchema = z.object({
  periodKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a month."),
  templateId: z.string().uuid().or(z.literal("")).transform((v) => v || null),
  attachPdfs: z.boolean(),
});
const previewSchema = optionsSchema.extend({ connectionId: z.string().uuid().or(z.literal("")).transform((v) => v || null) });
const startSchema = optionsSchema.extend({
  connectionId: z.string().uuid("Choose the account to send from."),
  recipientIds: z.array(z.string().uuid()),
  intent: z.enum(["send", "test"]),
});

const invalid = (issue: string | undefined): ActionState<never> => ({ ok: false, message: issue ?? "Check the details and try again.", code: "validation" });

const readOptions = (form: FormData) => ({ periodKey: form.get("periodKey"), templateId: form.get("templateId") ?? "", attachPdfs: form.get("attachPdfs") === "on" });

/** Builds the finished email exactly as it would go out, without sending anything. */
export async function previewSendAction(slug: string, form: FormData): Promise<ActionState<PreviewDto>> {
  const { user, membership } = await requireOrgFresh(slug);
  const parsed = previewSchema.safeParse({ ...readOptions(form), connectionId: form.get("connectionId") ?? "" });
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  return runAction(async () => toPreviewDto(await container().previewSend.execute({ actorId: user.id, orgId: membership.orgId, ...parsed.data })));
}

export async function startSendAction(slug: string, _p: ActionState | null, form: FormData): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const parsed = startSchema.safeParse({ ...readOptions(form), connectionId: form.get("connectionId"), recipientIds: form.getAll("recipientIds"), intent: form.get("intent") });
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const { intent, ...rest } = parsed.data;
  const result = await runAction(async () => (await container().startSend.execute({ actorId: user.id, orgId: membership.orgId, ...rest, test: intent === "test" })).id);
  if (!result.ok) return result;
  revalidatePath(`/${slug}/send`);
  redirect(`/${slug}/send/${result.data}`);
}

/** Sends the next waiting email. The progress screen calls this until it reports `finished`. */
export async function processNextSendAction(slug: string, sendId: string): Promise<ActionState<SendStepDto>> {
  const { user, membership } = await requireOrgFresh(slug);
  return runAction(async () => {
    const step = await container().processNextSendItem.execute({ actorId: user.id, orgId: membership.orgId, sendId });
    return { status: step.send.status, counts: step.counts, finished: step.finished, item: step.item ? toSendItemDto(step.item) : null };
  });
}

export async function cancelSendAction(slug: string, sendId: string): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const result = await runAction(async () => { await container().cancelSend.execute({ actorId: user.id, orgId: membership.orgId, sendId }); });
  revalidatePath(`/${slug}/send`);
  return result;
}

/** `itemId` null retries every failed email. */
export async function retrySendAction(slug: string, sendId: string, itemId: string | null): Promise<ActionState<number>> {
  const { user, membership } = await requireOrgFresh(slug);
  const result = await runAction(() => container().retrySendItems.execute({ actorId: user.id, orgId: membership.orgId, sendId, itemId }));
  revalidatePath(`/${slug}/send`);
  return result;
}
