export type DomainErrorCode =
  | "not_authenticated"
  | "not_allowlisted"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "invite_invalid"
  | "invite_expired"
  | "invite_exhausted"
  | "last_owner"
  | "rate_limited"
  | "unexpected";

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const USER_MESSAGES: Record<DomainErrorCode, string> = {
  not_authenticated: "Please sign in to continue.",
  not_allowlisted: "This Google account is not authorised to use Billfold.",
  forbidden: "You do not have permission to do that.",
  not_found: "We could not find what you were looking for.",
  validation: "Some of the details are not valid.",
  conflict: "That already exists.",
  invite_invalid: "That invite code is not valid.",
  invite_expired: "That invite code has expired.",
  invite_exhausted: "That invite code has already been used up.",
  last_owner: "An organisation must keep at least one owner.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
  unexpected: "Something went wrong. Please try again.",
};
