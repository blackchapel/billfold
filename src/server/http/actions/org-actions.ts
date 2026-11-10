"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_CURRENCY } from "@/constants/app";
import type { ActionState } from "@/types/action";
import { container } from "../../composition-root/container";
import { runAction } from "../action-result";
import { requireOrgFresh, requireUser } from "../session";

const createSchema = z.object({ name: z.string().trim().min(2, "Name must be 2 to 60 characters").max(60, "Name must be 2 to 60 characters") });
const joinSchema = z.object({ code: z.string().trim().min(6).max(64) });

export async function createOrgAction(_prev: ActionState<string> | null, form: FormData): Promise<ActionState<string>> {
  const user = await requireUser();
  const parsed = createSchema.safeParse({ name: form.get("name") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid name", code: "validation" };
  const result = await runAction(async () =>
    (await container().createOrg.execute({ userId: user.id, name: parsed.data.name, defaultCurrency: DEFAULT_CURRENCY })).slug);
  if (result.ok) redirect(`/${result.data}`);
  return result;
}

export async function joinOrgAction(_prev: ActionState<string> | null, form: FormData): Promise<ActionState<string>> {
  const user = await requireUser();
  const parsed = joinSchema.safeParse({ code: form.get("code") });
  if (!parsed.success) return { ok: false, message: "Enter the invite code you were given.", code: "validation" };
  const result = await runAction(async () => (await container().acceptInvite.execute({ userId: user.id, code: parsed.data.code })).slug);
  if (result.ok) redirect(`/${result.data}`);
  return result;
}

const renameSchema = z.object({ name: z.string().trim().min(2, "Name must be 2 to 60 characters").max(60, "Name must be 2 to 60 characters") });

export async function renameOrgAction(slug: string, _p: ActionState | null, form: FormData): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const parsed = renameSchema.safeParse({ name: form.get("name") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid name", code: "validation" };
  const result = await runAction(() => container().renameOrg.execute({ actorId: user.id, orgId: membership.orgId, name: parsed.data.name }));
  revalidatePath(`/${slug}`, "layout");
  return result;
}

export async function transferOwnershipAction(slug: string, _p: ActionState | null, form: FormData): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const parsed = z.object({ newOwnerId: z.string().uuid("Choose a member.") }).safeParse({ newOwnerId: form.get("newOwnerId") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Choose a member.", code: "validation" };
  const result = await runAction(() => container().transferOwnership.execute({ actorId: user.id, orgId: membership.orgId, newOwnerId: parsed.data.newOwnerId }));
  revalidatePath(`/${slug}`, "layout");
  return result;
}

export async function deleteOrgAction(slug: string, _p: ActionState | null, form: FormData): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const result = await runAction(() =>
    container().deleteOrg.execute({ actorId: user.id, orgId: membership.orgId, slug, confirmSlug: String(form.get("confirm") ?? "") }));
  if (result.ok) redirect("/");
  return result;
}

/** Forgets everything remembered about this organisation, for when something looks out of date. */
export async function clearCacheAction(slug: string, _p: ActionState | null): Promise<ActionState> { // eslint-disable-line @typescript-eslint/no-unused-vars
  const { user, membership } = await requireOrgFresh(slug);
  const result = await runAction(async () => { await container().clearCache.execute({ actorId: user.id, orgId: membership.orgId }); });
  revalidatePath(`/${slug}`, "layout");
  return result;
}
