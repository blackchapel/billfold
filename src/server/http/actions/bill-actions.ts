"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/types/action";
import { container } from "../../composition-root/container";
import { runAction } from "../action-result";
import { requireOrgFresh } from "../session";

const schema = z.object({
  billerName: z.string().trim().min(1, "Enter the biller's name.").max(80, "Biller name must be 1 to 80 characters."),
  amountText: z.string().trim().max(20, "That amount is too long."),
  periodKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose the month this bill belongs to."),
  billDate: z.string().trim().max(10),
  dueDate: z.string().trim().max(10),
  note: z.string().max(300, "The note can be at most 300 characters."),
});

function parse(form: FormData) {
  return schema.safeParse({
    billerName: form.get("billerName") ?? "", amountText: form.get("amountText") ?? "", periodKey: form.get("periodKey") ?? "",
    billDate: form.get("billDate") ?? "", dueDate: form.get("dueDate") ?? "", note: form.get("note") ?? "",
  });
}

/** The optional file on the Add a bill form, with the Drive and folder it should go to. Nothing is read when no file was chosen. */
async function readUpload(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return undefined;
  return {
    driveConnectionId: String(form.get("driveConnectionId") ?? ""),
    folderTemplate: String(form.get("folderTemplate") ?? ""),
    file: { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
  };
}

const refresh = (slug: string) => {
  revalidatePath(`/${slug}/bills`);
  revalidatePath(`/${slug}/reports`);
};

/** Saves an edited bill (with `billId`) or adds one typed in by hand (without). */
export async function saveBillAction(slug: string, billId: string | null, _p: ActionState | null, form: FormData): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const parsed = parse(form);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the details and try again.", code: "validation" };
  const result = await runAction(async () => {
    const base = { actorId: user.id, orgId: membership.orgId, fields: parsed.data };
    if (billId) await container().updateBill.execute({ ...base, billId, markChecked: form.get("markChecked") === "on" });
    else await container().createManualBill.execute({ ...base, upload: await readUpload(form) });
  });
  if (!result.ok) return result;
  refresh(slug);
  redirect(`/${slug}/bills`);
}

// useActionState passes the previous state as the last argument; these button actions do not need it.
/* eslint-disable @typescript-eslint/no-unused-vars */
export async function setBillPaidAction(slug: string, billId: string, paid: boolean, _prev: ActionState | null): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const result = await runAction(async () => { await container().setBillPaid.execute({ actorId: user.id, orgId: membership.orgId, billId, paid }); });
  refresh(slug);
  return result;
}

/** Removes an email's bill for good so the next run files that email again. */
export async function removeBillForRefilingAction(slug: string, billId: string, _prev: ActionState | null): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const result = await runAction(async () => { await container().removeBillForRefiling.execute({ actorId: user.id, orgId: membership.orgId, billId }); });
  refresh(slug);
  return result;
}

export async function setBillDeletedAction(slug: string, billId: string, deleted: boolean, _prev: ActionState | null): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const result = await runAction(async () => { await container().setBillDeleted.execute({ actorId: user.id, orgId: membership.orgId, billId, deleted }); });
  refresh(slug);
  return result;
}

export async function markBillCheckedAction(slug: string, billId: string, _prev: ActionState | null): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const result = await runAction(async () => { await container().markBillChecked.execute({ actorId: user.id, orgId: membership.orgId, billId }); });
  refresh(slug);
  return result;
}
/* eslint-enable @typescript-eslint/no-unused-vars */
