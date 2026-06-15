// Local smoke test for Auto Layout → Flexbox translation.
// Does NOT make any API calls or deploy. Just feeds a fake Figma frame
// and prints the resulting HTML so we can eyeball it.

import { buildHtmlFromTree } from "./lib/figmaTree.js";

// ───── Test 1: Frame WITH Auto Layout (new path) ─────
const autoLayoutFrame = {
  id: "test:1",
  name: "Frame Test Auto Layout",
  type: "FRAME",
  absoluteBoundingBox: { x: 0, y: 0, width: 1920, height: 555 },
  children: [
    {
      id: "1:bg",
      name: "background",
      type: "RECTANGLE",
      visible: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 1920, height: 555 }
    },
    {
      // Inner Auto Layout container — text stack on the left
      id: "1:content",
      name: "TextStack",
      type: "FRAME",
      visible: true,
      layoutMode: "VERTICAL",
      itemSpacing: 16,
      paddingTop: 80,
      paddingBottom: 40,
      paddingLeft: 40,
      paddingRight: 40,
      primaryAxisAlignItems: "MIN",
      counterAxisAlignItems: "MIN",
      absoluteBoundingBox: { x: 0, y: 0, width: 1100, height: 555 },
      children: [
        {
          id: "1:headline",
          name: "headline",
          type: "TEXT",
          visible: true,
          layoutSizingHorizontal: "FILL",
          layoutSizingVertical: "HUG",
          absoluteBoundingBox: { x: 40, y: 80, width: 1020, height: 80 },
          style: { fontFamily: "Proxima Nova", fontWeight: 900, fontSize: 64 },
          fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
          characters: "Default headline"
        },
        {
          id: "1:sub",
          name: "subheadline",
          type: "TEXT",
          visible: true,
          layoutSizingHorizontal: "FILL",
          layoutSizingVertical: "HUG",
          absoluteBoundingBox: { x: 40, y: 176, width: 1020, height: 40 },
          style: { fontFamily: "Proxima Nova", fontWeight: 400, fontSize: 24 },
          fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
          characters: "Default subheadline"
        },
        {
          id: "1:cta",
          name: "cta",
          type: "FRAME",
          visible: true,
          layoutMode: "HORIZONTAL",
          itemSpacing: 8,
          paddingTop: 16,
          paddingBottom: 16,
          paddingLeft: 32,
          paddingRight: 32,
          primaryAxisAlignItems: "CENTER",
          counterAxisAlignItems: "CENTER",
          layoutSizingHorizontal: "HUG",
          layoutSizingVertical: "HUG",
          cornerRadius: 30,
          fills: [{ type: "SOLID", color: { r: 0.89, g: 0.04, b: 0.07 } }],
          absoluteBoundingBox: { x: 40, y: 460, width: 225, height: 60 },
          children: [
            {
              id: "1:cta:t",
              name: "sprawdź",
              type: "TEXT",
              visible: true,
              layoutSizingHorizontal: "HUG",
              layoutSizingVertical: "HUG",
              absoluteBoundingBox: { x: 72, y: 478, width: 161, height: 24 },
              style: { fontFamily: "Proxima Nova", fontWeight: 700, fontSize: 20 },
              fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
              characters: "sprawdź"
            }
          ]
        }
      ]
    }
  ]
};

// ───── Test 2: Frame WITHOUT Auto Layout (legacy path) ─────
const legacyFrame = {
  id: "test:2",
  name: "Frame Test Legacy",
  type: "FRAME",
  absoluteBoundingBox: { x: 0, y: 0, width: 1920, height: 555 },
  children: [
    {
      id: "2:headline",
      name: "headline",
      type: "TEXT",
      visible: true,
      absoluteBoundingBox: { x: 40, y: 80, width: 600, height: 60 },
      style: { fontFamily: "Proxima Nova", fontWeight: 900, fontSize: 48 },
      fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
      characters: "Legacy default"
    }
  ]
};

const testCopy = {
  headline: "Wzmocnij swoją odporność",
  subheadline: "Witamina D dla całej rodziny",
  cta: "Sprawdź teraz"
};

const settings = {
  showLogo: true,
  showCTA: true,
  showDiscount: true,
  showDisclaimer: true
};

console.log("═".repeat(60));
console.log("TEST 1: Frame WITH Auto Layout (NEW Flexbox path)");
console.log("═".repeat(60));
const html1 = buildHtmlFromTree({
  frame: autoLayoutFrame,
  copy: testCopy,
  sceneUrl: "https://example.com/scene.png",
  logoDataUrl: "",
  settings,
  imageRefs: {}
});
console.log(html1);

console.log("\n");
console.log("═".repeat(60));
console.log("TEST 2: Frame WITHOUT Auto Layout (LEGACY absolute path)");
console.log("═".repeat(60));
const html2 = buildHtmlFromTree({
  frame: legacyFrame,
  copy: testCopy,
  sceneUrl: "",
  logoDataUrl: "",
  settings,
  imageRefs: {}
});
console.log(html2);
