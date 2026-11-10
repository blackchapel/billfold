import { DomainError } from "@/domain/errors/domain-error";
import { normalizeEmail } from "@/domain/value-objects/email-address";
import type { AllowlistRepository, UserRepository } from "@/domain/ports/repositories";
import type { UserRecord } from "@/domain/ports/records";

export interface SignInInput {
  authUserId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

/** Decides whether a freshly authenticated Google account may use Billfold. */
export class SignInGate {
  constructor(
    private readonly allowlist: AllowlistRepository,
    private readonly users: UserRepository,
    private readonly superAdmins: readonly string[],
  ) {}

  isSuperAdmin(email: string): boolean {
    const normalized = normalizeEmail(email);
    return !!normalized && this.superAdmins.includes(normalized);
  }

  /** Cheap per-request check so removing someone from the allowlist takes effect immediately. */
  async isStillAllowed(email: string): Promise<boolean> {
    const normalized = normalizeEmail(email);
    if (!normalized) return false;
    return this.isSuperAdmin(normalized) || this.allowlist.isAllowed(normalized);
  }

  async execute(input: SignInInput): Promise<UserRecord> {
    const email = normalizeEmail(input.email);
    if (!email) throw new DomainError("not_allowlisted", "Invalid email");
    const allowed = this.isSuperAdmin(email) || (await this.allowlist.isAllowed(email));
    if (!allowed) throw new DomainError("not_allowlisted", "Email is not on the allowlist");
    return this.users.upsert({ id: input.authUserId, email, name: input.name, avatarUrl: input.avatarUrl });
  }
}
