import fs from "node:fs";
import { geoCentroid, geoMercator, geoPath } from "d3-geo";

const W = 800;
const H = 600;
const panelW = 300;
const mapBox = [[300, 45], [750, 548]];
const mapTransform = "translate(273 31) scale(1.14) translate(-300 -45)";

const paths = {
  dealers: "dealers_verified.geojson",
  states: "tmp/mapdata/bundeslaender.geo.json",
  logo: "C:/Users/nb/OneDrive - Timan A S/AI - Digitalisering/Til konfigurator/Logo/Timan logo komprimeret.png",
  machine3330: "C:/Users/nb/OneDrive - Timan A S/AI - Digitalisering/Til konfigurator/Timan 3330/2620.png",
  rc1000s: "C:/Users/nb/OneDrive - Timan A S/AI - Digitalisering/Til konfigurator/RC-1000s/RC-1000s.png",
  rc751: "C:/Users/nb/OneDrive - Timan A S/AI - Digitalisering/Til konfigurator/RC-751/RC-751.png",
};

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function dataUri(path) {
  return `data:image/png;base64,${fs.readFileSync(path).toString("base64")}`;
}

function displayNumber(value) {
  return String(Number(value));
}

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const cols = line.split(",");
    return Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ""]));
  });
}

const dealersCsv = parseCsv(fs.readFileSync("dealers_verified.csv", "utf8"));
const dealers = JSON.parse(fs.readFileSync(paths.dealers, "utf8"));
const states = JSON.parse(fs.readFileSync(paths.states, "utf8"));

const projection = geoMercator().fitExtent(mapBox, states);
const path = geoPath(projection);

const labelOverrides = {
  "Schleswig-Holstein": [9.7, 54.15],
  Niedersachsen: [9.35, 52.7],
  "Nordrhein-Westfalen": [7.65, 51.6],
  Hessen: [9.2, 50.78],
  Thüringen: [11.34, 50.98],
  Sachsen: [13.2, 51.0],
  "Sachsen-Anhalt": [11.7, 51.95],
  Bayern: [11.35, 49.05],
  "Baden-Württemberg": [8.95, 48.75],
  Saarland: [6.95, 49.42],
  Berlin: [13.37, 52.48],
  Brandenburg: [13.3, 52.35],
  Bremen: [8.8, 53.1],
  Hamburg: [10.0, 53.55],
  "Mecklenburg-Vorpommern": [12.4, 53.8],
  "Rheinland-Pfalz": [7.55, 49.95],
};

const stateFills = [
  "#ece8df", "#e4e0d7", "#f1eee7", "#e7e3da",
  "#eeeae1", "#dedad1", "#f5f2ea", "#e9e5dc",
];

const stateShapes = states.features.map((feature, index) => {
  const d = path(feature);
  const fill = stateFills[index % stateFills.length];
  return `<path class="state" d="${d}" fill="${fill}"/>`;
}).join("\n");

const stateLabels = states.features.map((feature) => {
  const name = feature.properties.name;
  const coords = labelOverrides[name] ?? geoCentroid(feature);
  const [x, y] = projection(coords);
  const size = name.length > 18 ? 5.8 : 6.6;
  return `<text class="state-label" x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${size}">${esc(name)}</text>`;
}).join("\n");

const cityLabels = [
  ["Hamburg", 9.9937, 53.5511],
  ["Berlin", 13.405, 52.52],
  ["Hannover", 9.732, 52.3759],
  ["Köln", 6.9603, 50.9375],
  ["Frankfurt", 8.6821, 50.1109],
  ["Nürnberg", 11.0767, 49.4521],
  ["München", 11.582, 48.1351],
  ["Stuttgart", 9.1829, 48.7758],
  ["Dresden", 13.7373, 51.0504],
].map(([name, lon, lat]) => {
  const [x, y] = projection([lon, lat]);
  if (name === "München") {
    return `<g class="city"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.25"/><text x="${(x - 4).toFixed(2)}" y="${(y + 7.2).toFixed(2)}" text-anchor="end">${esc(name)}</text></g>`;
  }
  if (name === "Hamburg") {
    return `<g class="city"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.25"/><text x="${(x + 7.8).toFixed(2)}" y="${(y + 5.2).toFixed(2)}">${esc(name)}</text></g>`;
  }
  if (name === "Berlin") {
    return `<g class="city"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.25"/><text x="${(x + 7.2).toFixed(2)}" y="${(y + 4.8).toFixed(2)}">${esc(name)}</text></g>`;
  }
  if (name === "Stuttgart") {
    return `<g class="city"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.25"/><text x="${(x + 6).toFixed(2)}" y="${(y - 3.2).toFixed(2)}">${esc(name)}</text></g>`;
  }
  return `<g class="city"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.25"/><text x="${(x + 3).toFixed(2)}" y="${(y + 1.7).toFixed(2)}">${esc(name)}</text></g>`;
}).join("\n");

const points = dealers.features.map((feature) => {
  const [lon, lat] = feature.geometry.coordinates;
  const [x, y] = projection([lon, lat]);
  return {
    feature,
    x,
    y,
    drawX: x,
    drawY: y,
    color: feature.properties.pin_color === "green" ? "#079641" : "#e30613",
  };
});

for (let round = 0; round < 8; round++) {
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i];
      const b = points[j];
      const dx = b.drawX - a.drawX;
      const dy = b.drawY - a.drawY;
      const dist = Math.hypot(dx, dy);
      if (dist > 0 && dist < 20) {
        const push = (20 - dist) / 2;
        const ux = dx / dist;
        const uy = dy / dist;
        a.drawX -= ux * push;
        a.drawY -= uy * push;
        b.drawX += ux * push;
        b.drawY += uy * push;
      }
    }
  }
}

const pinShapes = points.map((point) => {
  const p = point.feature.properties;
  const hasOffset = Math.hypot(point.drawX - point.x, point.drawY - point.y) > 2;
  const line = hasOffset
    ? `<line class="leader" x1="${point.x.toFixed(2)}" y1="${point.y.toFixed(2)}" x2="${point.drawX.toFixed(2)}" y2="${point.drawY.toFixed(2)}"/>`
    : "";
  return `<g class="pin">
    ${line}
    <circle class="pin-shadow" cx="${(point.drawX + 1.2).toFixed(2)}" cy="${(point.drawY + 1.5).toFixed(2)}" r="8.6"/>
    <circle cx="${point.drawX.toFixed(2)}" cy="${point.drawY.toFixed(2)}" r="8.3" fill="${point.color}"/>
    <circle cx="${point.drawX.toFixed(2)}" cy="${point.drawY.toFixed(2)}" r="6.65" fill="none" stroke="#fff" stroke-width="1.15" opacity=".92"/>
    <text x="${point.drawX.toFixed(2)}" y="${(point.drawY + 2.15).toFixed(2)}">${esc(displayNumber(p.number))}</text>
  </g>`;
}).join("\n");

const listRows = dealersCsv.map((row, index) => {
  const y = 164 + index * 12.95;
  const color = row.Type === "Service Partner" ? "#079641" : "#e30613";
  const line2 = `${row.Adresse}, ${row.Postnr} ${row.By}`;
  const companyWidth = row.Firma.length > 34 ? ` textLength="184" lengthAdjust="spacingAndGlyphs"` : "";
  const addressWidth = line2.length > 50 ? ` textLength="184" lengthAdjust="spacingAndGlyphs"` : "";
  return `<g class="dealer-row" transform="translate(0 ${y.toFixed(2)})">
    <text x="30" y="0" class="list-no" fill="${color}">${esc(displayNumber(row.Nr))}</text>
    <text x="53" y="0" class="list-company"${companyWidth}>${esc(row.Firma)}</text>
    <text x="53" y="5.95" class="list-address"${addressWidth}>${esc(line2)}</text>
  </g>`;
}).join("\n");

const logoUri = dataUri(paths.logo);
const machine3330Uri = dataUri(paths.machine3330);
const rc1000sUri = dataUri(paths.rc1000s);
const rc751Uri = dataUri(paths.rc751);

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800mm" height="600mm" viewBox="0 0 800 600">
  <defs>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="7" stdDeviation="6" flood-color="#7f7466" flood-opacity=".20"/>
    </filter>
    <filter id="pinShadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="1.8" stdDeviation="1.6" flood-color="#2f2d29" flood-opacity=".35"/>
    </filter>
    <pattern id="paper" width="18" height="18" patternUnits="userSpaceOnUse">
      <rect width="18" height="18" fill="#f4f1ea"/>
      <path d="M0 9H18M9 0V18" stroke="#d9d2c5" stroke-width=".25" opacity=".18"/>
    </pattern>
    <linearGradient id="panelGrad" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#f8f6f1"/>
      <stop offset="1" stop-color="#e5dfd3"/>
    </linearGradient>
    <clipPath id="panelClip"><path d="M0 0H300L306 372L286 600H0Z"/></clipPath>
    <clipPath id="leftMachineClip"><path d="M0 498H318V600H0Z"/></clipPath>
    <clipPath id="rc1000sClip"><path d="M130 476H352V600H130Z"/></clipPath>
    <clipPath id="rightMachineClip"><path d="M520 365H800V600H520Z"/></clipPath>
    <linearGradient id="leftMachineFade" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".18" stop-color="#fff" stop-opacity=".88"/>
      <stop offset=".78" stop-color="#fff" stop-opacity=".88"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="rightMachineFade" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".18" stop-color="#fff" stop-opacity=".9"/>
      <stop offset=".86" stop-color="#fff" stop-opacity=".9"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="edgeFade" cx="50%" cy="52%" r="67%">
      <stop offset=".46" stop-color="#fff" stop-opacity="1"/>
      <stop offset=".78" stop-color="#fff" stop-opacity=".64"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <mask id="leftMachineMask">
      <rect x="0" y="492" width="318" height="108" fill="url(#leftMachineFade)"/>
      <rect x="0" y="492" width="318" height="108" fill="url(#edgeFade)" opacity=".72"/>
    </mask>
    <mask id="rc1000sMask">
      <rect x="130" y="482" width="188" height="118" fill="url(#leftMachineFade)"/>
      <rect x="130" y="482" width="188" height="118" fill="url(#edgeFade)" opacity=".72"/>
    </mask>
    <mask id="rightMachineMask">
      <rect x="520" y="365" width="280" height="235" fill="url(#rightMachineFade)"/>
      <rect x="520" y="365" width="280" height="235" fill="url(#edgeFade)" opacity=".68"/>
    </mask>
  </defs>
  <style>
    svg{font-family:Arial, Helvetica, sans-serif;background:#f1eee7;color:#222}
    .fine{font-size:5px;fill:#7d756a;letter-spacing:0}
    .state{stroke:#fff;stroke-width:1.35;filter:url(#softShadow)}
    .state-label{fill:#7e766d;text-anchor:middle;font-weight:700;letter-spacing:0;text-transform:uppercase;opacity:.82}
    .city circle{fill:#999188;opacity:.58}
    .city text{font-size:4.7px;fill:#8c8479;opacity:.68}
    .pin{filter:url(#pinShadow)}
    .pin text{font-size:6px;font-weight:800;text-anchor:middle;fill:#fff;letter-spacing:0}
    .pin-shadow{fill:#61594f;opacity:.22}
    .leader{stroke:#4e4942;stroke-width:.55;opacity:.45}
    .machine-art{mix-blend-mode:multiply}
    .title{font-size:10.8px;font-weight:900;fill:#25231f;letter-spacing:0}
    .subtitle{font-size:6.3px;fill:#6b645c;letter-spacing:.35px}
    .legend{font-size:6.8px;font-weight:800;fill:#2f2c28}
    .list-no{font-size:6.55px;font-weight:900;letter-spacing:0}
    .list-company{font-size:6.05px;font-weight:800;fill:#25231f;letter-spacing:0}
    .list-address{font-size:4.55px;fill:#665f57;letter-spacing:0}
  </style>
  <rect width="800" height="600" fill="url(#paper)"/>
  <path d="M300 0H800V600H286L306 372Z" fill="#ece8df"/>
  <path d="M318 0H800V600H304L322 372Z" fill="#e6e0d5" opacity=".11"/>
  <g opacity=".05">
    <path d="M324 65C315 155 318 278 326 370C320 436 309 521 300 600H800V0H336C331 20 327 42 324 65Z" fill="#d8d0c2"/>
  </g>
  <g clip-path="url(#panelClip)">
    <path d="M0 0H300L306 372L286 600H0Z" fill="url(#panelGrad)"/>
    <image href="${logoUri}" x="28" y="23" width="178" height="82" preserveAspectRatio="xMidYMid meet"/>
    <text class="title" x="28" y="121" textLength="238" lengthAdjust="spacingAndGlyphs">UNSERE HÄNDLER UND PARTNER</text>
    <g transform="translate(30 122)">
      <circle cx="4" cy="17" r="5.1" fill="#e30613"/><text x="15" y="19.4" class="legend">HÄNDLER</text>
      <circle cx="91" cy="17" r="5.1" fill="#079641"/><text x="102" y="19.4" class="legend">SERVICE PARTNER</text>
    </g>
    <g clip-path="url(#leftMachineClip)" mask="url(#leftMachineMask)" class="machine-art">
      <image href="${rc751Uri}" x="-2" y="501" width="136" height="91" opacity=".20" preserveAspectRatio="xMidYMid meet"/>
    </g>
    <g clip-path="url(#rc1000sClip)" mask="url(#rc1000sMask)" class="machine-art">
      <image href="${rc1000sUri}" x="-352" y="462" width="208" height="138" opacity=".20" transform="scale(-1 1)" preserveAspectRatio="xMidYMid meet"/>
    </g>
    ${listRows}
  </g>
  <g transform="translate(0 0)">
    <text x="766" y="31" font-size="6.6" font-weight="800" fill="#6b6258" letter-spacing=".52" text-anchor="end">TIMAN PARTNERNETZ · DEUTSCHLAND</text>
  </g>
  <g id="map">
    <g clip-path="url(#rightMachineClip)" mask="url(#rightMachineMask)" class="machine-art" opacity=".24">
      <image href="${machine3330Uri}" x="-820" y="370" width="300" height="200" transform="scale(-1 1)" preserveAspectRatio="xMidYMid meet"/>
    </g>
    <g transform="${mapTransform}">
      <path d="M292 52C338 31 414 27 494 35C601 47 704 29 780 58V568C655 547 572 558 493 563C416 568 344 555 298 529C288 393 286 210 292 52Z" fill="#ddd6c9" opacity=".48"/>
      ${stateShapes}
      <path d="${path({type:"FeatureCollection",features:states.features})}" fill="none" stroke="#b8afa2" stroke-width="1.7"/>
      ${stateLabels}
      ${cityLabels}
      ${pinShapes}
    </g>
  </g>
</svg>
`;

fs.writeFileSync("Timan_Dealer_Map_Germany_80x60cm.svg", svg, "utf8");
console.log("Wrote Timan_Dealer_Map_Germany_80x60cm.svg");
