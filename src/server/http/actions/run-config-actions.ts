"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PERIOD_MODES } from "@/domain/value-objects/period";
import type { ActionState } from "@/types/action";
import { container } from "../../composition-root/container";
import { runAction } from "../action-result";
import { requireOrgFresh } from "../session";

const schema = z.object({
  name: z.string().trim().min(2, "Name must be 2 to 60 characters").max(60, "Name must be 2 to 60 characters"),
  driveConnectionId: z.string().uuid("Choose a Google Drive to file the bills in."),
  driveFolder: z.string().trim().min(1, "Enter a Drive folder name.").max(100, "The Drive folder name can be at most 100 characters."),
  periodMode: z.enum(PERIOD_MODES, "Choose which month a run covers."),
  sourceIds: z.array(z.string().uuid()).min(1, "Choose at least one source.").max(50, "Use at most 50 sources."),
});

export async function saveRunConfigAction(slug: string, runConfigId: string | null, _p: ActionState | null, form: FormData): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const parsed = schema.safeParse({
    name: form.get("name"), driveConnectionId: form.get("driveConnectionId"), driveFolder: form.get("driveFolder"),
    periodMode: form.get("periodMode"), sourceIds: form.getAll("sourceIds").map(String),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the details and try again.", code: "validation" };
  const result = await runAction(async () => {
    await container().saveRunConfig.execute({ actorId: user.id, orgId: membership.orgId, ...(runConfigId ? { id: runConfigId } : {}), ...parsed.data });
  });
  if (result.ok) {
    revalidatePath(`/${slug}/run-configs`);
    redirect(`/${slug}/run-configs`);
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function deleteRunConfigAction(slug: string, runConfigId: string, _prev: ActionState | null): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const result = await runAction(async () => {
    await container().deleteRunConfig.execute({ actorId: user.id, orgId: membership.orgId, runConfigId });
  });
  revalidatePath(`/${slug}/run-configs`);
  return result;
}
