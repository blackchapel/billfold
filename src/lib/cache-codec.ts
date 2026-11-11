/** JSON that also carries bigint amounts and Dates, which plain JSON cannot. Used for everything stored in the cache. */
export function encode(value: unknown): string {
  return JSON.stringify(value, function (this: Record<string, unknown>, key: string, v: unknown) {
    const original = this[key];
    if (typeof original === "bigint") return { $b: original.toString() };
    if (original instanceof Date) return { $d: original.toISOString() };
    return v;
  });
}

export function decode<T>(text: string): T {
  return JSON.parse(text, (_key, v: unknown) => {
    if (v && typeof v === "object") {
      const o = v as { $b?: unknown; $d?: unknown };
      if (Object.keys(o).length === 1 && typeof o.$b === "string") return BigInt(o.$b);
      if (Object.keys(o).length === 1 && typeof o.$d === "string") return new Date(o.$d);
    }
    return v;
  }) as T;
}
