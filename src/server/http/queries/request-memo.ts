import "server-only";
import { cache } from "react";
import { container } from "../../composition-root/container";

/**
 * Page-render reads that several read models need (the Overview alone wanted the connections three times, through the source,
 * run configuration and connection lists). `cache` makes each run once per page render and hands the same answer to every caller.
 * Only for queries used while rendering pages: server actions never read through these, so they cannot see a stale list.
 */
export const connectionRecords = cache((orgId: string) => container().listConnections.execute(orgId));
export const sourceRecords = cache((orgId: string) => container().listSources.execute(orgId));
export const runConfigRecords = cache((orgId: string) => container().listRunConfigs.execute(orgId));
