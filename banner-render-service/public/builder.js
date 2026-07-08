/* Adaptive builder — lives inside Banner creation. Powered by the SAME modules
   the server render uses (public/lib). Products → AI copy → live adaptive preview.
   Everything auto-resizes via container queries; per-element colors are editable. */
import { renderBannerInner, assembleCss, SIZES, placementsFor } from "./lib/templates.js?v=45";
import { ELEMENTS } from "./lib/elements.js?v=45";

(function injectCss(){
  if (document.getElementById("adaptive-css")) return;
  const st = document.createElement("style");
  st.id = "adaptive-css";
  st.textContent = assembleCss({ fontBase: "fonts" });
  document.head.appendChild(st);
})();

const DEFAULT_SCENE = "img/styles/products-studio.png";
const DEFAULT_LOGO  = "img/drmax_logo.png";
const MAX_PRODUCTS = 4;
// built-in library images shown in the "Pick a generated image" (background) picker —
// the green-background product compositions for every format
const LIB_IMAGES = [
  "img/library/products-library.png",
  "img/library/bg-1080x1350.png",
  "img/library/bg-1080x1920.png",
  "img/library/bg-1080x1080.png",
  "img/library/bg-300x600.png",
  "img/library/bg-300x250.png",
  "img/library/bg-336x280.png",
  "img/library/bg-360x330.png",
];
// built-in product packshots that can be dropped inside a Plate/Outline shape (Layout → Packshot).
// each is movable + scalable inside the shape. Add more by dropping PNGs into img/library/.
const LIB_PACKSHOTS = [
  { url: "img/library/product-group.png",   name: "Product group" },  // clean white-bg product group
  { url: "img/library/product-magnez.png",  name: "Magnez B6" },       // drop your Magnez PNG here to enable
];
// default packshot auto-loaded when a Plate/Outline shape is turned on (if none picked yet)
const DEFAULT_PACKSHOT = "img/library/product-group.png";
// per-format background images (each format gets its own pre-composed photo)
const FORMAT_BG = {
  "1080x1350": "img/library/bg-1080x1350.png",
  "1080x1920": "img/library/bg-1080x1920.png",
  "1080x1080": "img/library/bg-1080x1080.png",
  "300x250":   "img/library/bg-300x250.png",
  "336x280":   "img/library/bg-336x280.png",
  "300x600":   "img/library/bg-300x600.png",
  "360x330":   "img/library/bg-360x330.png",
};

// banner copy in 3 languages (English default) — the Language switcher fills the copy fields
const COPY = {
  en: { eyebrow: "Health & Beauty",  headline: "Everyday energy for the whole family", sub: "Selected supplements with support for every day.", cta: "See the offer",     legal: "Offer valid while stocks last." },
  cz: { eyebrow: "Zdraví a krása",   headline: "Každodenní energie pro celou rodinu",  sub: "Vybrané doplňky s podporou pro každý den.",       cta: "Zobrazit nabídku", legal: "Nabídka platí do vyprodání zásob." },
  pl: { eyebrow: "Zdrowie i uroda",  headline: "Codzienna energia dla całej rodziny",  sub: "Wybrane suplementy ze wsparciem na każdy dzień.", cta: "Sprawdź ofertę",   legal: "Oferta obowiązuje do wyczerpania zapasów." },
};

/* order shown in the Elements block. background/logo are always on (no switch). */
const EL_ORDER = ["background","scene","eyebrow","headline","subheadline","cta","badge","pricetag","promoFlag","highlight","pattern","legal","logo"];
const ON_BY_DEFAULT = new Set(["background","scene","eyebrow","headline","subheadline","cta","pattern","logo"]);
const SKIP_TEXT = new Set(["eyebrow","headline","subheadline"]); // text edited in Copy block
const SKIP_ALL  = new Set(["cta"]);                              // cta controlled in Copy block → switch only

const state = {
  format: Object.keys(SIZES).find(k => SIZES[k].start) || Object.keys(SIZES)[0],
  products: [],
  clean: {},      // dataUrl -> bg-removed dataUrl
  cfg: {},
  block: "top",   // image position: top | bottom
  side: "right",  // media flush side / cap side: left | right
  align: "left",  // text alignment: left | center | right
  logoPos: "br",  // logo corner: tl | tr | bl | br
  bgByFormat: {}, // per-format background image { image, imgX, imgY, imgScale }
  lang: "en",     // banner copy language: en | cz | pl
  _langInit: false
};
// language switcher — fills the copy fields with the chosen language
function applyLangValues(lang){
  const c = COPY[lang]; if (!c) return;
  const set = (id, v)=>{ const el = document.getElementById(id); if (el) el.value = v; };
  set("bEyebrow", c.eyebrow); set("bHeadline", c.headline); set("bSub", c.sub); set("bCta", c.cta);
  if (state.cfg.legal) state.cfg.legal.props.text = c.legal;
}
function buildLang(){
  seg("bLang", [{v:"en",t:"EN"},{v:"cz",t:"CZ"},{v:"pl",t:"PL"}],
    o => o.v === state.lang, v => { state.lang = v; applyLangValues(v); buildLang(); render(); });
}
// current format's background — seeded from the built-in per-format image
function getBg(){
  if (!state.bgByFormat[state.format]){
    state.bgByFormat[state.format] = { image: FORMAT_BG[state.format] || "", imgX: 50, imgY: 50, imgScale: 100 };
  }
  return state.bgByFormat[state.format];
}
// init config from element defaults
for (const id of Object.keys(ELEMENTS)) {
  state.cfg[id] = { enabled: ON_BY_DEFAULT.has(id), props: { ...ELEMENTS[id].defaults } };
}

/* ---------- helpers ---------- */
function val(id){ const el = document.getElementById(id); return el ? el.value : ""; }
function fileToDataURL(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }
function escm(s){ return String(s ?? "").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function toHex(v){ return /^#[0-9a-f]{6}$/i.test(String(v)) ? v : "#ffffff"; }
function blobToDataURL(b){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onloadend=()=>res(r.result); r.onerror=rej; r.readAsDataURL(b); }); }

/* ---------- background removal (client-side, in-browser) ---------- */
let _bgrMod;
function loadBgRemover(){
  if (!_bgrMod) _bgrMod = import("https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/dist/index.mjs")
    .then(m => m.removeBackground || m.default);
  return _bgrMod;
}
let _cleaning = false;
async function ensureCleanProducts(){
  if (_cleaning) return;
  const pending = state.products.filter(p => !state.clean[p.dataUrl]);
  if (!pending.length) return;
  _cleaning = true;
  try {
    const removeBg = await loadBgRemover();
    for (const p of pending){
      try { const blob = await removeBg(p.dataUrl); state.clean[p.dataUrl] = await blobToDataURL(blob); }
      catch(_){ state.clean[p.dataUrl] = p.dataUrl; }   // fallback: original
      render();
    }
  } catch(_){
    for (const p of pending) state.clean[p.dataUrl] = state.clean[p.dataUrl] || p.dataUrl;  // lib unavailable
    render();
  } finally { _cleaning = false; }
}
function getProducts(){
  // bg-removed packshots — consumed by the plate / stroke scene shapes
  return state.products.map(p => state.clean[p.dataUrl] || p.dataUrl);
}

/* ---------- products ---------- */
function wireProducts(){
  const inp = document.getElementById("bProdInput");
  if (inp && !inp.dataset.w){
    inp.addEventListener("change", async (e)=>{
      for (const f of Array.from(e.target.files||[])){
        if (state.products.length >= MAX_PRODUCTS) break;
        const dataUrl = await fileToDataURL(f);
        state.products.push({ name: f.name.replace(/\.[^.]+$/,""), fileName: f.name, dataUrl });
      }
      e.target.value = "";
      renderProducts();
      render();
    });
    inp.dataset.w = "1";
  }
  renderProducts();
}
function renderProducts(){
  const g = document.getElementById("bProdGrid"); if (!g) return;
  g.innerHTML = state.products.map((p,i)=>
    `<div class="bprod"><img src="${escm(p.dataUrl)}" alt=""><span class="x" data-i="${i}">×</span></div>`
  ).join("");
  g.querySelectorAll(".x").forEach(x => x.addEventListener("click", ()=>{
    state.products.splice(Number(x.dataset.i),1); renderProducts();
  }));
}

/* ---------- AI copy ---------- */
function wireCopyGen(){
  const btn = document.getElementById("bGenCopy");
  if (btn && !btn.dataset.w){ btn.addEventListener("click", genCopy); btn.dataset.w = "1"; }
}
async function genCopy(){
  const btn = document.getElementById("bGenCopy");
  const err = document.getElementById("bCopyErr");
  err.classList.add("hidden");
  btn.disabled = true; btn.textContent = "Generating…";
  try{
    const res = await fetch("/generate-copy", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        products: state.products.map(p=>({ name:p.name, fileName:p.fileName, imageDataUrl:p.dataUrl })),
        targetGroup: [val("bCompany"), val("bTarget")].filter(Boolean).join(" · "),
        templateSettings: {}
      })
    });
    const d = await res.json();
    const v = [0,1,2].map(i => ({
      headline:(d.headlines||[])[i]||"", subheadline:(d.subheadlines||[])[i]||"",
      cta:(d.ctas||[])[i]||"", promo:(d.promos||[])[i]||"", legal:(d.legals||[])[i]||""
    })).filter(x=>x.headline||x.subheadline);
    renderCopyVars(v);
    if (v[0]) applyVariant(v[0]);
  }catch(e){
    err.textContent = "Copy error: " + e.message; err.classList.remove("hidden");
  }finally{
    btn.disabled = false; btn.textContent = "✨ Generate copy →";
  }
}
function renderCopyVars(vars){
  const box = document.getElementById("bCopyVars");
  box.innerHTML = vars.map((v,i)=>
    `<div class="bcopy-var" data-i="${i}"><b>${escm(v.headline)}</b>${escm(v.subheadline)} · <i>${escm(v.cta)}</i></div>`
  ).join("");
  box.querySelectorAll(".bcopy-var").forEach(c => c.addEventListener("click", ()=> applyVariant(vars[Number(c.dataset.i)])));
}
function applyVariant(v){
  const set = (id,val)=>{ const el=document.getElementById(id); if(el&&val) el.value=val; };
  set("bHeadline", v.headline); set("bSub", v.subheadline); set("bCta", v.cta);
  if (v.promo){ state.cfg.badge.props.value = v.promo; state.cfg.badge.enabled = true; }
  if (v.legal){ state.cfg.legal.props.text = v.legal; }
  buildElements(); render();
}

/* ---------- format pills ---------- */
function buildFormats(){
  const box = document.getElementById("bFormats"); if (!box) return;
  const keys = [...Object.keys(SIZES).filter(k=>SIZES[k].start), ...Object.keys(SIZES).filter(k=>!SIZES[k].start && !SIZES[k].hidden)];
  box.innerHTML = keys.map(k =>
    `<span class="bld-fmt${k===state.format?" on":""}" data-k="${k}" title="${SIZES[k].channel}">${k}${SIZES[k].scale?` ×${SIZES[k].scale}`:""}</span>`
  ).join("");
  box.querySelectorAll(".bld-fmt").forEach(p => p.addEventListener("click", ()=>{
    state.format = p.dataset.k;
    box.querySelectorAll(".bld-fmt").forEach(x=>x.classList.toggle("on", x.dataset.k===state.format));
    buildElements(); buildBackground(); buildPackshot();   // background scale/source is per-format
    render();   // placement is driven by the Layout controls (applyLayout)
  }));
}

/* ---------- layout controls: shape (4) / blocks (2) / text align (3) ---------- */
function applyLayout(){
  const b = state.block, s = state.side;
  if (b === "dome"){ state.cfg.scene.props.placement = "vtop"; state.cfg.scene.props.flip = false; return; }
  state.cfg.scene.props.placement = (b === "top")
    ? (s === "left" ? "top" : "vertical")
    : (s === "left" ? "vbottom-left" : "vbottom");
  state.cfg.scene.props.flip = (s === "right");   // stroke svg opens left by default
}
function seg(boxId, opts, isOn, onPick){
  const box = document.getElementById(boxId); if (!box) return;
  box.innerHTML = opts.map(o => `<span class="opt${isOn(o)?" on":""}" data-v="${escm(o.v)}">${escm(o.t)}</span>`).join("");
  box.querySelectorAll(".opt").forEach(el => el.addEventListener("click", ()=> onPick(el.dataset.v)));
}
function buildLayout(){
  const sc = state.cfg.scene.props;
  const shapeKey = sc.shape === "stroke" ? (state.side === "right" ? "stroke-r" : "stroke-l") : (sc.shape || "none");
  seg("bShape", [
    {v:"none",t:"Photo"},{v:"plate",t:"Plate"},{v:"stroke-l",t:"Outline ←"},{v:"stroke-r",t:"Outline →"}
  ], o => o.v === shapeKey, v => {
    if (v === "stroke-l"){ sc.shape = "stroke"; state.side = "left"; }
    else if (v === "stroke-r"){ sc.shape = "stroke"; state.side = "right"; }
    else { sc.shape = v; }
    state.cfg.scene.enabled = true;
    // picking a Plate/Outline shape with nothing inside yet → drop in the product group by default
    if ((sc.shape === "plate" || sc.shape === "stroke") && !sc.packshot && !getProducts().length){
      sc.packshot = DEFAULT_PACKSHOT; sc.imgX = 50; sc.imgY = 50; sc.imgScale = 80;
    }
    applyLayout(); buildLayout(); render();
  });
  seg("bBlocks", [{v:"top",t:"Image top"},{v:"bottom",t:"Image bottom"},{v:"dome",t:"Dome ↓"}],
    o => o.v === state.block, v => { state.block = v; applyLayout(); buildLayout(); render(); });
  seg("bAlign", [{v:"left",t:"Left"},{v:"center",t:"Center"},{v:"right",t:"Right"}],
    o => o.v === state.align, v => { state.align = v; buildLayout(); render(); });

  // Logo corners — disable corners already taken by badge/promo/pricetag (no overlap)
  const occ = occupiedCorners();
  if (occ.has(state.logoPos)) state.logoPos = ["br","tl","tr","bl"].find(c => !occ.has(c)) || "br";
  const lbox = document.getElementById("bLogo");
  if (lbox){
    const corners = [{v:"tl",t:"↖"},{v:"tr",t:"↗"},{v:"bl",t:"↙"},{v:"br",t:"↘"}];
    lbox.innerHTML = corners.map(o =>
      `<span class="opt${o.v===state.logoPos?" on":""}${occ.has(o.v)?" off":""}" data-v="${o.v}"${occ.has(o.v)?' title="occupied by another element"':""}>${o.t}</span>`
    ).join("");
    lbox.querySelectorAll(".opt").forEach(el => {
      if (occ.has(el.dataset.v)) return;   // taken corner — not clickable
      el.addEventListener("click", ()=>{ state.logoPos = el.dataset.v; buildLayout(); render(); });
    });
  }
  buildPackshot();
}
// Packshot picker — only for Plate/Outline shapes: drop a product inside the shape (movable + scalable)
function buildPackshot(){
  const box = document.getElementById("bPackshot"); if (!box) return;
  const lbl = document.getElementById("bPackshotLbl");
  const sc = state.cfg.scene.props;
  const shape = sc.shape || "none";
  const active = state.cfg.scene.enabled && (shape === "plate" || shape === "stroke");
  if (lbl) lbl.classList.toggle("hidden", !active);
  if (!active){ box.innerHTML = ""; return; }
  const uploaded = getProducts();
  const items = [ ...uploaded.map((u,i)=>({ url:u, name:`Upload ${i+1}` })), ...LIB_PACKSHOTS ];
  const cur = sc.packshot || "";
  const thumbs = items.map(it =>
    `<button class="pk-thumb${cur===it.url?" on":""}" data-url="${escm(it.url)}" title="${escm(it.name)}"><img src="${escm(it.url)}" alt="" onerror="this.closest('.pk-thumb').style.display='none'"></button>`
  ).join("");
  box.innerHTML = `<div class="pk-grid"><button class="pk-thumb pk-none${cur?"":" on"}" data-url="" title="No product">✕</button>${thumbs}</div>
    <span class="muted" style="font-size:11px;">drag to move · wheel = scale · double-click to reset</span>`;
  box.querySelectorAll(".pk-thumb").forEach(t => t.addEventListener("click", ()=>{
    sc.packshot = t.dataset.url || "";
    if (sc.packshot){ sc.imgX = 50; sc.imgY = 50; sc.imgScale = 70; }   // sit contained inside the shape
    buildPackshot(); render();
  }));
}
// which corners are occupied by enabled corner-elements
function occupiedCorners(){
  const occ = new Set();
  if (state.cfg.badge?.enabled)     occ.add("tr");
  if (state.cfg.promoFlag?.enabled) occ.add("tr");   // promo shares the badge slot
  if (state.cfg.pricetag?.enabled)  occ.add("bl");
  return occ;
}

/* ---------- elements block (toggles + per-element props/colors) ---------- */
function propControl(id, prop){
  const v = state.cfg[id].props[prop.key];
  const lab = `<label>${escm(prop.key)}</label>`;
  if (prop.type === "color")
    return `<span class="bel-prop"><input type="color" data-el="${id}" data-key="${prop.key}" value="${toHex(v)}">${lab}</span>`;
  if (prop.type === "enum"){
    // scene placement is limited to what fits the current format
    let values = prop.values;
    if (id === "scene" && prop.key === "placement"){
      const allowed = placementsFor(state.format);
      if (allowed.length) values = allowed;
    }
    return `<span class="bel-prop"><label>${escm(prop.key)}</label><select data-el="${id}" data-key="${prop.key}">${values.map(o=>`<option value="${o}"${o===v?" selected":""}>${o}</option>`).join("")}</select></span>`;
  }
  if (prop.type === "number")
    return `<span class="bel-prop"><input type="number" data-el="${id}" data-key="${prop.key}" value="${escm(v)}">${lab}</span>`;
  return `<span class="bel-prop"><input type="text" data-el="${id}" data-key="${prop.key}" value="${escm(v)}" placeholder="${escm(prop.key)}"></span>`;
}
// elements are split across three cards: Layout extras / main texts / promo & decoration
const EL_GROUPS = {
  bLayoutElements: ["scene", "pattern", "legal", "logo"],            // Layout card
  bElements:       ["eyebrow", "headline", "subheadline", "cta"],    // Text & colors
  bDecor:          ["badge", "pricetag", "promoFlag"],  // Promo & decoration
};
function buildElements(){
  for (const boxId of Object.keys(EL_GROUPS)) renderElGroup(boxId, EL_GROUPS[boxId]);
}
function renderElGroup(boxId, ids){
  const box = document.getElementById(boxId); if (!box) return;
  box.innerHTML = ids.map(id => {
    const def = ELEMENTS[id]; if (!def) return "";
    const togglable = def.removable !== false;
    const on = state.cfg[id].enabled;
    const props = (def.schema||[]).filter(p =>
      p.type !== "image" && !(SKIP_ALL.has(id)) && !(SKIP_TEXT.has(id) && p.type === "text")
      && !(id === "scene" && (p.key === "shape" || p.key === "placement"))  // handled by the Layout card
    );
    const sw = togglable ? `<span class="bel-sw${on?" on":""}" data-el="${id}"></span>` : `<span class="muted" style="font-size:10px;">always on</span>`;
    let propsHtml = (on && props.length) ? `<div class="bel-props">${props.map(p=>propControl(id,p)).join("")}</div>` : "";
    return `<div class="bel"><div class="bel-head"><span class="bel-name">${escm(def.label)}</span>${sw}</div>${propsHtml}</div>`;
  }).join("");

  box.querySelectorAll(".bel-sw").forEach(sw => sw.addEventListener("click", ()=>{
    const id = sw.dataset.el;
    state.cfg[id].enabled = !state.cfg[id].enabled;
    // badge & promo share one slot (top-right) — interchangeable, never both
    if (state.cfg[id].enabled){
      if (id === "badge")     state.cfg.promoFlag.enabled = false;
      if (id === "promoFlag") state.cfg.badge.enabled = false;
    }
    buildElements(); buildLayout(); render();   // refresh logo-corner availability
  }));
  box.querySelectorAll("[data-el][data-key]").forEach(inp => inp.addEventListener("input", ()=>{
    const el = inp.dataset.el, key = inp.dataset.key;
    state.cfg[el].props[key] = inp.value;
    render();
  }));
}

/* ---------- background controls (Layout card): gradient/solid props + library image ---------- */
function buildBackground(){
  const box = document.getElementById("bBackground"); if (!box) return;
  const def = ELEMENTS.background;
  const props = (def.schema||[]).filter(p => p.type !== "image");
  const hasImg = !!getBg().image;
  let html = `<div class="bel-props" style="margin-top:0;">${props.map(p=>propControl("background",p)).join("")}</div>`;
  html += `<div class="bel-props" style="margin-top:8px;">
      <button class="bld-mini${hasImg?"":" on"}" data-bgsrc="gradient">Gradient</button>
      <button class="bld-mini${hasImg?" on":""}" data-bgsrc="library">Library image…</button>
    </div>`;
  if (hasImg) html += `<div class="bel-props" style="margin-top:6px;">
      <span class="bel-prop"><label>scale %</label><input type="number" data-el="background" data-key="imgScale" value="${escm(getBg().imgScale ?? 100)}"></span>
      <span class="muted" style="font-size:11px;">drag to move · wheel = scale · double-click to reset</span>
    </div>`;
  box.innerHTML = html;
  box.querySelectorAll("[data-el][data-key]").forEach(inp => inp.addEventListener("input", ()=>{
    const key = inp.dataset.key;
    if (key === "imgScale"){ getBg().imgScale = Number(inp.value) || 100; render(); return; }
    state.cfg.background.props[key] = inp.value;
    render();
  }));
  box.querySelectorAll("[data-bgsrc]").forEach(b => b.addEventListener("click", ()=>{
    if (b.dataset.bgsrc === "gradient"){ getBg().image = ""; buildBackground(); render(); }
    else openBgLibrary();
  }));
}

/* ---------- background image library picker ---------- */
async function openBgLibrary(){
  let modal = document.getElementById("bgLibModal");
  if (!modal){
    modal = document.createElement("div");
    modal.id = "bgLibModal"; modal.className = "biglib";
    modal.innerHTML = `<div class="biglib-box"><div class="biglib-head">Pick a generated image<span class="biglib-x">×</span></div><div class="biglib-grid" id="bgLibGrid"></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", e => { if (e.target===modal || e.target.classList.contains("biglib-x")) modal.remove(); });
  }
  const grid = modal.querySelector("#bgLibGrid");
  const paint = (imgs)=>{
    grid.innerHTML = imgs.length
      ? imgs.map(u => `<img src="${escm(u)}" data-u="${escm(u)}" alt="">`).join("")
      : `<div class="muted" style="padding:14px;">No images yet.</div>`;
    grid.querySelectorAll("img").forEach(im => im.addEventListener("click", ()=>{
      getBg().image = im.dataset.u;
      document.getElementById("bgLibModal").remove();
      buildBackground(); render();
    }));
  };
  paint(LIB_IMAGES);   // built-in placeholders show immediately
  try {
    const r = await fetch("/library?client=drmax");
    const d = await r.json();
    const imgs = (d.images||[]).map(x => typeof x === "string" ? x : x.url).filter(Boolean);
    paint([...LIB_IMAGES, ...imgs]);   // placeholders + generated images from the backend
  } catch(e){ /* backend offline → keep the built-in placeholders */ }
}

/* ---------- copy inputs ---------- */
function wireCopyInputs(){
  ["bEyebrow","bHeadline","bSub","bCta","bCtaVar"].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.w){
      el.addEventListener("input", ()=>{ if (id==="bCtaVar") state.cfg.cta.props.variant = el.value; render(); });
      el.dataset.w = "1";
    }
  });
}

/* ---------- render ---------- */
function getCopy(){
  return { eyebrow:val("bEyebrow"), headline:val("bHeadline"), subheadline:val("bSub"),
           cta:val("bCta"), legal: state.cfg.legal.props.text };
}
function render(){
  const host = document.getElementById("bHost"), stage = document.getElementById("bStage");
  if (!host || !stage) return;
  applyLayout();   // sync scene placement + flip from the Layout controls
  const size = SIZES[state.format];
  const info = document.getElementById("bTplInfo");
  if (info) info.textContent = `${size.w}×${size.h} · template: ${size.template}` + (size.scale?` · render ×${size.scale}`:"");

  // sync cta variant from select if present
  const cv = document.getElementById("bCtaVar"); if (cv) state.cfg.cta.props.variant = cv.value;

  // plate / stroke shapes: make sure packshots get bg-removed (async, re-renders when ready)
  const shape = state.cfg.scene.props.shape || "none";
  if (state.cfg.scene.enabled && (shape === "plate" || shape === "stroke")
      && state.products.some(p => !state.clean[p.dataUrl])) {
    ensureCleanProducts();
  }

  // apply the current format's background image onto the background props
  const b = getBg();
  Object.assign(state.cfg.background.props, {
    image: b.image || "", imgX: b.imgX ?? 50, imgY: b.imgY ?? 50, imgScale: b.imgScale ?? 100
  });

  // scene src = the picked library image, else the default scene photo
  const aiScene = state.cfg.scene.props.src || DEFAULT_SCENE;
  // packshot inside a shape is chosen in Layout (state.cfg.scene.props.packshot);
  // uploaded products still flow through as a fallback packshot
  let products = getProducts();
  host.innerHTML = renderBannerInner({
    sizeKey: state.format, config: state.cfg, copy: getCopy(),
    scene: state.cfg.scene.enabled ? aiScene : "",
    products,
    logo: DEFAULT_LOGO,
    align: state.align,
    logoPos: state.logoPos
  });
  const ad = host.querySelector(".ad"); if (!ad) return;
  const aw = stage.clientWidth - 56, ah = stage.clientHeight - 56;
  const scale = Math.min(aw/size.w, ah/size.h, 1);
  ad.style.transformOrigin = "top left";
  ad.style.transform = `scale(${scale})`;
  host.style.width = (size.w*scale)+"px";
  host.style.height = (size.h*scale)+"px";
  wireDrag(ad);
}

/* ---------- free-drag: promo / badge / pricetag → any spot on the banner ---------- */
const DRAG_MAP = { "el-badge": "badge", "el-promo": "promoFlag", "el-pricetag": "pricetag" };
function wireDrag(ad){
  for (const [cls, id] of Object.entries(DRAG_MAP)){
    const el = ad.querySelector("." + cls); if (!el) continue;
    el.addEventListener("mousedown", (e)=> startDrag(e, ad, el, id));
    el.addEventListener("dblclick", (e)=>{ e.preventDefault(); delete state.cfg[id].props.pos; render(); }); // reset to default
  }
  // library background image — drag to move, wheel to scale, dbl-click to reset
  const bgimg = ad.querySelector(".el-bgimg");
  if (bgimg){
    bgimg.addEventListener("mousedown", (e)=> startBgDrag(e, ad, bgimg));
    bgimg.addEventListener("wheel", (e)=>{
      e.preventDefault();
      const p = getBg();
      p.imgScale = Math.max(20, Math.min(400, (p.imgScale ?? 100) + (e.deltaY < 0 ? 4 : -4)));
      render();
    }, { passive: false });
    bgimg.addEventListener("dblclick", (e)=>{ e.preventDefault();
      const p = getBg(); p.imgX = 50; p.imgY = 50; p.imgScale = 100; render();
    });
  }
  // photo inside the shape — drag to reposition (object-position), wheel to zoom, dbl-click reset
  const sfill = ad.querySelector(".el-scene .el-scene-fill");
  if (sfill){
    sfill.addEventListener("mousedown", (e)=> startSceneDrag(e, sfill));
    sfill.addEventListener("wheel", (e)=>{
      e.preventDefault();
      const p = state.cfg.scene.props;
      p.imgScale = Math.max(50, Math.min(400, (p.imgScale ?? 100) + (e.deltaY < 0 ? 5 : -5)));
      render();
    }, { passive: false });
    sfill.addEventListener("dblclick", (e)=>{ e.preventDefault();
      const p = state.cfg.scene.props; p.imgX = 50; p.imgY = 50; p.imgScale = 100; render();
    });
  }
}
function startSceneDrag(e, el){
  e.preventDefault(); e.stopPropagation();
  const p = state.cfg.scene.props;
  const r = el.parentElement.getBoundingClientRect();   // the pill/shape the photo lives in
  const sx = p.imgX ?? 50, sy = p.imgY ?? 50, x0 = e.clientX, y0 = e.clientY;
  let cx = sx, cy = sy;
  const move = (ev)=>{
    cx = sx + (ev.clientX - x0) / r.width  * 100;
    cy = sy + (ev.clientY - y0) / r.height * 100;
    el.style.left = cx + "%"; el.style.top = cy + "%";
  };
  const up = ()=>{
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    p.imgX = Math.round(cx); p.imgY = Math.round(cy); render();
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
}
function startBgDrag(e, ad, el){
  e.preventDefault(); e.stopPropagation();
  const r = ad.getBoundingClientRect();
  const p = getBg();
  const sx = p.imgX ?? 50, sy = p.imgY ?? 50, x0 = e.clientX, y0 = e.clientY;
  let cx = sx, cy = sy;
  const move = (ev)=>{
    cx = sx + (ev.clientX - x0) / r.width  * 100;
    cy = sy + (ev.clientY - y0) / r.height * 100;
    el.style.left = cx + "%"; el.style.top = cy + "%";
  };
  const up = ()=>{
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    p.imgX = Math.round(cx); p.imgY = Math.round(cy); render();
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
}
function startDrag(e, ad, el, id){
  e.preventDefault(); e.stopPropagation();
  let x, y;
  const move = (ev)=>{
    const r = ad.getBoundingClientRect();
    x = Math.max(0, Math.min(100, (ev.clientX - r.left) / r.width  * 100));
    y = Math.max(0, Math.min(100, (ev.clientY - r.top)  / r.height * 100));
    el.style.left = x + "%"; el.style.top = y + "%";
    el.style.right = "auto"; el.style.bottom = "auto";
    el.style.transform = "translate(-50%,-50%)";
  };
  const up = ()=>{
    document.removeEventListener("mousemove", move);
    document.removeEventListener("mouseup", up);
    if (x != null){ state.cfg[id].props.pos = { x: Math.round(x), y: Math.round(y) }; render(); }
  };
  document.addEventListener("mousemove", move);
  document.addEventListener("mouseup", up);
}

window.renderBuilder = function(){
  if (!document.getElementById("bStage")) return;   // banners view not in DOM yet
  applyLayout();   // scene placement + flip are driven by the Layout controls
  if (!state._langInit){ applyLangValues(state.lang); state._langInit = true; }  // seed English copy once
  wireProducts(); wireCopyGen(); wireCopyInputs(); wireSavePng();
  buildFormats(); buildLang(); buildLayout(); buildElements(); buildBackground();
  render();
};

/* ---------- export the current banner preview to PNG (native resolution) ---------- */
function wireSavePng(){
  const btn = document.getElementById("bSavePng");
  if (!btn || btn.dataset.w) return;
  btn.dataset.w = "1";
  btn.addEventListener("click", savePng);
}
// fetch any same-origin asset and return a data: URL (so it survives SVG rasterisation)
async function assetToDataURL(url){
  const r = await fetch(url, { cache: "force-cache" });
  const b = await r.blob();
  return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
}
// embed the Proxima Nova otf files as data URLs so the export keeps the brand font
let _fontCss;
async function embedFonts(){
  if (_fontCss != null) return _fontCss;
  const faces = [
    { w: 400, url: "fonts/ProximaNova-Regular.otf" },
    { w: 600, url: "fonts/ProximaNova-Semibold.otf" },
    { w: 700, url: "fonts/ProximaNova-Bold.otf" }
  ];
  let css = "";
  for (const f of faces){
    try { const d = await assetToDataURL(f.url);
      css += `@font-face{font-family:'Proxima Nova';src:url(${d}) format('opentype');font-weight:${f.w};font-style:normal;}`; }
    catch(_){}
  }
  _fontCss = css; return css;
}
function loadImage(src){ return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("raster failed")); i.src = src; }); }

// Export the current banner preview to a PNG at native resolution (×2), fully self-contained:
// clone → inline images + fonts → wrap in an SVG <foreignObject> → draw to canvas → download.
async function savePng(){
  const btn = document.getElementById("bSavePng");
  const ad = document.querySelector("#bHost .ad");
  if (!ad) return;
  const size = SIZES[state.format];
  const label = btn ? btn.textContent : "";
  if (btn){ btn.disabled = true; btn.textContent = "Exporting…"; }
  try {
    const clone = ad.cloneNode(true);
    clone.style.transform = "none"; clone.style.margin = "0";
    clone.style.width = size.w + "px"; clone.style.height = size.h + "px";
    // inline every <img> src as a data URL (rasterisation has no network access)
    await Promise.all([...clone.querySelectorAll("img")].map(async im => {
      const src = im.getAttribute("src");
      if (!src || src.startsWith("data:")) return;
      try { im.setAttribute("src", await assetToDataURL(src)); } catch(_){}
    }));
    const fontCss = await embedFonts();
    // adaptive CSS minus the external @font-face (replaced by the embedded one)
    const baseCss = (document.getElementById("adaptive-css")?.textContent || "")
      .replace(/@font-face\s*\{[^}]*\}/g, "");
    const xhtml = new XMLSerializer().serializeToString(clone);
    // CSS goes in a CDATA block so raw & / > in the stylesheet don't break XML parsing
    const inner = `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${size.w}px;height:${size.h}px">`
      + `<style><![CDATA[${fontCss}${baseCss}]]></style>${xhtml}</div>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}">`
      + `<foreignObject x="0" y="0" width="100%" height="100%">${inner}</foreignObject></svg>`;
    const img = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = size.w * scale; canvas.height = size.h * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
    const out = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = out; a.download = `drmax-${state.format}.png`; a.click();
  } catch(e){
    alert("PNG export failed: " + (e && e.message ? e.message : e));
  } finally {
    if (btn){ btn.disabled = false; btn.textContent = label; }
  }
}

// keep the preview fitted when the window resizes
let _rz;
window.addEventListener("resize", () => {
  clearTimeout(_rz);
  _rz = setTimeout(() => {
    const v = document.getElementById("view-banners");
    if (v && !v.classList.contains("hidden") && document.getElementById("bStage")) render();
  }, 120);
});
