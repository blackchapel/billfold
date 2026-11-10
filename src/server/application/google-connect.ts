import { DomainError } from "@/domain/errors/domain-error";
import type { AuditLogRepository, ConnectionRepository } from "@/domain/ports/repositories";
import type { ConnectionRecord } from "@/domain/ports/records";
import type { Clock, ConnectionProbe, GoogleOAuthClient, SecretBox } from "@/domain/ports/services";
import type { GoogleKind } from "@/domain/value-objects/connection";
import type { AuthorizationService } from "./authorization";

/** Finishes "Connect Google Drive / Gmail": swaps Google's one-time code for a refresh token and stores it sealed. */
export class CompleteGoogleConnect {
  constructor(
    private readonly repo: ConnectionRepository,
    private readonly authz: AuthorizationService,
    private readonly secrets: SecretBox,
    private readonly google: GoogleOAuthClient,
    private readonly probe: ConnectionProbe,
    private readonly clock: Clock,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(input: { actorId: string; orgId: string; kind: GoogleKind; code: string; redirectUri: string }): Promise<ConnectionRecord> {
    await this.authz.require(input.actorId, input.orgId, "connections.manage");
    let linked: { refreshToken: string; accountEmail: string };
    try {
      linked = await this.google.exchangeCode(input.kind, input.code, input.redirectUri);
    } catch (e) {
      throw new DomainError("validation", e instanceof Error ? e.message : "Google did not complete the connection.");
    }
    const secretJson = JSON.stringify({ refreshToken: linked.refreshToken });
    const cipher = await this.secrets.encrypt(input.orgId, secretJson);
    const existing = await this.repo.findByAccount(input.orgId, input.kind, linked.accountEmail);
    let record: ConnectionRecord;
    if (existing) {
      await this.repo.replaceSecret(input.orgId, existing.id, cipher);
      record = existing;
    } else {
      record = await this.repo.create({
        orgId: input.orgId, kind: input.kind, label: linked.accountEmail, accountEmail: linked.accountEmail,
        config: {}, secretCiphertext: cipher, createdBy: input.actorId,
      });
    }
    const result = await this.probe.check(input.kind, record.config, secretJson);
    await this.repo.recordCheck(input.orgId, record.id, { status: result.ok ? "active" : "needs_attention", error: result.ok ? null : result.message, at: this.clock.now() });
    await this.audit.record({
      orgId: input.orgId, actorUserId: input.actorId, action: existing ? "connection.reconnected" : "connection.added",
      entityType: "connection", entityId: record.id, metadata: { kind: input.kind, account: linked.accountEmail },
    });
    return record;
  }
}
