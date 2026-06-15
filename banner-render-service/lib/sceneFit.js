import sharp from "sharp";
import { Storage } from "@google-cloud/storage";

const storage = new Storage();
const bufferCache = new Map();
const fittedCache = new Map();

function parseSceneUrl(url) {
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

async function loadBuffer(url) {
  if (bufferCache.has(url)) return bufferCache.get(url);
  let buf;
  const parsed = parseSceneUrl(url);
  if (parsed) {
    const [b] = await storage
      .bucket(parsed.bucket)
      .file(parsed.key)
      .download();
    buf = b;
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch scene ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  bufferCache.set(url, buf);
  return buf;
}

export async function fitSceneToBanner(
  url,
  targetW,
  targetH,
  { anchor = "center", scale = 1, x = 0.5, y = 0.5 } = {}
) {
  if (!url || !targetW || !targetH) return null;
  const tf = Number(scale) !== 1 || Number(x) !== 0.5 || Number(y) !== 0.5;
  const cacheKey = `${url}|${targetW}x${targetH}|${anchor}|${scale}|${x}|${y}`;
  if (fittedCache.has(cacheKey)) return fittedCache.get(cacheKey);

  try {
    const buf = await loadBuffer(url);
    const meta = await sharp(buf).metadata();
    const srcW = meta.width;
    const srcH = meta.height;
    const srcAspect = srcW / srcH;
    const tgtAspect = targetW / targetH;

    let out = buf;

    // Zoom + pan: crop a banner-aspect region of the source, then resize to target.
    if (tf) {
      const s = Math.max(1, Math.min(Number(scale) || 1, 4));
      let cw, ch;
      if (srcAspect > tgtAspect) { ch = srcH; cw = Math.round(srcH * tgtAspect); }
      else { cw = srcW; ch = Math.round(srcW / tgtAspect); }
      cw = Math.max(1, Math.min(Math.round(cw / s), srcW));
      ch = Math.max(1, Math.min(Math.round(ch / s), srcH));
      const px = Math.max(0, Math.min(1, Number(x)));
      const py = Math.max(0, Math.min(1, Number(y)));
      const left = Math.round((srcW - cw) * px);
      const top = Math.round((srcH - ch) * py);
      out = await sharp(buf).extract({ left, top, width: cw, height: ch }).resize(targetW, targetH).png().toBuffer();
      const dataUrl = `data:image/png;base64,${out.toString("base64")}`;
      fittedCache.set(cacheKey, dataUrl);
      return dataUrl;
    }

    if (Math.abs(srcAspect - tgtAspect) > 0.005) {
      const extend = {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        extendWith: "copy"
      };
      if (srcAspect < tgtAspect) {
        const newW = Math.ceil(srcH * tgtAspect);
        const extra = newW - srcW;
        if (anchor === "right") {
          extend.left = extra;
          extend.right = 0;
        } else if (anchor === "left") {
          extend.left = 0;
          extend.right = extra;
        } else {
          extend.left = Math.floor(extra / 2);
          extend.right = extra - extend.left;
        }
      } else {
        const newH = Math.ceil(srcW / tgtAspect);
        const extra = newH - srcH;
        extend.top = Math.floor(extra / 2);
        extend.bottom = extra - extend.top;
      }
      out = await sharp(buf).extend(extend).png().toBuffer();
    }

    const dataUrl = `data:image/png;base64,${out.toString("base64")}`;
    fittedCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch (e) {
    console.warn(`fitSceneToBanner failed for ${url}: ${e.message}`);
    return null;
  }
}
