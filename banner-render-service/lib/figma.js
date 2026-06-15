const FIGMA_API = "https://api.figma.com/v1";

async function figma(path, token) {
  const res = await fetch(`${FIGMA_API}${path}`, {
    headers: { "X-Figma-Token": token }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Figma ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function rgbaToCss(color, opacity = 1) {
  if (!color) return "transparent";
  const r = Math.round((color.r ?? 0) * 255);
  const g = Math.round((color.g ?? 0) * 255);
  const b = Math.round((color.b ?? 0) * 255);
  const a = (color.a ?? 1) * opacity;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function fillToCss(fills) {
  if (!Array.isArray(fills) || !fills.length) return null;
  const fill = fills.find((f) => f.visible !== false);
  if (!fill) return null;
  if (fill.type === "SOLID") {
    return rgbaToCss(fill.color, fill.opacity ?? 1);
  }
  return null;
}

function textStyleToCss(node) {
  const s = node.style || {};
  const color = fillToCss(node.fills) || "#000";
  const align = (s.textAlignHorizontal || "LEFT").toLowerCase();
  return {
    fontFamily: s.fontFamily || "Proxima Nova",
    fontWeight: s.fontWeight || 400,
    fontSize: s.fontSize || 16,
    lineHeight: s.lineHeightPx ? `${s.lineHeightPx}px` : "normal",
    letterSpacing: s.letterSpacing ? `${s.letterSpacing}px` : "normal",
    color,
    textAlign: align === "justified" ? "justify" : align,
    verticalAlign: (s.textAlignVertical || "TOP").toLowerCase()
  };
}

function relBox(node, frame) {
  const a = node.absoluteBoundingBox || {};
  const f = frame.absoluteBoundingBox || {};
  return {
    x: (a.x || 0) - (f.x || 0),
    y: (a.y || 0) - (f.y || 0),
    w: a.width || 0,
    h: a.height || 0
  };
}

function findByName(node, name) {
  if (node.name === name) return node;
  for (const child of node.children || []) {
    const found = findByName(child, name);
    if (found) return found;
  }
  return null;
}

function findFirstTextChild(node) {
  if (node.type === "TEXT") return node;
  for (const child of node.children || []) {
    const found = findFirstTextChild(child);
    if (found) return found;
  }
  return null;
}

const SLOT_ALIASES = {
  headline: ["headline"],
  subheadline: ["subheadline", "sybheadline", "xx"],
  promo: ["promo", "promo copy"],
  promoBox: ["promo box", "promo_box", "promobox"],
  cta: ["cta"],
  legal: ["legal"],
  logo: ["logo"],
  background: ["background"]
};

function findSlot(frame, slotKey) {
  for (const alias of SLOT_ALIASES[slotKey] || [slotKey]) {
    const node = findByName(frame, alias);
    if (node) return node;
  }
  return null;
}

export async function fetchFrameDetails(fileKey, frameIds, token) {
  const ids = frameIds.join(",");
  const data = await figma(`/files/${fileKey}/nodes?ids=${ids}`, token);
  return frameIds
    .map((id) => data.nodes?.[id]?.document)
    .filter(Boolean);
}

export async function exportNodes(fileKey, ids, token, scale = 1) {
  if (!ids.length) return {};
  const idsParam = ids.join(",");
  const data = await figma(
    `/images/${fileKey}?ids=${idsParam}&format=png&scale=${scale}`,
    token
  );
  return data.images || {};
}

export async function fetchImageRefs(fileKey, token) {
  const data = await figma(`/files/${fileKey}/images`, token);
  return data.meta?.images || {};
}

export function buildManifest(frame) {
  const w = frame.absoluteBoundingBox?.width || 0;
  const h = frame.absoluteBoundingBox?.height || 0;

  const slots = {};
  for (const key of ["headline", "subheadline", "promo", "legal"]) {
    const node = findSlot(frame, key);
    if (!node || node.type !== "TEXT") continue;
    slots[key] = {
      type: "text",
      box: relBox(node, frame),
      style: textStyleToCss(node),
      placeholder: node.characters || ""
    };
  }

  const ctaFrame = findSlot(frame, "cta");
  if (ctaFrame) {
    const innerText = findFirstTextChild(ctaFrame);
    const ctaBox = relBox(ctaFrame, frame);
    const cornerRadius =
      ctaFrame.cornerRadius ??
      (Array.isArray(ctaFrame.rectangleCornerRadii)
        ? Math.max(...ctaFrame.rectangleCornerRadii)
        : Math.min(ctaBox.w, ctaBox.h) / 2);
    slots.cta = {
      type: "button",
      box: ctaBox,
      bg: fillToCss(ctaFrame.fills) || "#e30613",
      cornerRadius,
      style: innerText ? textStyleToCss(innerText) : {
        fontFamily: "Proxima Nova",
        fontWeight: 700,
        fontSize: 24,
        color: "#fff",
        textAlign: "center"
      },
      placeholder: innerText?.characters || "sprawdź"
    };
  }

  const promoBox = findSlot(frame, "promoBox");
  if (promoBox) {
    const pbBox = relBox(promoBox, frame);
    const pbRadius =
      promoBox.cornerRadius ??
      (Array.isArray(promoBox.rectangleCornerRadii)
        ? Math.max(...promoBox.rectangleCornerRadii)
        : 0);
    slots.promoBox = {
      type: "shape",
      box: pbBox,
      bg: fillToCss(promoBox.fills) || "#ffffff",
      cornerRadius: pbRadius
    };
  }

  const logo = findSlot(frame, "logo");
  if (logo) {
    slots.logo = {
      type: "image",
      box: relBox(logo, frame)
    };
  }

  const background = findSlot(frame, "background");
  const backgroundExportId =
    background && background.visible !== false ? background.id : null;
  const backgroundBox = background ? relBox(background, frame) : null;

  return {
    id: frame.id,
    name: frame.name,
    width: w,
    height: h,
    slots,
    background: backgroundExportId
      ? { exportId: backgroundExportId, box: backgroundBox }
      : null,
    rawFrame: frame
  };
}
