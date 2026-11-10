/**
 * Draws the PNG brand files from the same mark as src/app/icon.svg: the app icons, the touch icon and the social preview image.
 * Run with: PW_CHROMIUM_PATH=/path/to/chromium pnpm exec tsx scripts/make-brand-assets.mts   (output is committed; rerun only when the brand changes)
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const GREEN = "#1f5c46";
const PAPER = "#f6f3ec";
const INK = "#1b1a17";
const MUTED = "#6b665b";

const mark = (size: number, radius: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><rect width="32" height="32" rx="${radius}" fill="${GREEN}"/><path d="M7 9h18v14H7z" fill="none" stroke="${PAPER}" stroke-width="2"/><path d="M7 9l9 7 9-7" fill="none" stroke="${PAPER}" stroke-width="2"/></svg>`;

const social = `<!doctype html><html><body style="margin:0;width:1200px;height:630px;background:${PAPER};font-family:Georgia,'Times New Roman',serif;color:${INK};position:relative">
  <div style="position:absolute;left:80px;top:72px;display:flex;align-items:center;gap:20px">${mark(72, 6)}<span style="font-size:52px;letter-spacing:-1px">Billfold</span></div>
  <div style="position:absolute;left:80px;top:230px;width:900px;font-size:84px;line-height:1.08;letter-spacing:-2px">Every bill, filed and summarised.</div>
  <div style="position:absolute;left:80px;top:490px;width:900px;font-size:30px;line-height:1.35;color:${MUTED};font-family:Helvetica,Arial,sans-serif">Collect recurring bills from email, file the PDFs in Google Drive and send one clear summary.</div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:12px;background:${GREEN}"></div>
</body></html>`;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
async function png(html: string, width: number, height: number, file: string) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html);
  writeFileSync(file, await page.screenshot({ type: "png", omitBackground: true, clip: { x: 0, y: 0, width, height } }));
  await page.close();
}
const icon = (size: number, file: string, radius: number) => png(`<body style="margin:0;background:transparent">${mark(size, radius)}</body>`, size, size, file);

await icon(192, "public/icon-192.png", 6);
await icon(512, "public/icon-512.png", 6);
await icon(180, "src/app/apple-icon.png", 0); // iOS rounds the corners itself, so the touch icon is a full square
await png(social, 1200, 630, "src/app/opengraph-image.png");
writeFileSync("src/app/opengraph-image.alt.txt", "Billfold: every bill, filed and summarised.\n");
await browser.close();
console.log("brand assets written");
