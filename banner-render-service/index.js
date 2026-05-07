import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { VertexAI } from "@google-cloud/vertexai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

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

app.get("/get-scenes", async (req, res) => {
  try {
    const bucketName = "banner-automation-489120-creative-assets";

    const scenes = [
      `https://storage.googleapis.com/${bucketName}/hf_20260311_002407_390e28fd-e61e-424b-b7cf-1a64c8311e02.png`,
      `https://storage.googleapis.com/${bucketName}/hf_20260311_001156_0bed7eed-e0dc-45ac-bb55-fb08be2c5aea (1).png`,
      `https://storage.googleapis.com/${bucketName}/hf_20260310_234033_fbcae989-fa25-48aa-bc6e-d3cba88852d8.png`
    ];

    res.json({ scenes });
  } catch (err) {
    console.error("GET_SCENES_ERROR:", err);
    res.status(500).json({ error: "Failed to load scenes" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on ${PORT}`);
});
