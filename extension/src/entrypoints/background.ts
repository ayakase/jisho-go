import { createWorker } from "tesseract.js";
import {
  clearStoredSession,
  fetchExtensionMe,
  getApiBase,
  getStoredSession,
  logoutExtensionSession,
  setStoredSession,
  type ExtensionAuthSession,
} from "../lib/auth";
import {
  backgroundFindKanji,
  backgroundSearchSelection,
} from "../lib/dict-background";

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
  function registerCaptureSelectionMenu() {
    browser.contextMenus.remove("capture-selection", () => {
      // Chrome reports an error when the menu does not exist yet; reading it consumes it.
      void browser.runtime.lastError;
      browser.contextMenus.create({
        id: "capture-selection",
        title: "Khoanh vùng OCR",
        contexts: ["all"],
      });
    });

    browser.contextMenus.remove("ocr-image", () => {
      void browser.runtime.lastError;
      browser.contextMenus.create({
        id: "ocr-image",
        title: "OCR ảnh này",
        contexts: ["image"],
      });
    });
  }

  async function startExtensionLogin(): Promise<ExtensionAuthSession> {
    const redirectUri = browser.identity.getRedirectURL("auth");
    const startUrl = new URL(`${getApiBase()}/auth/ext/start`);
    startUrl.searchParams.set("redirect_uri", redirectUri);
    startUrl.searchParams.set("device_label", "Jisho Go Extension");

    const startRes = await fetch(startUrl.toString());
    if (!startRes.ok) {
      throw new Error(`Failed to start extension auth: ${startRes.status}`);
    }

    const startData = (await startRes.json()) as { authUrl?: string; error?: string };
    if (!startData.authUrl) {
      throw new Error(startData.error || "Missing auth URL");
    }

    const callbackUrl = await browser.identity.launchWebAuthFlow({
      url: startData.authUrl,
      interactive: true,
    });

    if (!callbackUrl) {
      throw new Error("Extension login cancelled");
    }

    const callback = new URL(callbackUrl);
    const code = callback.searchParams.get("code");
    const state = callback.searchParams.get("state");

    if (!code || !state) {
      const oauthError = callback.searchParams.get("error");
      throw new Error(oauthError || "Missing code/state from auth callback");
    }

    const exchangeRes = await fetch(`${getApiBase()}/auth/ext/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
        state,
        redirectUri,
        deviceLabel: "Jisho Go Extension",
      }),
    });

    const exchangeData = (await exchangeRes.json()) as
      | ExtensionAuthSession
      | { error?: string };

    if (!exchangeRes.ok) {
      throw new Error(
        "error" in exchangeData && exchangeData.error
          ? exchangeData.error
          : `Failed to exchange auth code: ${exchangeRes.status}`,
      );
    }

    const session = exchangeData as ExtensionAuthSession;
    await setStoredSession(session);
    return session;
  }

  registerCaptureSelectionMenu();

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

    if (info.menuItemId === "ocr-image" && tab?.id) {
      browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: (srcUrl) => {
          window.postMessage({ type: "START_IMAGE_OCR", srcUrl }, "*");
        },
        args: [info.srcUrl],
      });
    }
  });

  // Listen for screenshot capture requests from content script
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "AUTH_LOGIN") {
      (async () => {
        try {
          const session = await startExtensionLogin();
          sendResponse({ ok: true as const, session });
        } catch (e) {
          sendResponse({
            ok: false as const,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      })();
      return true;
    }

    if (message.type === "AUTH_ME") {
      (async () => {
        try {
          const session = await getStoredSession();
          if (!session) {
            sendResponse({ ok: true as const, session: null });
            return;
          }

          const user = await fetchExtensionMe(session.accessToken);
          if (!user) {
            await clearStoredSession();
            sendResponse({ ok: true as const, session: null });
            return;
          }

          const nextSession = {
            ...session,
            user,
          };
          await setStoredSession(nextSession);
          sendResponse({ ok: true as const, session: nextSession });
        } catch (e) {
          sendResponse({
            ok: false as const,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      })();
      return true;
    }

    if (message.type === "AUTH_LOGOUT") {
      (async () => {
        try {
          const session = await getStoredSession();
          if (session) {
            await logoutExtensionSession(session.accessToken);
          }
          await clearStoredSession();
          sendResponse({ ok: true as const });
        } catch (e) {
          sendResponse({
            ok: false as const,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      })();
      return true;
    }

    if (message.type === "DICT_FIND_KANJI") {
      (async () => {
        try {
          const { entry } = await backgroundFindKanji(
            (message as { query: string }).query,
          );
          sendResponse({ ok: true as const, entry });
        } catch (e) {
          sendResponse({
            ok: false as const,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      })();
      return true;
    }

    if (message.type === "DICT_SEARCH_SELECTION") {
      (async () => {
        try {
          const { skipped, kanjiResults, vocabResults } =
            await backgroundSearchSelection(
              (message as { query: string }).query,
              (message as { includeLongerMatches?: boolean })
                .includeLongerMatches ?? false,
            );
          sendResponse({
            ok: true as const,
            skipped,
            kanjiResults,
            vocabResults,
          });
        } catch (e) {
          sendResponse({
            ok: false as const,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      })();
      return true;
    }

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
