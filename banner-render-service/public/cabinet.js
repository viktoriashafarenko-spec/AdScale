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
  if (/^screenshot/i.test(raw) || /^img[_ -]?\d+/i.test(raw) || raw.length < 3) return `Produkt ${i}`;
  const c = raw.replace(/[0-9]{4}[-_ ]?[0-9]{2}[-_ ]?[0-9]{2}.*/i, "").replace(/[_-]+/g, " ").trim();
  return c || `Produkt ${i}`;
}
function show(id){ document.getElementById(id).classList.remove("hidden"); }
function hide(id){ document.getElementById(id).classList.add("hidden"); }
function setErr(id, msg){ const e=document.getElementById(id); if(!e)return; if(msg){ e.textContent=msg; e.classList.remove("hidden"); } else e.classList.add("hidden"); }

/* ---------- navigation ---------- */
function showView(v){
  document.querySelectorAll(".view").forEach(el => el.classList.toggle("hidden", el.id !== ("view-"+v)));
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.view === v));
  if (v === "banners"){ ensureTemplates(); renderPick(); }
  if (v === "saved") renderSaved();
  if (v === "brand") renderSwatches();
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
  if (skipped) alert(`Maksymalnie ${MAX_PRODUCTS} produkty w jednej scenie — pominięto ${skipped}.`);
});
function renderProducts(){
  const g = document.getElementById("productList");
  const head = uploadedProducts.length ? `<div class="muted" style="grid-column:1/-1;margin:2px 0;">Produkty w scenie: <b>${uploadedProducts.length}/${MAX_PRODUCTS}</b></div>` : "";
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
const DEMO_FEED = [
  { name:"Vichy Liftactiv Collagen Specialist Serum Eye", price:"149,99 zł", img:"img/styles/studio.png" },
  { name:"Vichy Minéral 89 Booster", price:"89,99 zł", img:"img/styles/in_water.png" },
  { name:"Vichy Liftactiv Supreme", price:"169,99 zł", img:"img/styles/in_hand.png" },
  { name:"Vichy Capital Soleil SPF50", price:"79,99 zł", img:"img/styles/interior.png" },
  { name:"Vichy Normaderm Phytosolution", price:"74,99 zł", img:"img/styles/with_person.png" }
];
function connectFeed(){
  const g = document.getElementById("feedGrid"), st = document.getElementById("feedStatus");
  st.textContent = ""; g.innerHTML = `<div class="loading"><div class="spin"></div> Pobieram i parsuję fid…</div>`;
  setTimeout(()=>{
    g.innerHTML = DEMO_FEED.map((p,i)=>`
      <div class="up-card feed-card" data-i="${i}" onclick="pickFeedProduct(${i})">
        <img src="${esc(p.img)}">
        <div class="nm">${esc(p.name)}</div>
        <div class="pr">${esc(p.price)}</div>
      </div>`).join("");
    syncFeedSel();
  }, 1000);
}
async function pickFeedProduct(i){
  const p = DEMO_FEED[i], id = "feed"+i;
  if (uploadedProducts.find(x=>x.id===id)){
    uploadedProducts = uploadedProducts.filter(x=>x.id!==id);
  } else {
    if (uploadedProducts.length >= MAX_PRODUCTS){ alert(`Maksymalnie ${MAX_PRODUCTS} produkty w jednej scenie.`); return; }
    const u = await blobToDataURL(await fetch(p.img).then(r=>r.blob()));
    uploadedProducts.push({ id, fileName:p.name, name:p.name, dataUrl:u });
  }
  syncFeedSel(); renderProducts();
}
function syncFeedSel(){
  document.querySelectorAll("#feedGrid .feed-card").forEach(c=>c.classList.toggle("sel", !!uploadedProducts.find(x=>x.id==="feed"+c.dataset.i)));
  const st = document.getElementById("feedStatus");
  if (st) st.innerHTML = uploadedProducts.length
    ? `W scenie: <b>${uploadedProducts.length}/${MAX_PRODUCTS}</b> produktów (klik, by dodać / usunąć).`
    : `Wybierz produkty z katalogu (do ${MAX_PRODUCTS} w jednej scenie).`;
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
  { key:"studio",      label:"Na jednolitym tle",   img:"img/styles/studio.png" },
  { key:"in_water",    label:"W wodzie",            img:"img/styles/in_water.png" },
  { key:"in_hand",     label:"W dłoni",             img:"img/styles/in_hand.png" },
  { key:"with_person", label:"Z osobą / aplikacja", img:"img/styles/with_person.png" },
  { key:"interior",    label:"W aranżacji",         img:"img/styles/interior.png" },
  { key:"custom",      label:"Własny prompt",       img:null }
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
  el.classList.toggle("active");
  if (el.dataset.style === "custom"){
    document.getElementById("customWrap").classList.toggle("hidden", !el.classList.contains("active"));
  }
}

/* Style base-prompts + variation suffixes → built into the style × variation matrix sent to the engine.
   (Ported / adapted from the n8n packshotscale flow; composite of the provided product packshot(s).) */
const STYLE_PROMPTS = {
  studio: "Premium studio packshot using the provided product packshot(s) as the exact product reference. The product(s) stand on a clean seamless light background with a soft natural shadow. Minimal, elegant e-commerce hero look. Preserve exact packaging from reference: shape, cap, logo, label text, colours. Show ONLY the provided product(s), nothing else.",
  in_water: "Premium beauty visual using the provided product packshot(s) as the exact product reference. The product(s) rest on the calm surface of clear clean water with subtle concentric ripples and delicate droplets. Fresh, hydrating mood, soft refracted light. Preserve exact packaging from reference: shape, cap, logo, label text, colours. Show ONLY the provided product(s).",
  in_hand: "Lifestyle visual using the provided product packshot(s) as the exact product reference. A well-groomed hand holds the product naturally with a soft warm bokeh background. Aspirational and tactile. Preserve exact packaging from reference: logo, label text, colours, shape. Show ONLY the provided product(s).",
  with_person: "Lifestyle beauty visual using the provided product packshot(s) as the exact product reference. A model with healthy glowing skin presents the product beside her face on a soft neutral studio background. Aspirational skincare mood. Preserve exact packaging from reference. Show ONLY the provided product(s).",
  interior: "Premium lifestyle still life using the provided product packshot(s) as the exact product reference. The product(s) arranged on a marble bathroom counter with soft natural window light, neutral folded towels and a sprig of greenery. Calm spa-like wellness mood. Preserve exact packaging from reference. Show ONLY the provided product(s)."
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

async function genImages(){
  if (!uploadedProducts.length){ alert("Wgraj najpierw produkt."); return; }
  const styles = [...document.querySelectorAll('#styleGrid .style-card.active')].map(c=>c.dataset.style);
  if (!styles.length){ alert("Zaznacz przynajmniej jeden styl."); return; }
  const customText = document.getElementById("customPrompt").value.trim();
  if (styles.includes("custom") && !customText){ alert("Wpisz własny prompt albo odznacz „Własny prompt”."); return; }
  const vars = parseInt(document.getElementById("genVars").value,10) || 4;
  const fmt = document.getElementById("genFormat").value;
  const quality = document.getElementById("genQuality").value;
  const prods = uploadedProducts.slice(0, MAX_PRODUCTS);

  // style × variation prompt matrix (every prompt is prefixed with the product-fidelity guard)
  const matrix = [];
  styles.forEach(s=>{
    const base = s === "custom" ? customText : (STYLE_PROMPTS[s] || "");
    for (let v=0; v<vars; v++){
      matrix.push({ label:`${STYLE_LABEL[s]||s} · ${VAR_LETTERS[v]||("V"+(v+1))}`, text:`${ANTI_HALLUCINATION} ${base} ${VARIATION_SUFFIX[v]||""}`.trim() });
    }
  });

  const btn = document.getElementById("btnGenImg");
  btn.disabled = true; btn.textContent = "Generuję…";
  show("imgResCard"); show("imgLoading"); hide("imgGrid"); setErr("imgErr","");
  document.getElementById("imgLoading").innerHTML = `<div class="spin"></div> Generuję ${matrix.length} ${matrix.length===1?"scenę":"scen"}… (${prods.length} prod. × ${fmt} · ${quality}, to może potrwać kilka minut)`;
  try{
    const res = await fetch("/generate-scenes", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({
        products: prods.map(p=>({ name:p.name, dataUrl:p.dataUrl })),
        prompts: matrix.map(m=>({ label:m.label, text:m.text })),
        aspectRatio: fmt,
        imageSize: quality,
        client: CLIENT_ID,
        composition: false
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Generacja nie powiodła się");
    const scenes = data.scenes || [];
    if (!scenes.length) throw new Error("Brak wygenerowanych obrazów");
    generatedScenes = [];
    scenes.forEach((url,i)=>{ generatedScenes.push({ url, aspect:fmt, label:(matrix[i] && matrix[i].label) || "scena", prompt:(matrix[i] && matrix[i].text) || "" }); savedImages.push({ url }); });
    hide("imgLoading");
    document.getElementById("imgGrid").classList.remove("hidden");
    document.getElementById("imgCount").textContent = `— ${scenes.length} scen · ${styles.length} styl(e) × ${vars} · ${prods.length} prod. · ${fmt} · ${quality}`;
    renderGenGrid();
  }catch(err){
    console.error(err); hide("imgLoading"); setErr("imgErr", `Błąd: ${err.message}`);
  }finally{
    btn.disabled = false; btn.textContent = "Generuj obrazy →";
  }
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
        <button class="b" onclick="useScene(${i})">Użyj</button>
        <button onclick="regenScene(${i})" title="Wygeneruj inny wariant">↻</button>
        <button onclick="toggleSceneEdit(${i})" title="Edytuj promptem">✎</button>
        <button onclick="saveScene(${i},this)" title="Zapisz w bibliotece">💾</button>
        <a href="${esc(s.url)}" target="_blank" download>PNG</a>
      </div>
      <div class="gen-edit hidden" id="genedit-${i}">
        <input type="text" placeholder="np. usuń listek, cieplejsze tło, mniej cienia" onkeydown="if(event.key==='Enter')applySceneEdit(${i})">
        <button onclick="applySceneEdit(${i})">Zastosuj</button>
      </div>
    </div>`).join("");
}
function sceneCell(i){ return document.querySelector(`#imgGrid .gen-cell[data-si="${i}"]`); }
function setSceneBusy(i, busy){ const c=sceneCell(i); if(!c) return; const b=c.querySelector(".gen-busy"); if(b) b.classList.toggle("hidden", !busy); }
function swapSceneImg(i, url){ const c=sceneCell(i); if(!c) return; c.querySelector(".img-item img").src=url; const dl=c.querySelector("a[download]"); if(dl) dl.href=url; }
function useScene(i){ pickedSceneUrl = generatedScenes[i].url; showView("banners"); }
function toggleSceneEdit(i){ const b=document.getElementById("genedit-"+i); if(!b) return; b.classList.toggle("hidden"); const inp=b.querySelector("input"); if(inp && !b.classList.contains("hidden")) inp.focus(); }

async function regenScene(i){
  const s=generatedScenes[i]; if(!s) return;
  const prods=uploadedProducts.slice(0,MAX_PRODUCTS);
  if(!prods.length){ alert("Brak produktu w pamięci — wygeneruj od nowa."); return; }
  setSceneBusy(i,true);
  try{
    const res=await fetch("/generate-scenes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      products:prods.map(p=>({name:p.name,dataUrl:p.dataUrl})),
      prompts:[{label:s.label,text:s.prompt||""}],
      aspectRatio:s.aspect, imageSize:document.getElementById("genQuality").value, client:CLIENT_ID, composition:false
    })});
    const data=await res.json(); if(!res.ok) throw new Error(data.error||"Regeneracja nie powiodła się");
    const url=(data.scenes||[])[0]; if(!url) throw new Error("Brak obrazu");
    s.url=url; savedImages.push({url}); swapSceneImg(i,url);
  }catch(err){ console.error(err); alert("Nie udało się: "+err.message); }
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
    const data=await res.json(); if(!res.ok) throw new Error(data.error||"Edycja nie powiodła się");
    if(!data.url) throw new Error("Brak obrazu");
    s.url=data.url; savedImages.push({url:data.url}); swapSceneImg(i,data.url);
    box.classList.add("hidden"); inp.value="";
  }catch(err){ console.error(err); alert("Nie udało się edytować: "+err.message); }
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
    btn.textContent="✓"; btn.title="Zapisano w bibliotece";
  }catch(err){ console.error(err); alert("Nie udało się zapisać: "+err.message); btn.textContent=orig; btn.disabled=false; }
}

/* fullscreen image viewer */
function openLightbox(url){ const lb=document.getElementById("lightbox"); if(!lb||!url) return; lb.querySelector("img").src=url; lb.classList.remove("hidden"); }
function closeLightbox(){ const lb=document.getElementById("lightbox"); if(lb) lb.classList.add("hidden"); }

/* use a saved image from the library directly in banner creation */
function useSavedScene(url, format){
  let i = generatedScenes.findIndex(s=>s.url===url);
  if (i<0){ generatedScenes.push({ url, aspect: format||"1:1", label:"zapisany" }); }
  pickedSceneUrl = url;
  showView("banners");
}

/* ================= MODULE: banner creation ================= */
async function ensureTemplates(){
  const row = document.getElementById("tplRow");
  if (availableTemplates.length){ renderTpl(); return; }
  try{
    const res = await fetch("/templates");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Nie udało się załadować szablonów");
    availableTemplates = data.templates || [];
    selectedTemplateIds = new Set(availableTemplates.length ? [availableTemplates[0].id] : []);
    renderTpl();
  }catch(err){
    row.innerHTML = `<div class="err">${esc(err.message)}</div>`;
  }
}
function renderTpl(){
  const row = document.getElementById("tplRow");
  const visible = availableTemplates;
  if (!visible.length){ row.innerHTML = `<div class="muted">Brak szablonów.</div>`; return; }
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
    libraryImages = (d.images||[]).map(s=>({ url:s.url, label:(s.meta&&s.meta.label)||"zapisany" }));
  }catch(_){ libraryImages = []; }
}
async function renderPick(){
  const g = document.getElementById("pickGrid");
  await loadLibrary();
  const sessionUrls = new Set(generatedScenes.map(s=>s.url));
  const all = [
    ...generatedScenes.map(s=>({ url:s.url, src:"sesja" })),
    ...libraryImages.filter(s=>!sessionUrls.has(s.url)).map(s=>({ url:s.url, src:"biblioteka" }))
  ];
  if (!all.length){ g.innerHTML = `<div class="muted">Brak obrazów. Wygeneruj w „Generacja obrazów" lub zapisz do biblioteki (💾).</div>`; return; }
  if (!pickedSceneUrl || !all.some(s=>s.url===pickedSceneUrl)) pickedSceneUrl = all[0].url;
  g.innerHTML = all.map(s=>`
    <div class="pick ${s.url===pickedSceneUrl?'sel':''}" data-url="${esc(s.url)}" onclick="selPick('${esc(s.url)}')">
      <img src="${esc(s.url)}"><span class="ck">✓</span><span class="src-tag">${s.src}</span>
    </div>`).join("");
}
function selPick(url){
  pickedSceneUrl = url;
  document.querySelectorAll('#pickGrid .pick').forEach(p=>p.classList.toggle('sel', p.dataset.url===url));
}
function refreshLibrary(){ libraryImages = []; renderPick(); }

/* templates now define their own size — keep the picker always visible */

/* ----- copy (real /generate-copy) ----- */
async function genCopy(){
  const btn = document.getElementById("btnCopy");
  btn.disabled = true; btn.textContent = "Generuję…";
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
    generatedVariants = [0,1,2].map(i => ({ headline:headlines[i]||"", subheadline:subs[i]||"", cta:ctas[i]||"" }));
    hide("copyLoading"); renderCopy(); show("copyActions");
  }catch(err){
    console.error(err); hide("copyLoading"); setErr("copyErr", `Błąd: ${err.message}`);
  }finally{
    btn.disabled = false; btn.textContent = "Generuj copy →";
  }
}
function renderCopy(){
  const g = document.getElementById("copyGrid"); g.classList.remove("hidden");
  g.innerHTML = generatedVariants.map((v,i)=>`
    <div class="copy" id="copy-${i}" style="animation-delay:${i*0.08}s">
      <div class="vt">Wariant ${i+1}</div>
      <div class="head">${esc(v.headline)}</div>
      <div class="sub">${esc(v.subheadline)}</div>
      <span class="cta">${esc(v.cta)}</span>
      <button class="copy-edit" onclick="editCopy(${i})">Edytuj</button>
    </div>`).join("");
}
function editCopy(i){
  const v = generatedVariants[i], c = document.getElementById("copy-"+i);
  if (c.classList.contains("editing")){
    v.headline = c.querySelector('[data-f=head]').value;
    v.subheadline = c.querySelector('[data-f=sub]').value;
    v.cta = c.querySelector('[data-f=cta]').value;
    c.classList.remove("editing");
    c.innerHTML = `<div class="vt">Wariant ${i+1}</div><div class="head">${esc(v.headline)}</div><div class="sub">${esc(v.subheadline)}</div><span class="cta">${esc(v.cta)}</span><button class="copy-edit" onclick="editCopy(${i})">Edytuj</button>`;
  } else {
    c.classList.add("editing");
    c.innerHTML = `<div class="vt">Wariant ${i+1}</div>
      <span class="fld-lbl">Nagłówek</span><textarea class="fld-edit" data-f="head" rows="2">${esc(v.headline)}</textarea>
      <span class="fld-lbl">Subheadline</span><textarea class="fld-edit" data-f="sub" rows="2">${esc(v.subheadline)}</textarea>
      <span class="fld-lbl">CTA</span><input class="fld-edit" data-f="cta" value="${esc(v.cta)}">
      <button class="copy-edit" onclick="editCopy(${i})">Zapisz</button>`;
  }
}

/* ----- banners (real /render-banner | /render-9x16) ----- */
function banClass(spec){
  if (spec.family === "wide") return "ban wide";
  if (spec.aspect === "9:16") return "ban vertical";
  return "ban";
}
async function genBanners(){
  if (reformatInFlight){ alert("Poczekaj, aż zakończy się bieżąca operacja."); return; }
  if (!generatedVariants.length){ alert("Najpierw wygeneruj copy."); return; }
  if (!pickedSceneUrl){ alert("Wybierz obraz w sekcji 2."); return; }
  if (!selectedTemplateIds.size){ alert("Zaznacz przynajmniej jeden szablon."); return; }

  show("banCard"); show("banLoading"); hide("banGrid"); setErr("banErr","");

  // one job per selected template — each rendered at its OWN native size
  const selected = availableTemplates.filter(t => selectedTemplateIds.has(t.id));
  const jobs = selected.map((t, idx)=> mkJob(t, idx));

  renderSkeletons(jobs);
  hide("banLoading");
  await Promise.all(jobs.map((job,i)=>{
    const card = document.querySelector(`#banGrid [data-ji="${i}"]`);
    return renderJob(card, job).catch(err=>{
      const ov = card.querySelector(".ovl"); if (ov) ov.innerHTML = `Błąd: ${esc(err.message)}`;
    });
  }));
}
function mkJob(t, variantIndex){
  const v = generatedVariants[variantIndex] || generatedVariants[0] || {headline:"",subheadline:"",cta:""};
  const s = getSettings();
  const w = Math.round(t.width), h = Math.round(t.height);
  return { templateId:t.id, templateName:t.name, variantIndex, w, h, family: templateFamily(t),
    format: `${w}x${h}`, sceneUrl: pickedSceneUrl,
    copy:{ headline:v.headline||"", subheadline:v.subheadline||"", cta:v.cta||"", promo:s.discountText||"", legal:s.disclaimerText||"" } };
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
      <div class="frame"><div class="ovl"><div class="spin"></div> Renderuję…</div></div>
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
    <select class="reformat-sel" onchange="onReformat(this)"><option value="" disabled selected>Reformatuj…</option></select>
    <select class="changetpl-sel" onchange="onChangeTpl(this)"><option value="" disabled selected>Zmień szablon…</option></select>
    <button class="mini edit" onclick="editText(this)">Edytuj tekst</button>
    <button class="mini edit" onclick="editComp(this)">Edytuj kompozycję</button>
    <button class="mini edit" onclick="editBg(this)">Edytuj tło</button>
    <a class="mini" href="${url}" download="${fname}">PNG</a>
    <button class="mini" onclick="dlHtml5(this)">HTML5</button>
    <button class="mini edit" onclick="saveBanner(this)">💾 Zapisz</button>`;
  renderedJobs.set(card, { ...job, downloadName:fname });
  populateReformat(card, format, job.templateId);
}

/* reformat + change template (ported logic) */
// Intra-family reformat: same master, other sizes within the same family (reflow via flexbox, reuse scene).
const SIBLING_SIZES = {
  vertical: ["1080x1920","1080x1350","300x600"],
  square:   ["1080x1080","600x600","300x250"],
  medium:   ["1920x1080","1200x628"],
  wide:     ["1920x555","970x250","728x90"]
};
function buildReformatOptions(currentFormat, currentTemplateId){
  const opts = []; const cur = FORMATS[currentFormat]; if (!cur || !currentTemplateId) return opts;
  // Intra-family: same master, other sizes (reflow via flexbox, reuse scene).
  (SIBLING_SIZES[cur.family] || []).forEach(f=>{
    if (f === currentFormat) return;
    const s = FORMATS[f]; if (!s) return;
    opts.push({ value:`${f}|${currentTemplateId}`, label:`${s.w}×${s.h} (ten sam szablon)` });
  });
  // Cross-family: jump to another available master (different layout + new/fitted scene).
  availableTemplates.forEach(t=>{
    if (t.id === currentTemplateId) return;
    if (templateFamily(t) === cur.family) return;
    const w = Math.round(t.width), h = Math.round(t.height);
    const fmt = `${w}x${h}`;
    if (!FORMATS[fmt]) return;
    opts.push({ value:`${fmt}|${t.id}`, label:`${w}×${h} — ${t.name} (nowa scena)` });
  });
  return opts;
}
function buildChangeTemplateOptions(currentFormat, currentTemplateId){
  const opts = []; const cur = FORMATS[currentFormat]; if (!cur || cur.family === "html") return opts;
  availableTemplates.forEach(t=>{ if (t.id===currentTemplateId) return; if (!templateMatchesFormat(t,currentFormat)) return; opts.push({ value:`${currentFormat}|${t.id}`, label:t.name }); });
  return opts;
}
function populateReformat(card, format, templateId){
  const rf = card.querySelector(".reformat-sel");
  if (rf){ const o = buildReformatOptions(format, templateId); rf.innerHTML = `<option value="" disabled selected>Reformatuj…</option>`+o.map(x=>`<option value="${esc(x.value)}">${esc(x.label)}</option>`).join(""); rf.style.display = o.length?"block":"none"; }
  const ct = card.querySelector(".changetpl-sel");
  if (ct){ const o = buildChangeTemplateOptions(format, templateId); ct.innerHTML = `<option value="" disabled selected>Zmień szablon…</option>`+o.map(x=>`<option value="${esc(x.value)}">${esc(x.label)}</option>`).join(""); ct.style.display = o.length?"block":"none"; }
}
function onReformat(sel){ const card = sel.closest("[data-ji]"); const v = sel.value; sel.selectedIndex = 0; if (v) reformatBanner(card, v); }
function onChangeTpl(sel){ const card = sel.closest("[data-ji]"); const v = sel.value; sel.selectedIndex = 0; if (v) reformatBanner(card, v); }

async function reformatBanner(card, value){
  if (reformatInFlight){ alert("Inny reformat trwa — poczekaj."); return; }
  const job = renderedJobs.get(card); if (!job) return;
  const [newFormat, newTemplateId] = value.split("|");
  const newSpec = getFormatSpec(newFormat), oldSpec = getFormatSpec(job.format);
  const isHtml = newSpec.family === "html";
  const sameFamily = newSpec.family === oldSpec.family;
  reformatInFlight = true;
  document.querySelectorAll(".reformat-sel,.changetpl-sel").forEach(s=>s.disabled=true);
  const frame = card.querySelector(".frame");
  const ov = document.createElement("div"); ov.className="ovl"; ov.innerHTML = sameFamily ? '<div class="spin"></div> Reformatuję…' : '<div class="spin"></div> Nowa scena…'; frame.appendChild(ov);
  try{
    let sceneUrl;
    if (sameFamily && job.sceneUrl){ sceneUrl = job.sceneUrl; }
    else {
      const newAspect = newSpec.family==="html"||newSpec.family==="vertical" ? "9:16" : newSpec.family==="square" ? "1:1" : "16:9";
      if (uploadedProducts.length){
        const sr = await fetch("/generate-scenes", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ products:uploadedProducts.slice(0,4).map(p=>({name:p.name,dataUrl:p.dataUrl})), targetGroup:document.getElementById("banTargetGroup").value.trim(), count:1, aspectRatio:newAspect, styleReferenceUrl:job.sceneUrl||null }) });
        const sd = await sr.json(); if (!sr.ok) throw new Error(sd.error||"Scene failed"); sceneUrl = (sd.scenes||[])[0] || job.sceneUrl;
      } else sceneUrl = job.sceneUrl;
    }
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
  }catch(err){ ov.innerHTML = `Błąd: ${esc(err.message)}`; setTimeout(()=>ov.remove(), 2500); }
  finally{ reformatInFlight=false; document.querySelectorAll(".reformat-sel,.changetpl-sel").forEach(s=>s.disabled=false); }
}

/* edit text (re-render with new copy) */
function editText(btn){
  const card = btn.closest("[data-ji]"); const job = renderedJobs.get(card); if (!job) return;
  const box = card.querySelector(".editbox");
  if (box.dataset.mode==="text"){ box.classList.add("hidden"); box.dataset.mode=""; return; }
  box.dataset.mode="text"; box.classList.remove("hidden");
  box.innerHTML = `<label>Nagłówek</label><input data-e="headline" value="${esc(job.copy.headline)}">
    <label>Subheadline</label><textarea data-e="subheadline" rows="2">${esc(job.copy.subheadline)}</textarea>
    <label>CTA</label><input data-e="cta" value="${esc(job.copy.cta)}">
    <button class="ap" onclick="applyText(this)">Zastosuj</button><button class="ca" onclick="this.closest('.editbox').classList.add('hidden')">Anuluj</button>`;
}
async function applyText(btn){
  if (reformatInFlight){ alert("Poczekaj na zakończenie operacji."); return; }
  const card = btn.closest("[data-ji]"); const job = renderedJobs.get(card); if (!job) return;
  const box = card.querySelector(".editbox");
  const copy = { ...job.copy,
    headline: box.querySelector('[data-e=headline]').value.trim(),
    subheadline: box.querySelector('[data-e=subheadline]').value.trim(),
    cta: box.querySelector('[data-e=cta]').value.trim() };
  reformatInFlight = true; btn.disabled = true;
  const frame = card.querySelector(".frame"); const ov = document.createElement("div"); ov.className="ovl"; ov.innerHTML='<div class="spin"></div> Renderuję…'; frame.appendChild(ov);
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
  }catch(err){ ov.innerHTML = `Błąd: ${esc(err.message)}`; setTimeout(()=>ov.remove(),2500); }
  finally{ reformatInFlight=false; }
}

/* edit composition (drag slots → slotOverrides → re-render) */
function editComp(btn){
  const card = btn.closest("[data-ji]"); const job = renderedJobs.get(card); if (!job) return;
  if (getFormatSpec(job.format).family === "html"){ alert("Edycja kompozycji dostępna dla szablonów Figma."); return; }
  const tpl = availableTemplates.find(t=>t.id===job.templateId);
  if (!tpl || !tpl.slots){ alert("Brak danych układu dla tego szablonu."); return; }
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
  const ap = document.createElement("button"); ap.className="mini edit comp-apply"; ap.textContent="Zastosuj układ"; ap.style.marginTop="6px";
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
  if (reformatInFlight){ alert("Poczekaj na zakończenie operacji."); return; }
  const job = renderedJobs.get(card); if (!job) return;
  reformatInFlight=true;
  const frame = card.querySelector(".frame"); const c = frame.querySelector(".comp-ovl"); if (c) c.remove();
  const ap = card.querySelector(".comp-apply"); if (ap) ap.remove();
  const ov = document.createElement("div"); ov.className="ovl"; ov.innerHTML='<div class="spin"></div> Renderuję układ…'; frame.appendChild(ov);
  try{
    const spec = getFormatSpec(job.format);
    const body = { templateId:job.templateId, copy:job.copy, sceneUrl:job.sceneUrl, logoDataUrl:uploadedLogo?.dataUrl||"", settings:getSettings(), slotOverrides:overrides, targetWidth:spec.w, targetHeight:spec.h };
    const rr = await fetch("/render-banner", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    if (!rr.ok){ const e = await rr.json().catch(()=>({})); throw new Error(e.error||`Render ${rr.status}`); }
    const url = URL.createObjectURL(await rr.blob());
    paintBanner(card, { ...job, slotOverrides:overrides }, job.format, url);
    savedBanners.push({ url, format:job.format, templateName:job.templateName });
  }catch(err){ ov.innerHTML = `Błąd: ${esc(err.message)}`; setTimeout(()=>ov.remove(),2500); }
  finally{ reformatInFlight=false; }
}

/* edit background — zoom + pan the scene inside the banner, then re-render */
function editBg(btn){
  const card = btn.closest("[data-ji]"); const job = renderedJobs.get(card); if (!job) return;
  const box = card.querySelector(".editbox");
  if (box.dataset.mode==="bg"){ box.classList.add("hidden"); box.dataset.mode=""; return; }
  box.dataset.mode="bg"; box.classList.remove("hidden");
  const t = job.bgTransform || { scale:1, x:0.5, y:0.5 };
  box.innerHTML = `
    <label>Zoom tła: <span data-z>${t.scale.toFixed(2)}×</span></label>
    <input type="range" min="1" max="3" step="0.05" value="${t.scale}" data-bg="scale" oninput="this.closest('.editbox').querySelector('[data-z]').textContent=(+this.value).toFixed(2)+'×'">
    <label>Przesuń ← →</label>
    <input type="range" min="0" max="100" step="1" value="${Math.round(t.x*100)}" data-bg="x">
    <label>Przesuń ↑ ↓</label>
    <input type="range" min="0" max="100" step="1" value="${Math.round(t.y*100)}" data-bg="y">
    <button class="ap" onclick="applyBg(this)">Zastosuj tło</button><button class="ca" onclick="this.closest('.editbox').classList.add('hidden')">Anuluj</button>`;
}
async function applyBg(btn){
  if (reformatInFlight){ alert("Poczekaj na zakończenie operacji."); return; }
  const card = btn.closest("[data-ji]"); const job = renderedJobs.get(card); if (!job) return;
  const box = card.querySelector(".editbox");
  const scale = parseFloat(box.querySelector('[data-bg=scale]').value) || 1;
  const x = (parseInt(box.querySelector('[data-bg=x]').value,10) || 50) / 100;
  const y = (parseInt(box.querySelector('[data-bg=y]').value,10) || 50) / 100;
  const bgTransform = { scale, x, y };
  reformatInFlight = true; btn.disabled = true;
  const frame = card.querySelector(".frame"); const ov = document.createElement("div"); ov.className="ovl"; ov.innerHTML='<div class="spin"></div> Renderuję tło…'; frame.appendChild(ov);
  try{
    const body = { templateId: job.templateId, copy:job.copy, sceneUrl:job.sceneUrl, logoDataUrl:uploadedLogo?.dataUrl||"", settings:getSettings(), targetWidth: job.w, targetHeight: job.h, bgTransform };
    if (job.slotOverrides) body.slotOverrides = job.slotOverrides;
    const rr = await fetch("/render-banner", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    if (!rr.ok){ const e = await rr.json().catch(()=>({})); throw new Error(e.error||`Render ${rr.status}`); }
    const url = URL.createObjectURL(await rr.blob());
    paintBanner(card, { ...job, bgTransform }, job.format, url);
    savedBanners.push({ url, format: job.format, templateName: job.templateName });
  }catch(err){ ov.innerHTML = `Błąd: ${esc(err.message)}`; setTimeout(()=>ov.remove(),2500); }
  finally{ reformatInFlight=false; }
}

/* HTML5 export */
async function dlHtml5(btn){
  const card = btn.closest("[data-ji]"); const job = renderedJobs.get(card); if (!job) return;
  const img = card.querySelector(".frame img"); if (!img){ alert("Baner nie jest gotowy."); return; }
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
  const img = card.querySelector(".frame img"); if (!img || !img.src){ alert("Baner nie jest jeszcze gotowy."); return; }
  const orig = btn.textContent; btn.disabled = true; btn.textContent = "Zapisuję…";
  try{
    const dataUrl = await blobToDataURL(await fetch(img.src).then(r=>r.blob()));
    const spec = getFormatSpec(job.format);
    const res = await fetch("/save-asset", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ client:CLIENT_ID, kind:"banner", dataUrl, meta:{ template:job.templateName, format:`${spec.w}x${spec.h}` } })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed");
    btn.textContent = "✓ Zapisano";
  }catch(err){
    console.error(err); alert("Nie udało się zapisać: "+err.message);
    btn.textContent = orig; btn.disabled = false;
  }
}

/* ================= SAVED (client library from GCS) ================= */
async function renderSaved(){
  const gi = document.getElementById("galImages");
  const gb = document.getElementById("galBanners");
  gi.innerHTML = `<div class="loading"><div class="spin"></div> Ładuję bibliotekę…</div>`;
  gb.innerHTML = "";
  try{
    const res = await fetch(`/library?client=${encodeURIComponent(CLIENT_ID)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Library failed");
    const imgs = data.images || [], bans = data.banners || [];
    gi.innerHTML = imgs.length
      ? imgs.map(s=>`<div class="item">
          <img src="${esc(s.url)}" style="cursor:zoom-in;" onclick="openLightbox(this.src)">
          <div class="cap">${s.meta&&s.meta.label?`<b>${esc(s.meta.label)}</b>`:"<b>Obraz</b>"}${s.meta&&s.meta.format?` <span>· ${esc(s.meta.format)}</span>`:""}</div>
          <button class="mini edit" style="width:100%;margin-top:5px;" onclick="useSavedScene('${esc(s.url)}','${esc((s.meta&&s.meta.format)||'1:1')}')">Użyj w banerze →</button>
        </div>`).join("")
      : `<div class="muted">Brak zapisanych obrazów. W „Generacja obrazów" kliknij 💾 na obrazie.</div>`;
    gb.innerHTML = bans.length
      ? bans.map(b=>`<div class="item">
          <img src="${esc(b.url)}" style="cursor:zoom-in;" onclick="openLightbox(this.src)">
          <div class="cap">${b.meta&&b.meta.format?`<span class="pill">${esc(b.meta.format)}</span><br>`:""}${b.meta&&b.meta.template?`<b>${esc(b.meta.template)}</b>`:"<b>Baner</b>"}</div>
        </div>`).join("")
      : `<div class="muted">Brak zapisanych banerów. Kliknij „💾 Zapisz" na banerze.</div>`;
  }catch(err){
    gi.innerHTML = `<div class="err">Błąd biblioteki: ${esc(err.message)}</div>`;
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
