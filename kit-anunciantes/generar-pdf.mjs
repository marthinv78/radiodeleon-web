// Genera kit-anunciantes/Radio-de-Leon-anunciantes.pdf a partir de kit.html
// Uso: node kit-anunciantes/generar-pdf.mjs   (necesita Playwright con Chromium)
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(join(dir, "kit.html")).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: join(dir, "Radio-de-Leon-anunciantes.pdf"), format: "Letter", printBackground: true, pageRanges: "1" });
await browser.close();
console.log("✓ kit-anunciantes/Radio-de-Leon-anunciantes.pdf");
