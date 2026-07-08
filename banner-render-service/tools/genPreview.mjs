/* Dev helper: render every START format to public/preview/<size>.html
 * plus a gallery.html that iframes them all. Run: node tools/genPreview.mjs */
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SIZES, renderAdaptiveBanner } from "../public/lib/templates.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "preview");
mkdirSync(outDir, { recursive: true });

const copy = {
  eyebrow: "Health & Beauty",
  headline: "Everyday energy for the whole family",
  subheadline: "Selected supplements with support for every day.",
  cta: "See the offer",
  legal: "Offer valid while stocks last."
};
const config = {
  badge:    { enabled: true,  props: { variant: "redCircle", value: "-40%" } },
  pricetag: { enabled: true,  props: { variant: "omnibus", now: "29,99", old: "49,99", oldLabel: "Lowest price in 30 days " } },
  pattern:  { enabled: true,  props: { opacity: 0.14 } }
};

const starts = Object.entries(SIZES).filter(([, s]) => s.start);
for (const [sizeKey] of starts) {
  const html = renderAdaptiveBanner({
    sizeKey, config, copy,
    scene: "../img/styles/products-studio.png",
    logo: "../img/drmax_logo.png",
    fontBase: "../fonts"
  });
  writeFileSync(path.join(outDir, `${sizeKey}.html`), html);
}

// ── 1080×1350 shape variations (lib slot/shape/*) ──
const VAR_SIZE = "1080x1350";
// stroke holds a transparent product packshot (no scene photo) — none in repo,
// so the stroke demos render the bare outline (the line element itself).
const variations = [
  { label: "shape/left · plate", shape: "plate",  placement: "top",      flip: false, scene: "../img/styles/products-studio.png" },
  { label: "stroke/left",        shape: "stroke", placement: "top",      flip: false, scene: "" },
  { label: "stroke/right",       shape: "stroke", placement: "vertical", flip: true,  scene: "" },
];
variations.forEach((v, i) => {
  const html = renderAdaptiveBanner({
    sizeKey: VAR_SIZE,
    config: { ...config, scene: { enabled: true, props: { shape: v.shape, placement: v.placement, flip: v.flip } } },
    copy, scene: v.scene, logo: "../img/drmax_logo.png", fontBase: "../fonts", assetBase: "../"
  });
  writeFileSync(path.join(outDir, `var-${i}.html`), html);
});

// ── 1080×1350 text/image layout & text alignment ──
const STUDIO = "../img/styles/products-studio.png";
const layoutVars = [
  { label: "image top · text bottom (default)", placement: "vertical", align: "left" },
  { label: "text top · image bottom (swap)",    placement: "vbottom",  align: "left" },
  { label: "text · align left",   placement: "vertical", align: "left" },
  { label: "text · align center", placement: "vertical", align: "center" },
  { label: "text · align right",  placement: "vertical", align: "right" },
];
layoutVars.forEach((v, i) => {
  const html = renderAdaptiveBanner({
    sizeKey: VAR_SIZE,
    config: { ...config, scene: { enabled: true, props: { shape: "none", placement: v.placement } } },
    copy, scene: STUDIO, logo: "../img/drmax_logo.png", fontBase: "../fonts", assetBase: "../", align: v.align, logoPos: "br"
  });
  writeFileSync(path.join(outDir, `lay-${i}.html`), html);
});

// ── 1080×1350 logo corners (badge/pricetag off so the logo positions read clean) ──
const logoVars = [
  { label: "logo ↖ top-left",  logoPos: "tl" },
  { label: "logo ↗ top-right", logoPos: "tr" },
  { label: "logo ↙ bottom-left",  logoPos: "bl" },
  { label: "logo ↘ bottom-right", logoPos: "br" },
];
const logoCfg = { ...config, badge: { enabled: false }, pricetag: { enabled: false } };
logoVars.forEach((v, i) => {
  const html = renderAdaptiveBanner({
    sizeKey: VAR_SIZE,
    config: { ...logoCfg, scene: { enabled: true, props: { shape: "none", placement: "vertical" } } },
    copy, scene: STUDIO, logo: "../img/drmax_logo.png", fontBase: "../fonts", assetBase: "../", logoPos: v.logoPos
  });
  writeFileSync(path.join(outDir, `logo-${i}.html`), html);
});

// gallery card helper — STAMP busts the iframe cache so previews always reload
const STAMP = Date.now();
function card(caption, src, dw, dh, scale) {
  const sc = Math.min(1, 240 / dw);           // fit to ~240px wide for the gallery
  const bw = Math.round(dw * sc), bh = Math.round(dh * sc);
  const bust = src + (src.includes("?") ? "&" : "?") + "t=" + STAMP;
  return `<figure style="margin:0">
    <figcaption style="font:600 12px Arial;color:#374151;margin-bottom:6px">${caption}</figcaption>
    <div style="width:${bw}px;height:${bh}px;overflow:hidden;border:1px solid #e5e7eb;border-radius:8px">
      <iframe src="${bust}" width="${dw}" height="${dh}" scrolling="no"
        style="border:0;width:${dw}px;height:${dh}px;transform:scale(${sc.toFixed(4)});transform-origin:top left"></iframe>
    </div>
  </figure>`;
}
const cards = starts.map(([k, s]) =>
  card(`${s.channel} · ${k}${s.scale ? ` (×${s.scale})` : ""}`, `${k}.html`, s.w, s.h)
).join("");
const vs = SIZES[VAR_SIZE];
const varCards = variations.map((v, i) => card(v.label, `var-${i}.html`, vs.w, vs.h)).join("");
const layCards = layoutVars.map((v, i) => card(v.label, `lay-${i}.html`, vs.w, vs.h)).join("");
const logoCards = logoVars.map((v, i) => card(v.label, `logo-${i}.html`, vs.w, vs.h)).join("");

writeFileSync(path.join(outDir, "gallery.html"),
  `<!DOCTYPE html><meta charset="utf-8"><title>Adaptive preview</title>
<body style="background:#f4f6f8;padding:24px;font-family:Arial">
<h2 style="color:#356B09">Adaptive templates — start formats</h2>
<div style="display:flex;flex-wrap:wrap;gap:28px;align-items:flex-start">${cards}</div>
<h2 style="color:#356B09;margin-top:36px">1080×1350 — shape variations</h2>
<div style="display:flex;flex-wrap:wrap;gap:28px;align-items:flex-start">${varCards}</div>
<h2 style="color:#356B09;margin-top:36px">1080×1350 — text/image layout &amp; alignment</h2>
<div style="display:flex;flex-wrap:wrap;gap:28px;align-items:flex-start">${layCards}</div>
<h2 style="color:#356B09;margin-top:36px">1080×1350 — logo corners</h2>
<div style="display:flex;flex-wrap:wrap;gap:28px;align-items:flex-start">${logoCards}</div>`);

console.log(`Generated ${starts.length} previews + ${variations.length + layoutVars.length + logoVars.length} variations + gallery in public/preview/`);
