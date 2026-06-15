import sharp from "sharp";

export async function fitToCanvasWithEdgePad({
  sceneBuffer,
  targetWidth,
  targetHeight
}) {
  const meta = await sharp(sceneBuffer).metadata();
  const srcW = meta.width;
  const srcH = meta.height;

  const scale = targetHeight / srcH;
  const innerW = Math.round(srcW * scale);

  if (innerW >= targetWidth) {
    return sharp(sceneBuffer)
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: "cover",
        position: "center"
      })
      .png()
      .toBuffer();
  }

  const resized = await sharp(sceneBuffer)
    .resize({ width: innerW, height: targetHeight, fit: "fill" })
    .png()
    .toBuffer();

  const offsetX = Math.round((targetWidth - innerW) / 2);
  const rightMargin = targetWidth - offsetX - innerW;

  const leftStrip = await sharp(resized)
    .extract({
      left: 0,
      top: 0,
      width: Math.max(1, Math.min(4, innerW)),
      height: targetHeight
    })
    .resize({ width: Math.max(1, offsetX), height: targetHeight, fit: "fill" })
    .blur(40)
    .png()
    .toBuffer();

  const rightStrip = await sharp(resized)
    .extract({
      left: innerW - Math.max(1, Math.min(4, innerW)),
      top: 0,
      width: Math.max(1, Math.min(4, innerW)),
      height: targetHeight
    })
    .resize({
      width: Math.max(1, rightMargin),
      height: targetHeight,
      fit: "fill"
    })
    .blur(40)
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: targetWidth,
      height: targetHeight,
      channels: 3,
      background: { r: 240, g: 240, b: 240 }
    }
  })
    .composite([
      { input: leftStrip, left: 0, top: 0 },
      { input: resized, left: offsetX, top: 0 },
      { input: rightStrip, left: offsetX + innerW, top: 0 }
    ])
    .png()
    .toBuffer();
}
