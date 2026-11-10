"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/types/action";
import type { StepDto } from "@/types/run";
import { container } from "../../composition-root/container";
import { runAction } from "../action-result";
import { toItemDto } from "../queries/run-queries";
import { requireOrgFresh } from "../session";

const startSchema = z.object({
  runConfigId: z.string().uuid("Choose a run configuration."),
  periodKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a month.").or(z.literal("")).transform((v) => v || null),
});

export async function startRunAction(slug: string, _p: ActionState | null, form: FormData): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const parsed = startSchema.safeParse({ runConfigId: form.get("runConfigId"), periodKey: form.get("periodKey") ?? "" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the details and try again.", code: "validation" };
  const result = await runAction(async () => (await container().startRun.execute({ actorId: user.id, orgId: membership.orgId, ...parsed.data })).run.id);
  if (!result.ok) return result;
  revalidatePath(`/${slug}/runs`);
  redirect(`/${slug}/runs/${result.data}`);
}

/** Files the next waiting item. The progress screen calls this over and over until it reports `finished`. */
export async function processNextAction(slug: string, runId: string): Promise<ActionState<StepDto>> {
  const { user, membership } = await requireOrgFresh(slug);
  return runAction(async () => {
    const step = await container().processNextItem.execute({ actorId: user.id, orgId: membership.orgId, runId });
    return {
      runStatus: step.run.status, counts: step.counts, finished: step.finished,
      item: step.item ? toItemDto(step.item, step.bill) : null,
    };
  });
}

export async function cancelRunAction(slug: string, runId: string): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const result = await runAction(async () => {
    await container().cancelRun.execute({ actorId: user.id, orgId: membership.orgId, runId });
  });
  revalidatePath(`/${slug}/runs`);
  return result;
}

/** `itemId` null retries every failed item. */
export async function retryRunAction(slug: string, runId: string, itemId: string | null): Promise<ActionState<number>> {
  const { user, membership } = await requireOrgFresh(slug);
  const result = await runAction(() => container().retryRunItems.execute({ actorId: user.id, orgId: membership.orgId, runId, itemId }));
  revalidatePath(`/${slug}/runs`);
  return result;
}
