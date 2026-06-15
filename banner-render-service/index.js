import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { VertexAI } from "@google-cloud/vertexai";
import {
  fetchFrameDetails,
  exportNodes,
  buildManifest,
  fetchImageRefs
} from "./lib/figma.js";
import { buildHtml, build9x16Html, renderHtmlToPng } from "./lib/render.js";
import { buildHtmlFromTree } from "./lib/figmaTree.js";
import {
  generateImageWithProducts,
  generateFullBanner,
  SCENE_PROMPTS,
  getScenePrompts,
  editImage
} from "./lib/geminiImage.js";
import { uploadPng, listFiles } from "./lib/storage.js";
import { fitSceneToBanner } from "./lib/sceneFit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const FIGMA_FILE_KEY = process.env.FIGMA_FILE_KEY || "";
const GEMINI_IMAGE_LOCATION =
  process.env.GEMINI_IMAGE_LOCATION || "global";
const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image-preview";
const SCENES_BUCKET =
  process.env.SCENES_BUCKET || "banner-automation-489120-creative-assets";
const FIGMA_FRAME_IDS = (process.env.FIGMA_FRAME_IDS || "16:3,23:19,23:43")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function getFigmaToken() {
  const token = process.env.FIGMA_TOKEN;
  if (!token) throw new Error("Missing FIGMA_TOKEN env var (mount via Secret Manager).");
  return token;
}

let _templatesCache = null;
let _imageRefsCache = null;
async function getTemplates() {
  if (_templatesCache) return _templatesCache;
  if (!FIGMA_FILE_KEY) throw new Error("FIGMA_FILE_KEY env var not set.");

  const token = getFigmaToken();
  const [frames, imageRefs] = await Promise.all([
    fetchFrameDetails(FIGMA_FILE_KEY, FIGMA_FRAME_IDS, token),
    fetchImageRefs(FIGMA_FILE_KEY, token)
  ]);
  const manifests = frames.map(buildManifest);

  const exportIds = manifests
    .map((m) => m.background?.exportId)
    .filter(Boolean);
  const exports = exportIds.length
    ? await exportNodes(FIGMA_FILE_KEY, exportIds, token, 1)
    : {};

  for (const m of manifests) {
    const id = m.background?.exportId;
    m.backgroundUrl = id ? exports[id] || null : null;
  }

  _imageRefsCache = imageRefs;
  _templatesCache = manifests;
  return manifests;
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = parseInt(process.env.PORT, 10) || 8080;
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "europe-west4";
const VERTEX_MODEL = process.env.VERTEX_MODEL || "gemini-2.5-flash";

let _textModel;
function getTextModel() {
  if (_textModel) return _textModel;

  const project =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT;

  if (!project) {
    throw new Error(
      "Missing project: set GOOGLE_CLOUD_PROJECT (or GCLOUD_PROJECT) env var."
    );
  }

  const vertexAI = new VertexAI({ project, location: VERTEX_LOCATION });
  _textModel = vertexAI.getGenerativeModel({ model: VERTEX_MODEL });
  return _textModel;
}

app.get("/health", (_, res) => {
  res.send("ok");
});

function extractJson(text = "") {
  const raw = String(text).trim();

  if (raw.startsWith("{") && raw.endsWith("}")) return raw;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1).trim();
  }

  throw new Error("Could not extract JSON from model response");
}

function sanitizeArray(arr, fallback = []) {
  if (!Array.isArray(arr)) return fallback;
  return arr.map((x) => String(x || "").trim()).filter(Boolean);
}

function cleanBadSubheadline(text = "", targetGroup = "") {
  const t = String(text).trim();

  const badPatterns = [
    /wybrane produkty\s*:/i,
    /produkt\s*\d/i,
    /screenshot/i,
    /,\s*produkt/i
  ];

  if (!badPatterns.some((p) => p.test(t))) return t;

  const audience = String(targetGroup || "").trim();

  const safeFallbacks = [
    audience ? `Suplementy dla ${audience}` : "Wybrane suplementy",
    "Codzienne wsparcie organizmu",
    "Oferta dopasowana do Twoich potrzeb"
  ];

  return safeFallbacks[Math.floor(Math.random() * safeFallbacks.length)];
}

app.post("/generate-copy", async (req, res) => {
  try {
    const {
      products = [],
      targetGroup = "",
      templateSettings = {}
    } = req.body;

    const productNames = products
      .map((p) => p.name || "")
      .filter(Boolean)
      .join(", ");

    const discount = templateSettings.discountText || "";

   const prompt = `
You are a senior Polish marketing copywriter creating short retail pharmacy banner copy.

Your task is to create 3 banner copy variants in Polish for a promotional banner.

Context:
- products: ${productNames}
- target group: ${targetGroup}
- discount badge exists separately in the banner design

Return STRICT JSON only:

{
  "headlines": ["","",""],
  "subheadlines": ["","",""],
  "ctas": ["","",""]
}

CRITICAL RULES

HEADLINE
- max 4 words
- emotional / aspirational
- NEVER mention discounts or prices
- NEVER mention percentages
- NEVER mention promotion

Good examples:
- "Zdrowie i uroda"
- "Codzienna energia"
- "Naturalne wsparcie"
- "Pełnia blasku"

SUBHEADLINE
- max 10 words
- can mention the category or benefit
- should describe products or support
- DO NOT mention percentages like -20% or -30%

Examples:
- "Suplementy dla kobiet 35+"
- "Wsparcie zdrowia i urody"
- "Wybrane suplementy dla Twojej energii"

CTA
- max 3 words
- action oriented

Examples:
- "Sprawdź ofertę"
- "Kup teraz"
- "Odkryj więcej"

IMPORTANT
Discount information already exists visually in the banner badge.
DO NOT repeat discounts in headline or subheadline.

Output ONLY valid JSON.
`;

    const request = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    };

    const response = await getTextModel().generateContent(request);
    const text = response.response.candidates[0].content.parts[0].text;
    const parsed = JSON.parse(extractJson(text));

    const headlines = sanitizeArray(parsed.headlines, [
      "Suplementy na co dzień",
      "Wsparcie każdego dnia",
      "Oferta dla kobiet 35+"
    ]);

    const subheadlines = sanitizeArray(parsed.subheadlines, [
      "Codzienne wsparcie organizmu",
      "Wybrane suplementy dla kobiet 35+",
      "Oferta dopasowana do Twoich potrzeb"
    ]).map((s) => cleanBadSubheadline(s, targetGroup));

    const ctas = sanitizeArray(parsed.ctas, [
      "Kup teraz",
      "Sprawdź ofertę",
      "Zamów online"
    ]);

    res.json({
      status: "OK",
      headlines: [0, 1, 2].map((i) => headlines[i] || headlines[0] || ""),
      subheadlines: [0, 1, 2].map((i) => subheadlines[i] || subheadlines[0] || ""),
      ctas: [0, 1, 2].map((i) => ctas[i] || ctas[0] || "")
    });
  } catch (e) {
    console.error("COPY_GENERATION_ERROR:", e);

    const audience = String(req.body?.targetGroup || "").trim();

    res.status(500).json({
      status: "FALLBACK",
      error: e.message || "Copy generation failed",
      headlines: [
        "Suplementy na co dzień",
        "Wsparcie każdego dnia",
        audience ? `Oferta dla ${audience}` : "Oferta dla Ciebie"
      ],
      subheadlines: [
        audience ? `Suplementy dla ${audience}` : "Wybrane suplementy",
        "Codzienne wsparcie organizmu",
        "Oferta dopasowana do Twoich potrzeb"
      ],
      ctas: [
        "Kup teraz",
        "Sprawdź ofertę",
        "Zamów online"
      ]
    });
  }
});

app.get("/templates", async (req, res) => {
  try {
    const templates = await getTemplates();
    res.json({
      templates: templates.map((m) => ({
        id: m.id,
        name: m.name,
        width: m.width,
        height: m.height,
        slots: Object.fromEntries(
          Object.entries(m.slots).map(([k, v]) => [k, { box: v.box, type: v.type }])
        ),
        backgroundUrl: m.backgroundUrl
      }))
    });
  } catch (e) {
    console.error("TEMPLATES_ERROR:", e);
    res.status(500).json({ error: e.message || "Failed to load templates" });
  }
});

app.post("/refresh-templates", async (req, res) => {
  _templatesCache = null;
  try {
    const templates = await getTemplates();
    res.json({ status: "OK", count: templates.length });
  } catch (e) {
    res.status(500).json({ error: e.message || "Refresh failed" });
  }
});

const GENERATION_ASPECT = "21:9";
const GENERATION_IMAGE_SIZE = "1K";

app.post("/generate-scenes", async (req, res) => {
  try {
    const {
      products = [],
      targetGroup = "",
      count = 3,
      aspectRatio: requestedAspect,
      targetWidth = 0,
      targetHeight = 0,
      styleReferenceUrl = null,
      prompts: clientPrompts = null,
      imageSize: requestedSize = "",
      client = "default",
      composition = true
    } = req.body;
    const clientId = String(client).replace(/[^a-z0-9_-]/gi, "") || "default";
    const useCompositionRef = composition !== false;
    const project =
      process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
    if (!project) throw new Error("GOOGLE_CLOUD_PROJECT not set");

    const ALLOWED_ASPECTS = ["1:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","16:9","21:9"];
    const aspectRatio = ALLOWED_ASPECTS.includes(requestedAspect) ? requestedAspect : GENERATION_ASPECT;
    const ALLOWED_SIZES = ["1K","2K","4K"];
    const imageSize = ALLOWED_SIZES.includes(requestedSize) ? requestedSize : GENERATION_IMAGE_SIZE;

    const productsWithImages = products.filter(
      (p) => p.dataUrl || p.imageDataUrl
    );

    // Client may pass an explicit prompt matrix (style × variation). Otherwise use built-in scene prompts.
    let prompts;
    if (Array.isArray(clientPrompts) && clientPrompts.length) {
      prompts = clientPrompts
        .slice(0, 30)
        .map((p, i) => ({ id: p.label || p.id || `p${i + 1}`, text: String(p.text || p.prompt || "").trim() }))
        .filter((p) => p.text);
    } else {
      const promptsForAspect = getScenePrompts(aspectRatio);
      const desiredCount = Math.max(1, Math.min(count, promptsForAspect.length));
      prompts = promptsForAspect.slice(0, desiredCount);
    }
    if (!prompts.length) throw new Error("No prompts to generate");

    const sceneBuffers = [];
    for (let idx = 0; idx < prompts.length; idx++) {
      const p = prompts[idx];
      let buf = null;
      let lastErr = null;
      for (let attempt = 0; attempt < 3 && !buf; attempt++) {
        try {
          buf = await generateImageWithProducts({
            project,
            location: GEMINI_IMAGE_LOCATION,
            model: GEMINI_IMAGE_MODEL,
            prompt: p.text,
            products: productsWithImages,
            aspectRatio,
            imageSize,
            styleReferenceUrl,
            useCompositionRef
          });
        } catch (e) {
          lastErr = e;
          const isQuota = String(e.message || "").includes("429");
          if (!isQuota) {
            console.warn(`Gemini error variant ${idx}:`, e.message);
            break;
          }
          console.warn(`Gemini 429 variant ${idx} attempt ${attempt + 1}`);
          await new Promise((r) => setTimeout(r, 6000));
        }
      }
      if (!buf) {
        throw new Error(
          `Gemini Image failed for variant ${idx}: ${lastErr?.message || "unknown error"}`
        );
      }
      sceneBuffers.push(buf);
    }

    const urls = await Promise.all(
      sceneBuffers.map((buf, i) =>
        uploadPng(SCENES_BUCKET, buf, `clients/${clientId}/tmp`, {
          client: clientId,
          label: prompts[i]?.id || "",
          format: aspectRatio
        })
      )
    );

    res.json({
      scenes: urls,
      prompts: prompts.map((p) => ({ id: p.id, text: p.text })),
      model: GEMINI_IMAGE_MODEL,
      productImages: productsWithImages.length
    });
  } catch (e) {
    console.error("GENERATE_SCENES_ERROR:", e);
    res.status(500).json({ error: e.message || "Scene generation failed" });
  }
});

app.post("/render-9x16", async (req, res) => {
  try {
    const {
      copy = {},
      logoDataUrl = "",
      sceneUrl = "",
      settings = {}
    } = req.body;

    const html = await build9x16Html({
      width: 1080,
      height: 1920,
      bgUrl: sceneUrl,
      logoUrl: logoDataUrl,
      copy,
      settings
    });
    const png = await renderHtmlToPng(html, 1080, 1920);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(png);
  } catch (e) {
    console.error("RENDER_9X16_ERROR:", e);
    res.status(500).json({ error: e.message || "Render failed" });
  }
});

app.post("/render-banner", async (req, res) => {
  try {
    const {
      templateId,
      copy = {},
      logoDataUrl = "",
      sceneUrl = "",
      settings = {},
      slotOverrides = null,
      targetWidth,
      targetHeight,
      bgTransform = null
    } = req.body;
    if (!templateId) {
      return res.status(400).json({ error: "templateId is required" });
    }
    const bgScale = bgTransform && Number(bgTransform.scale) > 0 ? Number(bgTransform.scale) : 1;
    const bgX = bgTransform && bgTransform.x != null ? Number(bgTransform.x) : 0.5;
    const bgY = bgTransform && bgTransform.y != null ? Number(bgTransform.y) : 0.5;

    const templates = await getTemplates();
    const manifest = templates.find((m) => m.id === templateId);
    if (!manifest) {
      return res.status(404).json({ error: `Template ${templateId} not found` });
    }

    // If client passed a target canvas size, use it; otherwise fall back to template's native size.
    const finalWidth = Number.isFinite(targetWidth) && targetWidth > 0 ? targetWidth : manifest.width;
    const finalHeight = Number.isFinite(targetHeight) && targetHeight > 0 ? targetHeight : manifest.height;

    const originalBgUrl = sceneUrl || manifest.backgroundUrl || "";
    const anchor = templateId === "23:19" ? "right" : "center";
    const fittedBgUrl =
      originalBgUrl
        ? await fitSceneToBanner(
            originalBgUrl,
            finalWidth,
            finalHeight,
            { anchor, scale: bgScale, x: bgX, y: bgY }
          )
        : null;
    const bgUrl = fittedBgUrl || originalBgUrl;

    const html = manifest.rawFrame
      ? buildHtmlFromTree({
          frame: manifest.rawFrame,
          copy,
          sceneUrl: bgUrl,
          logoDataUrl,
          settings,
          imageRefs: _imageRefsCache || {},
          slotOverrides,
          canvasWidth: finalWidth,
          canvasHeight: finalHeight
        })
      : buildHtml({
          manifest,
          copy,
          logoDataUrl,
          bgUrl,
          settings,
          canvasWidth: finalWidth,
          canvasHeight: finalHeight
        });

    const png = await renderHtmlToPng(html, finalWidth, finalHeight);

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(png);
  } catch (e) {
    console.error("RENDER_BANNER_ERROR:", e);
    res.status(500).json({ error: e.message || "Render failed" });
  }
});

app.post("/generate-banner-full", async (req, res) => {
  try {
    const {
      products = [],
      copy = {},
      logoDataUrl = "",
      aspectRatio = "21:9"
    } = req.body;

    const project =
      process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
    if (!project) throw new Error("GOOGLE_CLOUD_PROJECT not set");

    const productsWithImages = products.filter(
      (p) => p.dataUrl || p.imageDataUrl
    );

    let buf = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 3 && !buf; attempt++) {
      try {
        buf = await generateFullBanner({
          project,
          location: GEMINI_IMAGE_LOCATION,
          model: GEMINI_IMAGE_MODEL,
          products: productsWithImages,
          copy,
          logoDataUrl,
          aspectRatio
        });
      } catch (e) {
        lastErr = e;
        const isQuota = String(e.message || "").includes("429");
        if (!isQuota) {
          console.warn(`generateFullBanner error:`, e.message);
          break;
        }
        console.warn(`generateFullBanner 429 attempt ${attempt + 1}`);
        await new Promise((r) => setTimeout(r, 6000));
      }
    }

    if (!buf) {
      throw new Error(
        `Full banner generation failed: ${lastErr?.message || "unknown error"}`
      );
    }

    const url = await uploadPng(SCENES_BUCKET, buf, "banners-full");
    res.json({ url, aspectRatio });
  } catch (e) {
    console.error("GENERATE_BANNER_FULL_ERROR:", e);
    res.status(500).json({ error: e.message || "Full banner generation failed" });
  }
});

function safeClient(v) {
  return String(v || "default").replace(/[^a-z0-9_-]/gi, "") || "default";
}

// Edit an existing generated scene with a text instruction (image-to-image).
app.post("/edit-scene", async (req, res) => {
  try {
    const {
      imageUrl = "",
      imageDataUrl = "",
      prompt = "",
      aspectRatio: ra,
      imageSize: rs = "",
      client = "default"
    } = req.body;
    const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
    if (!project) throw new Error("GOOGLE_CLOUD_PROJECT not set");
    if (!String(prompt).trim()) return res.status(400).json({ error: "prompt required" });
    if (!imageUrl && !imageDataUrl) return res.status(400).json({ error: "source image required" });

    const ALLOWED_ASPECTS = ["1:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","16:9","21:9"];
    const aspectRatio = ALLOWED_ASPECTS.includes(ra) ? ra : "1:1";
    const ALLOWED_SIZES = ["1K","2K","4K"];
    const imageSize = ALLOWED_SIZES.includes(rs) ? rs : GENERATION_IMAGE_SIZE;
    const clientId = safeClient(client);

    let buf = null, lastErr = null;
    for (let attempt = 0; attempt < 3 && !buf; attempt++) {
      try {
        buf = await editImage({
          project,
          location: GEMINI_IMAGE_LOCATION,
          model: GEMINI_IMAGE_MODEL,
          prompt: String(prompt).trim(),
          imageUrl: imageUrl || null,
          imageDataUrl: imageDataUrl || null,
          aspectRatio,
          imageSize
        });
      } catch (e) {
        lastErr = e;
        if (!String(e.message || "").includes("429")) break;
        await new Promise((r) => setTimeout(r, 6000));
      }
    }
    if (!buf) throw new Error(`Edit failed: ${lastErr?.message || "unknown error"}`);

    const url = await uploadPng(SCENES_BUCKET, buf, `clients/${clientId}/tmp`, {
      client: clientId,
      label: "edit",
      format: aspectRatio
    });
    res.json({ url });
  } catch (e) {
    console.error("EDIT_SCENE_ERROR:", e);
    res.status(500).json({ error: e.message || "Edit failed" });
  }
});

// Save a rendered asset (e.g. a banner) into the client's library folder.
app.post("/save-asset", async (req, res) => {
  try {
    const { client = "default", kind = "image", dataUrl = "", sourceUrl = "", meta = {} } = req.body;
    const c = safeClient(client);
    let buf;
    if (/^data:image\/[a-z+]+;base64,/i.test(dataUrl)) {
      buf = Buffer.from(dataUrl.split(",")[1], "base64");
    } else if (sourceUrl) {
      // Copy an already-uploaded scene into the library (avoids browser CORS).
      const r = await fetch(sourceUrl);
      if (!r.ok) throw new Error(`Could not fetch sourceUrl (${r.status})`);
      buf = Buffer.from(await r.arrayBuffer());
    } else {
      return res.status(400).json({ error: "dataUrl or sourceUrl required" });
    }
    const folder = kind === "banner" ? "banners" : "images";
    const cleanMeta = {};
    for (const [k, v] of Object.entries(meta || {})) cleanMeta[k] = String(v);
    const url = await uploadPng(SCENES_BUCKET, buf, `clients/${c}/${folder}`, {
      client: c,
      ...cleanMeta
    });
    res.json({ url });
  } catch (e) {
    console.error("SAVE_ASSET_ERROR:", e);
    res.status(500).json({ error: e.message || "Save failed" });
  }
});

// List a client's saved images and banners.
app.get("/library", async (req, res) => {
  try {
    const c = safeClient(req.query.client);
    const [images, banners] = await Promise.all([
      listFiles(SCENES_BUCKET, `clients/${c}/images/`),
      listFiles(SCENES_BUCKET, `clients/${c}/banners/`)
    ]);
    const newestFirst = (a, b) => String(b.created).localeCompare(String(a.created));
    res.json({
      client: c,
      images: images.sort(newestFirst),
      banners: banners.sort(newestFirst)
    });
  } catch (e) {
    console.error("LIBRARY_ERROR:", e);
    res.status(500).json({ error: e.message || "Library failed" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on ${PORT}`);
});
