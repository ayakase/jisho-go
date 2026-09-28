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
  backgroundGetQuizOptions,
  backgroundSearchSelection,
  type QuizOption,
} from "../lib/dict-background";
import { storage } from "#imports";

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
        title: "Khoanh vùng scan ảnh",
        contexts: ["all"],
      });
    });

    browser.contextMenus.remove("ocr-image", () => {
      void browser.runtime.lastError;
      browser.contextMenus.create({
        id: "ocr-image",
        title: "Scan ảnh này",
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

    const startData = (await startRes.json()) as {
      authUrl?: string;
      error?: string;
    };
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
      browser.scripting
        .executeScript({
          target: { tabId: tab.id },
          func: () => {
            window.postMessage({ type: "START_SELECTION" }, "*");
          },
        })
        .catch((err) => {
          console.debug("Không thể thực thi script trong tab này:", err);
        });
    }

    if (info.menuItemId === "ocr-image" && tab?.id) {
      browser.scripting
        .executeScript({
          target: { tabId: tab.id },
          func: (srcUrl) => {
            window.postMessage({ type: "START_IMAGE_OCR", srcUrl }, "*");
          },
          args: [info.srcUrl],
        })
        .catch((err) => {
          console.debug("Không thể thực thi script trong tab này:", err);
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
          console.error(
            "Background: Capture error:",
            browser.runtime.lastError,
          );
          sendResponse({ error: browser.runtime.lastError.message });
          return;
        }

        if (!dataUrl) {
          console.error("Background: Capture dataUrl is empty");
          sendResponse({ error: "Không thể lấy dữ liệu ảnh chụp màn hình" });
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
            bounds.height * bounds.devicePixelRatio,
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
              bounds.height * bounds.devicePixelRatio,
            );
            // Convert canvas to blob and send the cropped image back to the content script
            const resultBlob = await canvas.convertToBlob({
              type: "image/png",
            });
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
        browser.tabs.captureVisibleTab(
          sender.tab.windowId,
          { format: "png" },
          captureCallback,
        );
      } else {
        browser.tabs.captureVisibleTab({ format: "png" }, captureCallback);
      }

      // Return true to indicate we'll send response asynchronously
      return true;
    }

    if (message.type === "TRIGGER_TEST_PASSIVE_LEARN") {
      const tabId = sender.tab?.id;
      triggerPassiveLearnCard(tabId, true).then((res) => {
        void scheduleNextPassiveLearn();
        sendResponse(res);
      });
      return true;
    }

    if (
      message.type === "RESET_PASSIVE_TIMER" ||
      message.type === "PASSIVE_CARD_CLOSED"
    ) {
      void scheduleNextPassiveLearn();
      sendResponse({ ok: true });
      return true;
    }
  });

  // --- Chế độ tự học thụ động (Passive Learning Engine) ---
  const PASSIVE_ALARM_NAME = "PASSIVE_LEARN_ALARM";
  const DEFAULT_SAMPLE_KANJI = "日本語学習勉強時間私行見";
  let passiveShortTimer: ReturnType<typeof setTimeout> | null = null;

  async function scheduleNextPassiveLearn() {
    try {
      if (passiveShortTimer) {
        clearTimeout(passiveShortTimer);
        passiveShortTimer = null;
      }
      const modeFlashcard =
        (await storage.getItem<boolean>("local:passiveLearnModeFlashcard")) ??
        false;
      const modeQuiz =
        (await storage.getItem<boolean>("local:passiveLearnModeQuiz")) ?? false;
      const legacyEnabled =
        (await storage.getItem<boolean>("local:passiveLearnEnabled")) ?? false;

      const isEnabled = modeFlashcard || modeQuiz || legacyEnabled;
      if (!isEnabled) {
        await browser.alarms.clear(PASSIVE_ALARM_NAME);
        return;
      }

      const storedSecs = await storage.getItem<number>(
        "local:passiveLearnIntervalSeconds",
      );
      const intervalSec =
        storedSecs !== null && storedSecs !== undefined
          ? storedSecs
          : ((await storage.getItem<number>("local:passiveLearnInterval")) ||
              20) * 60;

      if (intervalSec <= 30) {
        // Chế độ test ngắn (ví dụ: 10 giây): dùng setTimeout trực tiếp để đảm bảo kích hoạt chuẩn xác
        await browser.alarms.clear(PASSIVE_ALARM_NAME);
        passiveShortTimer = setTimeout(async () => {
          await triggerPassiveLearnCard();
          void scheduleNextPassiveLearn();
        }, intervalSec * 1000);
        return;
      }

      const baseMinutes = intervalSec / 60;
      // Thêm độ trễ ngẫu nhiên nhẹ (±20%) để tự nhiên hơn
      const jitter = (Math.random() - 0.5) * 0.4 * baseMinutes;
      const delay = Math.max(1, Math.round(baseMinutes + jitter));
      await browser.alarms.create(PASSIVE_ALARM_NAME, {
        delayInMinutes: delay,
      });
    } catch (e) {
      console.error("Failed to schedule passive learn alarm:", e);
    }
  }

  async function triggerPassiveLearnCard(
    targetTabId?: number,
    isUserTriggered = false,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      const recent = (await storage.getItem<string>("local:recentKanji")) || "";
      const kanjiPool =
        recent && recent.length > 0 ? recent : DEFAULT_SAMPLE_KANJI;

      // Chọn ngẫu nhiên 1 Kanji trong danh sách đã lưu hoặc fallback kanji mẫu
      const randomChar =
        kanjiPool[Math.floor(Math.random() * kanjiPool.length)];
      const { entry } = await backgroundFindKanji(randomChar);
      if (!entry) {
        return {
          ok: false,
          error: "Không tìm thấy dữ liệu từ điển cho Kanji này.",
        };
      }

      // Thu thập các ví dụ từ vựng
      const allExamples: Array<{ w: string; p: string; m: string }> = [];
      if (entry.examples) {
        for (const ex of entry.examples) {
          if (ex.w && ex.m)
            allExamples.push({ w: ex.w, p: ex.p || "", m: ex.m });
        }
      }
      if (entry.example_on) {
        for (const list of Object.values(entry.example_on)) {
          for (const ex of list) {
            if (ex.w && ex.m)
              allExamples.push({ w: ex.w, p: ex.p || "", m: ex.m });
          }
        }
      }
      if (entry.example_kun) {
        for (const list of Object.values(entry.example_kun)) {
          for (const ex of list) {
            if (ex.w && ex.m)
              allExamples.push({ w: ex.w, p: ex.p || "", m: ex.m });
          }
        }
      }

      const sampleExample =
        allExamples.length > 0
          ? allExamples[Math.floor(Math.random() * allExamples.length)]
          : null;

      let tabId = targetTabId;
      if (!tabId) {
        const tabs = await browser.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        let candidateTab = tabs[0];
        if (
          !candidateTab?.url ||
          candidateTab.url.startsWith("chrome://") ||
          candidateTab.url.startsWith("edge://") ||
          candidateTab.url.startsWith("about:") ||
          candidateTab.url.startsWith("chrome-extension://")
        ) {
          const allTabs = await browser.tabs.query({ active: true });
          candidateTab =
            allTabs.find(
              (t) =>
                t.url &&
                !t.url.startsWith("chrome://") &&
                !t.url.startsWith("edge://") &&
                !t.url.startsWith("about:") &&
                !t.url.startsWith("chrome-extension://"),
            ) || allTabs[0];
        }

        if (
          candidateTab?.id &&
          candidateTab.url &&
          !candidateTab.url.startsWith("chrome://") &&
          !candidateTab.url.startsWith("edge://") &&
          !candidateTab.url.startsWith("about:") &&
          !candidateTab.url.startsWith("chrome-extension://")
        ) {
          tabId = candidateTab.id;
        }
      }

      const displaySeconds =
        (await storage.getItem<number>("local:passiveLearnDisplaySeconds")) ||
        20;

      const modeFlashcard =
        (await storage.getItem<boolean>("local:passiveLearnModeFlashcard")) ??
        true;
      const modeQuiz =
        (await storage.getItem<boolean>("local:passiveLearnModeQuiz")) ?? true;

      let currentMode: "flashcard" | "quiz" = "flashcard";
      if (modeFlashcard && modeQuiz) {
        currentMode = Math.random() < 0.5 ? "flashcard" : "quiz";
      } else if (modeQuiz) {
        currentMode = "quiz";
      } else {
        currentMode = "flashcard";
      }

      let quizPayload:
        | { questionKanji: string; options: QuizOption[] }
        | undefined = undefined;
      if (currentMode === "quiz") {
        const options = await backgroundGetQuizOptions(
          entry.w,
          entry.h,
          recent,
        );
        quizPayload = {
          questionKanji: entry.w,
          options,
        };
      }

      if (tabId) {
        try {
          await browser.tabs.sendMessage(tabId, {
            type: "SHOW_PASSIVE_LEARN",
            isUserTriggered,
            payload: {
              mode: currentMode,
              kanji: entry.w,
              hanViet: entry.h,
              on: entry.on,
              kun: entry.kun,
              level: entry.level?.[0] || "",
              example: sampleExample,
              displaySeconds,
              quiz: quizPayload,
            },
          });
          return { ok: true };
        } catch (e) {
          return {
            ok: false,
            error:
              "Tab này chưa tải phiên bản mới của extension. Hãy F5 tải lại trang web này rồi thử lại nhé!",
          };
        }
      }
      return {
        ok: false,
        error: "Hãy mở một tab trang web bất kỳ để hiển thị thẻ học.",
      };
    } catch (e) {
      console.error("Error triggering passive learn card:", e);
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === PASSIVE_ALARM_NAME) {
      await triggerPassiveLearnCard();
      await scheduleNextPassiveLearn();
    }
  });

  storage.watch<boolean>("local:passiveLearnEnabled", (enabled) => {
    if (enabled) {
      void scheduleNextPassiveLearn();
    } else {
      if (passiveShortTimer) {
        clearTimeout(passiveShortTimer);
        passiveShortTimer = null;
      }
      void browser.alarms.clear(PASSIVE_ALARM_NAME);
    }
  });

  storage.watch<boolean>("local:passiveLearnModeFlashcard", () => {
    void scheduleNextPassiveLearn();
  });

  storage.watch<boolean>("local:passiveLearnModeQuiz", () => {
    void scheduleNextPassiveLearn();
  });

  storage.watch<number>("local:passiveLearnInterval", () => {
    void scheduleNextPassiveLearn();
  });

  storage.watch<number>("local:passiveLearnIntervalSeconds", () => {
    void scheduleNextPassiveLearn();
  });

  storage.watch<number>("local:passiveLearnDisplaySeconds", () => {
    void scheduleNextPassiveLearn();
  });

  // Khởi động alarm nếu đã bật trước đó
  browser.alarms.get(PASSIVE_ALARM_NAME).then((existing) => {
    if (!existing) {
      void scheduleNextPassiveLearn();
    }
  });
});
