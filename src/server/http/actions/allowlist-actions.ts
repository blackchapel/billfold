"use server";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/types/action";
import { container } from "../../composition-root/container";
import { runAction } from "../action-result";
import { requireSuperAdmin } from "../session";

export async function addAllowlistAction(_p: ActionState | null, form: FormData): Promise<ActionState> {
  const admin = await requireSuperAdmin();
  const result = await runAction(() => container().manageAllowlist.add({
    actorId: admin.id, isSuperAdmin: admin.isSuperAdmin, email: String(form.get("email") ?? ""), note: String(form.get("note") ?? "") || null,
  }));
  revalidatePath("/admin");
  return result;
}

export async function removeAllowlistAction(email: string): Promise<void> {
  const admin = await requireSuperAdmin();
  await container().manageAllowlist.remove({ actorId: admin.id, isSuperAdmin: admin.isSuperAdmin, email });
  revalidatePath("/admin");
}
