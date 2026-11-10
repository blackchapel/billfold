import "server-only";
import { cache } from "react";
import { container } from "../../composition-root/container";
import { cachedRead } from "./cached";

/**
 * Page-render reads that several read models need (the Overview alone wanted the connections three times). Two layers: `cache` makes
 * each run once per page render, and `cachedRead` remembers the answer across requests until the data changes.
 * Only for queries used while rendering pages: server actions never read through these, so they cannot see a stale list.
 */
export const connectionRecords = cache((orgId: string) => cachedRead(orgId, "connections", ["connections"], null, () => container().listConnections.execute(orgId)));
export const sourceRecords = cache((orgId: string) => cachedRead(orgId, "sources", ["sources"], null, () => container().listSources.execute(orgId)));
export const runConfigRecords = cache((orgId: string) => cachedRead(orgId, "runConfigs", ["runConfigs", "sources"], null, () => container().listRunConfigs.execute(orgId)));
/** Months that have bills and how many need a check. */
export const billSummary = cache((orgId: string) => cachedRead(orgId, "billSummary", ["bills"], null, () => container().listBills.summary(orgId)));
export const recipientRecords = cache((orgId: string) => cachedRead(orgId, "recipients", ["recipients"], null, () => container().listRecipients.execute(orgId)));
export const templateRecords = cache((orgId: string) => cachedRead(orgId, "templates", ["templates"], null, () => container().listTemplates.execute(orgId)));
