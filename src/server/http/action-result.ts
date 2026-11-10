import { DomainError, USER_MESSAGES } from "@/domain/errors/domain-error";
import type { ActionState } from "@/types/action";

/** Wraps a use-case call: expected domain errors become friendly messages, anything else is hidden. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionState<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof DomainError) {
      const message = e.code === "validation" ? e.message : USER_MESSAGES[e.code];
      return { ok: false, message, code: e.code };
    }
    if (isFrameworkSignal(e)) throw e; // redirect() and notFound() must propagate
    console.error("Unexpected action error", e instanceof Error ? e.message : "unknown");
    return { ok: false, message: USER_MESSAGES.unexpected, code: "unexpected" };
  }
}

function isFrameworkSignal(e: unknown): boolean {
  return typeof e === "object" && e !== null && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_");
}
