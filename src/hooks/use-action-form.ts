"use client";
import { useActionState, useEffect, useRef, useTransition, type FormEvent } from "react";
import type { ActionState } from "@/types/action";

interface Options {
  /** Clear the inputs after a successful save (for "add" forms). On errors the typed values are always kept. */
  resetOnSuccess?: boolean;
}

/**
 * Wraps a server action for a form: pending flag, last result and a ready-made error message.
 *
 * Spread `formProps` on the <form> instead of passing `action`. React 19 empties every uncontrolled field after a
 * form action finishes, even when it failed, which would make people retype everything after one validation error.
 * `formProps` submits through the same action but leaves the inputs alone. Use `dispatch` to choose the action per button.
 */
export function useActionForm<T>(action: (prev: ActionState<T> | null, form: FormData) => Promise<ActionState<T>>, options: Options = {}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const { resetOnSuccess = false } = options;

  useEffect(() => {
    if (resetOnSuccess && state?.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  const dispatch = (data: FormData) => startTransition(() => formAction(data));
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    dispatch(new FormData(e.currentTarget));
  };

  return {
    state, formAction, dispatch, pending,
    formProps: { ref: formRef, onSubmit },
    error: state && !state.ok ? state.message : null,
    data: state && state.ok ? state.data : null,
  };
}
