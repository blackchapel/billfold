export type ActionState<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string; code: string };

export const idleAction: ActionState<null> | null = null;
