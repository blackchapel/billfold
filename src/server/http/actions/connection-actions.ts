"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MAIL_SERVER_KINDS } from "@/domain/value-objects/connection";
import type { ActionState } from "@/types/action";
import { container } from "../../composition-root/container";
import { runAction } from "../action-result";
import { requireOrg } from "../session";

const mailSchema = z.object({
  kind: z.enum(MAIL_SERVER_KINDS),
  label: z.string().trim().max(60, "Name must be 60 characters or fewer").default(""),
  host: z.string().trim().min(3, "Enter the server name, for example imap.gmail.com").max(253)
    .regex(/^[a-z0-9.-]+$/i, "The server name can only contain letters, numbers, dots and dashes."),
  port: z.coerce.number().int("Port must be a whole number").min(1, "Enter a valid port").max(65535, "Enter a valid port"),
  secure: z.boolean(),
  username: z.string().trim().min(3, "Enter the full email address").max(254),
  password: z.string().min(1, "Enter the app password").max(256),
});

export async function addMailAccountAction(slug: string, _p: ActionState | null, form: FormData): Promise<ActionState> {
  const { user, membership } = await requireOrg(slug);
  const parsed = mailSchema.safeParse({
    kind: form.get("kind"), label: form.get("label") ?? "", host: form.get("host"), port: form.get("port"),
    secure: form.get("secure") === "on", username: form.get("username"), password: form.get("password"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the details and try again.", code: "validation" };
  const result = await runAction(async () => {
    await container().addMailAccount.execute({ actorId: user.id, orgId: membership.orgId, ...parsed.data });
  });
  revalidatePath(`/${slug}/connections`);
  return result;
}

// useActionState always passes the previous state as the last argument; these actions do not need it.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function testConnectionAction(slug: string, connectionId: string, _prev: ActionState<string> | null): Promise<ActionState<string>> {
  const { user, membership } = await requireOrg(slug);
  const result = await runAction(async () => {
    const probe = await container().testConnection.execute({ actorId: user.id, orgId: membership.orgId, connectionId });
    return probe.message;
  });
  revalidatePath(`/${slug}/connections`);
  return result;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function removeConnectionAction(slug: string, connectionId: string, _prev: ActionState | null): Promise<ActionState> {
  const { user, membership } = await requireOrg(slug);
  const result = await runAction(async () => {
    await container().removeConnection.execute({ actorId: user.id, orgId: membership.orgId, connectionId });
  });
  revalidatePath(`/${slug}/connections`);
  return result;
}

const passwordSchema = z.object({ password: z.string().min(1, "Enter the new app password").max(256) });

export async function updateMailPasswordAction(slug: string, connectionId: string, _p: ActionState | null, form: FormData): Promise<ActionState> {
  const { user, membership } = await requireOrg(slug);
  const parsed = passwordSchema.safeParse({ password: form.get("password") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Enter the new app password", code: "validation" };
  const result = await runAction(() => container().updateMailPassword.execute({ actorId: user.id, orgId: membership.orgId, connectionId, password: parsed.data.password }));
  revalidatePath(`/${slug}/connections`);
  return result;
}
