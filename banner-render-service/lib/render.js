import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _browser;

export async function getBrowser() {
  if (_browser && _browser.connected) return _browser;
  _browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--font-render-hinting=none"
    ]
  });
  return _browser;
}

export async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function styleString(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}:${v}`)
    .join(";");
}

function textSlotStyle(slot) {
  const s = slot.style || {};
  const justify =
    s.verticalAlign === "center"
      ? "center"
      : s.verticalAlign === "bottom"
      ? "flex-end"
      : "flex-start";
  return {
    position: "absolute",
    left: `${slot.box.x}px`,
    top: `${slot.box.y}px`,
    width: `${slot.box.w}px`,
    height: `${slot.box.h}px`,
    fontFamily: `'Montserrat', sans-serif`,
    fontWeight: s.fontWeight,
    fontSize: `${s.fontSize}px`,
    lineHeight: s.lineHeight,
    letterSpacing: s.letterSpacing,
    color: s.color,
    textAlign: s.textAlign,
    display: "flex",
    alignItems: justify,
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  };
}

function buttonSlotStyle(slot) {
  const s = slot.style || {};
  const radius =
    typeof slot.cornerRadius === "number"
      ? slot.cornerRadius
      : Math.min(slot.box.w, slot.box.h) / 2;
  return {
    position: "absolute",
    left: `${slot.box.x}px`,
    top: `${slot.box.y}px`,
    width: `${slot.box.w}px`,
    height: `${slot.box.h}px`,
    background: slot.bg,
    fontFamily: `'Montserrat', sans-serif`,
    fontWeight: s.fontWeight,
    fontSize: `${s.fontSize}px`,
    color: s.color,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: `${radius}px`,
    textTransform: "lowercase"
  };
}

export function buildHtml({ manifest, copy, logoDataUrl, bgUrl, settings = {} }) {
  const { width, height, slots } = manifest;

  const segments = [];

  if (bgUrl) {
    segments.push(
      `<img src="${escapeHtml(bgUrl)}" style="${styleString({
        position: "absolute",
        left: "0",
        top: "0",
        width: `${width}px`,
        height: `${height}px`,
        objectFit: "contain",
        background: "#ffffff"
      })}" />`
    );
  }

  if (slots.promoBox && settings.showDiscount !== false) {
    const b = slots.promoBox.box;
    segments.push(
      `<div style="${styleString({
        position: "absolute",
        left: `${b.x}px`,
        top: `${b.y}px`,
        width: `${b.w}px`,
        height: `${b.h}px`,
        background: slots.promoBox.bg,
        borderRadius: `${slots.promoBox.cornerRadius || 0}px`
      })}"></div>`
    );
  }

  for (const key of ["headline", "subheadline", "promo", "legal"]) {
    const slot = slots[key];
    if (!slot) continue;
    if (key === "promo" && settings.showDiscount === false) continue;
    if (key === "legal" && settings.showDisclaimer === false) continue;
    const text = (copy && copy[key]) || slot.placeholder || "";
    segments.push(
      `<div data-fit data-slot="${key}" style="${styleString(textSlotStyle(slot))}">${escapeHtml(text)}</div>`
    );
  }

  if (slots.cta && settings.showCTA !== false) {
    const text = (copy && copy.cta) || slots.cta.placeholder || "";
    segments.push(
      `<div data-fit data-slot="cta" style="${styleString(buttonSlotStyle(slots.cta))}">${escapeHtml(text)}</div>`
    );
  }

  if (slots.logo && logoDataUrl && settings.showLogo !== false) {
    const b = slots.logo.box;
    segments.push(
      `<img src="${escapeHtml(logoDataUrl)}" style="${styleString({
        position: "absolute",
        left: `${b.x}px`,
        top: `${b.y}px`,
        width: `${b.w}px`,
        height: `${b.h}px`,
        objectFit: "contain"
      })}" />`
    );
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@100;200;300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { width: ${width}px; height: ${height}px; overflow: hidden; background: #fff; }
  .banner { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; }
</style>
</head>
<body>
<div class="banner">
${segments.join("\n")}
</div>
</body>
</html>`;
}

let _9x16Template;
async function loadTemplate(name) {
  const file = path.join(__dirname, "..", "templates", name);
  return fs.readFile(file, "utf8");
}

function fillTemplate(tpl, vars) {
  return tpl.replace(/{{(\w+)}}/g, (_, k) =>
    vars[k] === undefined ? "" : String(vars[k])
  );
}

export async function build9x16Html({
  width = 1080,
  height = 1920,
  bgUrl = "",
  logoUrl = "",
  copy = {},
  settings = {}
}) {
  if (!_9x16Template) {
    _9x16Template = await loadTemplate("banner-9x16.html");
  }
  return fillTemplate(_9x16Template, {
    WIDTH: width,
    HEIGHT: height,
    BG_URL: escapeHtml(bgUrl),
    LOGO_URL: escapeHtml(logoUrl),
    HEADLINE: escapeHtml(copy.headline || ""),
    SUBHEADLINE: escapeHtml(copy.subheadline || ""),
    CTA: escapeHtml(copy.cta || ""),
    PROMO: escapeHtml(copy.promo || ""),
    LEGAL: escapeHtml(copy.legal || ""),
    LOGO_DISPLAY: settings.showLogo !== false && logoUrl ? "block" : "none",
    CTA_DISPLAY: settings.showCTA !== false && copy.cta ? "inline-flex" : "none",
    DISCOUNT_DISPLAY: settings.showDiscount !== false && copy.promo ? "inline-flex" : "none",
    LEGAL_DISPLAY: settings.showDisclaimer !== false && copy.legal ? "block" : "none"
  });
}

export async function renderHtmlToPng(html, width, height) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({
      width: Math.ceil(width),
      height: Math.ceil(height),
      deviceScaleFactor: 1
    });
    await page.setContent(html, { waitUntil: "load", timeout: 60000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map((img) => {
          if (!img.getAttribute("src")) return Promise.resolve();
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
            setTimeout(done, 8000);
          });
        })
      );

      const fitEls = document.querySelectorAll("[data-fit]");
      for (const el of fitEls) {
        const maxW = el.clientWidth;
        const maxH = el.clientHeight;
        if (!maxW || !maxH) continue;
        let fs = parseFloat(getComputedStyle(el).fontSize) || 16;
        const min = 8;
        let guard = 60;
        while (
          (el.scrollWidth > maxW + 1 || el.scrollHeight > maxH + 1) &&
          fs > min &&
          guard-- > 0
        ) {
          fs *= 0.9;
          el.style.fontSize = fs + "px";
        }
      }

      // Column fit-pass (reformat): for each top-level column whose content
      // overflows its height, shrink ALL text inside until it fits. Keeps
      // fixed-size elements (logo) intact while text adapts to the new size.
      const cols = document.querySelectorAll("[data-fitcol]");
      for (const col of cols) {
        let guard = 100;
        while (col.scrollHeight > col.clientHeight + 1 && guard-- > 0) {
          const texts = col.querySelectorAll("[data-slot]");
          if (!texts.length) break;
          let shrunk = false;
          for (const t of texts) {
            const fs = parseFloat(getComputedStyle(t).fontSize) || 16;
            if (fs > 7) {
              t.style.fontSize = fs * 0.94 + "px";
              shrunk = true;
            }
          }
          if (!shrunk) break; // everything already at min — avoid infinite loop
        }
      }
    });
    const buffer = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: Math.ceil(width), height: Math.ceil(height) }
    });
    return buffer;
  } finally {
    await page.close();
  }
}
