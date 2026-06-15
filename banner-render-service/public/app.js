const productImagesInput = document.getElementById("productImagesInput");
const uploadedProductsList = document.getElementById("uploadedProductsList");

const logoInput = document.getElementById("logoInput");
const logoPreviewBox = document.getElementById("logoPreviewBox");
const targetGroupInput = document.getElementById("targetGroupInput");

const showLogo = document.getElementById("showLogo");
const showCTA = document.getElementById("showCTA");
const showDiscount = document.getElementById("showDiscount");
const showDisclaimer = document.getElementById("showDisclaimer");

const discountText = document.getElementById("discountText");
const disclaimerText = document.getElementById("disclaimerText");
const formatSelect = document.getElementById("formatSelect");

const discountBlock = document.getElementById("discountBlock");
const disclaimerBlock = document.getElementById("disclaimerBlock");

const generateCopyBtn = document.getElementById("generateCopyBtn");
const generateBannersBtn = document.getElementById("generateBannersBtn");

const variantsGrid = document.getElementById("variantsGrid");
const bannersGrid = document.getElementById("bannersGrid");

let uploadedProducts = [];
let uploadedLogo = null;
let generatedVariants = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function normalizeName(fileName = "", index = 1) {
  const raw = String(fileName).replace(/\.[^.]+$/, "").trim();

  if (/^screenshot/i.test(raw) || /^img[_ -]?\d+/i.test(raw) || raw.length < 3) {
    return `Produkt ${index}`;
  }

  const cleaned = raw
    .replace(/[0-9]{4}[-_ ]?[0-9]{2}[-_ ]?[0-9]{2}.*/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

  if (!cleaned || /^screenshot/i.test(cleaned)) {
    return `Produkt ${index}`;
  }

  return cleaned;
}

function getTemplateSettings() {
  return {
    showLogo: showLogo.checked,
    showCTA: showCTA.checked,
    showDiscount: showDiscount.checked,
    showDisclaimer: showDisclaimer.checked,
    discountText: discountText.value.trim(),
    disclaimerText: disclaimerText.value.trim(),
    format: formatSelect.value
  };
}

function refreshConditionalFields() {
  discountBlock.style.display = showDiscount.checked ? "block" : "none";
  disclaimerBlock.style.display = showDisclaimer.checked ? "block" : "none";
}

function renderUploadedProducts() {
  uploadedProductsList.innerHTML = "";

  if (!uploadedProducts.length) {
    uploadedProductsList.innerHTML = `<div class="helper">No products uploaded yet.</div>`;
    return;
  }

  uploadedProducts.forEach((product) => {
    const card = document.createElement("div");
    card.className = "uploaded-card";

    card.innerHTML = `
      <img src="${escapeHtml(product.dataUrl)}" alt="${escapeHtml(product.name)}" class="uploaded-thumb" />
      <div class="uploaded-meta">
        <strong>${escapeHtml(product.name)}</strong>
        <div class="uploaded-file">${escapeHtml(product.fileName)}</div>
      </div>
      <button class="remove-btn" data-id="${escapeHtml(product.id)}" type="button">Remove</button>
    `;

    uploadedProductsList.appendChild(card);
  });

  document.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      uploadedProducts = uploadedProducts.filter((p) => p.id !== id);
      renderUploadedProducts();
    });
  });
}

function renderLogoPreview() {
  if (!uploadedLogo) {
    logoPreviewBox.innerHTML = `<div class="helper">No logo uploaded yet.</div>`;
    return;
  }

  logoPreviewBox.innerHTML = `
    <img src="${escapeHtml(uploadedLogo.dataUrl)}" alt="Logo" class="logo-preview-image" />
    <div class="uploaded-meta">
      <strong>${escapeHtml(uploadedLogo.fileName)}</strong>
    </div>
  `;
}

function renderVariants() {
  variantsGrid.innerHTML = "";

  if (!generatedVariants.length) {
    variantsGrid.innerHTML = `<div class="helper">No copy generated yet.</div>`;
    return;
  }

  generatedVariants.forEach((variant, index) => {
    const card = document.createElement("div");
    card.className = "variant-card";

    card.innerHTML = `
      <div class="variant-header">
        <div class="variant-title">Variant ${index + 1}</div>
      </div>

      <label class="label">Headline</label>
      <input type="text" class="variant-headline" data-index="${index}" value="${escapeHtml(variant.headline)}" />

      <label class="label">Subheadline</label>
      <textarea class="variant-subheadline" data-index="${index}" rows="4">${escapeHtml(variant.subheadline)}</textarea>

      <label class="label">CTA</label>
      <input type="text" class="variant-cta" data-index="${index}" value="${escapeHtml(variant.cta)}" />
    `;

    variantsGrid.appendChild(card);
  });

  document.querySelectorAll(".variant-headline").forEach((el) => {
    el.addEventListener("input", (e) => {
      const i = Number(e.target.dataset.index);
      generatedVariants[i].headline = e.target.value;
    });
  });

  document.querySelectorAll(".variant-subheadline").forEach((el) => {
    el.addEventListener("input", (e) => {
      const i = Number(e.target.dataset.index);
      generatedVariants[i].subheadline = e.target.value;
    });
  });

  document.querySelectorAll(".variant-cta").forEach((el) => {
    el.addEventListener("input", (e) => {
      const i = Number(e.target.dataset.index);
      generatedVariants[i].cta = e.target.value;
    });
  });
}

let availableTemplates = [];
let selectedTemplateIds = new Set();

async function loadTemplates() {
  const response = await fetch("/templates");
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to load templates");
  }
  return data.templates || [];
}

const templatePickerEl = document.getElementById("templatePicker");
const formatHintEl = document.getElementById("formatHint");

// Catalogue of supported formats.
// Each entry: { width, height, aspect ("16:9"|"9:16"|"1:1"), family ("wide"|"square"|"vertical"|"mid"|"html") }
const FORMATS = {
  // Wide horizontal (uses Figma templates Frame 3/4/5)
  "1920x555":  { w: 1920, h: 555,  aspect: "16:9", family: "wide" },
  "1200x400":  { w: 1200, h: 400,  aspect: "16:9", family: "wide" },
  "1200x300":  { w: 1200, h: 300,  aspect: "16:9", family: "wide" },
  "728x90":    { w: 728,  h: 90,   aspect: "16:9", family: "wide" },
  "970x250":   { w: 970,  h: 250,  aspect: "16:9", family: "wide" },

  // Square (uses Figma templates Frame 7/8/9)
  "1080x1080": { w: 1080, h: 1080, aspect: "1:1",  family: "square" },
  "600x600":   { w: 600,  h: 600,  aspect: "1:1",  family: "square" },
  "300x250":   { w: 300,  h: 250,  aspect: "1:1",  family: "square" },

  // Vertical (uses HTML template)
  "9:16":      { w: 1080, h: 1920, aspect: "9:16", family: "html" },
  "1080x1350": { w: 1080, h: 1350, aspect: "9:16", family: "vertical" },
  "300x600":   { w: 300,  h: 600,  aspect: "9:16", family: "vertical" },
  "160x600":   { w: 160,  h: 600,  aspect: "9:16", family: "vertical" },

  // Medium aspect
  "1200x630":  { w: 1200, h: 630,  aspect: "16:9", family: "mid" },
  "1920x1080": { w: 1920, h: 1080, aspect: "16:9", family: "mid" },
  "1280x720":  { w: 1280, h: 720,  aspect: "16:9", family: "mid" },

  // Legacy alias (for backward-compatibility of saved campaigns)
  "1:1":       { w: 600,  h: 600,  aspect: "1:1",  family: "square" }
};

function getFormatSpec(value) {
  return FORMATS[value] || FORMATS["1920x555"];
}

// Classify a template by its aspect family (wide / medium / square / vertical).
// Templates in the same family share a design concept and can be reflowed via Flexbox.
function templateFamily(t) {
  const ratio = t.width / t.height;
  if (ratio > 2.5) return "wide";       // 1920×555 (3.46), 728×90 (8.09), 970×250 (3.88)
  if (ratio > 1.5) return "medium";     // 1200×630 (1.9), 1920×1080 (1.78)
  if (Math.abs(ratio - 1) < 0.25) return "square"; // 1080×1080, 600×600, 300×250 (1.2)
  return "vertical";                    // 1080×1920 (0.56), 1080×1350 (0.8)
}

function templateMatchesFormat(t, format) {
  const spec = getFormatSpec(format);
  // Family-based matching: templates and formats sharing the same family are interchangeable.
  // Flexbox handles size adaptation within a family.
  return templateFamily(t) === spec.family;
}

function updateFormatHint() {
  // Hint under the Format select intentionally left blank (removed per request).
  if (!formatHintEl) return;
  formatHintEl.innerHTML = "";
}

function renderTemplatePicker() {
  if (!templatePickerEl) return;
  if (!availableTemplates.length) {
    templatePickerEl.innerHTML = `<div class="helper">Loading templates…</div>`;
    return;
  }
  const format = formatSelect.value;
  const visible = availableTemplates.filter((t) => templateMatchesFormat(t, format));
  templatePickerEl.innerHTML = "";
  if (!visible.length) {
    templatePickerEl.innerHTML = `<div class="helper">No templates match this format.</div>`;
    return;
  }
  visible.forEach((t) => {
    const checked = selectedTemplateIds.has(t.id);
    const card = document.createElement("label");
    card.className = "template-card";
    card.innerHTML = `
      <input type="checkbox" data-id="${escapeHtml(t.id)}" ${checked ? "checked" : ""} />
      <div class="template-meta">
        <strong>${escapeHtml(t.name)}</strong>
        <span class="helper">${t.width}×${t.height}</span>
      </div>
    `;
    templatePickerEl.appendChild(card);
  });
  templatePickerEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) selectedTemplateIds.add(id);
      else selectedTemplateIds.delete(id);
    });
  });
}

function renderBannerSkeletons(jobs) {
  bannersGrid.innerHTML = "";
  jobs.forEach((job, i) => {
    const card = document.createElement("div");
    card.className = "banner-card";
    card.dataset.jobIndex = String(i);
    card.innerHTML = `
      <div class="banner-preview">
        <img alt="" class="banner-bg-img" />
      </div>
      <div class="banner-meta">
        <span class="banner-template">${escapeHtml(job.templateName)}</span>
        <span class="banner-status">Rendering…</span>
        <button class="banner-edit" type="button" style="display:none;">Edit</button>
        <button class="banner-edit-layout" type="button" style="display:none;">Edit layout</button>
        <select class="banner-reformat" style="display:none;">
          <option value="" disabled selected>Reformat to size…</option>
        </select>
        <select class="banner-change-template" style="display:none;">
          <option value="" disabled selected>Change template…</option>
        </select>
        <a class="banner-download" style="display:none;" download>PNG</a>
        <button class="banner-download-html5" type="button" style="display:none;">HTML5</button>
      </div>
      <div class="layout-edit-toolbar" style="display:none;">
        <span class="layout-edit-hint">Drag elements to reposition. Apply when done.</span>
        <button type="button" class="layout-apply">Apply</button>
        <button type="button" class="layout-cancel">Cancel</button>
      </div>
      <div class="banner-edit-form" style="display:none;">
        <label>Headline</label>
        <input type="text" class="edit-headline">
        <label>Subheadline</label>
        <textarea class="edit-subheadline" rows="2"></textarea>
        <label>CTA</label>
        <input type="text" class="edit-cta">
        <div class="edit-actions">
          <button type="button" class="edit-apply">Apply</button>
          <button type="button" class="edit-cancel">Cancel</button>
        </div>
      </div>
    `;
    bannersGrid.appendChild(card);
  });
}

productImagesInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

  for (const file of files) {
    const dataUrl = await fileToDataURL(file);
    uploadedProducts.push({
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      fileName: file.name,
      name: normalizeName(file.name, uploadedProducts.length + 1),
      dataUrl
    });
  }

  renderUploadedProducts();
});

logoInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const dataUrl = await fileToDataURL(file);
  uploadedLogo = {
    fileName: file.name,
    dataUrl
  };

  renderLogoPreview();
});

[
  showLogo,
  showCTA,
  showDiscount,
  showDisclaimer,
  discountText,
  disclaimerText,
  formatSelect,
  targetGroupInput
].forEach((el) => {
  el.addEventListener("input", refreshConditionalFields);
  el.addEventListener("change", refreshConditionalFields);
});

function setBtnBusy(btn, busy, busyLabel) {
  if (busy) {
    btn.dataset.originalLabel = btn.textContent;
    btn.textContent = busyLabel;
    btn.disabled = true;
  } else {
    if (btn.dataset.originalLabel) btn.textContent = btn.dataset.originalLabel;
    btn.disabled = false;
  }
}

generateCopyBtn.addEventListener("click", async () => {
  if (generateCopyBtn.disabled) return;
  if (!uploadedProducts.length) {
    alert("Upload at least one product first.");
    return;
  }

  setBtnBusy(generateCopyBtn, true, "Generating copy…");
  try {
    const response = await fetch("/generate-copy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        products: uploadedProducts.map((p) => ({
          name: p.name,
          fileName: p.fileName,
          imageDataUrl: p.dataUrl
        })),
        logo: uploadedLogo ? {
          fileName: uploadedLogo.fileName,
          imageDataUrl: uploadedLogo.dataUrl
        } : null,
        targetGroup: targetGroupInput.value.trim(),
        templateSettings: getTemplateSettings()
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Copy generation failed");
    }

    const headlines = Array.isArray(data.headlines) ? data.headlines : [];
    const subheadlines = Array.isArray(data.subheadlines) ? data.subheadlines : [];
    const ctas = Array.isArray(data.ctas) ? data.ctas : [];

    generatedVariants = [0, 1, 2].map((i) => ({
      headline: headlines[i] || "",
      subheadline: subheadlines[i] || "",
      cta: ctas[i] || ""
    }));

    renderVariants();
  } catch (error) {
    console.error(error);
    alert(`Generate copy failed: ${error.message}`);
  } finally {
    setBtnBusy(generateCopyBtn, false);
  }
});

async function generateScenes(count, aspectRatio, targetWidth, targetHeight) {
  const res = await fetch("/generate-scenes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      products: uploadedProducts.slice(0, 4).map((p) => ({
        name: p.name,
        dataUrl: p.dataUrl
      })),
      targetGroup: targetGroupInput.value.trim(),
      count,
      aspectRatio,
      targetWidth,
      targetHeight
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Scene generation failed");
  return data.scenes || [];
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function downloadAsHtml5(card, safeTemplate, variantIndex) {
  const img = card.querySelector("img.banner-bg-img") || card.querySelector("img");
  if (!img || !img.src) {
    alert("Banner image not ready yet.");
    return;
  }

  const job = renderedJobs.get(card);
  const spec = job ? getFormatSpec(job.format) : { w: 1080, h: 1080 };

  try {
    const blob = await fetch(img.src).then(r => r.blob());
    const base64 = await blobToBase64(blob);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="ad.size" content="width=${spec.w},height=${spec.h}">
<title>Banner ${safeTemplate} v${variantIndex + 1}</title>
<style>
  html, body { margin: 0; padding: 0; }
  body { width: ${spec.w}px; height: ${spec.h}px; overflow: hidden; background: #fff; }
  .banner-link { display: block; width: 100%; height: 100%; }
  .banner-img { width: 100%; height: 100%; object-fit: cover; display: block; border: 0; }
</style>
</head>
<body>
<a class="banner-link" href="javascript:void(0)" id="banner-cta">
  <img class="banner-img" src="${base64}" alt="Banner" />
</a>
<script>
  // IAB-compatible click tag for ad networks (Google Ads, Meta, etc.)
  // Replace with actual destination URL before serving
  var clickTag = "https://www.drmax.pl/";
  document.getElementById("banner-cta").addEventListener("click", function(e) {
    window.open(clickTag, "_blank");
  });
</script>
</body>
</html>`;

    const htmlBlob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(htmlBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeTemplate}-v${variantIndex + 1}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    console.error("HTML5 export error:", e);
    alert("Failed to export HTML5: " + e.message);
  }
}

async function renderJob(card, job, format) {
  const settings = getTemplateSettings();
  const spec = getFormatSpec(format);
  const isHtmlTemplate = spec.family === "html";
  const endpoint = isHtmlTemplate ? "/render-9x16" : "/render-banner";
  const body = {
    copy: job.copy,
    sceneUrl: job.sceneUrl,
    logoDataUrl: uploadedLogo?.dataUrl || "",
    settings,
    targetWidth: spec.w,
    targetHeight: spec.h
  };
  if (!isHtmlTemplate) body.templateId = job.templateId;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Render failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const img = card.querySelector("img");
  img.src = url;
  card.querySelector(".banner-status").textContent = `Variant ${job.variantIndex + 1}`;

  const safeTemplate = String(job.templateName || "banner")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const filename = `${safeTemplate}-v${job.variantIndex + 1}.png`;
  const dl = card.querySelector(".banner-download");
  if (dl) {
    dl.href = url;
    dl.setAttribute("download", filename);
    dl.style.display = "inline";
  }

  // Wire up HTML5 download button
  const dlHtml5 = card.querySelector(".banner-download-html5");
  if (dlHtml5) {
    dlHtml5.onclick = () => downloadAsHtml5(card, safeTemplate, job.variantIndex);
    dlHtml5.style.display = "inline-block";
  }

  renderedJobs.set(card, {
    copy: job.copy,
    format,
    templateId: job.templateId,
    templateName: job.templateName,
    variantIndex: job.variantIndex,
    sceneUrl: job.sceneUrl
  });
  populateReformatSelect(card, format, job.templateId);
  setupEditButton(card);
}

function setupEditButton(card) {
  const btn = card.querySelector(".banner-edit");
  const form = card.querySelector(".banner-edit-form");
  if (!btn || !form) return;

  btn.style.display = "inline-block";
  btn.onclick = () => {
    const job = renderedJobs.get(card);
    if (!job) return;
    form.querySelector(".edit-headline").value = job.copy?.headline || "";
    form.querySelector(".edit-subheadline").value = job.copy?.subheadline || "";
    form.querySelector(".edit-cta").value = job.copy?.cta || "";
    form.style.display = form.style.display === "none" ? "block" : "none";
  };
  form.querySelector(".edit-cancel").onclick = () => {
    form.style.display = "none";
  };
  form.querySelector(".edit-apply").onclick = () => applyEdit(card);

  const layoutBtn = card.querySelector(".banner-edit-layout");
  if (layoutBtn) {
    const job = renderedJobs.get(card);
    if (job && job.format !== "9:16") {
      layoutBtn.style.display = "inline-block";
      layoutBtn.onclick = () => enterLayoutEditMode(card);
    }
  }
}

function enterLayoutEditMode(card) {
  const job = renderedJobs.get(card);
  if (!job) return;

  const template = availableTemplates.find(t => t.id === job.templateId);
  if (!template || !template.slots || typeof template.slots !== "object") {
    alert("Template layout data not available.");
    return;
  }

  const preview = card.querySelector(".banner-preview");
  const img = preview.querySelector("img");
  if (!img || !img.complete || !img.naturalWidth) {
    alert("Banner image still loading — try again in a moment.");
    return;
  }

  card.classList.add("layout-editing");
  const toolbar = card.querySelector(".layout-edit-toolbar");
  if (toolbar) toolbar.style.display = "flex";

  // Hide other action buttons while in layout-edit mode
  card.querySelectorAll(".banner-edit, .banner-edit-layout, .banner-reformat, .banner-download")
    .forEach(el => el.style.display = "none");

  const nativeW = template.width;
  const nativeH = template.height;

  // Existing overrides (if user already edited before)
  const overrides = job.slotOverrides ? JSON.parse(JSON.stringify(job.slotOverrides)) : {};

  // Create overlay container
  const overlay = document.createElement("div");
  overlay.className = "layout-edit-overlay";

  Object.entries(template.slots).forEach(([key, slot]) => {
    if (!slot.box) return;
    if (key === "background") return; // don't expose background as draggable

    const current = overrides[key]
      ? { ...slot.box, ...overrides[key] }
      : slot.box;

    const div = document.createElement("div");
    div.className = "layout-slot";
    div.dataset.slotKey = key;
    div.style.left = `${(current.x / nativeW) * 100}%`;
    div.style.top = `${(current.y / nativeH) * 100}%`;
    div.style.width = `${(current.w / nativeW) * 100}%`;
    div.style.height = `${(current.h / nativeH) * 100}%`;
    div.innerHTML = `<span class="layout-slot-label">${escapeHtml(key)}</span>`;

    makeSlotDraggable(div, overlay, nativeW, nativeH, overrides, key);

    overlay.appendChild(div);
  });

  preview.appendChild(overlay);

  // Wire toolbar buttons (rebind each time to capture current state)
  toolbar.querySelector(".layout-apply").onclick = () => applyLayoutEdit(card, overrides);
  toolbar.querySelector(".layout-cancel").onclick = () => exitLayoutEditMode(card);
}

function makeSlotDraggable(el, overlay, nativeW, nativeH, overrides, key) {
  let startClientX, startClientY;
  let startLeftPct, startTopPct;
  let activePointerId = null;

  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    startClientX = e.clientX;
    startClientY = e.clientY;
    const overlayRect = overlay.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    startLeftPct = (elRect.left - overlayRect.left) / overlayRect.width;
    startTopPct = (elRect.top - overlayRect.top) / overlayRect.height;
    activePointerId = e.pointerId;
    el.setPointerCapture(activePointerId);
    el.classList.add("dragging");
  });

  el.addEventListener("pointermove", (e) => {
    if (e.pointerId !== activePointerId) return;
    const overlayRect = overlay.getBoundingClientRect();
    const dxPct = (e.clientX - startClientX) / overlayRect.width;
    const dyPct = (e.clientY - startClientY) / overlayRect.height;
    const newLeftPct = Math.max(0, Math.min(1 - parseFloat(el.style.width) / 100, startLeftPct + dxPct));
    const newTopPct = Math.max(0, Math.min(1 - parseFloat(el.style.height) / 100, startTopPct + dyPct));
    el.style.left = `${newLeftPct * 100}%`;
    el.style.top = `${newTopPct * 100}%`;

    overrides[key] = {
      ...(overrides[key] || {}),
      x: Math.round(newLeftPct * nativeW),
      y: Math.round(newTopPct * nativeH)
    };
  });

  const endDrag = (e) => {
    if (e.pointerId !== activePointerId) return;
    try { el.releasePointerCapture(activePointerId); } catch (_) {}
    activePointerId = null;
    el.classList.remove("dragging");
  };
  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);
}

function exitLayoutEditMode(card) {
  card.classList.remove("layout-editing");
  const overlay = card.querySelector(".layout-edit-overlay");
  if (overlay) overlay.remove();
  const toolbar = card.querySelector(".layout-edit-toolbar");
  if (toolbar) toolbar.style.display = "none";

  // Restore action buttons
  card.querySelectorAll(".banner-edit, .banner-edit-layout, .banner-reformat, .banner-download")
    .forEach(el => {
      if (el.classList.contains("banner-download")) {
        if (el.href) el.style.display = "inline";
      } else {
        el.style.display = "inline-block";
      }
    });
}

async function applyLayoutEdit(card, overrides) {
  if (reformatInFlight) {
    alert("Wait until the current operation finishes.");
    return;
  }
  const job = renderedJobs.get(card);
  if (!job) return;

  reformatInFlight = true;
  document.querySelectorAll(".banner-reformat, .banner-edit, .banner-edit-layout, .edit-apply, .layout-apply, .layout-cancel")
    .forEach(el => el.disabled = true);
  if (generateBannersBtn) generateBannersBtn.disabled = true;

  const status = card.querySelector(".banner-status");
  status.textContent = "Re-rendering layout…";

  try {
    const settings = getTemplateSettings();
    const body = {
      templateId: job.templateId,
      copy: job.copy,
      sceneUrl: job.sceneUrl,
      logoDataUrl: uploadedLogo?.dataUrl || "",
      settings,
      slotOverrides: overrides
    };

    const res = await fetch("/render-banner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Render failed (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    card.querySelector("img").src = url;

    const safeName = String(job.templateName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const dl = card.querySelector(".banner-download");
    if (dl) {
      dl.href = url;
      dl.setAttribute("download", `${safeName}-v${job.variantIndex + 1}.png`);
    }

    status.textContent = `Variant ${job.variantIndex + 1}`;
    renderedJobs.set(card, { ...job, slotOverrides: overrides });
    exitLayoutEditMode(card);
  } catch (e) {
    console.error("Layout edit error:", e);
    status.textContent = `Layout edit failed: ${e.message}`;
  } finally {
    reformatInFlight = false;
    document.querySelectorAll(".banner-reformat, .banner-edit, .banner-edit-layout, .edit-apply, .layout-apply, .layout-cancel")
      .forEach(el => el.disabled = false);
    if (generateBannersBtn) {
      generateBannersBtn.disabled = !!generateBannersBtn.dataset.originalLabel;
    }
  }
}

async function applyEdit(card) {
  if (reformatInFlight) {
    alert("Wait until the current operation finishes.");
    return;
  }
  const job = renderedJobs.get(card);
  if (!job) return;

  const form = card.querySelector(".banner-edit-form");
  const newHeadline = form.querySelector(".edit-headline").value.trim();
  const newSubheadline = form.querySelector(".edit-subheadline").value.trim();
  const newCta = form.querySelector(".edit-cta").value.trim();

  reformatInFlight = true;
  document.querySelectorAll(".banner-reformat, .banner-edit, .edit-apply").forEach(el => el.disabled = true);
  if (generateBannersBtn) generateBannersBtn.disabled = true;

  const status = card.querySelector(".banner-status");
  status.textContent = "Re-rendering…";

  try {
    const settings = getTemplateSettings();
    const newCopy = {
      ...job.copy,
      headline: newHeadline,
      subheadline: newSubheadline,
      cta: newCta
    };

    const jobSpec = getFormatSpec(job.format);
    const isHtmlTemplate = jobSpec.family === "html";
    const endpoint = isHtmlTemplate ? "/render-9x16" : "/render-banner";
    const body = {
      copy: newCopy,
      sceneUrl: job.sceneUrl,
      logoDataUrl: uploadedLogo?.dataUrl || "",
      settings,
      targetWidth: jobSpec.w,
      targetHeight: jobSpec.h
    };
    if (job.format !== "9:16") body.templateId = job.templateId;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Render failed (${res.status})`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    card.querySelector("img").src = url;

    const safeName = String(job.templateName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const dl = card.querySelector(".banner-download");
    if (dl) {
      dl.href = url;
      dl.setAttribute("download", `${safeName}-v${job.variantIndex + 1}.png`);
    }

    status.textContent = `Variant ${job.variantIndex + 1}`;
    renderedJobs.set(card, { ...job, copy: newCopy });
    form.style.display = "none";
  } catch (e) {
    console.error("Edit error:", e);
    status.textContent = `Edit failed: ${e.message}`;
  } finally {
    reformatInFlight = false;
    document.querySelectorAll(".banner-reformat, .banner-edit, .edit-apply").forEach(el => el.disabled = false);
    if (generateBannersBtn) {
      generateBannersBtn.disabled = !!generateBannersBtn.dataset.originalLabel;
    }
  }
}

const renderedJobs = new Map();
let reformatInFlight = false;

function templateFormatLabel(format) {
  const spec = FORMATS[format];
  if (!spec) return format;
  return `${spec.w}×${spec.h}`;
}

// First available Figma template belonging to a given aspect family.
function defaultTemplateForFamily(family) {
  return availableTemplates.find(t => templateFamily(t) === family) || null;
}

// Reformat options: jump this banner to another FAMILY using a real master +
// a freshly generated scene for that aspect.
// NOTE: same-family flexbox size-variants (1200×400, 970×250, 728×90, 1200×300)
// are intentionally omitted for now — they over-shrink text and aren't
// production-ready yet. Re-enable once the reformat fit is solid.
function buildReformatOptions(currentFormat, currentTemplateId) {
  const opts = [];
  const currentSpec = FORMATS[currentFormat];
  if (!currentSpec) return opts;

  if (currentSpec.family !== "wide") {
    const t = defaultTemplateForFamily("wide");
    if (t) opts.push({ value: `1920x555|${t.id}`, label: `1920×555 · wide (new scene)` });
  }
  if (currentSpec.family !== "square") {
    const t = defaultTemplateForFamily("square");
    if (t) opts.push({ value: `600x600|${t.id}`, label: `600×600 · square (new scene)` });
  }
  if (currentSpec.family !== "html") {
    // 9:16 vertical uses the ready HTML template (always available).
    opts.push({ value: `9:16|html-9x16`, label: `1080×1920 · 9:16 vertical (new scene)` });
  }

  return opts;
}

// Change-template options: SAME format, different template within same family.
// (Designed for "I want a different design at the same size".)
function buildChangeTemplateOptions(currentFormat, currentTemplateId) {
  const opts = [];
  const currentSpec = FORMATS[currentFormat];
  if (!currentSpec) return opts;
  if (currentSpec.family === "html") return opts;       // HTML has only one template, can't change

  availableTemplates.forEach(t => {
    if (t.id === currentTemplateId) return;             // skip current
    if (!templateMatchesFormat(t, currentFormat)) return;
    opts.push({
      value: `${currentFormat}|${t.id}`,
      label: t.name
    });
  });

  return opts;
}

function populateReformatSelect(card, currentFormat, currentTemplateId) {
  // Reformat to size — same template, different sizes
  const select = card.querySelector(".banner-reformat");
  if (select) {
    const opts = buildReformatOptions(currentFormat, currentTemplateId);
    select.innerHTML = `<option value="" disabled selected>Reformat to size…</option>` +
      opts.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("");
    select.style.display = opts.length ? "inline-block" : "none";
    select.onchange = () => {
      const value = select.value;
      select.value = "";
      if (value) reformatBanner(card, value);
    };
  }

  // Change template — different template, same size
  const ctSelect = card.querySelector(".banner-change-template");
  if (ctSelect) {
    const ctOpts = buildChangeTemplateOptions(currentFormat, currentTemplateId);
    ctSelect.innerHTML = `<option value="" disabled selected>Change template…</option>` +
      ctOpts.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("");
    ctSelect.style.display = ctOpts.length ? "inline-block" : "none";
    ctSelect.onchange = () => {
      const value = ctSelect.value;
      ctSelect.value = "";
      if (value) reformatBanner(card, value);
    };
  }
}

async function reformatBanner(card, value) {
  if (reformatInFlight) {
    alert("Another reformat is in progress — wait a bit.");
    return;
  }
  const job = renderedJobs.get(card);
  if (!job) return;
  const [newFormat, newTemplateId] = value.split("|");
  const newSpec = getFormatSpec(newFormat);
  const oldSpec = getFormatSpec(job.format);
  const isHtmlTemplate = newSpec.family === "html";

  // Same family → only canvas size changes, reuse the existing scene (no Gemini call, fast & free).
  // Different family → need a new scene at the new aspect ratio (Gemini call).
  const sameFamily = newSpec.family === oldSpec.family;

  reformatInFlight = true;
  document.querySelectorAll(".banner-reformat, .banner-change-template").forEach(s => s.disabled = true);
  if (generateBannersBtn) generateBannersBtn.disabled = true;

  const status = card.querySelector(".banner-status");
  status.textContent = sameFamily ? "Re-rendering…" : "Reformatting (new scene)…";

  try {
    let sceneUrl;
    if (sameFamily && job.sceneUrl) {
      // Reuse existing scene — only size or template changes within same family.
      sceneUrl = job.sceneUrl;
    } else {
      // Need a new scene at the new aspect ratio.
      const newAspect =
        newSpec.family === "html" ? "9:16"
        : newSpec.family === "square" ? "1:1"
        : newSpec.family === "vertical" ? "9:16"
        : "16:9";

      const sceneRes = await fetch("/generate-scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: uploadedProducts.slice(0, 4).map(p => ({ name: p.name, dataUrl: p.dataUrl })),
          targetGroup: targetGroupInput.value.trim(),
          count: 1,
          aspectRatio: newAspect,
          styleReferenceUrl: job.sceneUrl || null
        })
      });
      const sceneData = await sceneRes.json();
      if (!sceneRes.ok) throw new Error(sceneData.error || "Scene generation failed");
      sceneUrl = (sceneData.scenes || [])[0] || "";
    }

    const settings = getTemplateSettings();
    const endpoint = isHtmlTemplate ? "/render-9x16" : "/render-banner";
    const body = {
      copy: job.copy,
      sceneUrl,
      logoDataUrl: uploadedLogo?.dataUrl || "",
      settings,
      targetWidth: newSpec.w,
      targetHeight: newSpec.h
    };
    if (!isHtmlTemplate) body.templateId = newTemplateId;

    const renderRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!renderRes.ok) {
      const err = await renderRes.json().catch(() => ({}));
      throw new Error(err.error || `Render failed (${renderRes.status})`);
    }
    const blob = await renderRes.blob();
    const url = URL.createObjectURL(blob);

    card.querySelector("img").src = url;

    // Tall (9:16) banners: show preview at ~1/3 width, centered — otherwise a
    // vertical banner blows up to full width in the single-column wide grid.
    card.classList.toggle("is-vertical", newSpec.aspect === "9:16");

    const newTemplateName = newFormat === "9:16"
      ? "9:16 HTML"
      : (availableTemplates.find(t => t.id === newTemplateId)?.name || newTemplateId);
    card.querySelector(".banner-template").textContent = newTemplateName;

    const safeName = String(newTemplateName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const dl = card.querySelector(".banner-download");
    if (dl) {
      dl.href = url;
      dl.setAttribute("download", `${safeName}-v${job.variantIndex + 1}.png`);
    }

    status.textContent = `Variant ${job.variantIndex + 1}`;

    renderedJobs.set(card, {
      ...job,
      format: newFormat,
      templateId: newTemplateId,
      templateName: newTemplateName,
      sceneUrl
    });
    populateReformatSelect(card, newFormat, newTemplateId);

  } catch (e) {
    console.error("Reformat error:", e);
    status.textContent = `Reformat failed: ${e.message}`;
  } finally {
    reformatInFlight = false;
    document.querySelectorAll(".banner-reformat, .banner-change-template").forEach(s => { s.disabled = false; });
    if (generateBannersBtn) {
      generateBannersBtn.disabled = !!generateBannersBtn.dataset.originalLabel;
    }
  }
}

generateBannersBtn.addEventListener("click", async () => {
  if (generateBannersBtn.disabled) return;
  if (reformatInFlight) {
    alert("A reformat is currently in progress — wait until it finishes.");
    return;
  }
  if (!generatedVariants.length) {
    alert("Generate copy first.");
    return;
  }
  if (!uploadedProducts.length) {
    alert("Upload at least one product first.");
    return;
  }

  const format = formatSelect.value;
  const spec = getFormatSpec(format);
  const aspectRatio = spec.aspect;
  const targetWidth = spec.w;
  const targetHeight = spec.h;
  const isHtmlTemplate = spec.family === "html";

  if (!isHtmlTemplate && !selectedTemplateIds.size) {
    alert("Select at least one template.");
    return;
  }

  setBtnBusy(generateBannersBtn, true, "Generating banners… (~3 min)");

  try {

  const settings = getTemplateSettings();
  // Apply layout class to the banners grid for responsive display
  bannersGrid.classList.toggle("format-9x16", spec.aspect === "9:16" && isHtmlTemplate);
  bannersGrid.classList.toggle("format-square", spec.aspect === "1:1");
  bannersGrid.classList.toggle("format-vertical", spec.aspect === "9:16");
  bannersGrid.innerHTML = `<div class="helper">Generating scenes with Imagen…</div>`;

  let scenes;
  try {
    scenes = await generateScenes(
      generatedVariants.length || 3,
      aspectRatio,
      targetWidth,
      targetHeight
    );
  } catch (e) {
    bannersGrid.innerHTML = `<div class="helper">Scene generation failed: ${escapeHtml(e.message)}</div>`;
    return;
  }

  const jobs = [];
  if (isHtmlTemplate) {
    generatedVariants.forEach((variant, i) => {
      jobs.push({
        templateId: "html-9x16",
        templateName: `${spec.w}×${spec.h} HTML`,
        variantIndex: i,
        sceneUrl: scenes[i] || scenes[0] || "",
        copy: {
          headline: variant.headline || "",
          subheadline: variant.subheadline || "",
          cta: variant.cta || "",
          promo: settings.discountText || "",
          legal: settings.disclaimerText || ""
        }
      });
    });
  } else {
    const selected = availableTemplates.filter((t) =>
      selectedTemplateIds.has(t.id) && templateMatchesFormat(t, format)
    );
    if (!selected.length) {
      bannersGrid.innerHTML = `<div class="helper">No selected templates match the chosen format.</div>`;
      return;
    }
    selected.forEach((t, idx) => {
      const variant =
        generatedVariants[idx] || generatedVariants[0] || {
          headline: "",
          subheadline: "",
          cta: ""
        };
      jobs.push({
        templateId: t.id,
        templateName: t.name,
        variantIndex: idx,
        sceneUrl: scenes[idx] || scenes[0] || "",
        copy: {
          headline: variant.headline || "",
          subheadline: variant.subheadline || "",
          cta: variant.cta || "",
          promo: settings.discountText || "",
          legal: settings.disclaimerText || ""
        }
      });
    });
  }

  renderBannerSkeletons(jobs);

  await Promise.all(
    jobs.map((job, i) => {
      const card = bannersGrid.querySelector(`[data-job-index="${i}"]`);
      return renderJob(card, job, format).catch((err) => {
        card.querySelector(".banner-status").textContent = `Failed: ${err.message}`;
      });
    })
  );

  } finally {
    setBtnBusy(generateBannersBtn, false);
  }
});

function refreshTemplatePickerVisibility() {
  const spec = getFormatSpec(formatSelect.value);
  const usesFigma = spec.family !== "html";
  if (templatePickerEl) {
    templatePickerEl.parentElement.style.display = usesFigma ? "" : "none";
  }
  renderTemplatePicker();
  updateFormatHint();
}
formatSelect.addEventListener("change", refreshTemplatePickerVisibility);
refreshTemplatePickerVisibility();

(async () => {
  try {
    availableTemplates = await loadTemplates();
    selectedTemplateIds = new Set(availableTemplates.map((t) => t.id));
    renderTemplatePicker();
  } catch (e) {
    if (templatePickerEl) {
      templatePickerEl.innerHTML = `<div class="helper">Failed to load templates: ${escapeHtml(e.message)}</div>`;
    }
  }
})();

renderUploadedProducts();
renderLogoPreview();
refreshConditionalFields();
renderVariants();
bannersGrid.innerHTML = `<div class="helper">No banners generated yet.</div>`;
