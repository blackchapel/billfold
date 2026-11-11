import "server-only";
import type { ConnectionRecord, RunConfigRecord, SourceRecord } from "@/domain/ports/records";
import type { ConnectionOption, RunConfigDto, SourceDto } from "@/types/source";
import { container } from "../../composition-root/container";
import { connectionRecords, sourceRecords, runConfigRecords } from "./request-memo";
import { hasFullDriveAccess } from "@/domain/value-objects/connection";

const toOption = (c: ConnectionRecord): ConnectionOption => ({ id: c.id, label: c.label, account: c.accountEmail });

export async function mailboxOptions(orgId: string): Promise<ConnectionOption[]> {
  return (await connectionRecords(orgId)).filter((c) => c.kind === "gmail" || c.kind === "imap").map(toOption);
}

export async function driveOptions(orgId: string): Promise<ConnectionOption[]> {
  return (await connectionRecords(orgId)).filter((c) => c.kind === "google_drive").map((c) => ({ ...toOption(c), fullAccess: hasFullDriveAccess(c.config) }));
}

const toSourceDto = (s: SourceRecord, labels: Map<string, string>): SourceDto => ({
  id: s.id, name: s.name, connectionId: s.connectionId, connectionLabel: labels.get(s.connectionId) ?? "(removed)",
  senders: s.matcher.senders, subjectContains: s.matcher.subjectContains, attachmentNameContains: s.matcher.attachmentNameContains,
  requireAttachment: s.matcher.requireAttachment, passwordMode: s.passwordMode, passwordPattern: s.passwordPattern, hasStaticPassword: s.hasStaticPassword,
  fileNameTemplate: s.fileNameTemplate, folderTemplate: s.folderTemplate,
});

async function labelMap(orgId: string) {
  return new Map((await connectionRecords(orgId)).map((c) => [c.id, c.label]));
}

export async function listSources(orgId: string): Promise<SourceDto[]> {
  const [sources, labels] = await Promise.all([sourceRecords(orgId), labelMap(orgId)]);
  return sources.map((s) => toSourceDto(s, labels));
}

export async function getSource(orgId: string, id: string): Promise<SourceDto | null> {
  const [source, labels] = await Promise.all([container().listSources.find(orgId, id), labelMap(orgId)]);
  return source ? toSourceDto(source, labels) : null;
}

export async function listRunConfigs(orgId: string): Promise<RunConfigDto[]> {
  const [configs, sources, labels] = await Promise.all([runConfigRecords(orgId), sourceRecords(orgId), labelMap(orgId)]);
  return configs.map((c) => toRunConfigDto(c, sources, labels));
}

export async function getRunConfig(orgId: string, id: string): Promise<RunConfigDto | null> {
  const [config, sources, labels] = await Promise.all([container().listRunConfigs.find(orgId, id), sourceRecords(orgId), labelMap(orgId)]);
  return config ? toRunConfigDto(config, sources, labels) : null;
}

function toRunConfigDto(c: RunConfigRecord, sources: SourceRecord[], labels: Map<string, string>): RunConfigDto {
  const names = new Map(sources.map((s) => [s.id, s.name]));
  return {
    id: c.id, name: c.name, driveConnectionId: c.driveConnectionId, driveLabel: labels.get(c.driveConnectionId) ?? "(removed)",
    driveFolder: c.driveFolder, periodMode: c.periodMode, sourceIds: c.sourceIds, // The database returns links in no particular order; show the names alphabetically so the list never jumps around.
    sourceNames: c.sourceIds.map((id) => names.get(id) ?? "(removed)").sort((a, b) => a.localeCompare(b)),
  };
}

export async function sourceOptions(orgId: string): Promise<{ id: string; name: string }[]> {
  return (await sourceRecords(orgId)).map((s) => ({ id: s.id, name: s.name }));
}
