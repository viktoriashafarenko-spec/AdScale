/* Dr.Max · AdScale Studio — client cabinet, wired to the real backend.
   Endpoints: /generate-scenes, /generate-copy, /templates, /render-banner, /render-9x16 */

/* ---------- state ---------- */
const MAX_PRODUCTS = 4;           // products composited into one scene (Gemini composite limit)
const CLIENT_ID = "drmax";        // per-client library scope (real login later)
let uploadedProducts = [];        // {id, fileName, name, dataUrl}
let uploadedLogo = null;          // {fileName, dataUrl}  (default = Dr.Max logo)
let generatedScenes = [];         // {url, aspect, label}
let availableTemplates = [];
let selectedTemplateIds = new Set();
let pickedSceneUrl = "";
let generatedVariants = [];       // {headline, subheadline, cta}
const renderedJobs = new Map();
let reformatInFlight = false;
const savedImages = [];           // {url}
const savedBanners = [];          // {url, format, templateName}

/* ---------- formats (ported from classic app.js) ---------- */
const FORMATS = {
  "1920x555":  { w: 1920, h: 555,  aspect: "16:9", family: "wide" },
  "1200x400":  { w: 1200, h: 400,  aspect: "16:9", family: "wide" },
  "1200x300":  { w: 1200, h: 300,  aspect: "16:9", family: "wide" },
  "728x90":    { w: 728,  h: 90,   aspect: "16:9", family: "wide" },
  "970x250":   { w: 970,  h: 250,  aspect: "16:9", family: "wide" },
  "1080x1080": { w: 1080, h: 1080, aspect: "1:1",  family: "square" },
  "1920x1080": { w: 1920, h: 1080, aspect: "16:9", family: "medium" },
  "1200x628":  { w: 1200, h: 628,  aspect: "16:9", family: "medium" },
  "1080x1920": { w: 1080, h: 1920, aspect: "9:16", family: "vertical" },
  "600x600":   { w: 600,  h: 600,  aspect: "1:1",  family: "square" },
  "300x250":   { w: 300,  h: 250,  aspect: "1:1",  family: "square" },
  "9:16":      { w: 1080, h: 1920, aspect: "9:16", family: "html" },
  "1080x1350": { w: 1080, h: 1350, aspect: "9:16", family: "vertical" },
  "300x600":   { w: 300,  h: 600,  aspect: "9:16", family: "vertical" },
  "1:1":       { w: 600,  h: 600,  aspect: "1:1",  family: "square" }
};
function getFormatSpec(v){ return FORMATS[v] || FORMATS["1920x555"]; }
function templateFamily(t){
  const r = t.width / t.height;
  if (r > 2.5) return "wide";
  if (r > 1.5) return "medium";
  if (Math.abs(r - 1) < 0.25) return "square";
  return "vertical";
}
function templateMatchesFormat(t, format){
  return templateFamily(t) === getFormatSpec(format).family;
}
function defaultTemplateForFamily(family){
  return availableTemplates.find(t => templateFamily(t) === family) || null;
}

/* ---------- utils ---------- */
function esc(v){ return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function fileToDataURL(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }
function blobToDataURL(blob){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onloadend=()=>res(r.result); r.onerror=rej; r.readAsDataURL(blob); }); }
function normalizeName(fn="", i=1){
  const raw = String(fn).replace(/\.[^.]+$/, "").trim();
  if (/^screenshot/i.test(raw) || /^img[_ -]?\d+/i.test(raw) || raw.length < 3) return `Product ${i}`;
  const c = raw.replace(/[0-9]{4}[-_ ]?[0-9]{2}[-_ ]?[0-9]{2}.*/i, "").replace(/[_-]+/g, " ").trim();
  return c || `Product ${i}`;
}
function show(id){ document.getElementById(id).classList.remove("hidden"); }
function hide(id){ document.getElementById(id).classList.add("hidden"); }
function setErr(id, msg){ const e=document.getElementById(id); if(!e)return; if(msg){ e.textContent=msg; e.classList.remove("hidden"); } else e.classList.add("hidden"); }

/* ---------- navigation ---------- */
function showView(v){
  document.querySelectorAll(".view").forEach(el => el.classList.toggle("hidden", el.id !== ("view-"+v)));
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === v));
  if (v === "banners"){
    ensureTemplates(); renderPick();
    if (window.renderBuilder) window.renderBuilder();
    if (window.setBuilderProducts) window.setBuilderProducts(uploadedProducts);  // reuse products from the generation tab (copy + shapes)
    updateBgCurrent(pickedSceneUrl);
  }
  if (v === "saved") renderSaved();
  if (v === "brand"){ renderSwatches(); buildLibMenu(); }
}

/* ---------- settings ---------- */
function getSettings(){
  return {
    showLogo: document.getElementById("showLogo").checked,
    showCTA: document.getElementById("showCTA").checked,
    showDiscount: document.getElementById("showDiscount").checked,
    showDisclaimer: document.getElementById("showDisclaimer").checked,
    discountText: document.getElementById("discountText").value.trim(),
    disclaimerText: document.getElementById("disclaimerText").value.trim()
  };
}

/* ================= MODULE: products + logo ================= */
document.getElementById("productInput").addEventListener("change", async (e)=>{
  const files = Array.from(e.target.files || []);
  let skipped = 0;
  for (const f of files){
    if (uploadedProducts.length >= MAX_PRODUCTS){ skipped++; continue; }
    const dataUrl = await fileToDataURL(f);
    uploadedProducts.push({ id:`${Date.now()}_${Math.random().toString(36).slice(2)}`, fileName:f.name, name:normalizeName(f.name, uploadedProducts.length+1), dataUrl });
  }
  e.target.value = "";
  renderProducts();
  if (skipped) alert(`Up to ${MAX_PRODUCTS} products in one scene — skipped ${skipped}.`);
});
function renderProducts(){
  const g = document.getElementById("productList");
  const head = uploadedProducts.length ? `<div class="muted" style="grid-column:1/-1;margin:2px 0;">Products in scene: <b>${uploadedProducts.length}/${MAX_PRODUCTS}</b></div>` : "";
  g.innerHTML = head + uploadedProducts.map(p => `
    <div class="up-card">
      <button class="x" onclick="removeProduct('${p.id}')">×</button>
      <img src="${esc(p.dataUrl)}" alt="">
      <div class="nm">${esc(p.name)}</div>
    </div>`).join("");
}
function removeProduct(id){ uploadedProducts = uploadedProducts.filter(p=>p.id!==id); renderProducts(); syncFeedSel(); }

/* ----- product feed (interface preview; real fid = backend fetch+parse of XML/CSV) ----- */
function prodTab(t){
  document.getElementById("prodUpload").classList.toggle("hidden", t!=="upload");
  document.getElementById("prodFeed").classList.toggle("hidden", t!=="feed");
  document.querySelectorAll("#prodTabs .tab").forEach(b=>b.classList.toggle("active", b.dataset.tab===t));
}
let feedItems = [];   // last loaded feed products (from the real feed)
async function loadFeed(q){
  const g = document.getElementById("feedGrid"), st = document.getElementById("feedStatus");
  const url = (document.getElementById("feedUrl").value || "").trim();
  if (!url){ st.textContent = "Enter a feed URL first."; return; }
  g.innerHTML = `<div class="loading"><div class="spin"></div> Loading catalog…</div>`;
  try {
    const r = await fetch(`/feed?url=${encodeURIComponent(url)}&q=${encodeURIComponent(q||"")}&limit=48`);
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "feed error");
    feedItems = d.items || [];
    document.getElementById("feedSearchWrap")?.classList.remove("hidden");
    if (!feedItems.length){
      g.innerHTML = `<div class="muted" style="padding:14px;">No products found${q?` for „${esc(q)}”`:""}.</div>`;
    } else {
      g.innerHTML = feedItems.map((p,i)=>`
        <div class="up-card feed-card" data-i="${i}" data-pid="${esc(p.id)}" onclick="pickFeedProduct(${i})">
          <img src="/proxy-image?url=${encodeURIComponent(p.image)}" loading="lazy" alt="">
          <div class="nm">${esc(p.title)}</div>
          <div class="pr">${esc(p.price||"")}</div>
        </div>`).join("");
    }
    st.innerHTML = `Showing <b>${d.count}</b> of ${d.total} products${q?` matching „${esc(q)}”`:""} — click to add (up to ${MAX_PRODUCTS} per scene).`;
    syncFeedSel();
  } catch(e){ g.innerHTML = ""; st.innerHTML = `<span class="err">Feed error: ${esc(e.message)}</span>`; }
}
function connectFeed(){ loadFeed(document.getElementById("feedSearch")?.value || ""); }
let _feedT;
function onFeedSearch(){ clearTimeout(_feedT); _feedT = setTimeout(()=> loadFeed(document.getElementById("feedSearch").value.trim()), 350); }
async function pickFeedProduct(i){
  const p = feedItems[i]; if (!p) return;
  const id = "feed" + p.id;
  if (uploadedProducts.find(x=>x.id===id)){
    uploadedProducts = uploadedProducts.filter(x=>x.id!==id);
  } else {
    if (uploadedProducts.length >= MAX_PRODUCTS){ alert(`Up to ${MAX_PRODUCTS} products in one scene.`); return; }
    try {
      const blob = await fetch(`/proxy-image?url=${encodeURIComponent(p.image)}`).then(r=>{ if(!r.ok) throw new Error("img"); return r.blob(); });
      uploadedProducts.push({ id, fileName:p.title, name:p.title, dataUrl: await blobToDataURL(blob) });
    } catch(e){ alert("Could not load that product image."); return; }
  }
  syncFeedSel(); renderProducts();
}
function syncFeedSel(){
  document.querySelectorAll("#feedGrid .feed-card").forEach(c=>c.classList.toggle("sel", !!uploadedProducts.find(x=>x.id==="feed"+c.dataset.pid)));
}

const logoInput = document.getElementById("logoInput");
if (logoInput){
  logoInput.addEventListener("change", async (e)=>{
    const f = e.target.files?.[0]; if(!f) return;
    uploadedLogo = { fileName:f.name, dataUrl: await fileToDataURL(f) };
    document.getElementById("logoPreview").innerHTML = `<img src="${esc(uploadedLogo.dataUrl)}" style="max-width:200px;max-height:60px;object-fit:contain;background:#fff;border-radius:8px;padding:6px;border:1px solid var(--line);">`;
  });
}

/* ================= MODULE: image generation (interface preview — engine wired next step) =================
   Styles + QA-filter come from the n8n flow (packshotscale). Engine = packshot-generator/generate.
   This module currently SIMULATES the style × variation matrix so the UI is reviewable;
   swap the setTimeout block for a fetch to /generate-packshots to go live. */
const STYLES = [
  { key:"studio",      label:"On a plain background",  img:"img/styles/studio.png" },
  { key:"in_water",    label:"In water",               img:"img/styles/in_water.png" },
  { key:"in_hand",     label:"In hand",                img:"img/styles/in_hand.png" },
  { key:"with_person", label:"With a person / application", img:"img/styles/with_person.png" },
  { key:"interior",    label:"In a setting",           img:"img/styles/interior.png" },
  { key:"custom",      label:"Custom prompt",          img:null }
];
const STYLE_IMAGES = {
  studio:["img/styles/studio.png"],
  in_water:["img/styles/in_water.png","img/styles/in_water_c.png"],
  in_hand:["img/styles/in_hand.png"],
  with_person:["img/styles/with_person.png"],
  interior:["img/styles/interior.png"]
};
const STYLE_LABEL = Object.fromEntries(STYLES.map(s=>[s.key,s.label]));
const STYLE_GRAD = {
  studio:"linear-gradient(135deg,#f3f5f7,#e4e9ed)",
  in_water:"linear-gradient(135deg,#dceef7,#a9d8ec)",
  in_hand:"linear-gradient(135deg,#f3ece8,#e7d8cf)",
  with_person:"linear-gradient(135deg,#f5ece6,#ead9cb)",
  interior:"linear-gradient(135deg,#f0ece4,#e0d7c6)",
  custom:"linear-gradient(135deg,#fdecee,#f6d2d8)"
};
const VAR_LETTERS = ["A","B","C","D","E"];

function renderStyles(){
  const g = document.getElementById("styleGrid"); if (!g || g.dataset.done) return;
  g.innerHTML = STYLES.map((s,i)=>`
    <div class="style-card ${s.key==='custom'?'custom':''} ${i===0?'active':''}" data-style="${s.key}" onclick="toggleStyle(this)">
      <span class="ck">✓</span>
      ${s.img ? `<img class="th" src="${s.img}">` : `<div class="th">✏️</div>`}
      <div class="nm">${esc(s.label)}</div>
    </div>`).join("");
  g.dataset.done = "1";
}
function toggleStyle(el){
  // single-select: exactly one style active at a time
  document.querySelectorAll("#styleGrid .style-card").forEach(c => c.classList.toggle("active", c === el));
  document.getElementById("customWrap").classList.toggle("hidden", el.dataset.style !== "custom");
}

/* Style base-prompts + variation suffixes → built into the style × variation matrix sent to the engine.
   (Ported / adapted from the n8n packshotscale flow; composite of the provided product packshot(s).) */
// Dr.Max brand look — prepended to EVERY style so all shots share one brand DNA
const DRMAX_BASE = "DR.MAX BRAND LOOK: bright, clean, trustworthy health-and-beauty pharmacy aesthetic — soft even professional lighting, the product crisp and sharp in focus, gentle natural shadow, fresh and premium yet friendly European drugstore mood, clean vivid colours, uncluttered with calm negative space.";
const STYLE_PROMPTS = {
  studio:      "E-commerce hero on a smooth Dr.Max green gradient background (fresh green fading to deeper green), seamless studio light with a soft grounded shadow. Minimal, clean, brand-forward.",
  in_water:    "Fresh hydration scene: the product on a calm clear water surface with subtle ripples and a few clean droplets, cool airy light — health-and-beauty freshness.",
  in_hand:     "Lifestyle: a well-groomed hand presents the product naturally against a soft warm bokeh, aspirational and tactile, bright and clean.",
  with_person: "Beauty lifestyle: a model with healthy glowing skin holds the product near her face on a soft neutral studio backdrop, aspirational skincare and wellness mood.",
  interior:    "Wellness still life: the product on a clean bright bathroom or kitchen counter in soft daylight, a sprig of fresh greenery and minimal props, calm spa-like mood."
};
const VARIATION_SUFFIX = [
  "Product centered, front-facing. Clean and minimal. Soft even lighting.",
  "Slight three-quarter angle on the product. Warm side lighting, richer atmosphere.",
  "Slight low angle looking up, making it feel premium and elevated. Cool clean lighting.",
  "Close-up framing with the product filling more of the frame. Dramatic side lighting, soft shadows.",
  "Wider framing showing more environment around the product. Dreamy soft pastel lighting, hazy atmosphere."
];
// Prepended to every prompt — hard guard against the model inventing other products.
const ANTI_HALLUCINATION = "CRITICAL PRODUCT FIDELITY: Use ONLY the exact product(s) shown in the attached reference image(s). Reproduce every product's packaging, box shape, logo, label text and colours EXACTLY as in the reference. Do NOT invent, add, swap or imagine ANY other products — every single product visible in the output must be one of the attached references and nothing else. If multiple products are attached, include all of them and only them.";

/* ----- product position (adapts to the format's orientation) ----- */
function positionOptionsFor(aspect){
  const [w,h] = String(aspect).split(":").map(Number);
  if (h > w) return [{v:"top",t:"Top"},{v:"center",t:"Center"},{v:"bottom",t:"Bottom"}];   // vertical
  return [{v:"left",t:"Left"},{v:"center",t:"Center"},{v:"right",t:"Right"}];               // horizontal / square
}
function updatePositionOptions(){
  const box = document.getElementById("genPosition"); if (!box) return;
  const fmt = document.getElementById("genFormat")?.value || "1:1";
  const opts = positionOptionsFor(fmt);
  const prev = new Set([...box.querySelectorAll(".opt.on")].map(o=>o.dataset.v));  // keep selection across format changes
  box.innerHTML = opts.map(o=>`<span class="opt${prev.has(o.v)?" on":""}" data-v="${o.v}">${o.t}</span>`).join("");
  if (!box.querySelector(".opt.on")){                                             // none carried over → default to center
    (box.querySelector('[data-v="center"]') || box.querySelector(".opt"))?.classList.add("on");
  }
  box.querySelectorAll(".opt").forEach(el => el.addEventListener("click", ()=>{
    el.classList.toggle("on");
    if (!box.querySelector(".opt.on")) el.classList.add("on");                    // always keep at least one
  }));
}
function selectedPositions(){
  const on = [...document.querySelectorAll('#genPosition .opt.on')].map(o=>o.dataset.v);
  return on.length ? on : ["center"];
}
// copy-space clause: product on one side, opposite side kept clean for the banner's text/logo
const POSITION_CLAUSE = {
  top:    "COMPOSITION FOR AN AD BANNER: place the product group in the TOP part of the frame; keep the LOWER half as clean, empty brand-green gradient space (no objects) for the headline and logo. Keep the product away from all edges. No text or logos rendered in the image.",
  bottom: "COMPOSITION FOR AN AD BANNER: place the product group in the LOWER part of the frame; keep the UPPER half as clean, empty brand-green gradient space (no objects) for the headline and logo. Keep the product away from all edges. No text or logos rendered in the image.",
  left:   "COMPOSITION FOR AN AD BANNER: place the product group on the LEFT side of the frame; keep the RIGHT half as clean, empty brand-green gradient space (no objects) for the headline and logo. Keep the product away from all edges. No text or logos rendered in the image.",
  right:  "COMPOSITION FOR AN AD BANNER: place the product group on the RIGHT side of the frame; keep the LEFT half as clean, empty brand-green gradient space (no objects) for the headline and logo. Keep the product away from all edges. No text or logos rendered in the image.",
  center: "COMPOSITION FOR AN AD BANNER: keep the product group centered with generous, even, empty brand-green gradient negative space around it for the headline and logo. Keep the product away from all edges. No text or logos rendered in the image."
};
document.addEventListener("change", (e)=>{ if (e.target && e.target.id === "genFormat") updatePositionOptions(); });
updatePositionOptions();

/* ----- editable brand / style prompts (Brand tab) — overlay localStorage on the defaults ----- */
function genBaseText(){ const v = localStorage.getItem("drmax_gen_base"); return v != null ? v : DRMAX_BASE; }
function genStyleText(s){
  try { const o = JSON.parse(localStorage.getItem("drmax_gen_styles") || "{}"); return (o && o[s] != null) ? o[s] : (STYLE_PROMPTS[s] || ""); }
  catch(_){ return STYLE_PROMPTS[s] || ""; }
}
// per-style reference images (used in generation) — small data URLs in localStorage
function genRefs(){ try { return JSON.parse(localStorage.getItem("drmax_gen_refs") || "{}"); } catch(_){ return {}; } }
function styleRefFor(s){ return genRefs()[s] || ""; }
function setStyleRef(s, dataUrl){
  const o = genRefs(); if (dataUrl) o[s] = dataUrl; else delete o[s];
  try { localStorage.setItem("drmax_gen_refs", JSON.stringify(o)); }
  catch(e){ alert("Reference image is too large to store — try a smaller file."); }
}
function downscaleImage(file, max){
  return new Promise((res,rej)=>{
    const img = new Image();
    img.onload = ()=>{ let w=img.naturalWidth, h=img.naturalHeight; const k=Math.min(1, max/Math.max(w,h||1));
      w=Math.max(1,Math.round(w*k)); h=Math.max(1,Math.round(h*k));
      const c=document.createElement("canvas"); c.width=w; c.height=h; c.getContext("2d").drawImage(img,0,0,w,h); res(c.toDataURL("image/jpeg",0.82)); };
    img.onerror = rej;
    const fr = new FileReader(); fr.onload = ()=>{ img.src = fr.result; }; fr.onerror = rej; fr.readAsDataURL(file);
  });
}
function renderBrandGenSettings(){
  const box = document.getElementById("brandGenSettings"); if (!box) return;
  const rows = Object.keys(STYLE_PROMPTS).map(s => {
    const ref = styleRefFor(s);
    const thumb = ref
      ? `<img src="${ref}" style="width:54px;height:54px;object-fit:cover;border-radius:8px;border:1px solid var(--line);">`
      : `<div style="width:54px;height:54px;border-radius:8px;border:1px dashed var(--line);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:20px;">🖼️</div>`;
    return `<label class="lbl" style="margin-top:16px;">${STYLE_LABEL[s]||s}</label>
      <textarea class="genStyleEdit" data-s="${s}" rows="2">${esc(genStyleText(s))}</textarea>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
        ${thumb}
        <label class="mini" style="cursor:pointer;">${ref?"Change reference":"Add reference"}<input type="file" accept="image/*" class="genRefInput" data-s="${s}" style="display:none;"></label>
        ${ref?`<button class="mini genRefClear" data-s="${s}" type="button">Remove</button>`:""}
        <span class="muted" style="font-size:11px;">brand example for this style — colour, light &amp; mood (feeds the model)</span>
      </div>`;
  }).join("");
  box.innerHTML = `<label class="lbl">Dr.Max brand look — added to every generated image</label><textarea id="genBaseEdit" rows="3">${esc(genBaseText())}</textarea>${rows}`;
  box.querySelectorAll(".genRefInput").forEach(inp => inp.addEventListener("change", async e=>{
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { setStyleRef(inp.dataset.s, await downscaleImage(f, 640)); renderBrandGenSettings(); }
    catch(_){ alert("Could not read that image."); }
  }));
  box.querySelectorAll(".genRefClear").forEach(btn => btn.addEventListener("click", ()=>{ setStyleRef(btn.dataset.s, ""); renderBrandGenSettings(); }));
}
// pull the shared server config so the client opens with what was set (not empty defaults)
async function loadBrandConfig(){
  try {
    const r = await fetch("/brand-config?client=" + encodeURIComponent(CLIENT_ID));
    if (!r.ok) return;
    const cfg = await r.json();
    if (cfg && (cfg.base != null || cfg.styles || cfg.refs)){
      if (cfg.base != null) localStorage.setItem("drmax_gen_base", cfg.base);
      if (cfg.styles) localStorage.setItem("drmax_gen_styles", JSON.stringify(cfg.styles));
      if (cfg.refs)   localStorage.setItem("drmax_gen_refs", JSON.stringify(cfg.refs));
      renderBrandGenSettings();
    }
  } catch(_){}
}
// reference slot for the Custom prompt (stored under the "custom" key, like the built-in styles)
function renderCustomRef(){
  const box = document.getElementById("customRefRow"); if (!box) return;
  const ref = styleRefFor("custom");
  const thumb = ref
    ? `<img src="${ref}" style="width:54px;height:54px;object-fit:cover;border-radius:8px;border:1px solid var(--line);">`
    : `<div style="width:54px;height:54px;border-radius:8px;border:1px dashed var(--line);display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:20px;">🖼️</div>`;
  box.innerHTML = thumb
    + `<label class="mini" style="cursor:pointer;">${ref?"Change reference":"Add reference"}<input type="file" accept="image/*" id="customRefInput" style="display:none;"></label>`
    + (ref?`<button class="mini" id="customRefClear" type="button">Remove</button>`:"")
    + `<span class="muted" style="font-size:11px;">optional style reference — colour, light &amp; mood</span>`;
  document.getElementById("customRefInput")?.addEventListener("change", async e=>{
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { setStyleRef("custom", await downscaleImage(f, 640)); renderCustomRef(); }
    catch(_){ alert("Could not read that image."); }
  });
  document.getElementById("customRefClear")?.addEventListener("click", ()=>{ setStyleRef("custom", ""); renderCustomRef(); });
}
(function initBrandGen(){
  renderBrandGenSettings();
  renderCustomRef();
  loadBrandConfig();
  document.getElementById("brandGenSave")?.addEventListener("click", async ()=>{
    const base = document.getElementById("genBaseEdit").value;
    const styles = {}; document.querySelectorAll(".genStyleEdit").forEach(t => styles[t.dataset.s] = t.value);
    const refs = genRefs();
    localStorage.setItem("drmax_gen_base", base);
    localStorage.setItem("drmax_gen_styles", JSON.stringify(styles));
    const b = document.getElementById("brandGenSave"); const orig = b ? b.textContent : "";
    if (b){ b.disabled = true; b.textContent = "Saving…"; }
    try {
      const r = await fetch("/brand-config", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ client: CLIENT_ID, base, styles, refs }) });
      if (!r.ok) throw new Error("save failed");
      if (b) b.textContent = "Saved ✓ (shared)";
    } catch(e){ if (b) b.textContent = "Saved locally only"; }
    finally { if (b) setTimeout(()=>{ b.textContent = orig; b.disabled = false; }, 2000); }
  });
  document.getElementById("brandGenReset")?.addEventListener("click", ()=>{
    localStorage.removeItem("drmax_gen_base"); localStorage.removeItem("drmax_gen_styles"); localStorage.removeItem("drmax_gen_refs"); renderBrandGenSettings();
  });
})();

async function genImages(){
  if (!uploadedProducts.length){ alert("Upload a product first."); return; }
  const styles = [...document.querySelectorAll('#styleGrid .style-card.active')].map(c=>c.dataset.style);
  if (!styles.length){ alert("Select at least one style."); return; }
  const customText = document.getElementById("customPrompt").value.trim();
  if (styles.includes("custom") && !customText){ alert("Enter a custom prompt or deselect „Custom prompt”."); return; }
  const vars = parseInt(document.getElementById("genVars").value,10) || 4;
  const fmt = document.getElementById("genFormat").value;
  const quality = document.getElementById("genQuality").value;
  const genModel = document.getElementById("genModel")?.value || undefined;
  const positions = selectedPositions();
  const prods = uploadedProducts.slice(0, MAX_PRODUCTS);

  // matrix = style × position × variation (fidelity guard + style + variation + banner copy-space position)
  const brandBase = genBaseText();
  const matrix = [];
  styles.forEach(s=>{
    const base = s === "custom" ? customText : genStyleText(s);
    const sref = styleRefFor(s);   // per-style brand reference image (incl. "custom")
    const refClause = sref ? "An extra STYLE REFERENCE image is attached — use it ONLY for overall colour palette, lighting and mood. Do NOT copy or include any products, people, logos, graphic shapes, plus symbols, frames or text from the style reference; the product(s) must come solely from the product reference image(s)." : "";
    positions.forEach(pos=>{
      const posClause = POSITION_CLAUSE[pos] || "";
      for (let v=0; v<vars; v++){
        matrix.push({ label:`${STYLE_LABEL[s]||s} · ${pos} · ${VAR_LETTERS[v]||("V"+(v+1))}`, styleRef: sref, text:`${ANTI_HALLUCINATION} ${refClause} ${brandBase} ${base} ${VARIATION_SUFFIX[v]||""} ${posClause}`.trim() });
      }
    });
  });

  // large batches are slower and can hit rate limits — warn before launching a big one
  if (matrix.length > 12 && !confirm(`This will generate ${matrix.length} images. Big batches are slower and may hit rate limits (some can be skipped). For reliability, generate in smaller sets. Continue?`)) return;

  const btn = document.getElementById("btnGenImg");
  btn.disabled = true; btn.textContent = "Generating…";
  show("imgResCard"); show("imgLoading"); setErr("imgErr","");
  document.getElementById("imgGrid").classList.remove("hidden");
  document.getElementById("imgGrid").innerHTML = "";
  generatedScenes = [];
  const total = matrix.length;
  let failed = 0;
  const status = ()=>{ document.getElementById("imgLoading").innerHTML =
    `<div class="spin"></div> Generating… <b>${generatedScenes.length}/${total}</b> ready${failed?` · ${failed} skipped`:""}`; };
  status();

  // one scene per request → each appears as soon as it's ready; one failure never kills the rest
  const genOne = async (m)=>{
    try {
      const res = await fetch("/generate-scenes", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          products: prods.map(p=>({ name:p.name, dataUrl:p.dataUrl })),
          prompts: [{ label:m.label, text:m.text, styleRef:m.styleRef || undefined }],
          aspectRatio: fmt, imageSize: quality, model: genModel, client: CLIENT_ID, composition: false
        })
      });
      const data = await res.json();
      const url = (data.scenes || [])[0];
      if (!res.ok || !url) throw new Error(data.error || "failed");
      generatedScenes.push({ url, aspect:fmt, label:m.label, prompt:m.text, saved:true });
      savedImages.push({ url });
      renderGenGrid();           // re-render so the new one pops in immediately
      // auto-save every generated image to the library (no button needed)
      fetch("/save-asset", { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ client: CLIENT_ID, kind:"image", sourceUrl: url, meta:{ label:m.label, format:fmt } }) }).catch(()=>{});
    } catch(e){ failed++; }
    status();
  };

  // sequential (one request at a time) — most reliable against the model's rate limit
  const worker = async ()=>{ let next = 0; while (next < matrix.length){ await genOne(matrix[next++]); } };
  await worker();

  hide("imgLoading");
  document.getElementById("imgCount").textContent =
    `— ${generatedScenes.length} generated${failed?`, ${failed} skipped (rate limit — regenerate those)`:""} · ${fmt} · ${quality}`;
  if (!generatedScenes.length) setErr("imgErr", "All generations failed — try again with a smaller batch.");
  btn.disabled = false; btn.textContent = "Generate images →";
}
function renderGenGrid(){
  const g = document.getElementById("imgGrid");
  g.innerHTML = generatedScenes.map((s,i)=>`
    <div class="gen-cell" data-si="${i}">
      <div class="img-item" style="aspect-ratio:${(s.aspect||'1:1').replace(':',' / ')};animation-delay:${(i%6)*0.05}s">
        <img src="${esc(s.url)}" style="width:100%;height:100%;object-fit:cover;cursor:zoom-in;" onclick="openLightbox(this.src)">
        <span class="img-tag">${esc(s.label)}</span>
        <div class="gen-busy hidden"><div class="spin"></div></div>
      </div>
      <div class="gen-tools">
        <button class="b" onclick="useScene(${i})">Use</button>
        <button onclick="regenScene(${i})" title="Generate another variant">↻</button>
        <button onclick="toggleSceneEdit(${i})" title="Edit with a prompt">✎</button>
        ${s.saved ? `<span title="Auto-saved to library" style="padding:5px 8px;color:var(--green);font-weight:800;">✓ Saved</span>` : `<button onclick="saveScene(${i},this)" title="Save to library">💾</button>`}
        <a href="/download?url=${encodeURIComponent(s.url)}&name=drmax-${(s.label||'scene').replace(/[^a-z0-9]+/gi,'-')}.png">PNG</a>
      </div>
      <div class="gen-edit hidden" id="genedit-${i}">
        <input type="text" placeholder="e.g. remove the leaf, warmer background, less shadow" onkeydown="if(event.key==='Enter')applySceneEdit(${i})">
        <button onclick="applySceneEdit(${i})">Apply</button>
      </div>
    </div>`).join("");
}
function sceneCell(i){ return document.querySelector(`#imgGrid .gen-cell[data-si="${i}"]`); }
function setSceneBusy(i, busy){ const c=sceneCell(i); if(!c) return; const b=c.querySelector(".gen-busy"); if(b) b.classList.toggle("hidden", !busy); }
function swapSceneImg(i, url){ const c=sceneCell(i); if(!c) return; c.querySelector(".img-item img").src=url; const dl=c.querySelector("a[download]"); if(dl) dl.href=url; }
function useScene(i){
  const url = generatedScenes[i] && generatedScenes[i].url; if (!url) return;
  pickedSceneUrl = url;                 // keep the legacy flow working too
  showView("banners");
  if (window.useSceneInBuilder) window.useSceneInBuilder(url);   // drop it into the adaptive builder
}
function toggleSceneEdit(i){ const b=document.getElementById("genedit-"+i); if(!b) return; b.classList.toggle("hidden"); const inp=b.querySelector("input"); if(inp && !b.classList.contains("hidden")) inp.focus(); }

async function regenScene(i){
  const s=generatedScenes[i]; if(!s) return;
  const prods=uploadedProducts.slice(0,MAX_PRODUCTS);
  if(!prods.length){ alert("No product in memory — generate again."); return; }
  setSceneBusy(i,true);
  try{
    const res=await fetch("/generate-scenes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      products:prods.map(p=>({name:p.name,dataUrl:p.dataUrl})),
      prompts:[{label:s.label,text:s.prompt||""}],
      aspectRatio:s.aspect, imageSize:document.getElementById("genQuality").value, client:CLIENT_ID, composition:false
    })});
    const data=await res.json(); if(!res.ok) throw new Error(data.error||"Regeneration failed");
    const url=(data.scenes||[])[0]; if(!url) throw new Error("No image");
    s.url=url; savedImages.push({url}); swapSceneImg(i,url);
  }catch(err){ console.error(err); alert("Failed: "+err.message); }
  finally{ setSceneBusy(i,false); }
}

async function applySceneEdit(i){
  const box=document.getElementById("genedit-"+i); if(!box) return;
  const inp=box.querySelector("input"); const instruction=(inp.value||"").trim();
  if(!instruction){ inp.focus(); return; }
  const s=generatedScenes[i]; if(!s) return;
  setSceneBusy(i,true);
  try{
    const res=await fetch("/edit-scene",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      imageUrl:s.url, prompt:instruction, aspectRatio:s.aspect, imageSize:document.getElementById("genQuality").value, client:CLIENT_ID
    })});
    const data=await res.json(); if(!res.ok) throw new Error(data.error||"Edit failed");
    if(!data.url) throw new Error("No image");
    s.url=data.url; savedImages.push({url:data.url}); swapSceneImg(i,data.url);
    box.classList.add("hidden"); inp.value="";
  }catch(err){ console.error(err); alert("Failed to edit: "+err.message); }
  finally{ setSceneBusy(i,false); }
}

async function saveScene(i, btn){
  const s=generatedScenes[i]; if(!s) return;
  const orig=btn.textContent; btn.disabled=true; btn.textContent="…";
  try{
    const res=await fetch("/save-asset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      client:CLIENT_ID, kind:"image", sourceUrl:s.url, meta:{ label:s.label, format:s.aspect }
    })});
    const data=await res.json(); if(!res.ok) throw new Error(data.error||"Save failed");
    btn.textContent="✓"; btn.title="Saved to library";
  }catch(err){ console.error(err); alert("Failed to save: "+err.message); btn.textContent=orig; btn.disabled=false; }
}

/* fullscreen image viewer */
function openLightbox(url){ const lb=document.getElementById("lightbox"); if(!lb||!url) return; lb.querySelector("img").src=url; lb.classList.remove("hidden"); }
function closeLightbox(){ const lb=document.getElementById("lightbox"); if(lb) lb.classList.add("hidden"); }

/* use a saved image from the library directly in banner creation */
function useSavedScene(url, format){
  let i = generatedScenes.findIndex(s=>s.url===url);
  if (i<0){ generatedScenes.push({ url, aspect: format||"1:1", label:"saved" }); }
  pickedSceneUrl = url;
  showView("banners");
  if (window.useSceneInBuilder) window.useSceneInBuilder(url);   // drop it into the adaptive builder too
}

/* ================= MODULE: banner creation ================= */
async function ensureTemplates(){
  const row = document.getElementById("tplRow");
  if (availableTemplates.length){ renderTpl(); return; }
  try{
    const res = await fetch("/templates");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load templates");
    // Main version scoped to the 9:16 vertical master only; 300×600 is the single
    // reformat surface for practising the rule-based layout swap.
    availableTemplates = (data.templates || []).filter(t => templateFamily(t) === "vertical");
    selectedTemplateIds = new Set(availableTemplates.length ? [availableTemplates[0].id] : []);
    renderTpl();
  }catch(err){
    row.innerHTML = `<div class="err">${esc(err.message)}</div>`;
  }
}
function renderTpl(){
  const row = document.getElementById("tplRow");
  const visible = availableTemplates;
  if (!visible.length){ row.innerHTML = `<div class="muted">No templates.</div>`; return; }
  row.innerHTML = visible.map(t => `
    <div class="tpl ${selectedTemplateIds.has(t.id)?'sel':''}" onclick="toggleTpl('${esc(t.id)}')">
      ${t.backgroundUrl ? `<img class="thumb" src="${esc(t.backgroundUrl)}">` : `<div class="thumb"></div>`}
      <div class="nm">${esc(t.name)}<span>${Math.round(t.width)}×${Math.round(t.height)}</span></div>
    </div>`).join("");
}
function toggleTpl(id){
  if (selectedTemplateIds.has(id)) selectedTemplateIds.delete(id); else selectedTemplateIds.add(id);
  renderTpl();
}
let libraryImages = [];
async function loadLibrary(){
  try{
    const res = await fetch(`/library?client=${encodeURIComponent(CLIENT_ID)}`);
    const d = await res.json();
    libraryImages = (d.images||[]).map(s=>({ url:s.url, label:(s.meta&&s.meta.label)||"saved" }));
  }catch(_){ libraryImages = []; }
}
async function renderPick(){
  const g = document.getElementById("pickGrid");
  await loadLibrary();
  const sessionUrls = new Set(generatedScenes.map(s=>s.url));
  const all = [
    ...generatedScenes.map(s=>({ url:s.url, src:"session" })),
    ...libraryImages.filter(s=>!sessionUrls.has(s.url)).map(s=>({ url:s.url, src:"library" }))
  ];
  if (!all.length){ g.innerHTML = `<div class="muted">No images. Generate in „Image generation" or save to the library (💾).</div>`; return; }
  if (!pickedSceneUrl || !all.some(s=>s.url===pickedSceneUrl)) pickedSceneUrl = all[0].url;
  g.innerHTML = all.map(s=>`
    <div class="pick ${s.url===pickedSceneUrl?'sel':''}" data-url="${esc(s.url)}" onclick="selPick('${esc(s.url)}')">
      <img src="${esc(s.url)}"><span class="ck">✓</span><span class="src-tag">${s.src}</span>
    </div>`).join("");
}
function selPick(url){
  pickedSceneUrl = url;
  document.querySelectorAll('#pickGrid .pick, #bBgGrid .pick').forEach(p=>p.classList.toggle('sel', p.dataset.url===url));
  if (window.useSceneInBuilder) window.useSceneInBuilder(url);   // also set it as the builder background
}
function refreshLibrary(){ libraryImages = []; renderPick(); }

// Background picker for the banner builder (Card 1) — opens in a MODAL so the growing
// library never bloats the sidebar. Source: session generations + saved library.
async function openBgModal(){
  const m = document.getElementById("bgModal"); if (!m) return;
  m.classList.remove("hidden");
  await renderBgModal();
}
function closeBgModal(){ const m = document.getElementById("bgModal"); if (m) m.classList.add("hidden"); }
async function renderBgModal(){
  const g = document.getElementById("bgModalGrid"); if (!g) return;
  g.innerHTML = `<div class="muted">Loading…</div>`;
  await loadLibrary();
  const sessionUrls = new Set(generatedScenes.map(s=>s.url));
  const all = [
    ...generatedScenes.map(s=>({ url:s.url, src:"session" })),
    ...libraryImages.filter(s=>!sessionUrls.has(s.url)).map(s=>({ url:s.url, src:"library" }))
  ];
  if (!all.length){ g.innerHTML = `<div class="muted">No images yet — click „Generate new →" to create one.</div>`; return; }
  g.innerHTML = all.map(s=>`
    <div class="pick ${s.url===pickedSceneUrl?'sel':''}" data-url="${esc(s.url)}" onclick="pickBg('${esc(s.url)}')">
      <img src="${esc(s.url)}"><span class="ck">✓</span><span class="src-tag">${s.src}</span>
    </div>`).join("");
}
async function refreshBgModal(){ libraryImages = []; await renderBgModal(); }
// pick from the modal → set as banner background, update the Card 1 preview, close.
function pickBg(url){ selPick(url); updateBgCurrent(url); closeBgModal(); }
// Card 1 compact preview of the chosen background (or a placeholder prompting to choose).
function updateBgCurrent(url){
  const c = document.getElementById("bBgCurrent"); if (!c) return;
  c.innerHTML = url
    ? `<img src="${esc(url)}" alt="background"><span class="bg-edit">Change</span>`
    : `<div class="bg-empty">No background chosen yet.<br>Click to pick one 🖼</div>`;
}

/* templates now define their own size — keep the picker always visible */

/* ----- copy (real /generate-copy) ----- */
async function genCopy(){
  const btn = document.getElementById("btnCopy");
  btn.disabled = true; btn.textContent = "Generating…";
  show("copyCard"); show("copyLoading"); hide("copyGrid"); hide("copyActions"); setErr("copyErr","");
  try{
    const res = await fetch("/generate-copy", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        products: uploadedProducts.map(p=>({ name:p.name, fileName:p.fileName, imageDataUrl:p.dataUrl })),
        targetGroup: document.getElementById("banTargetGroup").value.trim(),
        templateSettings: getSettings()
      })
    });
    const data = await res.json();
    const headlines = data.headlines || [], subs = data.subheadlines || [], ctas = data.ctas || [];
    const promos = data.promos || [], legals = data.legals || [];
    generatedVariants = [0,1,2].map(i => ({ headline:headlines[i]||"", subheadline:subs[i]||"", cta:ctas[i]||"", promo:promos[i]||"", legal:legals[i]||"" }));
    hide("copyLoading"); renderCopy(); show("copyActions");
  }catch(err){
    console.error(err); hide("copyLoading"); setErr("copyErr", `Error: ${err.message}`);
  }finally{
    btn.disabled = false; btn.textContent = "Generate copy →";
  }
}
function renderCopy(){
  const g = document.getElementById("copyGrid"); g.classList.remove("hidden");
  g.innerHTML = generatedVariants.map((v,i)=>`
    <div class="copy" id="copy-${i}" style="animation-delay:${i*0.08}s">
      <div class="vt">Variant ${i+1}</div>
      <div class="head">${esc(v.headline)}</div>
      <div class="sub">${esc(v.subheadline)}</div>
      <span class="cta">${esc(v.cta)}</span>
      <div class="sub" style="margin-top:8px;"><b>Badge:</b> ${esc(v.promo||'')}</div>
      <div class="sub" style="font-size:11px;color:var(--muted);"><b>Legal:</b> ${esc(v.legal||'')}</div>
      <button class="copy-edit" onclick="editCopy(${i})">Edit</button>
    </div>`).join("");
}
function editCopy(i){
  const v = generatedVariants[i], c = document.getElementById("copy-"+i);
  if (c.classList.contains("editing")){
    v.headline = c.querySelector('[data-f=head]').value;
    v.subheadline = c.querySelector('[data-f=sub]').value;
    v.cta = c.querySelector('[data-f=cta]').value;
    v.promo = c.querySelector('[data-f=promo]').value;
    v.legal = c.querySelector('[data-f=legal]').value;
    c.classList.remove("editing");
    c.innerHTML = `<div class="vt">Variant ${i+1}</div><div class="head">${esc(v.headline)}</div><div class="sub">${esc(v.subheadline)}</div><span class="cta">${esc(v.cta)}</span><div class="sub" style="margin-top:8px;"><b>Badge:</b> ${esc(v.promo||'')}</div><div class="sub" style="font-size:11px;color:var(--muted);"><b>Legal:</b> ${esc(v.legal||'')}</div><button class="copy-edit" onclick="editCopy(${i})">Edit</button>`;
  } else {
    c.classList.add("editing");
    c.innerHTML = `<div class="vt">Variant ${i+1}</div>
      <span class="fld-lbl">Headline</span><textarea class="fld-edit" data-f="head" rows="2">${esc(v.headline)}</textarea>
      <span class="fld-lbl">Subheadline</span><textarea class="fld-edit" data-f="sub" rows="2">${esc(v.subheadline)}</textarea>
      <span class="fld-lbl">CTA</span><input class="fld-edit" data-f="cta" value="${esc(v.cta)}">
      <span class="fld-lbl">Badge text</span><input class="fld-edit" data-f="promo" value="${esc(v.promo||'')}">
      <span class="fld-lbl">Legal</span><textarea class="fld-edit" data-f="legal" rows="2">${esc(v.legal||'')}</textarea>
      <button class="copy-edit" onclick="editCopy(${i})">Save</button>`;
  }
}

/* ----- banners (real /render-banner | /render-9x16) ----- */
function banClass(spec){
  if (spec.family === "wide") return "ban wide";
  if (spec.aspect === "9:16") return "ban vertical";
  return "ban";
}
async function genBanners(){
  if (reformatInFlight){ alert("Please wait for the current operation to finish."); return; }
  if (!generatedVariants.length){ alert("Generate copy first."); return; }
  if (!pickedSceneUrl){ alert("Pick an image in section 2."); return; }
  if (!selectedTemplateIds.size){ alert("Select at least one template."); return; }

  show("banCard"); show("banLoading"); hide("banGrid"); setErr("banErr","");

  // one job per selected template — each rendered at its OWN native size
  const selected = availableTemplates.filter(t => selectedTemplateIds.has(t.id));
  const jobs = selected.map((t, idx)=> mkJob(t, idx));

  renderSkeletons(jobs);
  hide("banLoading");
  await Promise.all(jobs.map((job,i)=>{
    const card = document.querySelector(`#banGrid [data-ji="${i}"]`);
    return renderJob(card, job).catch(err=>{
      const ov = card.querySelector(".ovl"); if (ov) ov.innerHTML = `Error: ${esc(err.message)}`;
    });
  }));
}
function mkJob(t, variantIndex){
  const v = generatedVariants[variantIndex] || generatedVariants[0] || {headline:"",subheadline:"",cta:""};
  const s = getSettings();
  const w = Math.round(t.width), h = Math.round(t.height);
  return { templateId:t.id, templateName:t.name, variantIndex, w, h, family: templateFamily(t),
    format: `${w}x${h}`, sceneUrl: pickedSceneUrl,
    copy:{ headline:v.headline||"", subheadline:v.subheadline||"", cta:v.cta||"", promo:s.discountText||"", badge:v.promo||"", legal:v.legal||s.disclaimerText||"" } };
}
function banClassFor(job){
  if (job.family === "wide" || job.family === "medium") return "ban wide";
  if (job.family === "vertical") return "ban vertical";
  return "ban";
}
function renderSkeletons(jobs){
  const g = document.getElementById("banGrid"); g.classList.remove("hidden");
  g.innerHTML = jobs.map((job,i)=>`
    <div class="${banClassFor(job)}" data-ji="${i}">
      <div class="frame"><div class="ovl"><div class="spin"></div> Rendering…</div></div>
      <div class="meta"><b>${esc(job.templateName)}</b> · <span class="fmt">${job.w}×${job.h}</span></div>
      <div class="tools"></div>
      <div class="editbox hidden"></div>
    </div>`).join("");
}
async function renderJob(card, job){
  const body = { templateId: job.templateId, copy:job.copy, sceneUrl:job.sceneUrl, logoDataUrl:uploadedLogo?.dataUrl||"", settings:getSettings(), targetWidth: job.w, targetHeight: job.h };
  const res = await fetch("/render-banner", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
  if (!res.ok){ const e = await res.json().catch(()=>({})); throw new Error(e.error || `Render ${res.status}`); }
  const url = URL.createObjectURL(await res.blob());
  paintBanner(card, job, job.format, url);
  savedBanners.push({ url, format: job.format, templateName: job.templateName });
}
function paintBanner(card, job, format, url){
  const spec = getFormatSpec(format);
  const frame = card.querySelector(".frame");
  frame.innerHTML = `<img src="${url}">`;
  const safe = String(job.templateName).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
  const fname = `${safe}-v${job.variantIndex+1}.png`;
  const tools = card.querySelector(".tools");
  tools.innerHTML = `
    <select class="reformat-sel" onchange="onReformat(this)"><option value="" disabled selected>Reformat…</option></select>
    <select class="changetpl-sel" onchange="onChangeTpl(this)"><option value="" disabled selected>Change template…</option></select>
    <button class="mini edit" onclick="editText(this)">Edit text</button>
    <button class="mini edit" onclick="editComp(this)">Edit layout</button>
    <button class="mini edit" onclick="editBg(this)">Edit background</button>
    <a class="mini" href="${url}" download="${fname}">PNG</a>
    <button class="mini" onclick="dlHtml5(this)">HTML5</button>
    <button class="mini edit" onclick="saveBanner(this)">💾 Save</button>`;
  renderedJobs.set(card, { ...job, downloadName:fname });
  populateReformat(card, format, job.templateId);
}

/* reformat + change template (ported logic) */
// Intra-family reformat: same master, other sizes within the same family (reflow via flexbox, reuse scene).
// Scoped down: the ONLY reformat kept is 9:16 → 300×600 (same vertical master).
// This is the single surface for practising / swapping the layout technology.
const SIBLING_SIZES = {
  vertical: ["300x600"]
};
function buildReformatOptions(currentFormat, currentTemplateId){
  const opts = []; const cur = FORMATS[currentFormat]; if (!cur || !currentTemplateId) return opts;
  // Intra-family: same master, other sizes (reflow via flexbox, reuse scene).
  (SIBLING_SIZES[cur.family] || []).forEach(f=>{
    if (f === currentFormat) return;
    const s = FORMATS[f]; if (!s) return;
    opts.push({ value:`${f}|${currentTemplateId}`, label:`${s.w}×${s.h}` });
  });
  // Cross-family jumps removed — scoped to the single 300×600 reformat.
  return opts;
}
function buildChangeTemplateOptions(currentFormat, currentTemplateId){
  return []; // template-swap removed in the scoped 9:16-only version
}
function populateReformat(card, format, templateId){
  const rf = card.querySelector(".reformat-sel");
  if (rf){ const o = buildReformatOptions(format, templateId); rf.innerHTML = `<option value="" disabled selected>Reformat…</option>`+o.map(x=>`<option value="${esc(x.value)}">${esc(x.label)}</option>`).join(""); rf.style.display = o.length?"block":"none"; }
  const ct = card.querySelector(".changetpl-sel");
  if (ct){ const o = buildChangeTemplateOptions(format, templateId); ct.innerHTML = `<option value="" disabled selected>Change template…</option>`+o.map(x=>`<option value="${esc(x.value)}">${esc(x.label)}</option>`).join(""); ct.style.display = o.length?"block":"none"; }
}
function onReformat(sel){ const card = sel.closest("[data-ji]"); const v = sel.value; sel.selectedIndex = 0; if (v) reformatBanner(card, v); }
function onChangeTpl(sel){ const card = sel.closest("[data-ji]"); const v = sel.value; sel.selectedIndex = 0; if (v) reformatBanner(card, v); }

async function reformatBanner(card, value){
  if (reformatInFlight){ alert("Another reformat is in progress — please wait."); return; }
  const job = renderedJobs.get(card); if (!job) return;
  const [newFormat, newTemplateId] = value.split("|");
  const newSpec = getFormatSpec(newFormat);
  const isHtml = newSpec.family === "html";
  reformatInFlight = true;
  document.querySelectorAll(".reformat-sel,.changetpl-sel").forEach(s=>s.disabled=true);
  const frame = card.querySelector(".frame");
  const ov = document.createElement("div"); ov.className="ovl"; ov.innerHTML = '<div class="spin"></div> Reformatting…'; frame.appendChild(ov);
  try{
    const sceneUrl = job.sceneUrl;   // same family → reuse the scene (no new AI scene, no REFLOW)
    const endpoint = isHtml ? "/render-9x16" : "/render-banner";
    const body = { copy:job.copy, sceneUrl, logoDataUrl:uploadedLogo?.dataUrl||"", settings:getSettings(), targetWidth:newSpec.w, targetHeight:newSpec.h };
    if (!isHtml) body.templateId = newTemplateId;
    const rr = await fetch(endpoint, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    if (!rr.ok){ const e = await rr.json().catch(()=>({})); throw new Error(e.error||`Render ${rr.status}`); }
    const url = URL.createObjectURL(await rr.blob());
    const newName = newFormat==="9:16" ? "1080×1920 HTML" : (availableTemplates.find(t=>t.id===newTemplateId)?.name || newTemplateId);
    card.className = banClass(newSpec); card.dataset.ji = card.dataset.ji;
    paintBanner(card, { ...job, templateId:newTemplateId, templateName:newName, format:newFormat, sceneUrl, w:newSpec.w, h:newSpec.h, family:newSpec.family }, newFormat, url);
    card.querySelector(".fmt").textContent = `${newSpec.w}×${newSpec.h}`;
    card.querySelector(".meta b").textContent = newName;
    savedBanners.push({ url, format:newFormat, templateName:newName });
  }catch(err){ ov.innerHTML = `Error: ${esc(err.message)}`; setTimeout(()=>ov.remove(), 2500); }
  finally{ reformatInFlight=false; document.querySelectorAll(".reformat-sel,.changetpl-sel").forEach(s=>s.disabled=false); }
}

/* edit text (re-render with new copy) */
function editText(btn){
  const card = btn.closest("[data-ji]"); const job = renderedJobs.get(card); if (!job) return;
  const box = card.querySelector(".editbox");
  if (box.dataset.mode==="text"){ box.classList.add("hidden"); box.dataset.mode=""; return; }
  box.dataset.mode="text"; box.classList.remove("hidden");
  box.innerHTML = `<label>Headline</label><input data-e="headline" value="${esc(job.copy.headline)}">
    <label>Subheadline</label><textarea data-e="subheadline" rows="2">${esc(job.copy.subheadline)}</textarea>
    <label>CTA</label><input data-e="cta" value="${esc(job.copy.cta)}">
    <label>Discount</label><input data-e="promo" value="${esc(job.copy.promo)}">
    <label>Badge text</label><input data-e="badge" value="${esc(job.copy.badge||'')}">
    <label>Legal / disclaimer</label><textarea data-e="legal" rows="2">${esc(job.copy.legal)}</textarea>
    <button class="ap" onclick="applyText(this)">Apply</button><button class="ca" onclick="this.closest('.editbox').classList.add('hidden')">Cancel</button>`;
}
async function applyText(btn){
  if (reformatInFlight){ alert("Please wait for the operation to finish."); return; }
  const card = btn.closest("[data-ji]"); const job = renderedJobs.get(card); if (!job) return;
  const box = card.querySelector(".editbox");
  const copy = { ...job.copy,
    headline: box.querySelector('[data-e=headline]').value.trim(),
    subheadline: box.querySelector('[data-e=subheadline]').value.trim(),
    cta: box.querySelector('[data-e=cta]').value.trim(),
    promo: box.querySelector('[data-e=promo]').value.trim(),
    badge: box.querySelector('[data-e=badge]').value.trim(),
    legal: box.querySelector('[data-e=legal]').value.trim() };
  reformatInFlight = true; btn.disabled = true;
  const frame = card.querySelector(".frame"); const ov = document.createElement("div"); ov.className="ovl"; ov.innerHTML='<div class="spin"></div> Rendering…'; frame.appendChild(ov);
  try{
    const spec = getFormatSpec(job.format); const isHtml = spec.family==="html";
    const endpoint = isHtml ? "/render-9x16" : "/render-banner";
    const body = { copy, sceneUrl:job.sceneUrl, logoDataUrl:uploadedLogo?.dataUrl||"", settings:getSettings(), targetWidth:spec.w, targetHeight:spec.h };
    if (!isHtml) body.templateId = job.templateId;
    const rr = await fetch(endpoint, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    if (!rr.ok){ const e = await rr.json().catch(()=>({})); throw new Error(e.error||`Render ${rr.status}`); }
    const url = URL.createObjectURL(await rr.blob());
    paintBanner(card, { ...job, copy }, job.format, url);
    savedBanners.push({ url, format:job.format, templateName:job.templateName });
  }catch(err){ ov.innerHTML = `Error: ${esc(err.message)}`; setTimeout(()=>ov.remove(),2500); }
  finally{ reformatInFlight=false; }
}

/* edit composition (drag slots → slotOverrides → re-render) */
function editComp(btn){
  const card = btn.closest("[data-ji]"); const job = renderedJobs.get(card); if (!job) return;
  if (getFormatSpec(job.format).family === "html"){ alert("Layout editing is available for Figma templates."); return; }
  const tpl = availableTemplates.find(t=>t.id===job.templateId);
  if (!tpl || !tpl.slots){ alert("No layout data for this template."); return; }
  const frame = card.querySelector(".frame");
  if (frame.querySelector(".comp-ovl")){ frame.querySelector(".comp-ovl").remove(); const ex = card.querySelector(".comp-apply"); if (ex) ex.remove(); return; }
  const nW = tpl.width, nH = tpl.height;
  const overrides = job.slotOverrides ? JSON.parse(JSON.stringify(job.slotOverrides)) : {};
  const ov = document.createElement("div"); ov.className="comp-ovl";
  Object.entries(tpl.slots).forEach(([key,slot])=>{
    if (!slot.box || key==="background") return;
    const cur = overrides[key] ? {...slot.box, ...overrides[key]} : slot.box;
    const d = document.createElement("div"); d.className="slot";
    d.style.left=`${cur.x/nW*100}%`; d.style.top=`${cur.y/nH*100}%`; d.style.width=`${cur.w/nW*100}%`; d.style.height=`${cur.h/nH*100}%`;
    d.innerHTML=`<span class="lab">${esc(key)}</span>`;
    dragSlot(d, ov, nW, nH, overrides, key); ov.appendChild(d);
  });
  frame.appendChild(ov);
  const ap = document.createElement("button"); ap.className="mini edit comp-apply"; ap.textContent="Apply layout"; ap.style.marginTop="6px";
  ap.onclick = ()=> applyComp(card, overrides);
  card.querySelector(".tools").appendChild(ap);
}
function dragSlot(el, overlay, nW, nH, overrides, key){
  let sx, sy, sl, st, pid=null;
  el.addEventListener("pointerdown",(e)=>{ e.preventDefault(); sx=e.clientX; sy=e.clientY; const o=overlay.getBoundingClientRect(), r=el.getBoundingClientRect(); sl=(r.left-o.left)/o.width; st=(r.top-o.top)/o.height; pid=e.pointerId; el.setPointerCapture(pid); });
  el.addEventListener("pointermove",(e)=>{ if (e.pointerId!==pid) return; const o=overlay.getBoundingClientRect(); const dx=(e.clientX-sx)/o.width, dy=(e.clientY-sy)/o.height; const nl=Math.max(0,Math.min(1-parseFloat(el.style.width)/100, sl+dx)); const nt=Math.max(0,Math.min(1-parseFloat(el.style.height)/100, st+dy)); el.style.left=`${nl*100}%`; el.style.top=`${nt*100}%`; overrides[key]={...(overrides[key]||{}), x:Math.round(nl*nW), y:Math.round(nt*nH)}; });
  const end=(e)=>{ if (e.pointerId!==pid) return; try{el.releasePointerCapture(pid);}catch(_){}; pid=null; };
  el.addEventListener("pointerup",end); el.addEventListener("pointercancel",end);
}
async function applyComp(card, overrides){
  if (reformatInFlight){ alert("Please wait for the operation to finish."); return; }
  const job = renderedJobs.get(card); if (!job) return;
  reformatInFlight=true;
  const frame = card.querySelector(".frame"); const c = frame.querySelector(".comp-ovl"); if (c) c.remove();
  const ap = card.querySelector(".comp-apply"); if (ap) ap.remove();
  const ov = document.createElement("div"); ov.className="ovl"; ov.innerHTML='<div class="spin"></div> Rendering layout…'; frame.appendChild(ov);
  try{
    const spec = getFormatSpec(job.format);
    const body = { templateId:job.templateId, copy:job.copy, sceneUrl:job.sceneUrl, logoDataUrl:uploadedLogo?.dataUrl||"", settings:getSettings(), slotOverrides:overrides, targetWidth:spec.w, targetHeight:spec.h };
    const rr = await fetch("/render-banner", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    if (!rr.ok){ const e = await rr.json().catch(()=>({})); throw new Error(e.error||`Render ${rr.status}`); }
    const url = URL.createObjectURL(await rr.blob());
    paintBanner(card, { ...job, slotOverrides:overrides }, job.format, url);
    savedBanners.push({ url, format:job.format, templateName:job.templateName });
  }catch(err){ ov.innerHTML = `Error: ${esc(err.message)}`; setTimeout(()=>ov.remove(),2500); }
  finally{ reformatInFlight=false; }
}

/* edit background — LIVE layered preview: the scene zooms/pans in real time as the
   sliders move (CSS mirrors the server's fitSceneToBanner crop math exactly, so the
   preview matches the final), with text/logo guides from the template slots on top.
   "Zastosuj tło" then commits via /render-banner for the authoritative flat PNG. */
function ensureBgCss(){
  if (document.getElementById("bg-live-css")) return;
  const s = document.createElement("style"); s.id = "bg-live-css";
  s.textContent = `
  .bg-stage{position:relative;width:100%;overflow:hidden;display:block;background:#000;container-type:size;}
  .bg-stage .bgl{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;will-change:transform,object-position;}
  .bg-ovl{position:absolute;inset:0;pointer-events:none;}
  .bg-ovl>.t{position:absolute;overflow:hidden;word-break:break-word;color:#fff;font-weight:700;line-height:1.1;text-shadow:0 1px 6px rgba(0,0,0,.55);}
  .bg-ovl>.pill{position:absolute;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--red);color:#fff;border-radius:999px;font-weight:800;}
  .bg-ovl>.lg{position:absolute;object-fit:contain;}
  .bg-hint{position:absolute;left:8px;bottom:8px;z-index:5;background:rgba(0,0,0,.6);color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;pointer-events:none;}`;
  document.head.appendChild(s);
}
function editBg(btn){
  const card = btn.closest("[data-ji]"); const job = renderedJobs.get(card); if (!job) return;
  const box = card.querySelector(".editbox");
  if (box.dataset.mode==="bg"){ bgEditClose(card); return; }
  if (!job.sceneUrl){ alert("This banner has no separate background to edit."); return; }
  ensureBgCss();
  box.dataset.mode="bg"; box.classList.remove("hidden");
  const t = job.bgTransform || { scale:1, x:0.5, y:0.5 };
  box.innerHTML = `
    <label>Background zoom: <span data-z>${(+t.scale).toFixed(2)}×</span></label>
    <input type="range" min="1" max="3" step="0.05" value="${t.scale}" data-bg="scale" oninput="bgLive(this)">
    <label>Move ← →</label>
    <input type="range" min="0" max="100" step="1" value="${Math.round(t.x*100)}" data-bg="x" oninput="bgLive(this)">
    <label>Move ↑ ↓</label>
    <input type="range" min="0" max="100" step="1" value="${Math.round(t.y*100)}" data-bg="y" oninput="bgLive(this)">
    <button class="ap" onclick="applyBg(this)">Apply background</button><button class="ca" onclick="bgCancel(this)">Cancel</button>`;
  mountBgStage(card, job);
  bgLiveApply(card, +t.scale, +t.x, +t.y);
}
function mountBgStage(card, job){
  const frame = card.querySelector(".frame");
  const flat = frame.querySelector("img");
  if (flat && flat.src) card.dataset.flatSrc = flat.src;   // remember PNG to restore on cancel
  const stage = document.createElement("div");
  stage.className = "bg-stage";
  stage.style.aspectRatio = `${job.w} / ${job.h}`;          // hold the frame's height once the PNG is gone
  stage.innerHTML =
    `<img class="bgl" src="${esc(job.sceneUrl)}" alt="">` +
    bgOverlayHtml(card, job) +
    `<div class="bg-hint">Live preview · „Apply background" to save</div>`;
  frame.innerHTML = "";
  frame.appendChild(stage);
}
/* text/logo guides from the template slots (positions = where the server will place them).
   Slot-less templates (HTML 9:16) fall back to a background-only live preview. */
function bgOverlayHtml(card, job){
  const tpl = availableTemplates.find(t=>t.id===job.templateId);
  if (!tpl || !tpl.slots) return "";
  const nW = tpl.width, nH = tpl.height, ov = job.slotOverrides||{}, st = getSettings();
  const box = (k)=>{ const s=tpl.slots[k]; if(!s||!s.box) return null; return ov[k]?{...s.box,...ov[k]}:s.box; };
  const pos = (b)=>`left:${(b.x/nW*100).toFixed(2)}%;top:${(b.y/nH*100).toFixed(2)}%;width:${(b.w/nW*100).toFixed(2)}%;height:${(b.h/nH*100).toFixed(2)}%;`;
  const font = (k)=>{ const s=(tpl.slots[k]&&tpl.slots[k].style)||{}; let c=""; if(s.fontSize)c+=`font-size:${(s.fontSize/nH*100).toFixed(2)}cqh;`; if(s.color)c+=`color:${s.color};`; if(s.fontWeight)c+=`font-weight:${s.fontWeight};`; if(s.textAlign)c+=`text-align:${s.textAlign};`; if(s.lineHeight)c+=`line-height:${s.lineHeight};`; return c; };
  let h = `<div class="bg-ovl">`;
  const txt = (k,v)=>{ const b=box(k); if(b&&v) h+=`<div class="t" style="${pos(b)}${font(k)}">${esc(v)}</div>`; };
  const pill = (k,v)=>{ const b=box(k); if(b&&v) h+=`<div class="pill" style="${pos(b)}${font(k)}">${esc(v)}</div>`; };
  if (st.showLogo && uploadedLogo && uploadedLogo.dataUrl){ const b=box("logo"); if(b) h+=`<img class="lg" style="${pos(b)}" src="${esc(uploadedLogo.dataUrl)}">`; }
  txt("headline", job.copy.headline);
  txt("subheadline", job.copy.subheadline);
  if (st.showDiscount) pill("promo", job.copy.promo);
  if (st.showCTA) pill("cta", job.copy.cta);
  if (st.showDisclaimer) txt("legal", job.copy.legal);
  return h + `</div>`;
}
/* CSS crop that reproduces server fitSceneToBanner: min 1.2× zoom while panning, clamp 1–4×.
   object-fit:cover == server cover-crop; object-position == pan; scale about the same focal
   point == zoom (algebraically identical: transform-origin == object-position == x/y). */
function bgLiveApply(card, scale, x, y){
  const img = card.querySelector(".frame .bgl"); if(!img) return;
  const px = Math.max(0,Math.min(1, x)), py = Math.max(0,Math.min(1, y));
  const panning = Math.abs(px-0.5)>0.001 || Math.abs(py-0.5)>0.001;
  let s = Math.max(1, Math.min(Number(scale)||1, 4));
  if (panning && s<1.2) s = 1.2;
  const p = `${(px*100).toFixed(2)}% ${(py*100).toFixed(2)}%`;
  img.style.objectPosition = p;
  img.style.transformOrigin = p;
  img.style.transform = `scale(${s})`;
}
function bgLive(el){
  const card = el.closest("[data-ji]"); const box = card.querySelector(".editbox");
  const scale = parseFloat(box.querySelector('[data-bg=scale]').value)||1;
  const x = (parseInt(box.querySelector('[data-bg=x]').value,10)||50)/100;
  const y = (parseInt(box.querySelector('[data-bg=y]').value,10)||50)/100;
  const z = box.querySelector('[data-z]'); if(z) z.textContent = scale.toFixed(2)+"×";
  bgLiveApply(card, scale, x, y);
}
function bgCancel(btn){ bgEditClose(btn.closest("[data-ji]")); }
function bgEditClose(card){
  const box = card.querySelector(".editbox"); if(box){ box.classList.add("hidden"); box.dataset.mode=""; }
  const frame = card.querySelector(".frame"); const src = card.dataset.flatSrc;
  if (frame && src) frame.innerHTML = `<img src="${src}">`;   // restore the committed PNG
}
async function applyBg(btn){
  if (reformatInFlight){ alert("Please wait for the operation to finish."); return; }
  const card = btn.closest("[data-ji]"); const job = renderedJobs.get(card); if (!job) return;
  const box = card.querySelector(".editbox");
  const scale = parseFloat(box.querySelector('[data-bg=scale]').value) || 1;
  const x = (parseInt(box.querySelector('[data-bg=x]').value,10) || 50) / 100;
  const y = (parseInt(box.querySelector('[data-bg=y]').value,10) || 50) / 100;
  const bgTransform = { scale, x, y };
  reformatInFlight = true; btn.disabled = true;
  const frame = card.querySelector(".frame"); const ov = document.createElement("div"); ov.className="ovl"; ov.innerHTML='<div class="spin"></div> Rendering background…'; frame.appendChild(ov);
  try{
    const body = { templateId: job.templateId, copy:job.copy, sceneUrl:job.sceneUrl, logoDataUrl:uploadedLogo?.dataUrl||"", settings:getSettings(), targetWidth: job.w, targetHeight: job.h, bgTransform };
    if (job.slotOverrides) body.slotOverrides = job.slotOverrides;
    const rr = await fetch("/render-banner", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    if (!rr.ok){ const e = await rr.json().catch(()=>({})); throw new Error(e.error||`Render ${rr.status}`); }
    const url = URL.createObjectURL(await rr.blob());
    paintBanner(card, { ...job, bgTransform }, job.format, url);
    card.dataset.flatSrc = url;
    if (box){ box.classList.add("hidden"); box.dataset.mode=""; }
    savedBanners.push({ url, format: job.format, templateName: job.templateName });
  }catch(err){ ov.innerHTML = `Error: ${esc(err.message)}`; setTimeout(()=>ov.remove(),2500); }
  finally{ reformatInFlight=false; btn.disabled=false; }
}

/* HTML5 export */
async function dlHtml5(btn){
  const card = btn.closest("[data-ji]"); const job = renderedJobs.get(card); if (!job) return;
  const img = card.querySelector(".frame img"); if (!img){ alert("The banner is not ready."); return; }
  const spec = getFormatSpec(job.format);
  const base64 = await blobToDataURL(await fetch(img.src).then(r=>r.blob()));
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="ad.size" content="width=${spec.w},height=${spec.h}"><style>html,body{margin:0;padding:0}body{width:${spec.w}px;height:${spec.h}px;overflow:hidden}.l{display:block;width:100%;height:100%}.i{width:100%;height:100%;object-fit:cover;display:block;border:0}</style></head><body><a class="l" id="c" href="javascript:void(0)"><img class="i" src="${base64}"></a><script>var clickTag="https://www.drmax.pl/";document.getElementById("c").onclick=function(){window.open(clickTag,"_blank")}<\/script></body></html>`;
  const url = URL.createObjectURL(new Blob([html], {type:"text/html"}));
  const a = document.createElement("a"); a.href=url; a.download=`${job.downloadName.replace(/\.png$/,'')}.html`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

/* save a rendered banner into the client's library (GCS clients/<id>/banners) */
async function saveBanner(btn){
  const card = btn.closest("[data-ji]"); const job = renderedJobs.get(card); if (!job) return;
  const img = card.querySelector(".frame img"); if (!img || !img.src){ alert("The banner is not ready yet."); return; }
  const orig = btn.textContent; btn.disabled = true; btn.textContent = "Saving…";
  try{
    const dataUrl = await blobToDataURL(await fetch(img.src).then(r=>r.blob()));
    const spec = getFormatSpec(job.format);
    const res = await fetch("/save-asset", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ client:CLIENT_ID, kind:"banner", dataUrl, meta:{ template:job.templateName, format:`${spec.w}x${spec.h}` } })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed");
    btn.textContent = "✓ Saved";
  }catch(err){
    console.error(err); alert("Failed to save: "+err.message);
    btn.textContent = orig; btn.disabled = false;
  }
}

/* ================= SAVED (client library from GCS) ================= */
async function renderSaved(){
  const gi = document.getElementById("galImages");
  const gb = document.getElementById("galBanners");
  gi.innerHTML = `<div class="loading"><div class="spin"></div> Loading library…</div>`;
  gb.innerHTML = "";
  try{
    const res = await fetch(`/library?client=${encodeURIComponent(CLIENT_ID)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Library failed");
    const imgs = data.images || [], bans = data.banners || [];
    gi.innerHTML = imgs.length
      ? imgs.map(s=>`<div class="item">
          <img src="${esc(s.url)}" style="cursor:zoom-in;" onclick="openLightbox(this.src)">
          <div class="cap">${s.meta&&s.meta.label?`<b>${esc(s.meta.label)}</b>`:"<b>Image</b>"}${s.meta&&s.meta.format?` <span>· ${esc(s.meta.format)}</span>`:""}</div>
          <button class="mini edit" style="width:100%;margin-top:5px;" onclick="useSavedScene('${esc(s.url)}','${esc((s.meta&&s.meta.format)||'1:1')}')">Use in banner →</button>
        </div>`).join("")
      : `<div class="muted">No saved images. In „Image generation" click 💾 on an image.</div>`;
    gb.innerHTML = bans.length
      ? bans.map(b=>`<div class="item">
          <img src="${esc(b.url)}" style="cursor:zoom-in;" onclick="openLightbox(this.src)">
          <div class="cap">${b.meta&&b.meta.format?`<span class="pill">${esc(b.meta.format)}</span><br>`:""}${b.meta&&b.meta.template?`<b>${esc(b.meta.template)}</b>`:"<b>Banner</b>"}</div>
        </div>`).join("")
      : `<div class="muted">No saved banners. Click „💾 Save" on a banner.</div>`;
  }catch(err){
    gi.innerHTML = `<div class="err">Library error: ${esc(err.message)}</div>`;
    gb.innerHTML = "";
  }
}

/* ================= BRAND ================= */
const COLORS = [{nm:"Dr.Max Red",hx:"#E2001A"},{nm:"Green Plus",hx:"#76B82A"},{nm:"Graphite",hx:"#2b2f33"},{nm:"Ink",hx:"#1f2937"},{nm:"Cloud",hx:"#f4f6f8"}];
function renderSwatches(){
  const s = document.getElementById("swatches"); if (s.dataset.done) return;
  s.innerHTML = COLORS.map(c=>`<div class="sw"><div class="chip" style="background:${c.hx}"></div><div class="info"><div class="nm">${c.nm}</div><div class="hx">${c.hx}</div></div></div>`).join("");
  s.dataset.done="1";
}
function setupChips(sel){ if(!sel) return; sel.querySelectorAll(".lang").forEach(c=>c.addEventListener("click",()=>c.classList.toggle("active"))); }

/* ================= MODULE: brand elements library ================= */
/* Building blocks exported from Figma (public/library). Each one auto-resizes
   and will be auto-placed into the universal templates. */
const LIBRARY = [
  { grp:"Text", items:[
    { id:"headline",    file:"library/headline.svg",    nm:"Headline",          ds:"Proxima Nova Black / Bold · resize" },
    { id:"subheadline", file:"library/subheadline.svg", nm:"Subheadline",       ds:"Medium / Semibold · resize" },
    { id:"highlight",   file:"library/highlight.svg",   nm:"Text highlight",    ds:"Lozenge — GREEN / RED / WHITE" },
    { id:"disclaimer",  file:"library/disclaimer.svg",  nm:"Disclaimer",        ds:"Legal line / Omnibus · resize" },
  ]},
  { grp:"Price & promo", items:[
    { id:"pricetag",    file:"library/pricetag.svg",    nm:"Pricetag",          ds:"simple · double · Omnibus" },
    { id:"badge",       file:"library/badge/big.svg",   nm:"Discount badge",    ds:"−40% · green dome / red circle" },
    { id:"for3",        file:"library/badge/3for2.svg", nm:"3 for 2",           ds:"Multibuy badge" },
    { id:"promo",       file:"library/CTA/promo.svg",   nm:"Promo flag",        ds:"2+1 zdarma" },
  ]},
  { grp:"Buttons", items:[
    { id:"cta",         file:"library/CTA/big.svg",     nm:"CTA button",        ds:"red / green / text link" },
  ]},
  { grp:"Brand & layout", items:[
    { id:"logo",        file:"library/logo.svg",        nm:"Dr.Max logo",       ds:"big / small" },
    { id:"background",  file:"library/background/small.svg", nm:"Background",   ds:"solid / gradient" },
    { id:"shape",       file:"library/shape.svg",       nm:"Photo shape",       ds:"pill masks for the scene" },
  ]},
];
function buildLibMenu(){
  const menu = document.getElementById("libMenu");
  if (!menu || menu.dataset.done) return;
  menu.innerHTML = LIBRARY.map(g =>
    `<div class="lib-grp">${esc(g.grp)}</div>` +
    g.items.map(it =>
      `<div class="lib-opt" onclick="selectLibElement('${it.id}')">
         <img src="${esc(it.file)}" alt="">
         <div><div class="nm">${esc(it.nm)}</div><div class="ds">${esc(it.ds)}</div></div>
       </div>`
    ).join("")
  ).join("");
  menu.dataset.done = "1";
}
function toggleLib(){ buildLibMenu(); document.getElementById("libDd").classList.toggle("open"); }
function selectLibElement(id){
  const it = LIBRARY.flatMap(g=>g.items).find(x=>x.id===id);
  if (!it) return;
  document.getElementById("libDd").classList.remove("open");
  const p = document.getElementById("libPreview");
  p.style.display = "flex";
  p.innerHTML = `<div class="frame"><img src="${esc(it.file)}" alt="${esc(it.nm)}"></div>
    <div class="meta"><div class="nm">${esc(it.nm)}</div><div class="ds">${esc(it.ds)}</div>
    <span class="tag">auto-resize</span></div>`;
}
/* close the dropdown when clicking outside */
document.addEventListener("click", (e)=>{
  const dd = document.getElementById("libDd");
  if (dd && dd.classList.contains("open") && !dd.contains(e.target)) dd.classList.remove("open");
});

/* ================= init: load default Dr.Max logo as dataURL ================= */
(async ()=>{
  try{
    const blob = await fetch("img/drmax_logo.png").then(r=>r.blob());
    uploadedLogo = { fileName:"drmax_logo.png", dataUrl: await blobToDataURL(blob) };
  }catch(_){ /* logo upload still available */ }
})();
setupChips(document.getElementById("langGrid"));
renderStyles();
renderProducts();
