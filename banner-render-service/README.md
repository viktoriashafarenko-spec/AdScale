# AdScale — banner-render-service (Dr.Max)

Node.js + Express na Cloud Run. Generuje banery reklamowe: szablony z Figmy + AI-scena w tle + copy → render do PNG. W repo jest też frontend (kabinet) w `public/`.

## Stack
- Backend: Node/Express — `index.js`; render przez **Puppeteer** (headless Chrome)
- Silnik szablonów: **Figma Auto-Layout → HTML/CSS Flexbox** — `lib/figmaTree.js`
- Sceny/obrazy: Vertex AI Gemini — `lib/geminiImage.js`
- Dopasowanie sceny do banera (+ zoom/pan): `lib/sceneFit.js`
- Frontend (kabinet): `public/index.html` + `public/cabinet.js`

## Endpointy (`index.js`)
`/generate-scenes`, `/generate-copy`, `/templates`, `/render-banner`, `/render-9x16`, `/edit-scene`, `/save-asset`, `/library`

## Mapowanie warstw Figma (po nazwie)
W szablonie warstwy muszą się nazywać: `background` (scena), `headline`, `subheadline`, `cta`, `promo` (rabat), `legal`, `logo`. Inna nazwa = warstwa nie zostanie podstawiona.

## ⚠️ Znany problem do naprawy: REFORMAT
Przy reformacie silnik **przekłada elementy (reflow)** zamiast je **skalować** — rozmiary (logo, font, przyciski) są zapisane na sztywno w pikselach i nie zmniejszają się pod nowe płótno, więc na mniejszym lub węższym banerze stają się za duże i wychodzą poza kadr.

Naprawa zależy od przypadku:
- **Ten sam format, inny rozmiar** (np. 1080×1080 → 600×600): nie przekładać, tylko wyrenderować baner w **natywnym rozmiarze mastera** i **przeskalować gotowy PNG w dół** (`sharp.resize`, w `lib/sceneFit.js` / `index.js` `/render-banner`).
- **Inny format** (np. 1080×1920 → 300×600): skalowanie nie pomoże — użyć **innego mastera** pod ten kształt, a nie rozciągać obecnego.

Reformat auto-wykrywa się w `lib/figmaTree.js` (gdy target ≠ natywny rozmiar fremu); `data-fit` skaluje tylko tekst, nie grafikę/logo — stąd problem.
