import { createWorker } from "tesseract.js";

let workerPromise: ReturnType<typeof createWorker> | null = null;

export function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("jpn", 1, {
      logger: (m) => console.log(m),
      workerPath: browser.runtime.getURL("/tesseract/worker.min.js"),
      corePath: browser.runtime.getURL("/tesseract/tesseract-core.wasm.js"),
      langPath: browser.runtime.getURL("/tesseract/lang" as any) + "/",
    });
  }
  return workerPromise;
}

export default defineBackground(() => {
  // create a menu item once the extension gets installed or loads
  browser.contextMenus.create({
    id: "capture-selection",
    title: "Capture Selection",
    contexts: ["page"], // show on page right‑click
  });

  // listen for menu item clicks
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "capture-selection" && tab?.id) {
      browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          window.postMessage({ type: "START_SELECTION" }, "*");
        },
      });
    }
  });

  // Listen for screenshot capture requests from content script
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "CAPTURE_SCREENSHOT") {
      const bounds = message.bounds;

      // Capture the visible tab
      const captureCallback = async (dataUrl: string) => {
        if (browser.runtime.lastError) {
          console.error("Background: Capture error:", browser.runtime.lastError);
          sendResponse({ error: browser.runtime.lastError.message });
          return;
        }

        try {
          // Convert data URL to blob
          const response = await fetch(dataUrl);
          const blob = await response.blob();

          // Use createImageBitmap which works in service workers
          const imageBitmap = await createImageBitmap(blob);

          const canvas = new OffscreenCanvas(
            bounds.width * bounds.devicePixelRatio,
            bounds.height * bounds.devicePixelRatio
          );
          const ctx = canvas.getContext("2d");

          if (ctx) {
            // Draw the cropped portion
            ctx.drawImage(
              imageBitmap,
              bounds.x * bounds.devicePixelRatio,
              bounds.y * bounds.devicePixelRatio,
              bounds.width * bounds.devicePixelRatio,
              bounds.height * bounds.devicePixelRatio,
              0,
              0,
              bounds.width * bounds.devicePixelRatio,
              bounds.height * bounds.devicePixelRatio
            );
            // Convert canvas to blob and send the cropped image back to the content script
            const resultBlob = await canvas.convertToBlob({ type: "image/png" });
            const reader = new FileReader();
            reader.onloadend = () => {
              sendResponse({ imageDataUrl: reader.result });
            };
            reader.readAsDataURL(resultBlob);
          } else {
            console.error("Background: Failed to get canvas context");
            sendResponse({ error: "Failed to get canvas context" });
          }
        } catch (error) {
          console.error("Background: Error processing image:", error);
          sendResponse({ error: "Failed to process captured image: " + error });
        }
      };

      // Call captureVisibleTab with or without windowId
      if (sender.tab?.windowId !== undefined) {
        browser.tabs.captureVisibleTab(sender.tab.windowId, { format: "png" }, captureCallback);
      } else {
        browser.tabs.captureVisibleTab({ format: "png" }, captureCallback);
      }

      // Return true to indicate we'll send response asynchronously
      return true;
    }
  });
});
