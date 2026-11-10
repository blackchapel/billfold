import { DomainError } from "@/domain/errors/domain-error";
import type { AuditLogRepository, ConnectionRepository, RunConfigRepository, SourceRepository } from "@/domain/ports/repositories";
import type { RunConfigFields, RunConfigRecord } from "@/domain/ports/records";
import { PERIOD_MODES, type PeriodMode } from "@/domain/value-objects/period";
import type { AuthorizationService } from "./authorization";

export interface RunConfigInput {
  actorId: string;
  orgId: string;
  /** Present when editing. */
  id?: string;
  name: string;
  driveConnectionId: string;
  driveFolder: string;
  periodMode: PeriodMode;
  sourceIds: string[];
}

function validateFields(input: RunConfigInput): RunConfigFields {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) throw new DomainError("validation", "Name must be 2 to 60 characters");
  const folder = input.driveFolder.trim();
  if (folder.length < 1 || folder.length > 100) throw new DomainError("validation", "The Drive folder name must be 1 to 100 characters.");
  if (/[\\/]/.test(folder) || /^\.+$/.test(folder)) throw new DomainError("validation", "The Drive folder name cannot contain slashes.");
  if (!(PERIOD_MODES as readonly string[]).includes(input.periodMode)) throw new DomainError("validation", "Choose which month a run covers.");
  const sourceIds = [...new Set(input.sourceIds)];
  if (sourceIds.length === 0) throw new DomainError("validation", "Choose at least one source.");
  if (sourceIds.length > 50) throw new DomainError("validation", "Use at most 50 sources in one run configuration.");
  return { name, driveConnectionId: input.driveConnectionId, driveFolder: folder, periodMode: input.periodMode, sourceIds };
}

/** Creates or edits a run configuration. Every one must name a Google Drive connection to file into. */
export class SaveRunConfig {
  constructor(
    private readonly runConfigs: RunConfigRepository,
    private readonly sources: SourceRepository,
    private readonly connections: ConnectionRepository,
    private readonly authz: AuthorizationService,
    private readonly audit: AuditLogRepository,
  ) {}

  async execute(input: RunConfigInput): Promise<RunConfigRecord> {
    await this.authz.require(input.actorId, input.orgId, "run_configs.manage");
    const fields = validateFields(input);
    const drive = await this.connections.find(input.orgId, input.driveConnectionId);
    if (!drive || drive.kind !== "google_drive") throw new DomainError("validation", "Choose a connected Google Drive to file the bills in.");
    if ((await this.sources.findMany(input.orgId, fields.sourceIds)).length !== fields.sourceIds.length) throw new DomainError("validation", "One of the chosen sources no longer exists.");
    const clash = await this.runConfigs.findByName(input.orgId, fields.name);
    if (clash && clash.id !== input.id) throw new DomainError("validation", "A run configuration with that name already exists.");

    const existing = input.id ? await this.runConfigs.find(input.orgId, input.id) : null;
    if (input.id && !existing) throw new DomainError("not_found", "Run configuration not found");
    const record = existing
      ? await this.runConfigs.update(input.orgId, existing.id, fields)
      : await this.runConfigs.create(input.orgId, input.actorId, fields);
    if (!record) throw new DomainError("not_found", "Run configuration not found");
    await this.audit.record({
      orgId: input.orgId, actorUserId: input.actorId, action: existing ? "run_config.updated" : "run_config.created", entityType: "run_config", entityId: record.id,
      metadata: { name: fields.name, sources: fields.sourceIds.length },
    });
    return record;
  }
}

export class DeleteRunConfig {
  constructor(private readonly runConfigs: RunConfigRepository, private readonly authz: AuthorizationService, private readonly audit: AuditLogRepository) {}

  async execute(input: { actorId: string; orgId: string; runConfigId: string }): Promise<void> {
    await this.authz.require(input.actorId, input.orgId, "run_configs.manage");
    const config = await this.runConfigs.find(input.orgId, input.runConfigId);
    if (!config) throw new DomainError("not_found", "Run configuration not found");
    await this.runConfigs.remove(input.orgId, config.id);
    await this.audit.record({ orgId: input.orgId, actorUserId: input.actorId, action: "run_config.deleted", entityType: "run_config", entityId: config.id, metadata: { name: config.name } });
  }
}

export class ListRunConfigs {
  constructor(private readonly runConfigs: RunConfigRepository) {}
  execute(orgId: string): Promise<RunConfigRecord[]> { return this.runConfigs.list(orgId); }
  find(orgId: string, id: string): Promise<RunConfigRecord | null> { return this.runConfigs.find(orgId, id); }
}
