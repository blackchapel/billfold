export interface SniffedFile { mimeType: string; extension: string }

/**
 * What a file really is, from its first bytes, not from the name or type the browser claimed. Only PDFs and common pictures
 * (a photographed paper bill) are accepted; anything else, including a program renamed to .pdf, is refused.
 */
export function sniffBillFile(bytes: Uint8Array): SniffedFile | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return { mimeType: "application/pdf", extension: ".pdf" }; // %PDF-
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mimeType: "image/png", extension: ".png" };
  if (starts(0xff, 0xd8, 0xff)) return { mimeType: "image/jpeg", extension: ".jpg" };
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { mimeType: "image/webp", extension: ".webp" }; // RIFF....WEBP
  return null;
}
