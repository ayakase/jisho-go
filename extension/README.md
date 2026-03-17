## Kanji Go (Extension)

### Usage

- **Selection popup**: select Japanese text on a page to show a popup near the selection.
- **Button mode**: instead of showing the popup immediately, a small button appears near the selection; click it to open the popup.
- **Hover mode**: hover over a kanji character to show a popup near your cursor.
- **OCR selection (screen region)**:
  - Right-click a page → **Capture Selection**
  - Drag a rectangle on the page
  - Wait for OCR to finish (a small “OCR running…” toast appears)
  - The recognized Japanese text is used to open the popup

### Tech

This is a **browser extension** built with **WXT** (MV3) + **Svelte** + **tesseract.js**.

- **Content script**: `src/entrypoints/content.ts`
  - Runs on `"<all_urls>"`.
  - Handles selection + hover UX, mounts Svelte components into the page, and positions them relative to DOMRects.
  - Implements the OCR overlay (rectangle drawing), calls OCR, and shows the OCR loading toast.

- **Background service worker (MV3)**: `src/entrypoints/background.ts`
  - Adds the context menu entry (**Capture Selection**).
  - On click, injects a tab script that triggers the overlay via `window.postMessage({ type: "START_SELECTION" })`.
  - Receives `CAPTURE_SCREENSHOT` from the content script, captures the visible tab, crops it with `OffscreenCanvas`, and replies with a cropped `data:` URL.

- **OCR message flow**
  - Context menu click → background triggers overlay
  - Overlay rectangle → content script sends `CAPTURE_SCREENSHOT`
  - Background capture + crop → returns `imageDataUrl`
  - Content script converts to `Blob` → `tesseract.js` recognizes → popup opens with filtered Japanese text

- **CSP-safe OCR assets**
  - Some sites block CDN-loaded workers via CSP, so the Tesseract worker/core/lang data are bundled locally in `public/tesseract/...` and loaded via `browser.runtime.getURL(...)`.
  - Files:
    - `public/tesseract/worker.min.js`
    - `public/tesseract/tesseract-core.wasm.js`
    - `public/tesseract/tesseract-core.wasm`
    - `public/tesseract/lang/jpn.traineddata.gz`
  - Exposed through `web_accessible_resources` in `wxt.config.ts`.

- **Dev/build**

```bash
yarn dev
yarn build
```
