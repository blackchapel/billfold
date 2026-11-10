"use client";
import { useActionState } from "react";
import type { ActionState } from "@/types/action";

/** Wraps a server action for a form: pending flag, last result and a ready-made error message. */
export function useActionForm<T>(action: (prev: ActionState<T> | null, form: FormData) => Promise<ActionState<T>>) {
  const [state, formAction, pending] = useActionState(action, null);
  return { state, formAction, pending, error: state && !state.ok ? state.message : null, data: state && state.ok ? state.data : null };
}
