"use server";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { DomainError } from "@/domain/errors/domain-error";
import { authGateway } from "../../composition-root/auth-gateway";
import { container } from "../../composition-root/container";

export async function signInWithGoogle(): Promise<void> {
  const url = await authGateway.googleSignInUrl();
  redirect(url ?? "/sign-in?error=1");
}

/** Test mode only: signs in a fake user through the same allowlist gate as real sign-in. */
export async function signInAsTestUser(formData: FormData): Promise<void> {
  if (!authGateway.isTestMode()) throw new Error("Test mode is disabled");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const id = deterministicUuid(email);
  try {
    await container().signInGate.execute({ authUserId: id, email, name: email.split("@")[0] ?? null, avatarUrl: null });
  } catch (e) {
    if (e instanceof DomainError && e.code === "not_allowlisted") redirect("/not-authorised");
    throw e;
  }
  await authGateway.setTestSession(id);
  redirect("/");
}

export async function signOut(): Promise<void> {
  if (authGateway.isTestMode()) await authGateway.clearTestSession();
  else await authGateway.signOut();
  redirect("/");
}

function deterministicUuid(seed: string): string {
  const h = createHash("sha256").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
