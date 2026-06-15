import { GoogleAuth } from "google-auth-library";
import { Storage } from "@google-cloud/storage";

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"]
});

const storage = new Storage();

function dataUrlParts(dataUrl) {
  const m = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  return m ? { mimeType: m[1], data: m[2] } : null;
}

function parseGcsUrl(url) {
  if (!url) return null;
  if (url.startsWith("gs://")) {
    const rest = url.slice(5);
    const slash = rest.indexOf("/");
    if (slash < 0) return null;
    return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
  }
  if (url.startsWith("https://storage.googleapis.com/")) {
    const rest = url.slice("https://storage.googleapis.com/".length);
    const slash = rest.indexOf("/");
    if (slash < 0) return null;
    return {
      bucket: rest.slice(0, slash),
      key: decodeURIComponent(rest.slice(slash + 1))
    };
  }
  return null;
}

let _compositionRefCache = null;
async function getCompositionReference() {
  if (_compositionRefCache !== null) return _compositionRefCache;
  const url = process.env.COMPOSITION_REFERENCE_URL;
  if (!url) {
    _compositionRefCache = false;
    return null;
  }
  const parsed = parseGcsUrl(url);
  if (!parsed) {
    console.warn(`Invalid COMPOSITION_REFERENCE_URL: ${url}`);
    _compositionRefCache = false;
    return null;
  }
  try {
    const [buf] = await storage
      .bucket(parsed.bucket)
      .file(parsed.key)
      .download();
    _compositionRefCache = {
      mimeType: "image/png",
      data: buf.toString("base64")
    };
    console.log(
      `Loaded composition reference from ${url} (${buf.length} bytes)`
    );
    return _compositionRefCache;
  } catch (e) {
    console.warn(`Failed to load composition reference: ${e.message}`);
    _compositionRefCache = false;
    return null;
  }
}

async function fetchUrlAsInlineData(url) {
  if (!url) return null;
  try {
    const parsed = parseGcsUrl(url);
    let buffer;
    if (parsed) {
      const [buf] = await storage.bucket(parsed.bucket).file(parsed.key).download();
      buffer = buf;
    } else {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`Failed to fetch style reference ${url}: ${res.status}`);
        return null;
      }
      const ab = await res.arrayBuffer();
      buffer = Buffer.from(ab);
    }
    return { mimeType: "image/png", data: buffer.toString("base64") };
  } catch (e) {
    console.warn(`fetchUrlAsInlineData(${url}) failed: ${e.message}`);
    return null;
  }
}

export async function generateImageWithProducts({
  project,
  location = "global",
  model = "gemini-3-pro-image-preview",
  prompt,
  products = [],
  aspectRatio = "16:9",
  imageSize = "2K",
  styleReferenceUrl = null,
  useCompositionRef = true
}) {
  if (!project) throw new Error("project is required");
  if (!prompt) throw new Error("prompt is required");

  const productParts = products
    .map((p) => {
      const parsed = dataUrlParts(p.dataUrl || p.imageDataUrl);
      if (!parsed) return null;
      return { inlineData: { mimeType: parsed.mimeType, data: parsed.data } };
    })
    .filter(Boolean);

  const compositionRef = await getCompositionReference();
  const styleRef = styleReferenceUrl ? await fetchUrlAsInlineData(styleReferenceUrl) : null;

  const url =
    `https://${location === "global" ? "aiplatform" : `${location}-aiplatform`}.googleapis.com/v1/projects/${project}` +
    `/locations/${location}/publishers/google/models/${model}:generateContent`;

  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;

  let textPrompt = prompt;
  if (styleRef) {
    textPrompt = [
      prompt,
      "",
      "═══ ADDITIONAL STYLE REFERENCE (last attached image after products) ═══",
      "An additional image is attached AFTER the client products. This is a STYLE REFERENCE from a previous version of this banner.",
      "Match the visual style of that reference IMAGE PRECISELY:",
      "- Same exact background color and saturation",
      "- Same lighting direction and intensity",
      "- Same overall mood and atmosphere",
      "- Same product surface and shadow style",
      "Do NOT copy the composition or product positions from the style reference — follow the COMPOSITION instructions above for the NEW aspect ratio. Only the LOOK (colors, lighting, mood) must match.",
      "Treat the style reference as a colour-palette and lighting-mood anchor; recreate the same vibe but in the new layout."
    ].join("\n");
  }

  const parts = [{ text: textPrompt }];
  if (useCompositionRef && compositionRef) {
    parts.push({ inlineData: compositionRef });
  }
  parts.push(...productParts);
  if (styleRef) {
    parts.push({ inlineData: styleRef });
  }

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio, imageSize }
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini Image ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const candidates = data.candidates || [];
  for (const c of candidates) {
    const cParts = c.content?.parts || [];
    for (const p of cParts) {
      if (p.inlineData?.data) {
        return Buffer.from(p.inlineData.data, "base64");
      }
    }
  }
  throw new Error("Gemini Image returned no image part");
}

// Edit an existing generated image with a text instruction (image-to-image).
export async function editImage({
  project,
  location = "global",
  model = "gemini-3-pro-image-preview",
  prompt,
  imageUrl = null,
  imageDataUrl = null,
  aspectRatio = "1:1",
  imageSize = "1K"
}) {
  if (!project) throw new Error("project is required");
  if (!prompt) throw new Error("edit prompt is required");

  let inline = null;
  if (imageDataUrl) {
    const parsed = dataUrlParts(imageDataUrl);
    if (parsed) inline = { mimeType: parsed.mimeType, data: parsed.data };
  } else if (imageUrl) {
    inline = await fetchUrlAsInlineData(imageUrl);
  }
  if (!inline) throw new Error("source image required");

  const url =
    `https://${location === "global" ? "aiplatform" : `${location}-aiplatform`}.googleapis.com/v1/projects/${project}` +
    `/locations/${location}/publishers/google/models/${model}:generateContent`;

  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;

  const editText = [
    "Edit the attached image according to this instruction and change ONLY what it asks — keep everything else identical:",
    prompt,
    "",
    "Preserve the product packaging EXACTLY (logo, label text, shape, colours). Keep the same overall composition, framing and product position unless the instruction explicitly asks to move it."
  ].join("\n");

  const body = {
    contents: [{ role: "user", parts: [{ text: editText }, { inlineData: inline }] }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio, imageSize }
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini edit ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  for (const c of data.candidates || []) {
    for (const p of c.content?.parts || []) {
      if (p.inlineData?.data) return Buffer.from(p.inlineData.data, "base64");
    }
  }
  throw new Error("Gemini edit returned no image part");
}

const COMPOSITION_GUIDANCE_BASE = [
  "INPUT IMAGES PROTOCOL — READ CAREFULLY BEFORE GENERATING:",
  "- The FIRST attached image is a LAYOUT REFERENCE ONLY. Use it EXCLUSIVELY to copy the spatial arrangement (stepped heights, soft shadows, surface they rest on). The products visible inside that reference DO NOT exist for this task — they are placeholders for the layout pose only.",
  "- ALL OTHER attached images are the CLIENT PRODUCTS. These are the ONLY products that may appear in the final scene. They must be copied 1-to-1 from the references: every label, every letter, every digit, every color, every brand mark on the packaging must match the client product images EXACTLY — pixel-perfect.",
  "ABSOLUTE RULES (any violation is a failure):",
  "- NEVER use, copy, or include any product from the FIRST (layout) reference image. Ignore ReviHair, Calcium, Selen, ProbioMax, Vitamin A+E, or anything else seen there. Those are NOT for this task.",
  "- NEVER invent, add, duplicate, or hallucinate any product that is not in the client product references.",
  "- The number of products in the final scene MUST exactly match the number of client product reference images attached after the layout reference. If 3 client products are attached, render exactly 3 products. If 4, render exactly 4. No extras.",
  "- The client products must be reproduced 1-to-1 from their reference photos. Do not redesign, restyle, recolor, retypeset, or modify their packaging in any way."
].join(" ");

const COMPOSITION_LAYOUT_HORIZONTAL = [
  "COMPOSITION (wide horizontal 21:9 / 16:9):",
  "- Cluster the client products tightly together in the CENTER-RIGHT region of the frame.",
  "- Leave the LEFT THIRD of the canvas as completely empty backdrop — reserved for headline text. No products, fragments, shadows, decor, or text in this area.",
  "- Stack products at varied stepped heights: one slightly elevated 'hero' product positioned behind, with the rest arranged in a front row resting on a clean surface.",
  "- Render soft realistic drop shadows beneath the products on the surface.",
  "- Keep ~5% empty backdrop on the right edge so products do not bleed off frame."
].join(" ");

const COMPOSITION_LAYOUT_VERTICAL = [
  "COMPOSITION (tall vertical 9:16 portrait — Stories / Reels):",
  "- Cluster the client products tightly together in the CENTER of the frame, roughly between 35% and 75% of the height (the middle band).",
  "- Leave the TOP ~30% of the canvas as completely empty backdrop — reserved for headline text. No products, fragments, shadows, decor, or text in the top area.",
  "- Leave the BOTTOM ~20% of the canvas as completely empty backdrop — reserved for CTA button and disclaimer text. No products there either.",
  "- Stack products at varied stepped heights: one slightly elevated 'hero' product positioned behind, with the rest arranged in a front row resting on a clean surface.",
  "- Render soft realistic drop shadows beneath the products on the surface.",
  "- Keep ~8% empty backdrop on both left and right edges so products do not bleed off frame.",
  "- DO NOT use a wide horizontal layout, two-half split, or left-text/right-products arrangement — this is a tall vertical canvas."
].join(" ");

const COMPOSITION_LAYOUT_SQUARE = [
  "COMPOSITION (square 1:1):",
  "- Cluster the client products tightly together in the BOTTOM-CENTER of the frame, occupying roughly the lower half (between 50% and 90% of the height).",
  "- Leave the TOP ~45-50% of the canvas as completely empty backdrop — reserved for headline, subheadline, logo, and CTA elements overlaid by the template. No products, fragments, shadows, decor, or text in the top area.",
  "- Stack products at varied stepped heights: one slightly elevated 'hero' product positioned behind, with the rest arranged in a front row resting on a clean surface.",
  "- Render soft realistic drop shadows beneath the products on the surface.",
  "- Keep ~5% empty backdrop on left, right, and bottom edges so products do not bleed off frame.",
  "- DO NOT use a wide horizontal layout or tall portrait layout — this is a square canvas."
].join(" ");

function compositionGuidance(aspectRatio) {
  let layout;
  if (aspectRatio === "9:16") layout = COMPOSITION_LAYOUT_VERTICAL;
  else if (aspectRatio === "1:1") layout = COMPOSITION_LAYOUT_SQUARE;
  else layout = COMPOSITION_LAYOUT_HORIZONTAL;
  return `${COMPOSITION_GUIDANCE_BASE} ${layout}`;
}

// Back-compat: default horizontal guidance for any code still referencing the old constant.
const COMPOSITION_GUIDANCE = compositionGuidance("21:9");

const POLISH_DIACRITICS = "ąćęłńóśźżĄĆĘŁŃÓŚŹŻ";

function diacriticWordsIn(str) {
  if (!str) return [];
  return String(str)
    .split(/\s+/)
    .filter((w) => [...w].some((c) => POLISH_DIACRITICS.includes(c)));
}

function buildDiacriticReminders(strings) {
  const lines = [];
  for (const [label, str] of Object.entries(strings)) {
    if (!str) continue;
    const words = diacriticWordsIn(str);
    if (!words.length) continue;
    lines.push(`• ${label}: in «${str}» — preserve diacritics in: ${words.map((w) => `"${w}"`).join(", ")}`);
  }
  return lines.length ? lines.join("\n") : "• (no Polish diacritics in this banner's copy)";
}

function layoutFor(aspectRatio) {
  switch (aspectRatio) {
    case "1:1":
      return [
        "Square banner. Three horizontal bands:",
        "• TOP ZONE (~25% height): big bold WHITE headline, left-aligned, 1-2 lines.",
        "• CENTER ZONE (~50% height): client products from inputs [3..N] clustered centrally with stepped heights, standing on a clean green surface with realistic drop shadows. Products are the visual focus, fully visible, no cropping.",
        "• BOTTOM ZONE (~25% height): WHITE subheadline (left-aligned, smaller), red CTA pill below it (left-aligned). Dr.Max+ logo pill in bottom-left corner. Tiny WHITE legal text along the very bottom.",
        "• TOP-RIGHT CORNER: round white promo badge."
      ].join(" ");
    case "9:16":
      return [
        "Tall vertical 9:16 banner (Stories / Reels style). Stack from top to bottom:",
        "• TOP (~18% height): big bold WHITE headline, centered or left-aligned, can span 2-3 lines.",
        "• HERO PRODUCT ZONE (~45% height): client products from inputs [3..N] arranged as a tight central cluster, stepped heights, standing on green surface with realistic shadows. This is the visual hero of the banner — products fully visible and prominent.",
        "• BELOW PRODUCTS (~12% height): WHITE subheadline, centered, smaller weight.",
        "• CTA ZONE (~15% height): red CTA pill, centered horizontally, prominent.",
        "• FOOTER (~10% height): Dr.Max+ logo pill at left-bottom; tiny WHITE legal text along the very bottom edge.",
        "• TOP-RIGHT CORNER: round white promo badge."
      ].join(" ");
    case "21:9":
    case "16:9":
    default:
      return [
        "Wide horizontal cinematic banner. Two vertical halves:",
        "• LEFT HALF (~60% of width, text area): completely clean green backdrop, NO products. Stacked vertically from top: big bold WHITE headline (1-2 lines), then medium WHITE subheadline directly below, then red CTA pill button, then in the bottom-left corner the small Dr.Max+ logo pill plus tiny WHITE legal text running along the bottom edge.",
        "• RIGHT HALF (~40% of width, visual area): client products from inputs [3..N] clustered tightly with stepped heights, standing on the green surface with realistic shadows. All products fully visible, NOT cropped at edges.",
        "• UPPER-RIGHT CORNER: round white promo badge sticker."
      ].join(" ");
  }
}

export function buildFullBannerPrompt({ aspectRatio = "21:9", copy = {} } = {}) {
  const headline = copy.headline || "";
  const subheadline = copy.subheadline || "";
  const cta = copy.cta || "";
  const promoTop = copy.promo || "";
  const promoBottom = copy.promoSubtext || "przy zakupie 2 produktów";
  const legal = copy.legal || "";

  const diacriticReminders = buildDiacriticReminders({
    HEADLINE: headline,
    SUBHEADLINE: subheadline,
    CTA: cta,
    "PROMO line 1": promoTop,
    "PROMO line 2": promoBottom,
    LEGAL: legal
  });

  const layoutZones = layoutFor(aspectRatio);

  return [
    "FINAL FINISHED Dr.Max PHARMACY RETAIL BANNER — render as a complete, ready-to-publish commercial image. This is a deliverable for production, not a draft or sketch.",
    "",
    "═══ ATTACHED IMAGES (IN ORDER) ═══",
    "[1] COMPOSITION LAYOUT REFERENCE — use ONLY for the spatial pattern of products (tight cluster on a clean surface, stepped heights, soft realistic drop shadows, scale relationships). The PRODUCTS inside this reference image are NOT for this task — completely ignore their names, brands, packaging, and any text on them.",
    "[2] Dr.Max+ LOGO — reproduce this logo EXACTLY in the banner's logo pill. Do not redesign the letters, the red color, the green plus sign, the weight, or the proportions. Treat this image as the absolute source-of-truth for the logo.",
    "[3..N] CLIENT PRODUCTS — the ONLY products allowed in the final banner. Each one must be reproduced PIXEL-PERFECT: every label word, every digit, every color block, every brand mark on the packaging must match its source image exactly.",
    "",
    "═══ OUTPUT SPECS ═══",
    `• Aspect ratio: ${aspectRatio}.`,
    "• Background: solid uniform Dr.Max BRAND GREEN — saturated mid-green (~#3E8B2C, same green as the composition reference). Completely flat: no patterns, no gradients beyond very subtle ambient light fall-off, no texture, no decoration.",
    "• Style: photorealistic studio product photography. Soft directional key light from upper-left. Realistic subtle drop shadows on the green surface beneath products and elements.",
    "",
    "═══ TYPOGRAPHY (APPLIES TO ALL TEXT IN THE BANNER) ═══",
    "• Font family: modern heavy geometric sans-serif — Proxima Nova / Montserrat aesthetic. Clean lines, slightly condensed letterforms, no serifs, no decorative or hand-drawn styles.",
    "• Headline: extra-bold / black weight.",
    "• Subheadline: regular or medium weight.",
    "• CTA & promo text: bold.",
    "• Legal: regular, very small but readable.",
    "• Text color: pure WHITE (#FFFFFF) for headline, subheadline, CTA label, and legal. DARK near-black (#1A1A1A) for the text inside the promo badge.",
    "• Text rendering must be PERFECTLY SHARP — no depth-of-field blur, no motion blur, no painterly softness. Letters fully legible.",
    "",
    "═══ ELEMENT FORMS (CRITICAL) ═══",
    "• DR.MAX+ LOGO PILL: a small WHITE rounded-pill shape with a slight realistic drop shadow. Inside it, the Dr.Max+ logo reproduced pixel-perfect from input image [2] (red 'Dr.Max' word with a green plus sign — exactly as in the source).",
    "• CTA BUTTON: a rounded pill (capsule) shape filled with Dr.Max RED (#E30613). White bold text label centered inside. Slight realistic drop shadow beneath. No outlines, no gradients, no glow.",
    "• PROMO BADGE: a white rounded sticker shape (oval / tear-drop), slight realistic drop shadow. Two lines of DARK text stacked centered inside — top line larger and bolder, bottom line smaller.",
    "",
    "═══ LAYOUT ═══",
    layoutZones,
    "",
    "═══ TEXT CONTENT — REPRODUCE EXACTLY, CHARACTER FOR CHARACTER ═══",
    "The following Polish strings must appear in the banner exactly as written. Do not translate, paraphrase, shorten, or substitute any letter.",
    `• HEADLINE: «${headline}»`,
    `• SUBHEADLINE: «${subheadline}»`,
    `• CTA: «${cta}»`,
    `• PROMO top line: «${promoTop}»`,
    `• PROMO bottom line: «${promoBottom}»`,
    `• LEGAL: «${legal}»`,
    "",
    "═══ POLISH DIACRITIC VERIFICATION — RE-CHECK BEFORE RENDERING ═══",
    "Polish uses ą ć ę ł ń ó ś ź ż (and their capitals). Latin-only substitutes are WRONG. For each word that contains a diacritic, render that diacritic precisely:",
    diacriticReminders,
    "",
    "═══ ABSOLUTE STRICT RULES — VIOLATION = FAILURE ═══",
    "1. Polish text uses proper diacritics. Never substitute with latin-only forms.",
    "2. The Dr.Max+ logo is pixel-perfect from input [2]. No redesign of letters, colors, plus sign, or proportions.",
    "3. Client products are pixel-perfect from inputs [3..N]. No redesign, no recolor, no substitution of labels.",
    "4. The number of products in the scene EXACTLY equals the number of client product images attached. No extras, no duplicates, no missing.",
    "5. NO people, NO hands, NO body parts, NO additional text beyond what is specified, NO watermarks, NO hashtags, NO Instagram-style frames, NO decorative borders, NO extra graphic elements, NO weather effects.",
    "6. The banner is a polished commercial deliverable — pristine, clean, professional. No rough sketches, no painterly artifacts."
  ].join("\n");
}

export async function generateFullBanner({
  project,
  location = "global",
  model = "gemini-3-pro-image-preview",
  products = [],
  copy = {},
  logoDataUrl = "",
  aspectRatio = "21:9",
  imageSize = "2K"
}) {
  if (!project) throw new Error("project is required");

  const prompt = buildFullBannerPrompt({ aspectRatio, copy });

  const productParts = products
    .map((p) => {
      const parsed = dataUrlParts(p.dataUrl || p.imageDataUrl);
      if (!parsed) return null;
      return { inlineData: { mimeType: parsed.mimeType, data: parsed.data } };
    })
    .filter(Boolean);

  const compositionRef = await getCompositionReference();

  const logoParsed = dataUrlParts(logoDataUrl);
  const logoPart = logoParsed
    ? { inlineData: { mimeType: logoParsed.mimeType, data: logoParsed.data } }
    : null;

  const url =
    `https://${location === "global" ? "aiplatform" : `${location}-aiplatform`}.googleapis.com/v1/projects/${project}` +
    `/locations/${location}/publishers/google/models/${model}:generateContent`;

  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;

  const parts = [{ text: prompt }];
  if (compositionRef) parts.push({ inlineData: compositionRef });
  if (logoPart) parts.push(logoPart);
  parts.push(...productParts);

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio, imageSize }
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini Image (full banner) ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const candidates = data.candidates || [];
  for (const c of candidates) {
    const cParts = c.content?.parts || [];
    for (const p of cParts) {
      if (p.inlineData?.data) {
        return Buffer.from(p.inlineData.data, "base64");
      }
    }
  }
  throw new Error("Gemini Image (full banner) returned no image part");
}

export function getScenePrompts(aspectRatio = "21:9") {
  const composition = compositionGuidance(aspectRatio);
  const isVertical = aspectRatio === "9:16";
  const isSquare = aspectRatio === "1:1";
  const orientationDescriptor = isVertical
    ? "Tall vertical product advertising photograph (9:16 portrait ratio, Stories / Reels format)"
    : isSquare
      ? "Square product advertising photograph (1:1 ratio, social-media post format)"
      : "Wide horizontal editorial product advertising photograph (21:9 cinematic ratio)";
  const orientationDescriptorPremium = isVertical
    ? "Tall vertical premium product advertising photograph (9:16 portrait ratio)"
    : isSquare
      ? "Square premium product advertising photograph (1:1 ratio)"
      : "Wide horizontal premium product advertising photograph (21:9 cinematic ratio)";

  return [
    {
      id: "studio_color",
      text: [
        `${orientationDescriptor} in a professional photo studio.`,
        "Bold solid backdrop in a single saturated color (coral, dusty rose, mint, butter yellow, or warm beige — pick one).",
        "Soft directional studio lighting, gentle drop shadows, e-commerce magazine style, photorealistic.",
        composition,
        "Render the product labels with sharp focus, high resolution, and clearly readable text.",
        "STRICT: include ONLY the exact products from the supplied product reference images (not the composition reference). Do NOT add, duplicate, invent, hallucinate, or imagine any additional products, boxes, bottles, tubes, blister packs, or packaging.",
        "No extra text overlays, no logos, no watermarks, no people, no hands, no decor."
      ].join(" ")
    },
    {
      id: "dark_moody",
      text: [
        `${orientationDescriptorPremium} on a moody dark backdrop.`,
        "Deep charcoal or midnight-blue seamless gradient background, perfectly uniform with no patterns, no objects, no text.",
        "Low-key dramatic lighting with a single soft rim light, deep shadows, sophisticated luxury feel, photorealistic.",
        composition,
        "Render the product labels with sharp focus, high resolution, and clearly readable text.",
        "STRICT: include ONLY the exact products from the supplied product reference images (not the composition reference). Do NOT add, duplicate, invent, hallucinate, or imagine any additional products or packaging.",
        "No extra text overlays, no logos, no watermarks, no people, no hands, no decor."
      ].join(" ")
    },
    {
      id: "brand_green",
      text: [
        `${orientationDescriptorPremium} on a solid saturated brand-green seamless backdrop, matching the green tone of the composition layout reference image exactly.`,
        "Soft directional studio lighting, gentle realistic drop shadows, polished pharmacy-retail look, photorealistic.",
        composition,
        "Render the product labels with sharp focus, high resolution, and clearly readable text.",
        "STRICT: include ONLY the exact products from the supplied product reference images (not the composition reference). Do NOT add, duplicate, invent, hallucinate, or imagine any additional products or packaging.",
        "No extra text overlays, no logos, no watermarks, no people, no hands, no decor."
      ].join(" ")
    }
  ];
}

// Back-compat for any callers that still import the static horizontal prompts.
export const SCENE_PROMPTS = getScenePrompts("21:9");
