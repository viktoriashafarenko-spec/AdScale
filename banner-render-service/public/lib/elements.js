/* Dr.Max — adaptive element library.
 *
 * Every element is described once and renders the same way at ANY banner size.
 * The trick: the banner root (.ad) is a CSS *container* (container-type:size),
 * so each element sizes itself in container units (cqw/cqh) wrapped in clamp().
 * Logo / badge / pricetag / promo are vector SVG, so they stay razor-sharp and
 * scale by a single factor — this is what fixes the old pixel-baked reformat.
 *
 * Each entry:
 *   label      — human name (UI)
 *   category   — grouping (UI)
 *   removable  — can the user toggle it off
 *   defaults   — default props
 *   schema     — editable props (for the cabinet UI)
 *   render(props, ctx) -> HTML string
 * Plus ELEMENT_CSS below: the adaptive styles for all elements.
 */

export const THEME = {
  red: "#E4002B",
  green: "#5DA20A",
  green300: "#78BE20",
  green600: "#356B09",
  greenDark: "#225106",
  badgeBg: "#E8F5CC",
  white: "#FFFFFF",
  ink: "#2B2F33",
  legal: "#6B7280",
  font: "'Proxima Nova','Helvetica Neue',Arial,sans-serif"
};

export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

// Free-drag override: when an element carries props.pos {x,y} (% of banner),
// pin it there (centered on the point), overriding the CSS default corner.
function posStyle(p) {
  if (!p || !p.pos || p.pos.x == null) return "";
  return ` style="left:${p.pos.x}%;top:${p.pos.y}%;right:auto;bottom:auto;transform:translate(-50%,-50%)"`;
}

/* ─── vector builders (scale perfectly) ──────────────────────────── */

function svgLogo(ctx) {
  const src = (ctx && ctx.logoUrl) || "img/drmax_logo.png";
  return `<img class="el-logo" src="${esc(src)}" alt="Dr.Max">`;
}

// Discount badge — variants: redCircle | redOutline | greenDome
function svgBadge(p) {
  const v = p.variant || "redCircle";
  const value = esc(p.value || "-40%");
  if (v === "greenDome") {
    const top = esc(p.text || "");
    return `<svg class="el-badge"${posStyle(p)} viewBox="0 0 300 360" preserveAspectRatio="xMidYMid meet" aria-label="${value}">
<path d="M0 0 H300 V190 C300 282 233 360 150 360 C67 360 0 282 0 190 Z" fill="${THEME.badgeBg}"/>
${top ? `<text x="150" y="90" text-anchor="middle" font-family="${THEME.font}" font-weight="700" font-size="34" fill="${THEME.greenDark}">${top}</text>` : ""}
<text x="150" y="${top ? 235 : 215}" text-anchor="middle" font-family="${THEME.font}" font-weight="800" font-size="118" fill="${THEME.greenDark}">${value}</text></svg>`;
  }
  if (v === "redOutline") {
    return `<svg class="el-badge"${posStyle(p)} viewBox="0 0 120 120" aria-label="${value}">
<circle cx="60" cy="60" r="54" fill="none" stroke="${THEME.red}" stroke-width="9"/>
<text x="60" y="76" text-anchor="middle" font-family="${THEME.font}" font-weight="800" font-size="40" fill="${THEME.red}">${value}</text></svg>`;
  }
  return `<svg class="el-badge"${posStyle(p)} viewBox="0 0 120 120" aria-label="${value}">
<circle cx="60" cy="60" r="58" fill="${THEME.red}"/>
<text x="60" y="76" text-anchor="middle" font-family="${THEME.font}" font-weight="800" font-size="40" fill="${THEME.white}">${value}</text></svg>`;
}

// Pricetag — variants: simple | double | omnibus
function svgPricetag(p) {
  const v = p.variant || "simple";
  const now = esc(p.now || "299,-");
  const old = esc(p.old || "599,-");
  const oldLabel = esc(p.oldLabel || (v === "omnibus" ? "Lowest price in 30 days " : ""));
  if (v === "simple") {
    return `<svg class="el-pricetag"${posStyle(p)} viewBox="0 0 300 130" preserveAspectRatio="xMidYMid meet" aria-label="${now}">
<rect x="0" y="0" width="300" height="130" rx="65" fill="${THEME.red}"/>
<text x="150" y="92" text-anchor="middle" font-family="${THEME.font}" font-weight="800" font-size="62" fill="${THEME.white}">${now}</text></svg>`;
  }
  // double / omnibus: "now" price on top, struck "old" price below (with an
  // optional Omnibus label). The tag widens for the longer Omnibus line so the
  // text never spills out of the red shape, and only the old PRICE is struck.
  const W = oldLabel ? 470 : 360;
  const x2 = W - 80;                       // where the rounded right cap starts
  const tagPath = `M0 0 H${x2} C${x2 + 50} 0 ${W} 30 ${W} 75 C${W} 120 ${x2 + 50} 150 ${x2} 150 H0 Z`;
  const labelSpan = oldLabel ? `<tspan>${oldLabel}</tspan>` : "";
  const oldSpan = `<tspan text-decoration="line-through">${oldLabel ? " " : ""}${old}</tspan>`;
  return `<svg class="el-pricetag"${posStyle(p)} viewBox="0 0 ${W} 150" preserveAspectRatio="xMinYMid meet" aria-label="${now}">
<path d="${tagPath}" fill="${THEME.red}"/>
<text x="32" y="74" font-family="${THEME.font}" font-weight="800" font-size="56" fill="${THEME.white}">${now}</text>
<text x="32" y="118" font-family="${THEME.font}" font-weight="600" font-size="25" fill="${THEME.white}" opacity="0.92">${labelSpan}${oldSpan}</text></svg>`;
}

// Promo flag — "2+1 zdarma"
function svgPromoFlag(p) {
  const big = esc(p.deal || "2+1");
  const small = esc(p.text || "");   // empty text → compact, deal-only variant
  if (!small) {
    // narrower viewBox → narrower CSS width (.el-promo--solo) keeps the deal text the same size
    return `<svg class="el-promo el-promo--solo"${posStyle(p)} viewBox="0 0 190 110" preserveAspectRatio="xMinYMid meet" aria-label="${big}">
<rect x="0" y="0" width="190" height="110" rx="55" fill="${THEME.red}"/>
<text x="95" y="76" text-anchor="middle" font-family="${THEME.font}" font-weight="800" font-size="62" fill="${THEME.white}">${big}</text></svg>`;
  }
  return `<svg class="el-promo"${posStyle(p)} viewBox="0 0 320 110" preserveAspectRatio="xMinYMid meet" aria-label="${big} ${small}">
<rect x="0" y="0" width="320" height="110" rx="55" fill="${THEME.red}"/>
<text x="36" y="76" font-family="${THEME.font}" font-weight="800" font-size="62" fill="${THEME.white}">${big}</text>
<text x="180" y="70" font-family="${THEME.font}" font-weight="700" font-size="34" fill="${THEME.white}">${small}</text></svg>`;
}

// Plus-pattern decoration
function svgPattern(p) {
  const op = p.opacity != null ? p.opacity : 0.16;
  return `<svg class="el-pattern" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs><g id="cr" fill="${THEME.white}" opacity="${op}"><rect x="14" y="2" width="12" height="36" rx="6"/><rect x="2" y="14" width="36" height="12" rx="6"/></g>
<pattern id="pg" width="80" height="80" patternUnits="userSpaceOnUse"><use href="#cr" x="0" y="0"/><use href="#cr" x="40" y="40"/></pattern></defs>
<rect width="200" height="200" fill="url(#pg)"/></svg>`;
}

/* ─── element registry ───────────────────────────────────────────── */

export const ELEMENTS = {
  background: {
    label: "Background", category: "Layout", removable: false,
    defaults: { type: "gradient", angle: 135, from: THEME.green300, to: THEME.green600, imgX: 50, imgY: 50, imgScale: 100 },
    schema: [
      { key: "type", type: "enum", values: ["gradient", "solid"] },
      { key: "from", type: "color" }, { key: "to", type: "color" },
      { key: "angle", type: "number" }
    ],
    // Background paints the .ad itself — see bannerBackground() below.
    render: () => ""
  },

  scene: {
    label: "Scene / Products", category: "Media", removable: true,
    // The media slot is a stadium (pill) region whose radius = half its short
    // side — the same Figma "slot/shape" geometry, kept in pure CSS so it scales
    // to any format. `shape` is the slot treatment:
    //   none   — plain photo (cover) / gradient / background fills the slot
    //   plate  — white pill plate holding a library image / packshot (contain)
    //   stroke — pill outline ("line") + bg-removed packshot floating inside
    // `placement` = which side the slot occupies (right/left/vertical/diagonal).
    defaults: { shape: "none", placement: "right", src: "", packshot: "", imgX: 50, imgY: 50, imgScale: 100 },
    schema: [
      { key: "shape", type: "enum", values: ["none", "plate", "stroke"] },
      { key: "placement", type: "enum", values: ["right", "left", "vertical", "top", "vbottom", "vtop", "diagonal"] },
      { key: "src", type: "image" }, { key: "packshot", type: "image" }
    ],
    render: (p, ctx) => {
      const shape = p.shape || "none";
      const prods = (ctx && ctx.products) || [];
      // the image inside the shape is freely movable / scalable (drag + wheel in the builder)
      const fillSty = `left:${p.imgX ?? 50}%;top:${p.imgY ?? 50}%;width:${p.imgScale ?? 100}%;transform:translate(-50%,-50%)`;
      const fillImg = p.src ? `<img class="el-scene-fill" src="${esc(p.src)}" alt="" style="${fillSty}">` : "";
      // packshot = a product object placed inside a plate/stroke shape (picked in Layout, or first upload).
      // rendered as a draggable/scalable el-scene-fill so it can be moved & resized just like the photo.
      const packshot = p.packshot || prods[0] || "";
      const packImg = packshot ? `<img class="el-scene-fill el-scene-fill--pack" src="${esc(packshot)}" alt="" style="${fillSty}">` : "";
      const assetBase = (ctx && ctx.assetBase) || "";
      // stroke: the actual library outline shape (slot/shape/stroke) + movable packshot inside
      if (shape === "stroke") {
        const ring = `<img class="el-scene-ring" src="${esc(assetBase + "library/shape-stroke-left.svg?v=3")}" alt="">`;
        const inner = packImg || `<div class="el-scene-ph"></div>`;
        const flip = p.flip ? " el-scene--flip" : "";
        return `<div class="el-scene el-scene--stroke${flip}">${ring}${inner}</div>`;
      }
      // plate: white pill — a movable packshot, or a photo filling it (cover)
      if (shape === "plate") {
        const inner = packImg || fillImg || `<div class="el-scene-ph"></div>`;
        return `<div class="el-scene el-scene--plate">${inner}</div>`;
      }
      // none: photo fills the pill (cover), pan/zoomable
      const inner = fillImg || `<div class="el-scene-ph"></div>`;
      return `<div class="el-scene">${inner}</div>`;
    }
  },

  eyebrow: {
    label: "Category plaque", category: "Text", removable: true,
    defaults: { text: "Health & Beauty", bg: THEME.white, color: THEME.green, size: 100 },
    schema: [{ key: "text", type: "text" }, { key: "bg", type: "color" }, { key: "color", type: "color" }, { key: "size", type: "number" }],
    render: (p) => `<span class="el-eyebrow" style="background:${esc(p.bg)};color:${esc(p.color)};--size:${(Number(p.size) || 100) / 100}">${esc(p.text)}</span>`
  },

  headline: {
    label: "Headline", category: "Text", removable: true,
    defaults: { text: "Everyday energy", color: THEME.white, lines: 3, size: 100 },
    schema: [{ key: "text", type: "text" }, { key: "color", type: "color" }, { key: "size", type: "number" }],
    render: (p) => `<h2 class="el-headline" style="color:${esc(p.color)};-webkit-line-clamp:${Number(p.lines) || 3};--size:${(Number(p.size) || 100) / 100}">${esc(p.text)}</h2>`
  },

  subheadline: {
    label: "Subheadline", category: "Text", removable: true,
    defaults: { text: "Everyday health and beauty support", color: "rgba(255,255,255,.92)", lines: 3, size: 100 },
    schema: [{ key: "text", type: "text" }, { key: "color", type: "color" }, { key: "size", type: "number" }],
    render: (p) => `<p class="el-sub" style="color:${esc(p.color)};-webkit-line-clamp:${Number(p.lines) || 3};--size:${(Number(p.size) || 100) / 100}">${esc(p.text)}</p>`
  },

  cta: {
    label: "CTA button", category: "Buttons", removable: true,
    defaults: { text: "See the offer", variant: "red", size: 100 },
    schema: [{ key: "text", type: "text" }, { key: "variant", type: "enum", values: ["red", "green", "white"] }, { key: "size", type: "number" }],
    render: (p) => {
      const v = p.variant || "red";
      const style =
        v === "green" ? `background:${THEME.green};color:#fff` :
        v === "white" ? `background:#fff;color:${THEME.green}` :
        `background:${THEME.red};color:#fff`;
      return `<a class="el-cta" href="#" style="${style};--size:${(Number(p.size) || 100) / 100}">${esc(p.text)}</a>`;
    }
  },

  highlight: {
    label: "Text highlight", category: "Text", removable: true,
    defaults: { text: "NEW", variant: "green" },
    schema: [{ key: "text", type: "text" }, { key: "variant", type: "enum", values: ["green", "red", "white"] }],
    render: (p) => {
      const v = p.variant || "green";
      const style =
        v === "red" ? `background:${THEME.red};color:#fff` :
        v === "white" ? `background:#fff;color:${THEME.green};border:1px solid #C5C5C5` :
        `background:${THEME.green};color:#fff`;
      return `<span class="el-highlight" style="${style}">${esc(p.text)}</span>`;
    }
  },

  pricetag: {
    label: "Pricetag", category: "Price & promo", removable: true,
    defaults: { variant: "simple", now: "299,-", old: "599,-", oldLabel: "" },
    schema: [
      { key: "variant", type: "enum", values: ["simple", "double", "omnibus"] },
      { key: "now", type: "text" }, { key: "old", type: "text" }, { key: "oldLabel", type: "text" }
    ],
    render: (p) => svgPricetag(p)
  },

  badge: {
    label: "Discount badge", category: "Price & promo", removable: true,
    defaults: { variant: "redCircle", value: "-40%", text: "" },
    schema: [
      { key: "variant", type: "enum", values: ["redCircle", "redOutline", "greenDome"] },
      { key: "value", type: "text" }, { key: "text", type: "text" }
    ],
    render: (p) => svgBadge(p)
  },

  promoFlag: {
    label: "Promo flag", category: "Price & promo", removable: true,
    defaults: { deal: "2+1", text: "free" },
    schema: [{ key: "deal", type: "text" }, { key: "text", type: "text" }],
    render: (p) => svgPromoFlag(p)
  },

  legal: {
    label: "Disclaimer", category: "Text", removable: true,
    defaults: { text: "Offer valid while stocks last.", size: 100 },
    schema: [{ key: "text", type: "text" }, { key: "size", type: "number" }],
    render: (p) => `<div class="el-legal" style="--size:${(Number(p.size) || 100) / 100}">${esc(p.text)}</div>`
  },

  pattern: {
    label: "Plus pattern", category: "Layout", removable: true,
    defaults: { opacity: 0.16 },
    schema: [{ key: "opacity", type: "number" }],
    render: (p) => svgPattern(p)
  },

  logo: {
    label: "Dr.Max logo", category: "Layout", removable: false,
    defaults: {},
    schema: [],
    render: (_p, ctx) => svgLogo(ctx)
  }
};

// Background paints the banner root directly (image / gradient / solid).
export function bannerBackground(props = {}) {
  const p = { ...ELEMENTS.background.defaults, ...props };
  // library images render as a separate draggable/scalable layer (see renderBannerInner),
  // so the banner background itself stays the gradient / solid.
  if (p.type === "solid") return p.from;
  return `linear-gradient(${p.angle}deg, ${p.from} 0%, ${p.from} 46%, ${p.to} 100%)`;
}

export function renderElement(id, props = {}, ctx = {}) {
  const def = ELEMENTS[id];
  if (!def) return "";
  const merged = { ...def.defaults, ...props };
  return def.render(merged, ctx);
}

export function listElements() {
  return Object.entries(ELEMENTS).map(([id, e]) => ({
    id, label: e.label, category: e.category, removable: e.removable !== false, schema: e.schema || []
  }));
}

/* ─── adaptive element CSS (container-query units everywhere) ─────── */

export const ELEMENT_CSS = `
/* media slot — the pill radius itself is set per-placement (see templates.js).
   shape:none → cover photo; plate → white plate (contain); stroke → outline. */
.el-scene{position:absolute;inset:0;width:100%;height:100%;background-size:cover;background-position:center;
  background-repeat:no-repeat;display:grid;place-items:center;overflow:hidden;border-radius:inherit;}
.el-scene-fill{position:absolute;height:auto;cursor:move;-webkit-user-drag:none;user-select:none;}
/* a product packshot placed inside a shape — contained, with a soft product shadow */
.el-scene-fill--pack{object-fit:contain;filter:drop-shadow(0 3cqh 5cqh rgba(0,0,0,.22));}
.el-scene-ph{width:34%;aspect-ratio:1;border:2px solid #fff;border-radius:7px;opacity:.4;
  background:linear-gradient(transparent 60%,#fff 60%) no-repeat,radial-gradient(circle at 32% 38%,#fff 15%,transparent 16%) no-repeat;}
/* plate — white pill; a library image FILLS it (cover), white shows for cutouts */
.el-scene--plate{background:#fff;}
.el-scene--plate .el-scene-fill{object-fit:cover;}
/* stroke — the real library outline shape (image); packshot sits inside it */
.el-scene--stroke{background:transparent;overflow:visible;}
/* the outline element bleeds to the banner edges (no side inset) */
.ad--stroke .z-media{left:0;right:0;}
.el-scene-ring{position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;}
.el-scene--flip .el-scene-ring{transform:scaleX(-1);}  /* mirror → opens to the right */
.el-scene--stroke .el-scene-products{padding:12% 14%;}
/* bg-removed packshots sit inside the slot (contain) */
.el-scene-products{display:flex;align-items:center;justify-content:center;gap:3cqw;width:100%;height:100%;padding:8%;}
.el-scene-products img{max-width:100%;max-height:86%;object-fit:contain;filter:drop-shadow(0 4cqh 6cqh rgba(0,0,0,.18));}

.el-eyebrow{align-self:flex-start;font-weight:800;border-radius:999px;white-space:nowrap;
  font-size:calc(clamp(9px,3cqw,26px)*var(--size,1));padding:clamp(3px,1.4cqh,12px) clamp(9px,3.5cqw,24px);}

.el-headline{margin:0;font-weight:800;line-height:1.04;letter-spacing:-.015em;
  font-size:calc(clamp(16px,7.5cqw,116px)*var(--size,1));
  display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;}

.el-sub{margin:0;font-weight:500;line-height:1.25;
  font-size:calc(clamp(10px,3.4cqw,40px)*var(--size,1));
  display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;}

.el-highlight{display:inline-block;font-weight:800;border-radius:999px;line-height:1;
  font-size:clamp(9px,3cqw,30px);padding:clamp(2px,1cqh,10px) clamp(8px,3cqw,22px);}

.el-cta{align-self:flex-start;margin-top:clamp(2px,1cqh,16px);font-weight:800;text-decoration:none;
  border-radius:999px;white-space:nowrap;line-height:1.15;
  /* padding is em-based → the pill keeps the SAME proportions in every format
     (height/width tied to the font, not to the banner's width or height) */
  font-size:calc(clamp(11px,3.6cqw,34px)*var(--size,1));padding:.62em 1.5em;}

.el-legal{font-weight:400;line-height:1.3;opacity:.92;color:rgba(255,255,255,.9);
  font-size:calc(clamp(7px,1.8cqw,18px)*var(--size,1));
  display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;}

/* floating / overlay vector elements — sized & placed in container units */
.el-logo{position:absolute;right:4cqw;bottom:4cqh;width:clamp(54px,22cqw,260px);height:auto;z-index:6;
  filter:drop-shadow(0 1px 2px rgba(0,0,0,.15));}
/* logo corner positions — override the placement defaults (added after, wins) */
.lg-tl .el-logo{left:5cqw;right:auto;top:5cqh;bottom:auto;}
.lg-tr .el-logo{right:5cqw;left:auto;top:5cqh;bottom:auto;}
.lg-bl .el-logo{left:5cqw;right:auto;bottom:5cqh;top:auto;}
.lg-br .el-logo{right:5cqw;left:auto;bottom:5cqh;top:auto;}
/* logo in a bottom corner sits on the SAME baseline as the CTA (= content bottom padding),
   so button + logo line up on one row when the content is at the bottom */
.lg-bl.sc-vertical .el-logo,.lg-br.sc-vertical .el-logo,
.lg-bl.sc-vtop .el-logo,.lg-br.sc-vtop .el-logo,
.lg-bl.sc-top .el-logo,.lg-br.sc-top .el-logo,
.lg-bl.sc-corner .el-logo,.lg-br.sc-corner .el-logo{bottom:clamp(16px,6cqh,72px);}
.lg-bl.sc-diagonal .el-logo,.lg-br.sc-diagonal .el-logo{bottom:clamp(12px,6cqh,56px);}
/* image at the bottom + logo in a bottom corner → lift the media slot so it clears the logo */
.lg-bl.sc-vbottom .z-media,.lg-br.sc-vbottom .z-media,
.lg-bl.sc-vbottom-left .z-media,.lg-br.sc-vbottom-left .z-media{bottom:15cqh;height:40cqh;}
/* image at the top + logo in a top corner → lower the media slot so it clears the logo */
.lg-tl.sc-vertical .z-media,.lg-tr.sc-vertical .z-media,
.lg-tl.sc-top .z-media,.lg-tr.sc-top .z-media{top:14cqh;height:40cqh;}
.lg-tl.sc-vtop .z-media,.lg-tr.sc-vtop .z-media{top:14cqh;height:50cqh;}
/* logo in a top corner + text on top → narrow the headline on the logo side so the
   overlapping word wraps to the next line (text stays at the top, doesn't shift down) */
.lg-tr.sc-vbottom .el-headline,.lg-tr.sc-vbottom-left .el-headline{margin-right:24cqw;}
.lg-tl.sc-vbottom .el-headline,.lg-tl.sc-vbottom-left .el-headline{margin-left:24cqw;}
.lg-tl.sc-vbottom .el-eyebrow,.lg-tl.sc-vbottom-left .el-eyebrow{margin-left:24cqw;}
.el-badge{position:absolute;right:5cqw;top:6cqh;width:clamp(46px,20cqw,200px);height:auto;z-index:5;}
.el-pricetag{position:absolute;left:0;bottom:6cqh;width:clamp(90px,34cqw,360px);height:auto;z-index:5;}
/* promo shares the discount-badge slot (top-right) — they're interchangeable */
.el-promo{position:absolute;right:5cqw;top:6cqh;left:auto;width:clamp(80px,30cqw,320px);height:auto;z-index:5;}
/* text-less variant: narrower pill so the deal text stays the same size as the full flag */
.el-promo.el-promo--solo{width:clamp(48px,18cqw,190px);}
/* draggable overlay elements (interactive in the builder; inert in the static render) */
.el-badge,.el-promo,.el-pricetag{pointer-events:auto;cursor:move;}
.el-pattern{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;}
/* library background image — a movable / scalable layer (drag + wheel in the builder) */
.z-bgimg{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;}
.el-bgimg{position:absolute;height:auto;pointer-events:auto;cursor:move;user-select:none;-webkit-user-drag:none;}
`;
