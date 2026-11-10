"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DEFAULT_CURRENCY } from "@/constants/app";
import type { ActionState } from "@/types/action";
import { container } from "../../composition-root/container";
import { runAction } from "../action-result";
import { requireUser } from "../session";

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
