import "server-only";
import { container } from "../composition-root/container";

export async function runConnectionHealthSweep() {
  return container().checkAllConnections.execute();
}
