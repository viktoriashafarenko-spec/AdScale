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
    .map(
      ([k, v]) =>
        `${k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}:${v}`
    )
    .join(";");
}

function rgbaToCss(color, opacity = 1) {
  if (!color) return "transparent";
  const r = Math.round((color.r ?? 0) * 255);
  const g = Math.round((color.g ?? 0) * 255);
  const b = Math.round((color.b ?? 0) * 255);
  const a = (color.a ?? 1) * opacity;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function gradientCss(fill) {
  const stops = (fill.gradientStops || [])
    .map((s) => `${rgbaToCss(s.color)} ${(s.position * 100).toFixed(2)}%`)
    .join(", ");
  if (!stops) return null;
  if (fill.type === "GRADIENT_LINEAR") {
    return `linear-gradient(180deg, ${stops})`;
  }
  if (fill.type === "GRADIENT_RADIAL") {
    return `radial-gradient(circle, ${stops})`;
  }
  return null;
}

function pickVisibleFill(fills) {
  if (!Array.isArray(fills)) return null;
  return fills.find((f) => f.visible !== false);
}

function fillToBackground(fills, imageRefs) {
  const fill = pickVisibleFill(fills);
  if (!fill) return null;
  if (fill.type === "SOLID") {
    return { color: rgbaToCss(fill.color, fill.opacity ?? 1) };
  }
  if (fill.type === "IMAGE") {
    const url = imageRefs[fill.imageRef];
    if (!url) return null;
    return { image: url };
  }
  const grad = gradientCss(fill);
  if (grad) return { color: grad };
  return null;
}

function textStyleObj(node) {
  const s = node.style || {};
  const fill = pickVisibleFill(node.fills);
  const color = fill?.type === "SOLID" ? rgbaToCss(fill.color, fill.opacity ?? 1) : "#000";
  const align = (s.textAlignHorizontal || "LEFT").toLowerCase();
  const valign = (s.textAlignVertical || "TOP").toLowerCase();
  // Discount (promo) renders on a SINGLE line and the fit-pass shrinks it to
  // fit the badge width — so "do -20%" stays one tidy line instead of wrapping.
  const isPromo = (node.name || "").toLowerCase() === "promo";
  return {
    fontFamily: `'Montserrat', sans-serif`,
    fontWeight: s.fontWeight || 400,
    fontSize: s.fontSize ? `${s.fontSize}px` : "16px",
    lineHeight: s.lineHeightPx ? `${s.lineHeightPx}px` : "normal",
    letterSpacing: s.letterSpacing ? `${s.letterSpacing}px` : "normal",
    color,
    textAlign: align === "justified" ? "justify" : align,
    display: "flex",
    alignItems:
      valign === "center"
        ? "center"
        : valign === "bottom"
        ? "flex-end"
        : "flex-start",
    overflow: "hidden",
    whiteSpace: isPromo ? "nowrap" : "pre-wrap",
    wordBreak: isPromo ? "keep-all" : "break-word"
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

function effectsToCss(effects) {
  const filters = [];
  const shadows = [];
  for (const e of effects || []) {
    if (e.visible === false) continue;
    if (e.type === "LAYER_BLUR") {
      filters.push(`blur(${e.radius || 0}px)`);
    } else if (e.type === "DROP_SHADOW") {
      const off = e.offset || { x: 0, y: 0 };
      shadows.push(
        `${off.x || 0}px ${off.y || 0}px ${e.radius || 0}px ${rgbaToCss(e.color)}`
      );
    }
  }
  const out = {};
  if (filters.length) out.filter = filters.join(" ");
  if (shadows.length) out.boxShadow = shadows.join(", ");
  return out;
}

function cornerRadiusCss(node) {
  if (typeof node.cornerRadius === "number") {
    return `${node.cornerRadius}px`;
  }
  if (Array.isArray(node.rectangleCornerRadii)) {
    const [tl, tr, br, bl] = node.rectangleCornerRadii;
    return `${tl}px ${tr}px ${br}px ${bl}px`;
  }
  return null;
}

const COPY_SLOTS = {
  headline: "headline",
  subheadline: "subheadline",
  sybheadline: "subheadline",
  xx: "subheadline",
  promo: "promo",
  "promo copy": "promo",
  badge: "badge",
  "badge text": "badge",
  legal: "legal"
};

const SLOT_NAME_TO_KEY = {
  headline: "headline",
  subheadline: "subheadline",
  sybheadline: "subheadline",
  xx: "subheadline",
  promo: "promo",
  "promo copy": "promo",
  badge: "badge",
  "badge text": "badge",
  legal: "legal",
  cta: "cta",
  logo: "logo",
  "promo box": "promoBox",
  promo_box: "promoBox",
  promobox: "promoBox"
};

function resolveSlotKey(name) {
  return SLOT_NAME_TO_KEY[(name || "").toLowerCase()] || null;
}

// ─── Auto Layout helpers ─────────────────────────────────────────

function isAutoLayout(node) {
  return node && (node.layoutMode === "HORIZONTAL" || node.layoutMode === "VERTICAL");
}

function autoLayoutContainerStyles(node) {
  if (!isAutoLayout(node)) return {};

  const styles = {
    display: "flex",
    flexDirection: node.layoutMode === "HORIZONTAL" ? "row" : "column",
    gap: `${node.itemSpacing || 0}px`,
    paddingTop: `${node.paddingTop || 0}px`,
    paddingRight: `${node.paddingRight || 0}px`,
    paddingBottom: `${node.paddingBottom || 0}px`,
    paddingLeft: `${node.paddingLeft || 0}px`,
    boxSizing: "border-box"
  };

  const justifyMap = {
    MIN: "flex-start",
    CENTER: "center",
    MAX: "flex-end",
    SPACE_BETWEEN: "space-between",
    SPACE_AROUND: "space-around",
    SPACE_EVENLY: "space-evenly"
  };
  if (node.primaryAxisAlignItems) {
    styles.justifyContent = justifyMap[node.primaryAxisAlignItems] || "flex-start";
  }

  const alignMap = {
    MIN: "flex-start",
    CENTER: "center",
    MAX: "flex-end",
    BASELINE: "baseline"
  };
  if (node.counterAxisAlignItems) {
    styles.alignItems = alignMap[node.counterAxisAlignItems] || "flex-start";
  }

  return styles;
}

function flexChildSizingStyles(node, parentLayoutMode) {
  const styles = {};

  // Horizontal sizing
  const hSizing = node.layoutSizingHorizontal;
  if (hSizing === "FILL") {
    if (parentLayoutMode === "HORIZONTAL") {
      styles.flex = "1 1 0";
      styles.minWidth = "0";
    } else {
      styles.alignSelf = "stretch";
      styles.width = "auto";
    }
  } else if (hSizing === "HUG") {
    styles.width = "auto";
  } else if (hSizing === "FIXED" && node.absoluteBoundingBox?.width) {
    styles.width = `${node.absoluteBoundingBox.width}px`;
    styles.flexShrink = 0;
  }

  // Vertical sizing
  const vSizing = node.layoutSizingVertical;
  if (vSizing === "FILL") {
    if (parentLayoutMode === "VERTICAL") {
      styles.flex = "1 1 0";
      styles.minHeight = "0";
    } else {
      styles.alignSelf = "stretch";
      styles.height = "auto";
    }
  } else if (vSizing === "HUG") {
    styles.height = "auto";
  } else if (vSizing === "FIXED" && node.absoluteBoundingBox?.height) {
    styles.height = `${node.absoluteBoundingBox.height}px`;
    styles.flexShrink = 0;
  }

  // Legacy properties (older Figma files may use these)
  if (node.layoutGrow === 1 && !styles.flex) {
    styles.flexGrow = 1;
  }
  if (node.layoutAlign === "STRETCH" && !styles.alignSelf) {
    styles.alignSelf = "stretch";
  }

  return styles;
}

// Renders a node as a flex CHILD (relative positioning, sized by flex rules).
// Used recursively inside an Auto Layout container.
// `isTopLevel` marks the direct columns of the root banner — on reformat these
// are forced to fill the banner height and tagged so the browser can shrink text to fit.
function renderFlexChild(node, ctx, ancestorCtaOverride, parentLayoutMode, isTopLevel = false) {
  if (node.visible === false) return "";
  const lowerName = (node.name || "").toLowerCase();

  // Visibility from template settings
  if (lowerName === "cta" && ctx.settings.showCTA === false) return "";
  if (lowerName === "promo" && ctx.settings.showDiscount === false) return "";
  if (lowerName === "legal" && ctx.settings.showDisclaimer === false) return "";
  if (lowerName === "logo" && ctx.settings.showLogo === false) return "";

  const sizing = flexChildSizingStyles(node, parentLayoutMode);

  // Logo node — render as <img> if we have a logoDataUrl
  if (lowerName === "logo") {
    if (!ctx.logoDataUrl) return "";
    const w = node.absoluteBoundingBox?.width || 0;
    const h = node.absoluteBoundingBox?.height || 0;
    const style = {
      objectFit: "contain",
      ...sizing
    };
    if (!style.width) style.width = w ? `${w}px` : "auto";
    if (!style.height) style.height = h ? `${h}px` : "auto";
    return `<img src="${escapeHtml(ctx.logoDataUrl)}" style="${styleString(style)}" />`;
  }

  // Nested Auto Layout container
  if (isAutoLayout(node)) {
    const childStyles = {
      ...autoLayoutContainerStyles(node),
      ...sizing
    };

    // CTA must hug its content — never let a stretching parent blow the button
    // out to full banner width (Figma "Fill" / parent "stretch" → web full-width).
    if (lowerName === "cta") {
      childStyles.alignSelf = "flex-start";
      childStyles.width = "fit-content";
      childStyles.flex = "0 0 auto";
      delete childStyles.flexShrink;
    }

    // Backgrounds / borders / shadows
    if (node.type !== "TEXT") {
      const bg = fillToBackground(node.fills, ctx.imageRefs);
      if (bg?.color) childStyles.background = bg.color;
      if (bg?.image) {
        childStyles.backgroundImage = `url('${bg.image}')`;
        childStyles.backgroundSize = "cover";
        childStyles.backgroundPosition = "center";
      }
    }
    const cr = cornerRadiusCss(node);
    if (cr) childStyles.borderRadius = cr;
    Object.assign(childStyles, effectsToCss(node.effects));
    if (typeof node.opacity === "number" && node.opacity < 1) {
      childStyles.opacity = node.opacity;
    }

    const ctaOverride =
      lowerName === "cta" && ctx.copy.cta ? String(ctx.copy.cta) : ancestorCtaOverride;

    // Top-level columns: on reformat, force them to fill the banner height and
    // tag them so the browser fit-pass can shrink text until content fits.
    let fitAttr = "";
    if (isTopLevel) {
      fitAttr = " data-fitcol";
      if (ctx.reformat) {
        childStyles.alignSelf = "stretch";
        delete childStyles.height;        // ignore the Figma FIXED height baked for native
        childStyles.minHeight = "0";
        childStyles.overflow = "hidden";
      }
    }

    const inner = (node.children || [])
      .map(c => renderFlexChild(c, ctx, ctaOverride, node.layoutMode))
      .join("");

    return `<div data-name="${escapeHtml(node.name || "")}"${fitAttr} style="${styleString(childStyles)}">${inner}</div>`;
  }

  // Text node inside Auto Layout — let it flow naturally
  if (node.type === "TEXT") {
    const baseStyles = textStyleObj(node);
    // Inside flex, we want the text to grow vertically rather than be clipped.
    // Remove the `display: flex` from textStyleObj so we don't fight the parent.
    const style = { ...baseStyles, ...sizing };
    delete style.display;
    style.overflow = "visible";
    // Don't constrain height — allow text to wrap to multiple lines
    if (sizing.height === "auto" || !sizing.height) {
      delete style.height;
    }
    // Discount: pin to its designed width and shrink-to-fit so a longer promo
    // ("do -20%") stays one line inside the badge instead of growing/overflowing.
    let fitAttr = "";
    if (lowerName === "promo") {
      const pw = node.absoluteBoundingBox?.width || 0;
      if (pw) style.width = `${pw}px`;
      style.flex = "0 0 auto";
      style.overflow = "hidden";
      fitAttr = " data-fit";
    }
    const text =
      ancestorCtaOverride !== null
        ? ancestorCtaOverride
        : resolveText(node, ctx.copy);
    return `<div${fitAttr} data-slot="${escapeHtml(lowerName)}" style="${styleString(style)}">${escapeHtml(text)}</div>`;
  }

  // Generic container (no Auto Layout, but may have visible fills/effects + children)
  const containerStyles = { ...sizing };
  if (lowerName === "cta") {
    containerStyles.alignSelf = "flex-start";
    containerStyles.width = "fit-content";
    containerStyles.flex = "0 0 auto";
    delete containerStyles.flexShrink;
  }
  if (node.type !== "TEXT") {
    const bg = fillToBackground(node.fills, ctx.imageRefs);
    if (bg?.color) containerStyles.background = bg.color;
    if (bg?.image) {
      containerStyles.backgroundImage = `url('${bg.image}')`;
      containerStyles.backgroundSize = "cover";
      containerStyles.backgroundPosition = "center";
    }
  }
  const cr = cornerRadiusCss(node);
  if (cr) containerStyles.borderRadius = cr;
  Object.assign(containerStyles, effectsToCss(node.effects));
  if (typeof node.opacity === "number" && node.opacity < 1) {
    containerStyles.opacity = node.opacity;
  }

  const ctaOverride =
    lowerName === "cta" && ctx.copy.cta ? String(ctx.copy.cta) : ancestorCtaOverride;

  // If this container has no fill/effect and no children, skip it
  const hasVisuals =
    containerStyles.background ||
    containerStyles.backgroundImage ||
    containerStyles.boxShadow ||
    containerStyles.borderRadius;
  const innerParts = (node.children || [])
    .map(c => renderFlexChild(c, ctx, ctaOverride, parentLayoutMode))
    .join("");

  if (!hasVisuals && !innerParts) return "";

  return `<div data-name="${escapeHtml(node.name || "")}" style="${styleString(containerStyles)}">${innerParts}</div>`;
}

// Renders an Auto Layout SUBTREE rooted at `node`, positioned absolutely
// within the banner frame (using `box` for position/size).
// Children flow as flex items inside.
function renderAutoLayoutSubtree(node, frame, ctx, box, ancestorCtaOverride) {
  const rootStyles = {
    position: "absolute",
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.w}px`,
    height: `${box.h}px`,
    ...autoLayoutContainerStyles(node)
  };

  // Visuals on the Auto Layout root
  const bg = fillToBackground(node.fills, ctx.imageRefs);
  if (bg?.color) rootStyles.background = bg.color;
  if (bg?.image) {
    rootStyles.backgroundImage = `url('${bg.image}')`;
    rootStyles.backgroundSize = "cover";
    rootStyles.backgroundPosition = "center";
  }
  const cr = cornerRadiusCss(node);
  if (cr) rootStyles.borderRadius = cr;
  Object.assign(rootStyles, effectsToCss(node.effects));
  if (typeof node.opacity === "number" && node.opacity < 1) {
    rootStyles.opacity = node.opacity;
  }

  const lowerName = (node.name || "").toLowerCase();
  const ctaOverride =
    lowerName === "cta" && ctx.copy.cta ? String(ctx.copy.cta) : ancestorCtaOverride;

  const inner = (node.children || [])
    .map(c => renderFlexChild(c, ctx, ctaOverride, node.layoutMode))
    .join("");

  return `<div data-name="${escapeHtml(node.name || "")}" data-auto-layout="1" style="${styleString(rootStyles)}">${inner}</div>`;
}

// ──────────────────────────────────────────────────────────────────

function resolveText(node, copy) {
  const lower = (node.name || "").toLowerCase();
  if (lower in COPY_SLOTS) {
    const key = COPY_SLOTS[lower];
    const override = copy[key];
    if (override !== undefined && override !== null && override !== "") {
      return String(override);
    }
  }
  return node.characters || "";
}

function emitFlat(node, frame, ctx, segments, ancestorCtaOverride = null, ancestorOffset = { dx: 0, dy: 0 }) {
  if (node.visible === false) return;

  const lowerName = (node.name || "").toLowerCase();
  const isBackground = lowerName === "background";
  const isLogo = lowerName === "logo";
  const isCtaFrame = lowerName === "cta";

  const origBox = relBox(node, frame);
  const b = {
    x: origBox.x + ancestorOffset.dx,
    y: origBox.y + ancestorOffset.dy,
    w: origBox.w,
    h: origBox.h
  };

  let nodeOffsetDelta = { dx: 0, dy: 0 };
  const slotKey = resolveSlotKey(node.name);
  if (slotKey && ctx.slotOverrides && ctx.slotOverrides[slotKey]) {
    const ov = ctx.slotOverrides[slotKey];
    if (typeof ov.x === "number") {
      nodeOffsetDelta.dx = ov.x - b.x;
      b.x = ov.x;
    }
    if (typeof ov.y === "number") {
      nodeOffsetDelta.dy = ov.y - b.y;
      b.y = ov.y;
    }
    if (typeof ov.w === "number") b.w = ov.w;
    if (typeof ov.h === "number") b.h = ov.h;
  }
  const childOffset = {
    dx: ancestorOffset.dx + nodeOffsetDelta.dx,
    dy: ancestorOffset.dy + nodeOffsetDelta.dy
  };

  if (isBackground && ctx.sceneUrl) {
    const fw = frame.absoluteBoundingBox?.width || b.w;
    const fh = frame.absoluteBoundingBox?.height || b.h;
    segments.push(
      `<img src="${escapeHtml(ctx.sceneUrl)}" style="${styleString({
        position: "absolute",
        left: "0px",
        top: "0px",
        width: `${fw}px`,
        height: `${fh}px`,
        objectFit: "cover"
      })}" />`
    );
    for (const child of node.children || []) {
      emitFlat(child, frame, ctx, segments, ancestorCtaOverride, childOffset);
    }
    return;
  }

  if (isLogo) {
    if (ctx.settings.showLogo === false) return;
    if (ctx.logoDataUrl) {
      segments.push(
        `<img src="${escapeHtml(ctx.logoDataUrl)}" style="${styleString({
          position: "absolute",
          left: `${b.x}px`,
          top: `${b.y}px`,
          width: `${b.w}px`,
          height: `${b.h}px`,
          objectFit: "contain"
        })}" />`
      );
      return;
    }
  }

  if (isCtaFrame && ctx.settings.showCTA === false) return;
  if (lowerName === "promo" && ctx.settings.showDiscount === false) return;
  if (lowerName === "legal" && ctx.settings.showDisclaimer === false) return;

  // ─── NEW: Auto Layout fast-path ─────────────────────────────
  // If this node is an Auto Layout container, render the whole subtree
  // as a flex container with nested (relatively positioned) children.
  // We still position the container itself absolutely within the banner frame
  // using the box we already computed (with ancestor offsets + slot overrides).
  if (isAutoLayout(node) && !isBackground) {
    segments.push(renderAutoLayoutSubtree(node, frame, ctx, b, ancestorCtaOverride));
    return;
  }
  // ────────────────────────────────────────────────────────────

  const style = {
    position: "absolute",
    left: `${b.x}px`,
    top: `${b.y}px`,
    width: `${b.w}px`,
    height: `${b.h}px`,
    boxSizing: "border-box"
  };

  if (typeof node.opacity === "number" && node.opacity < 1) {
    style.opacity = node.opacity;
  }

  if (node.type !== "TEXT") {
    const bg = fillToBackground(node.fills, ctx.imageRefs);
    if (bg?.color) style.background = bg.color;
    if (bg?.image) {
      style.backgroundImage = `url('${bg.image}')`;
      style.backgroundSize = "cover";
      style.backgroundPosition = "center";
    }
  }

  const cr = cornerRadiusCss(node);
  if (cr) style.borderRadius = cr;

  const effects = effectsToCss(node.effects);
  Object.assign(style, effects);

  if (node.type === "TEXT") {
    Object.assign(style, textStyleObj(node));
    const text =
      ancestorCtaOverride !== null
        ? ancestorCtaOverride
        : resolveText(node, ctx.copy);
    segments.push(
      `<div data-fit data-slot="${escapeHtml(lowerName)}" style="${styleString(style)}">${escapeHtml(text)}</div>`
    );
    return;
  }

  if (style.background || style.backgroundImage || style.boxShadow) {
    segments.push(
      `<div data-name="${escapeHtml(node.name || "")}" style="${styleString(style)}"></div>`
    );
  }

  const ctaOverride =
    isCtaFrame && ctx.copy.cta ? String(ctx.copy.cta) : ancestorCtaOverride;

  for (const child of node.children || []) {
    emitFlat(child, frame, ctx, segments, ctaOverride, childOffset);
  }
}

export function buildHtmlFromTree({
  frame,
  copy = {},
  sceneUrl = "",
  logoDataUrl = "",
  settings = {},
  imageRefs = {},
  slotOverrides = null,
  canvasWidth = null,
  canvasHeight = null,
  scaleFit = null
}) {
  // Frame's native size from Figma
  const frameW = frame.absoluteBoundingBox?.width || 0;
  const frameH = frame.absoluteBoundingBox?.height || 0;

  // If caller passed a target canvas size, override frame's native size
  // The frame's internal Auto Layout / Flexbox will reflow children for the new size.
  const fw = canvasWidth && canvasWidth > 0 ? canvasWidth : frameW;
  const fh = canvasHeight && canvasHeight > 0 ? canvasHeight : frameH;

  // Reformat = target canvas differs from the Figma frame's native size.
  // On reformat we force top-level columns to fill the banner and shrink text to fit.
  const reformat =
    (frameW > 0 && Math.abs(fw - frameW) > 1) ||
    (frameH > 0 && Math.abs(fh - frameH) > 1);

  const ctx = { copy, sceneUrl, logoDataUrl, settings, imageRefs, slotOverrides, reformat };
  const segments = [];

  // If the ROOT frame itself has Auto Layout — .banner becomes a flex container.
  // Its in-flow children flow as flex items (FILL/HUG/FIXED honoured), ABSOLUTE children stay positioned.
  const rootIsAutoLayout = isAutoLayout(frame);

  // When the root is Auto Layout, paint the AI scene as the .banner background
  // (CSS background-image), so it always sits below all flex/absolute children.
  // Otherwise the absolute-positioned <img> would paint OVER static flex items.
  let bannerBackgroundImage = null;

  if (rootIsAutoLayout) {
    for (const child of frame.children || []) {
      const childName = (child.name || "").toLowerCase();
      const isBackgroundChild = childName === "background";

      if (isBackgroundChild && sceneUrl) {
        // Skip rendering background as a separate element — use it as .banner background-image
        bannerBackgroundImage = sceneUrl;
        continue;
      }

      if (child.layoutPositioning === "ABSOLUTE") {
        // Absolute child — use the legacy absolute path (e.g., legal positioned at bottom)
        emitFlat(child, frame, ctx, segments, null);
      } else {
        // In-flow child — render as a flex item inside .banner (top-level column)
        segments.push(renderFlexChild(child, ctx, null, frame.layoutMode, true));
      }
    }
  } else {
    // Root frame has no Auto Layout — original behaviour: everything goes through emitFlat.
    for (const child of frame.children || []) {
      emitFlat(child, frame, ctx, segments, null);
    }
  }

  const children = segments.join("");

  // Build .banner styles: if root has Auto Layout, .banner is a flex container.
  const bannerInlineStyle = rootIsAutoLayout
    ? styleString({
        position: "relative",
        width: `${fw}px`,
        height: `${fh}px`,
        overflow: "hidden",
        ...(bannerBackgroundImage
          ? {
              backgroundImage: `url('${bannerBackgroundImage}')`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat"
            }
          : {}),
        ...autoLayoutContainerStyles(frame)
      })
    : `position:relative;width:${fw}px;height:${fh}px;overflow:hidden`;

  // ─── Scale-fit (proportional reformat) ───────────────────────────
  // When target aspect ≈ native aspect, the caller renders at NATIVE size
  // and asks us to scale the whole design to the target canvas (cover).
  // Everything — text, logo, badge — shrinks by ONE factor, so nothing
  // overflows and proportions are preserved exactly.
  const viewW = scaleFit && scaleFit.w > 0 ? scaleFit.w : fw;
  const viewH = scaleFit && scaleFit.h > 0 ? scaleFit.h : fh;

  let bannerStyle = bannerInlineStyle;
  let stageOpen = "";
  let stageClose = "";
  if (scaleFit && scaleFit.w > 0 && scaleFit.h > 0) {
    // CONTAIN: scale so the WHOLE design fits without cropping — this preserves
    // the banner's edge padding exactly. A small aspect mismatch shows as thin
    // bands, which we fill with the scene (cover) so they're never empty.
    const s = Math.min(scaleFit.w / fw, scaleFit.h / fh);
    const offX = (scaleFit.w - fw * s) / 2;
    const offY = (scaleFit.h - fh * s) / 2;
    bannerStyle = `${bannerInlineStyle};position:absolute;left:${offX}px;top:${offY}px;transform:scale(${s});transform-origin:top left`;
    const stageBg = sceneUrl
      ? `background-image:url('${sceneUrl}');background-size:cover;background-position:center`
      : "background:#fff";
    stageOpen = `<div class="stage" style="position:relative;width:${scaleFit.w}px;height:${scaleFit.h}px;overflow:hidden;${stageBg}">`;
    stageClose = `</div>`;
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
  body { width: ${viewW}px; height: ${viewH}px; overflow: hidden; background: #fff; }
</style>
</head>
<body>
${stageOpen}<div class="banner" style="${bannerStyle}">${children}</div>${stageClose}
</body>
</html>`;
}
