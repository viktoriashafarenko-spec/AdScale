/* Dr.Max — universal templates.
 *
 * A template is pure data: an archetype + which library elements live in which
 * zone. It carries NO pixel sizes — the same template renders at 300x250 or
 * 1080x1920 because every element sizes itself in container units (see
 * elements.js). Reformat = just render the same template at the new w/h.
 *
 *   archetypes:  split (content left, scene pill right)
 *                stack (scene on top, content below)  ← portrait / vertical
 *                strip (single row)                   ← leaderboards / 320x50
 */

import {
  THEME, ELEMENT_CSS, renderElement, bannerBackground, ELEMENTS
} from "./elements.js?v=46";

/* ─── templates (data) ───────────────────────────────────────────── */

export const TEMPLATES = {
  split: {
    id: "split", name: "Split — scene right", archetype: "split",
    zones: [
      { name: "decor",   els: ["pattern"] },
      { name: "media",   els: ["scene"] },
      { name: "content", els: ["eyebrow", "headline", "subheadline", "cta"] },
      { name: "overlay", els: ["badge", "promoFlag", "pricetag", "logo"] }
    ]
  },
  stack: {
    id: "stack", name: "Stack — scene top", archetype: "stack",
    zones: [
      { name: "decor",   els: ["pattern"] },
      { name: "media",   els: ["scene"] },
      { name: "content", els: ["eyebrow", "headline", "subheadline", "cta", "legal"] },
      { name: "overlay", els: ["badge", "promoFlag", "pricetag", "logo"] }
    ]
  },
  strip: {
    id: "strip", name: "Strip — single row", archetype: "strip",
    zones: [
      { name: "content", els: ["headline", "cta", "logo"] }
    ]
  }
};

/* ─── sizes (data). `start:true` = the launch formats. ───────────── */

export const SIZES = {
  // Meta
  "1080x1350": { w: 1080, h: 1350, template: "stack", placement: "vertical", channel: "Meta 4:5",  start: true },
  "1080x1920": { w: 1080, h: 1920, template: "stack", placement: "vertical", channel: "Meta 9:16", start: true },
  "1080x1080": { w: 1080, h: 1080, template: "stack", placement: "vertical", channel: "Meta 1:1" },
  // GDN
  "300x250":   { w: 300,  h: 250,  template: "split", placement: "right", channel: "GDN",       start: true },
  "336x280":   { w: 336,  h: 280,  template: "split", placement: "right", channel: "GDN" },
  // Sklik
  "300x600":   { w: 300,  h: 600,  template: "stack", placement: "vertical", channel: "Sklik",  start: true },
  // Direct
  "320x50":    { w: 320,  h: 50,   template: "strip", channel: "Direct",    start: true },
  "728x90":    { w: 728,  h: 90,   template: "strip", channel: "Direct" },
  "970x250":   { w: 970,  h: 250,  template: "split", placement: "right", channel: "Direct", hidden: true },
  // Web banners (rendered at 2× for crispness → display 360x330)
  "360x330":   { w: 360,  h: 330,  template: "split", placement: "right", channel: "Web", scale: 2, start: true },
  "1140x330":  { w: 1140, h: 330,  template: "split", placement: "right", channel: "Web", hidden: true }
};

// Which placements make sense for a given size (used by the builder UI).
export function placementsFor(sizeKey) {
  const s = SIZES[sizeKey]; if (!s || s.template === "strip") return [];
  const r = s.w / s.h;
  if (r < 0.9) return ["vertical", "top", "vbottom", "vtop", "diagonal"]; // portrait
  if (r > 1.6) return ["right", "left", "diagonal"];   // wide
  return ["right", "left", "vertical", "diagonal"];    // near-square
}

export function listTemplates() {
  return Object.values(TEMPLATES).map((t) => ({ id: t.id, name: t.name, archetype: t.archetype }));
}
export function listSizes() {
  return Object.entries(SIZES).map(([id, s]) => ({ id, ...s }));
}

/* ─── default config (which elements are on) ─────────────────────── */

function defaultConfig() {
  const cfg = {};
  for (const id of Object.keys(ELEMENTS)) {
    const on = ["background", "scene", "eyebrow", "headline", "subheadline", "cta", "logo"].includes(id);
    cfg[id] = { enabled: on, props: {} };
  }
  return cfg;
}

// Map the copy object onto text-element props.
function applyCopy(cfg, copy = {}) {
  const set = (id, prop, val) => {
    if (val == null || val === "") return;
    cfg[id] = cfg[id] || { enabled: true, props: {} };
    cfg[id].props = { ...cfg[id].props, [prop]: val };
  };
  set("eyebrow", "text", copy.eyebrow);
  set("headline", "text", copy.headline);
  set("subheadline", "text", copy.subheadline);
  set("cta", "text", copy.cta);
  set("legal", "text", copy.legal);
  return cfg;
}

/* ─── CSS assembly ───────────────────────────────────────────────── */

const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box;}
html,body{margin:0;padding:0;}
.ad{position:relative;overflow:hidden;font-family:${THEME.font};container-type:size;isolation:isolate;}
.zone{position:absolute;}
.z-decor{inset:0;z-index:0;pointer-events:none;}
.z-content{display:flex;flex-direction:column;justify-content:center;z-index:3;}
.z-overlay{inset:0;z-index:5;pointer-events:none;}
`;

const LAYOUT_CSS = `
/* ── scene placement: RIGHT (rounded-left pill, content left) ── */
.sc-right .z-media{top:0;right:0;height:100%;width:50cqw;
  border-top-left-radius:999px;border-bottom-left-radius:999px;}
.sc-right .z-content{top:0;left:0;height:100%;width:56cqw;
  gap:clamp(5px,2.4cqh,24px);padding:clamp(12px,6cqh,56px) clamp(12px,5cqw,64px);}
.sc-right .el-pricetag{left:0;right:auto;bottom:6cqh;}
.sc-right .el-logo{left:5cqw;right:auto;}

/* ── scene placement: LEFT (mirror of right) ── */
.sc-left .z-media{top:0;left:0;height:100%;width:50cqw;
  border-top-right-radius:999px;border-bottom-right-radius:999px;}
.sc-left .z-content{top:0;right:0;height:100%;width:56cqw;text-align:right;
  gap:clamp(5px,2.4cqh,24px);padding:clamp(12px,6cqh,56px) clamp(12px,5cqw,64px);}
.sc-left .z-content .el-eyebrow,.sc-left .z-content .el-cta{align-self:flex-end;}
.sc-left .el-badge{left:5cqw;right:auto;}
.sc-left .el-promo{left:5cqw;right:auto;}
.sc-left .el-pricetag{left:0;right:auto;bottom:6cqh;}
.sc-left .el-logo{right:5cqw;left:auto;}

/* ── scene placement: VERTICAL (scene top, content bottom) ──
   media is a capsule (Square.svg): left cap rounded (semicircle), flush right ── */
.sc-vertical .z-media{top:7cqh;left:8cqw;right:0;height:44cqh;
  border-radius:999px 0 0 999px;}
.sc-vertical .z-content{left:0;bottom:0;width:100%;height:52cqh;justify-content:flex-end;
  gap:clamp(5px,2cqh,22px);padding:clamp(12px,5cqw,56px);padding-bottom:clamp(16px,6cqh,72px);}
.sc-vertical .el-pricetag{top:53cqh;bottom:auto;left:0;}

/* ── scene placement: DIAGONAL (clipped scene, content left) ── */
.sc-diagonal .z-media{inset:0;width:100%;height:100%;
  clip-path:polygon(42% 0,100% 0,100% 100%,68% 100%);}
.sc-diagonal .z-content{top:0;left:0;height:100%;width:56cqw;justify-content:center;
  gap:clamp(5px,2.4cqh,24px);padding:clamp(12px,6cqh,56px) clamp(12px,5cqw,64px);}
.sc-diagonal .el-pricetag{left:0;right:auto;bottom:6cqh;}
.sc-diagonal .el-logo{left:5cqw;right:auto;}

/* ── TOP (lib "shape/left"): exact mirror of vertical — same height/position,
     just flush-left with the RIGHT cap rounded ── */
.sc-top .z-media{top:7cqh;left:0;right:8cqw;height:44cqh;
  border-radius:0 999px 999px 0;}
.sc-top .z-content{left:0;bottom:0;width:100%;height:52cqh;justify-content:flex-end;
  gap:clamp(5px,2cqh,22px);padding:clamp(12px,5cqw,56px);padding-bottom:clamp(16px,6cqh,72px);}
.sc-top .el-pricetag{top:53cqh;bottom:auto;left:0;}

/* ── CORNER (lib "Frame 1"): media flush top-right, bottom-left corner rounded; content bottom ── */
.sc-corner .z-media{top:0;right:0;left:auto;width:74cqw;height:54cqh;
  border-radius:0 0 0 999px;}
.sc-corner .z-content{left:0;bottom:0;width:100%;height:50cqh;justify-content:flex-end;
  gap:clamp(5px,2cqh,22px);padding:clamp(12px,5cqw,56px);padding-bottom:clamp(16px,6cqh,72px);}
.sc-corner .el-pricetag{top:auto;bottom:6cqh;left:0;}

/* ── VBOTTOM: swap of vertical — text on top, image capsule at the bottom ── */
.sc-vbottom .z-media{top:auto;bottom:7cqh;left:8cqw;right:0;height:44cqh;
  border-radius:999px 0 0 999px;}
.sc-vbottom .z-content{top:0;left:0;width:100%;height:52cqh;justify-content:flex-start;
  gap:clamp(5px,2cqh,22px);padding:clamp(16px,6cqh,72px) clamp(12px,5cqw,56px) 0;}
.sc-vbottom .el-pricetag{top:auto;bottom:53cqh;left:0;}

/* ── VBOTTOM-LEFT: mirror of vbottom — image capsule bottom, flush left, right cap rounded ── */
.sc-vbottom-left .z-media{top:auto;bottom:7cqh;left:0;right:8cqw;height:44cqh;
  border-radius:0 999px 999px 0;}
.sc-vbottom-left .z-content{top:0;left:0;width:100%;height:52cqh;justify-content:flex-start;
  gap:clamp(5px,2cqh,22px);padding:clamp(16px,6cqh,72px) clamp(12px,5cqw,56px) 0;}
.sc-vbottom-left .el-pricetag{top:auto;bottom:53cqh;left:0;}

/* ── VTOP: vertical dome — image on top (flush), rounded BOTTOM; content bottom ── */
.sc-vtop .z-media{top:0;left:8cqw;right:8cqw;height:55cqh;
  border-bottom-left-radius:999px;border-bottom-right-radius:999px;}
.sc-vtop .z-content{left:0;bottom:0;width:100%;height:45cqh;justify-content:flex-end;
  gap:clamp(5px,2cqh,22px);padding:clamp(12px,5cqw,56px);padding-bottom:clamp(16px,6cqh,72px);}
.sc-vtop .el-pricetag{top:auto;bottom:46cqh;left:0;}

/* ── near-square / landscape formats: media slot ~2/3 width (shifted, 1/3 free) ── */
.ad--sq.sc-top .z-media{right:34cqw;}
.ad--sq.sc-vertical .z-media{left:34cqw;}
.ad--sq.sc-vbottom .z-media{left:34cqw;}
.ad--sq.sc-vbottom-left .z-media{right:34cqw;}

/* ── text alignment of the content block (independent of scene placement) ── */
.ta-left   .z-content{align-items:flex-start;text-align:left;}
.ta-center .z-content{align-items:center;text-align:center;}
.ta-right  .z-content{align-items:flex-end;text-align:right;}
.ta-left   .z-content>*{align-self:flex-start;}
.ta-center .z-content>*{align-self:center;}
.ta-right  .z-content>*{align-self:flex-end;}

/* ── strip (single row, no scene) ── */
.ar-strip .z-content{inset:0;flex-direction:row;align-items:center;justify-content:flex-start;
  gap:clamp(6px,3cqw,16px);padding:0 clamp(8px,3cqw,18px);}
/* strip is always vertically centered — override the ta-* text-align classes */
.ar-strip .z-content>*{align-self:center;}
.ar-strip .el-headline{display:block;line-height:1;align-self:center;
  font-size:clamp(11px,34cqh,22px);white-space:nowrap;overflow:hidden;
  flex:1 1 auto;min-width:0;letter-spacing:0;text-overflow:ellipsis;}
.ar-strip .el-cta{margin:0;align-self:center;font-size:clamp(8px,20cqh,12px);line-height:1;
  padding:clamp(3px,11cqh,7px) clamp(9px,3.4cqw,15px);flex:0 0 auto;}
.ar-strip .el-logo{position:static;height:58cqh;width:auto;flex:0 0 auto;margin-right:clamp(4px,2cqw,18px);}
`;

export function assembleCss({ fontBase = "fonts" } = {}) {
  return `
@font-face{font-family:'Proxima Nova';src:url('${fontBase}/ProximaNova-Regular.otf') format('opentype');font-weight:400;font-display:swap;}
@font-face{font-family:'Proxima Nova';src:url('${fontBase}/ProximaNova-Semibold.otf') format('opentype');font-weight:600;font-display:swap;}
@font-face{font-family:'Proxima Nova';src:url('${fontBase}/ProximaNova-Bold.otf') format('opentype');font-weight:700;font-display:swap;}
${BASE_CSS}
${LAYOUT_CSS}
${ELEMENT_CSS}`;
}

/* ─── render ─────────────────────────────────────────────────────── */

// Returns just the .ad element markup (for embedding).
// `products` = array of (bg-removed) packshot URLs for scene "products" mode.
export function renderBannerInner({ sizeKey, template, config = {}, copy = {}, scene = "", logo = "", products = [], assetBase = "", align = "", logoPos = "" }) {
  const size = SIZES[sizeKey];
  if (!size) throw new Error(`Unknown size: ${sizeKey}`);
  const tpl = TEMPLATES[template || size.template];
  if (!tpl) throw new Error(`Unknown template: ${template || size.template}`);

  // merge config: defaults <- caller config <- copy
  let cfg = defaultConfig();
  for (const [id, v] of Object.entries(config)) {
    cfg[id] = { enabled: v.enabled !== undefined ? v.enabled : (cfg[id]?.enabled ?? true), props: { ...(cfg[id]?.props || {}), ...(v.props || {}) } };
  }
  if (scene) cfg.scene = { enabled: true, props: { ...(cfg.scene?.props || {}), src: scene } };
  // badge & promo share one slot — never render both (badge wins)
  if (cfg.badge?.enabled && cfg.promoFlag?.enabled) cfg.promoFlag.enabled = false;
  applyCopy(cfg, copy);

  const ctx = { logoUrl: logo || "", products, assetBase };
  const zonesHtml = tpl.zones.map((zone) => {
    const inner = zone.els
      .filter((id) => cfg[id] && cfg[id].enabled)
      .map((id) => renderElement(id, cfg[id].props, ctx))
      .join("");
    if (!inner) return "";
    return `<div class="zone z-${zone.name}">${inner}</div>`;
  }).join("");

  // Layout class: strip uses its own; otherwise the scene placement drives it.
  let layoutClass;
  if (tpl.archetype === "strip") {
    layoutClass = "ar-strip";
  } else {
    const placement = cfg.scene?.props?.placement || size.placement || "right";
    layoutClass = `sc-${placement}`;
  }

  const bg = bannerBackground(cfg.background?.props);
  const alignClass = align ? ` ta-${align}` : "";
  const logoClass = (tpl.archetype !== "strip" && logoPos) ? ` lg-${logoPos}` : "";
  const strokeClass = (cfg.scene?.enabled && cfg.scene?.props?.shape === "stroke") ? " ad--stroke" : "";
  // near-square / landscape formats → media slot takes ~2/3 width (not full)
  const sqClass = (size.w / size.h) >= 0.95 ? " ad--sq" : "";
  // library background image → a movable / scalable layer behind everything
  const bp = cfg.background?.props || {};
  const bgImg = bp.image
    ? `<div class="z-bgimg"><img class="el-bgimg" src="${bp.image}" alt="" style="left:${bp.imgX ?? 50}%;top:${bp.imgY ?? 50}%;width:${bp.imgScale ?? 100}%;transform:translate(-50%,-50%)"></div>`
    : "";
  return `<div class="ad ${layoutClass}${alignClass}${logoClass}${strokeClass}${sqClass}" style="width:${size.w}px;height:${size.h}px;background:${bg}">${bgImg}${zonesHtml}</div>`;
}

// Returns a full standalone HTML document (for Puppeteer / browser preview).
export function renderAdaptiveBanner(opts) {
  const size = SIZES[opts.sizeKey];
  const inner = renderBannerInner(opts);
  const css = assembleCss({ fontBase: opts.fontBase });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{width:${size.w}px;height:${size.h}px;overflow:hidden;background:#fff;}
${css}
</style></head><body>${inner}</body></html>`;
}
