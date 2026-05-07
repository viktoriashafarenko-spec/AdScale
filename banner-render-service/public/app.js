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
let generatedBanners = [];

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

async function loadScenes() {
  const response = await fetch("/get-scenes");
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to load scenes");
  }

  return data.scenes || [];
}

function buildBannerData(scenes) {
  const settings = getTemplateSettings();

  return [0, 1, 2].map((i) => ({
    variantIndex: i + 1,
    backgroundUrl: scenes[i] || "",
    headline: generatedVariants[i]?.headline || "",
    subheadline: generatedVariants[i]?.subheadline || "",
    cta: generatedVariants[i]?.cta || "",
    settings
  }));
}

function renderBanners() {
  bannersGrid.innerHTML = "";

  if (!generatedBanners.length) {
    bannersGrid.innerHTML = `<div class="helper">No banners generated yet.</div>`;
    return;
  }

  generatedBanners.forEach((banner) => {
    const card = document.createElement("div");
    card.className = "banner-card";

    card.innerHTML = `
      <div class="banner-preview">
        ${banner.backgroundUrl ? `<img src="${escapeHtml(banner.backgroundUrl)}" alt="" class="banner-bg" />` : ""}

        ${banner.settings.showLogo && uploadedLogo ? `
          <div class="banner-logo-wrap">
            <img src="${escapeHtml(uploadedLogo.dataUrl)}" alt="Logo" class="banner-logo" />
          </div>
        ` : ""}

        <div class="banner-copy">
          <div class="banner-headline">${escapeHtml(banner.headline)}</div>
          <div class="banner-subheadline">${escapeHtml(banner.subheadline)}</div>

          ${banner.settings.showCTA ? `
            <div class="banner-cta">${escapeHtml(banner.cta)}</div>
          ` : ""}
        </div>

        ${banner.settings.showDiscount ? `
          <div class="banner-discount">${escapeHtml(banner.settings.discountText)}</div>
        ` : ""}

        ${banner.settings.showDisclaimer ? `
          <div class="banner-disclaimer">${escapeHtml(banner.settings.disclaimerText)}</div>
        ` : ""}
      </div>
      <div class="banner-meta">Banner ${banner.variantIndex}</div>
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

generateCopyBtn.addEventListener("click", async () => {
  if (!uploadedProducts.length) {
    alert("Upload at least one product first.");
    return;
  }

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
  }
});

generateBannersBtn.addEventListener("click", async () => {
  if (!generatedVariants.length) {
    alert("Generate copy first.");
    return;
  }

  try {
    const scenes = await loadScenes();
    generatedBanners = buildBannerData(scenes);
    renderBanners();
  } catch (error) {
    console.error(error);
    bannersGrid.innerHTML = `<div class="helper">Banner generation failed: ${error.message}</div>`;
  }
});

renderUploadedProducts();
renderLogoPreview();
refreshConditionalFields();
renderVariants();
renderBanners();
