import sharp from "sharp";

function dataUrlToBuffer(dataUrl) {
  if (!dataUrl) return null;
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return Buffer.from(m[2], "base64");
}

export async function compositeProductsOntoScene({
  sceneBuffer,
  products = [],
  aspectRatio = "16:9"
}) {
  const bg = sharp(sceneBuffer);
  const meta = await bg.metadata();
  const W = meta.width;
  const H = meta.height;

  const productBuffers = products
    .map((p) => dataUrlToBuffer(p.dataUrl || p.imageDataUrl))
    .filter(Boolean)
    .slice(0, 4);

  if (!productBuffers.length) {
    return sceneBuffer;
  }

  const isVertical = aspectRatio === "9:16";

  const slotH = Math.round(isVertical ? H * 0.35 : H * 0.7);
  const targetH = slotH;

  const resized = await Promise.all(
    productBuffers.map((b) =>
      sharp(b)
        .resize({ height: targetH, fit: "inside", withoutEnlargement: false })
        .png()
        .toBuffer({ resolveWithObject: true })
    )
  );

  const totalW = resized.reduce((sum, r) => sum + r.info.width, 0);
  const gap = Math.round(targetH * 0.05);
  const blockW = totalW + gap * (resized.length - 1);

  let startX;
  let startY;

  if (isVertical) {
    startX = Math.round((W - blockW) / 2);
    startY = Math.round(H * 0.32);
  } else {
    startX = Math.round(W * 0.55);
    startY = Math.round((H - targetH) / 2);
    if (startX + blockW > W - 40) {
      startX = Math.max(40, W - blockW - 40);
    }
  }

  const overlays = [];
  let x = startX;
  for (const r of resized) {
    overlays.push({
      input: r.data,
      left: Math.round(x),
      top: Math.round(startY + (targetH - r.info.height) / 2)
    });
    x += r.info.width + gap;
  }

  return sharp(sceneBuffer).composite(overlays).png().toBuffer();
}
