import { open, parseMasterKey, seal } from "./envelope";

/** Re-wraps an org's data key under a new master key. The data key (and so every secret sealed with it) is unchanged. */
export function rewrapDataKey(wrapped: string, oldMasterBase64: string, newMasterBase64: string): string {
  const dataKeyBase64 = open(parseMasterKey(oldMasterBase64), wrapped);
  return seal(parseMasterKey(newMasterBase64), dataKeyBase64);
}
