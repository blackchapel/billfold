import "server-only";
import { DomainError } from "@/domain/errors/domain-error";
import { authGateway } from "../composition-root/auth-gateway";
import { container } from "../composition-root/container";

export type CallbackOutcome = "ok" | "not_allowlisted" | "error";

/** Exchanges the OAuth code, then applies the allowlist. Rejected users are signed out at once. */
export async function completeGoogleSignIn(code: string | null): Promise<CallbackOutcome> {
  if (!code || !(await authGateway.exchangeCode(code))) return "error";
  const identity = await authGateway.identity();
  if (!identity) return "error";
  try {
    await container().signInGate.execute({ authUserId: identity.id, email: identity.email, name: identity.name, avatarUrl: identity.avatarUrl });
    return "ok";
  } catch (e) {
    await authGateway.signOut();
    return e instanceof DomainError && e.code === "not_allowlisted" ? "not_allowlisted" : "error";
  }
}
