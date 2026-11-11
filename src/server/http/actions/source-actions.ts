"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PASSWORD_MODES } from "@/domain/value-objects/password-rule";
import type { ActionState } from "@/types/action";
import type { TesterDto } from "@/types/source";
import { container } from "../../composition-root/container";
import { runAction } from "../action-result";
import { requireOrgFresh } from "../session";

const text = (max: number, message: string) => z.string().trim().max(max, message).transform((v) => v || null);

const sourceSchema = z.object({
  name: z.string().trim().min(2, "Name must be 2 to 60 characters").max(60, "Name must be 2 to 60 characters"),
  connectionId: z.string().uuid("Choose a mailbox to read from."),
  senders: z.string().max(2000, "Too many senders").transform((v) => v.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)),
  subjectContains: text(100, "The subject text can be at most 100 characters."),
  attachmentNameContains: text(60, "The attachment name text can be at most 60 characters."),
  requireAttachment: z.boolean(),
  passwordMode: z.enum(PASSWORD_MODES, "Choose how to open the PDF."),
  passwordPattern: text(120, "The pattern can be at most 120 characters."),
  staticPassword: z.string().max(256, "That password is too long.").transform((v) => v || null),
  fileNameTemplate: text(150, "The file name can be at most 150 characters."),
  folderTemplate: text(200, "The folder path can be at most 200 characters."),
});

function parse(form: FormData) {
  return sourceSchema.safeParse({
    name: form.get("name"), connectionId: form.get("connectionId"), senders: form.get("senders") ?? "",
    subjectContains: form.get("subjectContains") ?? "", attachmentNameContains: form.get("attachmentNameContains") ?? "",
    requireAttachment: form.get("requireAttachment") === "on", passwordMode: form.get("passwordMode"),
    passwordPattern: form.get("passwordPattern") ?? "", staticPassword: form.get("staticPassword") ?? "",
    fileNameTemplate: form.get("fileNameTemplate") ?? "", folderTemplate: form.get("folderTemplate") ?? "",
  });
}

const invalid = (issue: string | undefined): ActionState<never> => ({ ok: false, message: issue ?? "Check the details and try again.", code: "validation" });

export async function saveSourceAction(slug: string, sourceId: string | null, _p: ActionState | null, form: FormData): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const parsed = parse(form);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const result = await runAction(async () => {
    await container().saveSource.execute({ actorId: user.id, orgId: membership.orgId, ...(sourceId ? { id: sourceId } : {}), ...parsed.data });
  });
  if (result.ok) {
    revalidatePath(`/${slug}/sources`);
    redirect(`/${slug}/sources`);
  }
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function deleteSourceAction(slug: string, sourceId: string, _prev: ActionState | null): Promise<ActionState> {
  const { user, membership } = await requireOrgFresh(slug);
  const result = await runAction(async () => {
    await container().deleteSource.execute({ actorId: user.id, orgId: membership.orgId, sourceId });
  });
  revalidatePath(`/${slug}/sources`);
  return result;
}

/** Dry run from the form: nothing is saved, nothing is downloaded. */
export async function testSourceAction(slug: string, _p: ActionState<TesterDto> | null, form: FormData): Promise<ActionState<TesterDto>> {
  const { user, membership } = await requireOrgFresh(slug);
  const parsed = parse(form);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const { staticPassword: _ignored, ...rules } = parsed.data; // eslint-disable-line @typescript-eslint/no-unused-vars
  return runAction(async () => {
    const r = await container().testSource.execute({ actorId: user.id, orgId: membership.orgId, windowDays: 90, ...rules });
    return { windowDays: r.windowDays, scanned: r.scanned, matches: r.matches.map((m) => ({ ...m, date: m.date.toISOString() })) };
  });
}
