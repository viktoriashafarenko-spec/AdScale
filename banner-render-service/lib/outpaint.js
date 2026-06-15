import { GoogleAuth } from "google-auth-library";
import sharp from "sharp";

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"]
});

async function preparePadded({ sceneBuffer, targetWidth, targetHeight }) {
  const meta = await sharp(sceneBuffer).metadata();
  const srcW = meta.width;
  const srcH = meta.height;

  const scale = targetHeight / srcH;
  const innerW = Math.round(srcW * scale);

  let usedW = innerW;
  let resized;
  if (innerW > targetWidth) {
    usedW = targetWidth;
    resized = await sharp(sceneBuffer)
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: "cover",
        position: "center"
      })
      .png()
      .toBuffer();
  } else {
    resized = await sharp(sceneBuffer)
      .resize({ width: innerW, height: targetHeight, fit: "fill" })
      .png()
      .toBuffer();
  }

  const offsetX = Math.round((targetWidth - usedW) / 2);
  const rightMargin = targetWidth - offsetX - usedW;

  const leftStrip = await sharp(resized)
    .extract({ left: 0, top: 0, width: Math.min(2, usedW), height: targetHeight })
    .resize({ width: offsetX, height: targetHeight, fit: "fill" })
    .blur(20)
    .png()
    .toBuffer();

  const rightStrip = await sharp(resized)
    .extract({
      left: usedW - Math.min(2, usedW),
      top: 0,
      width: Math.min(2, usedW),
      height: targetHeight
    })
    .resize({ width: rightMargin, height: targetHeight, fit: "fill" })
    .blur(20)
    .png()
    .toBuffer();

  const padded = await sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 3,
      background: { r: 128, g: 128, b: 128 }
    }
  })
    .composite([
      { input: leftStrip, left: 0, top: 0 },
      { input: resized, left: offsetX, top: 0 },
      { input: rightStrip, left: offsetX + usedW, top: 0 }
    ])
    .png()
    .toBuffer();

  const maskSvg = `<svg width="${targetWidth}" height="${targetHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${targetWidth}" height="${targetHeight}" fill="white"/>
    <rect x="${offsetX}" y="0" width="${usedW}" height="${targetHeight}" fill="black"/>
  </svg>`;
  const mask = await sharp(Buffer.from(maskSvg)).png().toBuffer();

  return { padded, mask, offsetX, innerW: usedW };
}

export async function outpaintToCanvas({
  project,
  location = "us-central1",
  model = "imagen-3.0-capability-001",
  sceneBuffer,
  targetWidth,
  targetHeight,
  prompt = "Seamlessly extend the existing scene outward to the left and right edges of the frame. Match the existing surface, colors, lighting, depth of field, and overall composition. No new products, no text, no logos."
}) {
  const { padded, mask } = await preparePadded({
    sceneBuffer,
    targetWidth,
    targetHeight
  });

  const url =
    `https://${location}-aiplatform.googleapis.com/v1/projects/${project}` +
    `/locations/${location}/publishers/google/models/${model}:predict`;

  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;

  const body = {
    instances: [
      {
        prompt,
        referenceImages: [
          {
            referenceType: "REFERENCE_TYPE_RAW",
            referenceId: 1,
            referenceImage: { bytesBase64Encoded: padded.toString("base64") }
          },
          {
            referenceType: "REFERENCE_TYPE_MASK",
            referenceId: 2,
            referenceImage: { bytesBase64Encoded: mask.toString("base64") },
            maskImageConfig: {
              maskMode: "MASK_MODE_USER_PROVIDED",
              dilation: 0.01
            }
          }
        ]
      }
    ],
    parameters: {
      editMode: "EDIT_MODE_OUTPAINT",
      editConfig: { baseSteps: 35 },
      sampleCount: 1
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
    throw new Error(`Imagen outpaint ${res.status}: ${text.slice(0, 400)}`);
  }

  const data = await res.json();
  const preds = data.predictions || [];
  const first = preds.find((p) => p.bytesBase64Encoded);
  if (!first) throw new Error("Imagen outpaint returned no image");
  return Buffer.from(first.bytesBase64Encoded, "base64");
}
