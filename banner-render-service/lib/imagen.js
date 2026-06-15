import { GoogleAuth } from "google-auth-library";

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"]
});

function dataUrlToBase64(dataUrl) {
  if (!dataUrl) return null;
  const m = String(dataUrl).match(/^data:[^;]+;base64,(.+)$/);
  return m ? m[1] : null;
}

export async function generateProductRecontext({
  project,
  location = "us-central1",
  model = "imagen-product-recontext-preview-06-30",
  prompt,
  products = [],
  sampleCount = 3,
  aspectRatio = "16:9"
}) {
  if (!project) throw new Error("project is required");

  const productImages = products
    .slice(0, 3)
    .map((p) => {
      const b64 = dataUrlToBase64(p.dataUrl || p.imageDataUrl);
      if (!b64) return null;
      return {
        image: { bytesBase64Encoded: b64 },
        productConfig: { productDescription: p.name || "product" }
      };
    })
    .filter(Boolean);

  if (!productImages.length) {
    throw new Error("product-recontext requires at least one product image");
  }

  const url =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${project}` +
    `/locations/${location}/publishers/google/models/${model}:predict`;

  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;

  const body = {
    instances: [{ prompt: prompt || "", productImages }],
    parameters: {
      sampleCount,
      aspectRatio,
      personGeneration: "allow_adult",
      safetySetting: "block_only_high"
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
    throw new Error(`Imagen recontext ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = await res.json();
  const preds = data.predictions || [];
  return preds
    .filter((p) => p.bytesBase64Encoded)
    .map((p) => Buffer.from(p.bytesBase64Encoded, "base64"));
}

export function buildRecontextPrompt({ targetGroup = "" }) {
  const audience = targetGroup ? ` aimed at ${targetGroup}` : "";
  return [
    `Premium pharmacy product banner photograph${audience}.`,
    "Place the product on a soft pastel marble surface with subtle natural lighting and shallow depth of field.",
    "Composition leaves clear copy space on the left side for headline text.",
    "Modern, clean, minimalistic, sophisticated retail aesthetic.",
    "No additional text, no logos, no watermarks, no people."
  ].join(" ");
}

export async function generateScenes({
  project,
  location = "us-central1",
  model = "imagen-3.0-fast-generate-001",
  prompt,
  sampleCount = 3,
  aspectRatio = "16:9",
  referenceImages = null
}) {
  if (!project) throw new Error("project is required");
  if (!prompt) throw new Error("prompt is required");

  const url =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${project}` +
    `/locations/${location}/publishers/google/models/${model}:predict`;

  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;

  const instance = { prompt };
  if (referenceImages && referenceImages.length) {
    instance.referenceImages = referenceImages;
  }

  const body = {
    instances: [instance],
    parameters: {
      sampleCount,
      aspectRatio,
      personGeneration: "allow_adult",
      safetySetting: "block_only_high",
      addWatermark: false,
      includeRaiReason: true
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
    throw new Error(`Imagen ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = await res.json();
  const preds = data.predictions || [];
  return preds
    .filter((p) => p.bytesBase64Encoded)
    .map((p) => Buffer.from(p.bytesBase64Encoded, "base64"));
}

export function buildSubjectReferences(products = [], maxRefs = 2) {
  return products
    .slice(0, maxRefs)
    .map((p, i) => {
      const b64 = dataUrlToBase64(p.dataUrl || p.imageDataUrl);
      if (!b64) return null;
      return {
        referenceType: "REFERENCE_TYPE_SUBJECT",
        referenceId: i + 1,
        referenceImage: { bytesBase64Encoded: b64 },
        subjectImageConfig: {
          subjectDescription: p.name || `product ${i + 1}`,
          subjectType: "SUBJECT_TYPE_PRODUCT"
        }
      };
    })
    .filter(Boolean);
}

export function buildSubjectPrompt({ products = [], targetGroup = "", maxRefs = 2 }) {
  const usable = products
    .filter((p) => p.dataUrl || p.imageDataUrl)
    .slice(0, maxRefs);

  if (!usable.length) return null;

  const refs = usable.map((_, i) => `[${i + 1}]`).join(" and ");
  const audience = targetGroup ? ` for ${targetGroup}` : "";

  return [
    `Professional pharmacy product advertising photography featuring ${refs}.`,
    "Soft natural lighting, pastel marble or seamless studio background, premium minimalistic composition.",
    `Pharmacy ad context${audience}.`,
    "Clean, modern, sophisticated, suitable for a banner ad background.",
    "Keep the products' labels and packaging exactly as shown in the references.",
    "No additional text, no logos, no watermarks, no people."
  ].join(" ");
}

export function buildScenePrompt({ products = [], targetGroup = "" }) {
  const productNames = products
    .map((p) => p.name)
    .filter(Boolean)
    .slice(0, 6)
    .join(", ");
  const audience = targetGroup ? ` for ${targetGroup}` : "";

  return [
    "Professional pharmacy product advertising photography.",
    "Soft natural lighting, marble or pastel background, premium minimalistic composition.",
    productNames
      ? `Subject context: pharmacy products such as ${productNames}${audience}.`
      : `Subject context: pharmacy supplements and vitamins${audience}.`,
    "Clean, modern, sophisticated, suitable for a banner ad background.",
    "No text, no logos, no watermarks, no people."
  ].join(" ");
}
