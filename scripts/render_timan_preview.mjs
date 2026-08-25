import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const svgPath = path.resolve("Timan_Dealer_Map_Germany_80x60cm.svg");
const outPath = path.resolve("Timan_Dealer_Map_Germany_preview.png");
const svg = fs.readFileSync(svgPath, "utf8");

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: 1600, height: 1200 },
  deviceScaleFactor: 1,
});
page.setDefaultTimeout(120000);
await page.setContent(`<!doctype html>
<html>
  <head>
    <style>
      html, body { margin: 0; width: 1600px; height: 1200px; overflow: hidden; background: #f1eee7; }
      svg { display: block; width: 1600px; height: 1200px; }
    </style>
  </head>
  <body>${svg}</body>
</html>`, { waitUntil: "load" });
await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 1600, height: 1200 } });
await browser.close();
console.log(`Wrote ${outPath}`);
