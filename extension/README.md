## Jisho Go (Extension)

### Usage

- **Selection popup**: select Japanese text on a page to show a popup near the selection.
- **Button mode**: instead of showing the popup immediately, a small button appears near the selection; click it to open the popup.
- **Hover mode**: hover over a kanji character to show a popup near your cursor.
- **OCR selection (screen region)**:
  - Right-click a page → **Capture Selection**
  - Drag a rectangle on the page
  - Wait for OCR to finish (a scan animation runs over the region you selected)
  - The recognized Japanese text is used to open the popup
- **OCR keyboard shortcut**: open the popup → **OCR** tab to assign a shortcut. There is no on/off switch — the shortcut is unset by default and OCR stays off until you assign a combo; clearing the combo turns it off again. Pressing it starts the region-select overlay on the current tab; press it again to cancel. Inside the overlay, dragging draws a region, while hovering an `<img>` spotlights that image and a plain click OCRs the whole image. Image OCR is also on the right-click menu (**OCR this image**). The shortcut also works on blacklisted sites, since pressing it is explicit intent.

### Tech

This is a **browser extension** built with **WXT** (MV3) + **Svelte** + **tesseract.js**.

- **Content script**: `src/entrypoints/content.ts`
  - Runs on `"<all_urls>"`.
  - Handles selection + hover UX, mounts Svelte components into the page, and positions them relative to DOMRects.
  - Implements the OCR overlay (rectangle drawing + image hover spotlight), calls OCR, and renders the in-region scan animation while Tesseract runs.

- **Background service worker (MV3)**: `src/entrypoints/background.ts`
  - Adds the context menu entry (**Capture Selection**).
  - On click, injects a tab script that triggers the overlay via `window.postMessage({ type: "START_SELECTION" })`.
  - Receives `CAPTURE_SCREENSHOT` from the content script, captures the visible tab, crops it with `OffscreenCanvas`, and replies with a cropped `data:` URL.

- **OCR settings**: `src/entrypoints/popup/components/OcrSetting.svelte` stores the shortcut in `local:ocrShortcut` (shape + helpers live in `src/lib/ocr-shortcut.ts`). The stored value is `null` when no shortcut is assigned — that is what "OCR off" means, there is no separate enabled flag. The content script watches that key and listens for the matching `keydown` to toggle the overlay.

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

### Extension auth setup

- Set `WXT_API_URL` so the extension points at the correct API.
- Example extension env:

```bash
WXT_API_URL=http://localhost:8787
```

- Apply API migrations locally before testing login:

```bash
cd ../api && yarn db:migrate:local
```

- Add the extension redirect URI from `browser.identity.getRedirectURL("auth")` to Google Cloud Console.
- For Chromium browsers it will look like:

```txt
https://<extension-id>.chromiumapp.org/auth
```

- API auth env still needs:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `AUTH_COOKIE_SECRET`
