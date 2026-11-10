import "server-only";
import { DomainError } from "@/domain/errors/domain-error";
import { logEvent, safeMessage } from "@/lib/log";
import { authGateway } from "../composition-root/auth-gateway";
import { container } from "../composition-root/container";

export type CallbackOutcome = "ok" | "not_allowlisted" | "error";

export interface CallbackParams {
  code: string | null;
  /** Supabase/Google report failures as ?error=…&error_code=…&error_description=… */
  providerError: { error: string | null; code: string | null; description: string | null };
}

/** Exchanges the OAuth code, then applies the allowlist. Rejected users are signed out at once. */
export async function completeGoogleSignIn({ code, providerError }: CallbackParams): Promise<CallbackOutcome> {
  if (providerError.error) {
    logEvent("auth_callback_failed", {
      step: "provider_error", error: safeMessage(providerError.error),
      error_code: safeMessage(providerError.code ?? ""), description: safeMessage(providerError.description ?? ""),
    });
    return "error";
  }
  if (!code) {
    logEvent("auth_callback_failed", { step: "missing_code" });
    return "error";
  }
  try {
    if (!(await authGateway.exchangeCode(code))) {
      logEvent("auth_callback_failed", { step: "exchange_code" });
      return "error";
    }
  } catch (e) {
    logEvent("auth_callback_failed", { step: "exchange_code", message: safeMessage(e) });
    return "error";
  }
  const identity = await authGateway.identity().catch((e: unknown) => {
    logEvent("auth_callback_failed", { step: "read_identity", message: safeMessage(e) });
    return null;
  });
  if (!identity) {
    logEvent("auth_callback_failed", { step: "no_identity" });
    return "error";
  }
  try {
    await container().signInGate.execute({ authUserId: identity.id, email: identity.email, name: identity.name, avatarUrl: identity.avatarUrl });
    return "ok";
  } catch (e) {
    await authGateway.signOut().catch(() => undefined);
    if (e instanceof DomainError && e.code === "not_allowlisted") return "not_allowlisted";
    logEvent("auth_callback_failed", { step: "sign_in_gate", message: safeMessage(e) });
    return "error";
  }
}
