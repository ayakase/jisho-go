import { mount } from 'svelte';
import { storage } from '#imports';
import SelectionPopup from './SelectionPopup.svelte';
import HoverPopup from './HoverPopup.svelte';
import HoverParagraphPopup from './HoverParagraphPopup.svelte';
import { createWorker } from 'tesseract.js';
import {
  matchesOcrShortcut,
  normalizeOcrShortcut,
  type OcrShortcut,
} from '../lib/ocr-shortcut';

type PopupMode = 'off' | 'immediate' | 'button';
type HoverGrabMode = 'single-kanji' | 'paragraph';
type SearchButtonSize = 'small' | 'medium' | 'big';
type HoverParagraphSections = {
  translate: boolean;
  vocab: boolean;
  kanji: boolean;
};
const MAX_SELECTION_TEXT_LENGTH = 300;

const DEFAULT_HOVER_PARAGRAPH_SECTIONS: HoverParagraphSections = {
  translate: true,
  vocab: true,
  kanji: false,
};

let popupContainer: HTMLElement | null = null; // Click/selection popup
let hoverPopupContainer: HTMLElement | null = null; // Hover popup (separate)
let buttonContainer: HTMLElement | null = null;
let popupText: string | null = null;
let popupMode: PopupMode = 'immediate';
let hoverMode = false;
let hoverGrabMode: HoverGrabMode = 'single-kanji';
let hoverTimeout: number | null = null;
let hoverDelayMs = 300;
let selectionDelayMs = 300;
let lastHoveredText: string | null = null;
let selectionPopupTimeout: number | null = null;
let hoverParagraphSections: HoverParagraphSections = { ...DEFAULT_HOVER_PARAGRAPH_SECTIONS };
let blacklist: string[] = [];
let popupOpacity = 1;
let searchButtonSize: SearchButtonSize = 'medium';
let suppressSelectionPopupUntil = 0;
let lastContextMenuImage: HTMLImageElement | null = null;
let ocrShortcut: OcrShortcut | null = null;

function clampPopupOpacity(val: number): number {
  if (Number.isNaN(val)) return 1;
  return Math.max(0.1, Math.min(1, val));
}

function normalizeHoverParagraphSections(value: unknown): HoverParagraphSections {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_HOVER_PARAGRAPH_SECTIONS };
  }
  const raw = value as Partial<HoverParagraphSections>;
  return {
    translate: typeof raw.translate === 'boolean' ? raw.translate : DEFAULT_HOVER_PARAGRAPH_SECTIONS.translate,
    vocab: typeof raw.vocab === 'boolean' ? raw.vocab : DEFAULT_HOVER_PARAGRAPH_SECTIONS.vocab,
    kanji: typeof raw.kanji === 'boolean' ? raw.kanji : DEFAULT_HOVER_PARAGRAPH_SECTIONS.kanji,
  };
}

let ocrWorkerPromise: ReturnType<typeof createWorker> | null = null;

let ocrLoadingEl: HTMLDivElement | null = null;
let ocrScanFillEl: HTMLDivElement | null = null;
let ocrScanLineEl: HTMLDivElement | null = null;
let ocrScanBounds: DOMRect | null = null;
let ocrScanCreepTimer: ReturnType<typeof setInterval> | null = null;
let ocrScanCreepStart = 0;
let ocrScanDisplayPct = 0;
let ocrScanInitSeen = false;
let ocrDarkMode = false;
let ocrRequestId = 0;
let selectionOverlay: HTMLDivElement | null = null;

const OCR_SCAN_FADE_MS = 220;
const OCR_SCAN_LINE_H = 5;

// Kéo ít hơn ngần này coi như click (để click vào ảnh = OCR ảnh đó).
const OCR_CLICK_SLOP_PX = 4;

function ocrScanColors(isDark: boolean) {
  return isDark
    ? {
        fill: 'rgba(158, 195, 232, 0.16)',
        line: '#9ec3e8',
        glow: 'rgba(158, 195, 232, 0.65)',
        ring: 'rgba(158, 195, 232, 0.55)',
      }
    : {
        fill: 'rgba(91, 143, 197, 0.18)',
        line: '#5b8fc5',
        glow: 'rgba(91, 143, 197, 0.7)',
        ring: 'rgba(91, 143, 197, 0.5)',
      };
}

function applyOcrTheme() {
  if (!ocrLoadingEl) return;

  const { fill, line, glow, ring } = ocrScanColors(ocrDarkMode);
  ocrLoadingEl.style.boxShadow = `0 0 0 1px ${ring}`;
  if (ocrScanFillEl) ocrScanFillEl.style.background = fill;
  if (ocrScanLineEl) {
    ocrScanLineEl.style.background = line;
    ocrScanLineEl.style.boxShadow = `0 0 12px 2px ${glow}`;
  }
}

// Khi tesseract chưa báo gì (chụp màn hình, boot worker...) thì để vệt quét tự
// bò tới ~30% rồi đứng, KHÔNG chạy vòng lặp để khỏi quay ngược về 0.
const OCR_SCAN_CREEP_CAP = 30;
const OCR_SCAN_CREEP_TAU = 1200;
const OCR_SCAN_CREEP_TICK = 100;

// Tesseract báo progress theo từng phase, mỗi phase 0 → 1. Trải đều ra timeline
// để vệt quét chạy liền mạch từ lúc bắt đầu tới lúc xong.
const OCR_SCAN_PHASES: Record<string, [number, number]> = {
  'initializing tesseract': [0, 5],
  'loading language traineddata': [5, 25],
  'initializing api': [25, 30],
  'recognizing text': [30, 100],
};

function stopOcrScanCreep() {
  if (ocrScanCreepTimer !== null) {
    clearInterval(ocrScanCreepTimer);
    ocrScanCreepTimer = null;
  }
}

// Vệt quét chỉ tiến, không bao giờ lùi → không còn cảnh chạy hết rồi về 0.
function setOcrScanPct(pct: number) {
  const next = Math.max(ocrScanDisplayPct, Math.max(0, Math.min(100, pct)));
  if (next === ocrScanDisplayPct) return;

  ocrScanDisplayPct = next;
  positionOcrScanProgress(ocrScanDisplayPct);
}

function startOcrScanCreep() {
  stopOcrScanCreep();

  ocrScanCreepStart = performance.now();
  ocrScanCreepTimer = setInterval(() => {
    const elapsed = performance.now() - ocrScanCreepStart;
    setOcrScanPct(OCR_SCAN_CREEP_CAP * (1 - Math.exp(-elapsed / OCR_SCAN_CREEP_TAU)));
  }, OCR_SCAN_CREEP_TICK);
}

function positionOcrScanProgress(pct: number) {
  if (!ocrScanFillEl || !ocrScanLineEl || !ocrScanBounds) return;

  const clamped = Math.max(0, Math.min(100, pct));
  const filled = (ocrScanBounds.height * clamped) / 100;
  ocrScanFillEl.style.height = `${filled}px`;
  ocrScanLineEl.style.top = `${filled - OCR_SCAN_LINE_H / 2}px`;
}

// Hiện vệt quét OCR ngay trên khung vừa khoanh (thay cho loader ở góc).
function startOcrScan(bounds: DOMRect) {
  ocrScanBounds = bounds;
  ocrScanDisplayPct = 0;
  ocrScanInitSeen = false;

  if (!ocrLoadingEl) {
    ocrLoadingEl = document.createElement('div');
    ocrLoadingEl.style.cssText = `
      position: fixed;
      z-index: 2147483647;
      overflow: hidden;
      border-radius: 4px;
      pointer-events: none;
      opacity: 1;
      transition: opacity ${OCR_SCAN_FADE_MS}ms ease;
    `;

    // Lớp phủ mờ dần phần đã "quét" qua
    ocrScanFillEl = document.createElement('div');
    ocrScanFillEl.style.cssText = `
      position: absolute;
      left: 0; right: 0; top: 0;
      height: 0;
      transition: height .25s linear;
    `;

    // Vạch sáng chạy đúng vị trí progress
    ocrScanLineEl = document.createElement('div');
    ocrScanLineEl.style.cssText = `
      position: absolute;
      left: 2px; right: 2px;
      height: ${OCR_SCAN_LINE_H}px;
      top: ${-OCR_SCAN_LINE_H / 2}px;
      border-radius: 3px;
      transition: top .25s linear;
    `;

    ocrLoadingEl.append(ocrScanFillEl, ocrScanLineEl);
    document.body.appendChild(ocrLoadingEl);
  }

  ocrLoadingEl.style.left = `${bounds.left}px`;
  ocrLoadingEl.style.top = `${bounds.top}px`;
  ocrLoadingEl.style.width = `${bounds.width}px`;
  ocrLoadingEl.style.height = `${bounds.height}px`;
  ocrLoadingEl.style.opacity = '1';

  applyOcrTheme();
  positionOcrScanProgress(0);
  startOcrScanCreep();
}

function setOcrLoading(visible: boolean) {
  if (visible) return;

  ocrScanInitSeen = false;

  if (!ocrLoadingEl) {
    ocrScanBounds = null;
    return;
  }

  const el = ocrLoadingEl;
  stopOcrScanCreep();
  positionOcrScanProgress(100);

  ocrLoadingEl = null;
  ocrScanFillEl = null;
  ocrScanLineEl = null;
  ocrScanBounds = null;

  el.style.opacity = '0';
  window.setTimeout(() => el.remove(), OCR_SCAN_FADE_MS + 40);
}

function handleTesseractLog(m: any) {
  // Keep console logs off; use UI instead.
  if (!m || typeof m !== 'object') return;

  const status = typeof m.status === 'string' ? m.status : null;
  const progress = typeof m.progress === 'number' ? m.progress : null;
  if (!status || progress === null) return;

  if (status !== 'recognizing text') {
    ocrScanInitSeen = true;
  }

  const range = OCR_SCAN_PHASES[status];
  if (!range) return;

  // Worker đã warm (core + api init sẵn) thì chỉ còn phase recognizing, cho nó
  // chạy full 0 → 100 thay vì nhảy thẳng lên 30%.
  const [start, end] = status === 'recognizing text' && !ocrScanInitSeen ? [0, 100] : range;
  const phase = Math.max(0, Math.min(1, progress));
  setOcrScanPct(start + (end - start) * phase);
}

function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker('jpn', 1, {
      logger: handleTesseractLog,
      workerPath: browser.runtime.getURL('/tesseract/worker.min.js'),
      corePath: browser.runtime.getURL('/tesseract/tesseract-core.wasm.js'),
      langPath: browser.runtime.getURL('/tesseract/lang' as any) + '/',
    });
  }
  return ocrWorkerPromise;
}

async function runOcrFromBounds(rectBounds: DOMRect) {
  if (rectBounds.width <= 0 || rectBounds.height <= 0) {
    return;
  }

  const requestId = ++ocrRequestId;

  try {
    const response = await browser.runtime.sendMessage({
      type: "CAPTURE_SCREENSHOT",
      bounds: {
        x: rectBounds.x,
        y: rectBounds.y,
        width: rectBounds.width,
        height: rectBounds.height,
        devicePixelRatio: window.devicePixelRatio
      }
    });

    if (response && response.imageDataUrl) {
      // Hiện vệt quét SAU khi chụp xong, nếu không nó bị chụp luôn vào ảnh đem
      // đi OCR (viền khung + vạch quét nằm ngay trong vùng đang chụp).
      startOcrScan(rectBounds);

      const responseUrl = response.imageDataUrl as string;
      const res = await fetch(responseUrl);
      const blob = await res.blob();
      const worker = await getOcrWorker();
      const {
        data: { text },
      } = await worker.recognize(blob);
      const normalizedText = text.replace(/\s+/g, " ").trim();
      const hasJapanese = /[\u3040-\u30FF\u4E00-\u9FFF]/.test(
        normalizedText
      );
      if (hasJapanese && requestId === ocrRequestId) {
        showPopupNear(rectBounds, normalizedText);
      }
    } else if (response && response.error) {
      console.error("Capture error from background:", response.error);
      alert("Failed to capture: " + response.error);
    }
  } catch (error) {
    console.error("Content: OCR failed:", error);
    alert("Error capturing screenshot: " + error);
  } finally {
    if (requestId === ocrRequestId) {
      setOcrLoading(false);
    }
  }
}

function getImageFromContextMenu(srcUrl?: string): HTMLImageElement | null {
  if (
    lastContextMenuImage &&
    (!srcUrl || lastContextMenuImage.currentSrc === srcUrl || lastContextMenuImage.src === srcUrl) &&
    document.contains(lastContextMenuImage)
  ) {
    return lastContextMenuImage;
  }

  if (!srcUrl) {
    return null;
  }

  return Array.from(document.images).find((img) => {
    return img.currentSrc === srcUrl || img.src === srcUrl;
  }) ?? null;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  async main() {
    // Load settings
    await loadPopupMode();
    await loadHoverMode();
    await loadHoverGrabMode();
    await loadHoverDelayMs();
    await loadSelectionDelayMs();
    await loadHoverParagraphSections();
    await loadBlacklist();
    await loadPopupOpacity();
    await loadSearchButtonSettings();
    await loadOcrTheme();
    await loadOcrShortcut();

    storage.watch<unknown>('local:ocrShortcut', (value) => {
      ocrShortcut = normalizeOcrShortcut(value);
    });

    // Keyboard shortcut for the region-select OCR overlay
    document.addEventListener('keydown', handleOcrShortcutKeydown, true);

    // Watch blacklist changes so updates from the popup apply without reload
    storage.watch<unknown>('local:blacklist', (value) => {
      if (Array.isArray(value)) {
        blacklist = value as string[];
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        const values = Object.values(value as Record<string, unknown>)
          .map((v) => (typeof v === 'string' ? v.trim() : ''))
          .filter((v) => v.length > 0);
        blacklist = values;
      } else if (typeof value === 'string' && value.trim()) {
        blacklist = [value.trim()];
      } else {
        blacklist = [];
      }

      // If this site just became blacklisted, clean up any UI
      if (isBlacklistedLocation()) {
        removePopup();
        removeButton();
        cleanupHoverMode();
      }
    });

    // Listen for storage changes using WXT storage watch
    storage.watch<PopupMode>('local:popupMode', (newMode, oldMode) => {
      if (newMode) {
        popupMode = newMode;
        if (popupMode === 'off') {
          removePopup();
          removeButton();
        }
      }
    });

    // Watch for popup opacity changes
    storage.watch<number>('local:popupOpacity', (newOpacity) => {
      popupOpacity =
        typeof newOpacity === "number" ? clampPopupOpacity(newOpacity) : 1;
      applyPopupOpacity();
    });

    storage.watch<SearchButtonSize>('local:searchButtonSize', (newSize) => {
      if (newSize === 'small' || newSize === 'medium' || newSize === 'big') {
        searchButtonSize = newSize;
      } else {
        searchButtonSize = 'medium';
      }
    });

    storage.watch<boolean>('local:darkMode', (newMode) => {
      ocrDarkMode = newMode === true;
      applyOcrTheme();
    });

    // Show a small popup next to highlighted text on the page
    document.addEventListener('mousedown', (event) => {
      if (
        (popupContainer && popupContainer.contains(event.target as Node)) ||
        (hoverPopupContainer && hoverPopupContainer.contains(event.target as Node)) ||
        (buttonContainer && buttonContainer.contains(event.target as Node))
      ) {
        return;
      }

      if (selectionPopupTimeout !== null) {
        clearTimeout(selectionPopupTimeout);
        selectionPopupTimeout = null;
      }
    }, true);

    document.addEventListener('mouseup', (event) => {
      if (selectionPopupTimeout !== null) {
        clearTimeout(selectionPopupTimeout);
        selectionPopupTimeout = null;
      }

      if (Date.now() < suppressSelectionPopupUntil) {
        return;
      }
      // Don't process if clicking inside the popup, hover popup, or button
      if (
        (popupContainer && popupContainer.contains(event.target as Node)) ||
        (hoverPopupContainer && hoverPopupContainer.contains(event.target as Node)) ||
        (buttonContainer && buttonContainer.contains(event.target as Node))
      ) {
        return;
      }
      // Do nothing on blacklisted sites
      if (isBlacklistedLocation()) {
        removePopup();
        removeButton();
        return;
      }

      // If popup mode is off, don't show anything
      if (popupMode === 'off') {
        removePopup();
        removeButton();
        return;
      }

      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (!text || !selection || selection.rangeCount === 0) {
        // If no text is selected, remove popup and button
        removePopup();
        removeButton();
        return;
      }

      // Only show popup/button if text contains Japanese characters
      if (!hasJapaneseChars(text)) {
        removePopup();
        removeButton();
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const sourceRange = range.cloneRange();
      const selectedText = text;
      const lookupText = text.slice(0, MAX_SELECTION_TEXT_LENGTH);
      const isTextTruncated = text.length > MAX_SELECTION_TEXT_LENGTH;

      // Clear any hover popup when showing selection popup
      removeHoverPopup();

      selectionPopupTimeout = window.setTimeout(() => {
        selectionPopupTimeout = null;

        const currentSelection = window.getSelection();
        if (
          !currentSelection ||
          currentSelection.rangeCount === 0 ||
          currentSelection.toString().trim() !== selectedText
        ) {
          return;
        }

        if (popupMode === 'button') {
          showButtonNear(rect, lookupText, sourceRange, isTextTruncated);
        } else {
          showPopupNear(rect, lookupText, sourceRange, isTextTruncated);
        }
      }, selectionDelayMs);
    });
    // Escape closes every extension overlay currently shown on the page.
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;

      const hasOpenUi =
        popupContainer !== null ||
        hoverPopupContainer !== null ||
        buttonContainer !== null ||
        selectionOverlay !== null ||
        ocrLoadingEl !== null;

      if (!hasOpenUi) return;

      event.preventDefault();
      event.stopPropagation();
      closeAllPopups();
    }, true);

    // Watch for hover mode changes
    storage.watch<boolean>('local:hoverMode', (newMode) => {
      hoverMode = newMode ?? false;
      if (hoverMode) {
        setupHoverMode();
      } else {
        cleanupHoverMode();
      }
    });

    storage.watch<HoverGrabMode>('local:hoverGrabMode', (newMode) => {
      if (newMode === 'paragraph' || newMode === 'single-kanji') {
        hoverGrabMode = newMode;
      } else {
        hoverGrabMode = 'single-kanji';
      }
    });

    storage.watch<number>('local:hoverDelayMs', (newDelay) => {
      if (typeof newDelay === 'number' && Number.isFinite(newDelay)) {
        hoverDelayMs = Math.max(0, Math.round(newDelay));
      } else {
        hoverDelayMs = 300;
      }
    });

    storage.watch<number>('local:selectionDelayMs', (newDelay) => {
      if (typeof newDelay === 'number' && Number.isFinite(newDelay)) {
        selectionDelayMs = Math.max(0, Math.min(3000, Math.round(newDelay)));
      } else {
        selectionDelayMs = 300;
      }
    });

    storage.watch<unknown>('local:hoverParagraphSections', (newSections) => {
      hoverParagraphSections = normalizeHoverParagraphSections(newSections);
    });

    // Initialize hover mode if enabled
    if (hoverMode) {
      setupHoverMode();
    }

    document.addEventListener('contextmenu', (event) => {
      const image = (event.target as Element | null)?.closest?.('img');
      lastContextMenuImage = image instanceof HTMLImageElement ? image : null;
    }, true);
  },
});

async function loadPopupMode() {
  try {
    const stored = await storage.getItem<PopupMode>('local:popupMode');
    if (stored) {
      popupMode = stored;
    }
  } catch (error) {
    console.error('Failed to load popup mode:', error);
  }
}

async function loadOcrTheme() {
  try {
    ocrDarkMode = (await storage.getItem<boolean>('local:darkMode')) === true;
  } catch (error) {
    console.error('Failed to load OCR theme:', error);
  }
}

async function loadOcrShortcut() {
  try {
    const stored = await storage.getItem<unknown>('local:ocrShortcut');
    ocrShortcut = normalizeOcrShortcut(stored);
  } catch (error) {
    console.error('Failed to load OCR shortcut:', error);
    ocrShortcut = null;
  }
}

async function loadHoverMode() {
  try {
    const stored = await storage.getItem<boolean>('local:hoverMode');
    if (stored !== null && stored !== undefined) {
      hoverMode = stored;
    }
  } catch (error) {
    console.error('Failed to load hover mode:', error);
  }
}

async function loadHoverGrabMode() {
  try {
    const stored = await storage.getItem<HoverGrabMode>('local:hoverGrabMode');
    if (stored === 'paragraph' || stored === 'single-kanji') {
      hoverGrabMode = stored;
    }
  } catch (error) {
    console.error('Failed to load hover grab mode:', error);
  }
}

async function loadHoverDelayMs() {
  try {
    const stored = await storage.getItem<number>('local:hoverDelayMs');
    if (typeof stored === 'number' && Number.isFinite(stored)) {
      hoverDelayMs = Math.max(0, Math.round(stored));
    }
  } catch (error) {
    console.error('Failed to load hover delay ms:', error);
  }
}

async function loadSelectionDelayMs() {
  try {
    const stored = await storage.getItem<number>('local:selectionDelayMs');
    if (typeof stored === 'number' && Number.isFinite(stored)) {
      selectionDelayMs = Math.max(0, Math.min(3000, Math.round(stored)));
    }
  } catch (error) {
    console.error('Failed to load selection delay ms:', error);
  }
}

async function loadHoverParagraphSections() {
  try {
    const stored = await storage.getItem<unknown>('local:hoverParagraphSections');
    hoverParagraphSections = normalizeHoverParagraphSections(stored);
  } catch (error) {
    console.error('Failed to load hover paragraph sections:', error);
    hoverParagraphSections = { ...DEFAULT_HOVER_PARAGRAPH_SECTIONS };
  }
}

async function loadBlacklist() {
  try {
    const stored = await storage.getItem<unknown>('local:blacklist');
    if (Array.isArray(stored)) {
      // Đã là array rồi
      blacklist = stored as string[];
    } else if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      // Trường hợp Chrome/WXT show dạng {"0":"url1","1":"url2"}
      const values = Object.values(stored as Record<string, unknown>)
        .map((v) => (typeof v === 'string' ? v.trim() : ''))
        .filter((v) => v.length > 0);
      blacklist = values;
    } else if (typeof stored === 'string' && stored.trim()) {
      // Backward compatibility if a single string was stored before
      blacklist = [stored.trim()];
    } else {
      blacklist = [];
    }
  } catch (error) {
    console.error('Failed to load blacklist:', error);
  }
}

async function loadPopupOpacity() {
  try {
    const stored = await storage.getItem<number>('local:popupOpacity');
    popupOpacity =
      typeof stored === 'number' ? clampPopupOpacity(stored) : 1;
  } catch (error) {
    console.error('Failed to load popup opacity:', error);
    popupOpacity = 1;
  }
}

function applyPopupOpacity() {
  if (popupContainer) popupContainer.style.opacity = popupOpacity.toString();
  if (hoverPopupContainer) hoverPopupContainer.style.opacity = popupOpacity.toString();
}

async function loadSearchButtonSettings() {
  try {
    const storedSize = await storage.getItem<SearchButtonSize>('local:searchButtonSize');
    if (storedSize === 'small' || storedSize === 'medium' || storedSize === 'big') {
      searchButtonSize = storedSize;
    }

  } catch (error) {
    console.error('Failed to load search button settings:', error);
    searchButtonSize = 'medium';
  }
}

function isBlacklistedLocation(): boolean {
  const host = window.location.hostname.toLowerCase();
  return blacklist.some((entry) => {
    const trimmed = entry.trim().toLowerCase();
    if (!trimmed) return false;

    // Try to interpret entry as URL or plain domain and extract hostname
    let domain = trimmed;
    try {
      const url = new URL(trimmed);
      domain = url.hostname.toLowerCase();
    } catch {
      try {
        const url = new URL(`https://${trimmed}`);
        domain = url.hostname.toLowerCase();
      } catch {
        // If it still can't be parsed, fall back to raw string
        domain = trimmed;
      }
    }

    return host === domain || host.endsWith(`.${domain}`);
  });
}

function removePopup() {
  if (popupContainer) {
    popupContainer.remove();
    popupContainer = null;
    popupText = null;
  }
}

function removeHoverPopup() {
  if (hoverPopupContainer) {
    hoverPopupContainer.remove();
    hoverPopupContainer = null;
    lastHoveredText = null;
  }
}

function removeButton() {
  if (buttonContainer) {
    buttonContainer.remove();
    buttonContainer = null;
  }
}

function removeSelectionOverlay() {
  if (selectionOverlay) {
    selectionOverlay.remove();
    selectionOverlay = null;
  }
}

function closeAllPopups() {
  if (selectionPopupTimeout !== null) {
    clearTimeout(selectionPopupTimeout);
    selectionPopupTimeout = null;
  }
  removePopup();
  removeHoverPopup();
  removeButton();
  removeSelectionOverlay();
  if (hoverTimeout !== null) {
    clearTimeout(hoverTimeout);
    hoverTimeout = null;
  }
  if (hoverLeaveTimeout !== null) {
    clearTimeout(hoverLeaveTimeout);
    hoverLeaveTimeout = null;
  }
  lastHoveredText = null;
  setOcrLoading(false);
  ocrRequestId += 1;
}

// Check if string contains Japanese characters (kanji, hiragana, katakana)
function hasJapaneseChars(str: string): boolean {
  const kanjiRegex = /[\u4E00-\u9FAF]/;
  const hiraganaRegex = /[\u3040-\u309F]/;
  const katakanaRegex = /[\u30A0-\u30FF]/;
  return kanjiRegex.test(str) || hiraganaRegex.test(str) || katakanaRegex.test(str);
}

function showButtonNear(
  rect: DOMRect,
  text: string,
  sourceRange: Range,
  isTextTruncated = false,
) {
  // Remove existing button and popup
  removeButton();
  removePopup();

  // Create button container
  buttonContainer = document.createElement('div');
  buttonContainer.id = 'jisho-go-search-button';
  buttonContainer.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    font-family: system-ui, -apple-system, sans-serif;
  `;

  const sizeConfig =
    searchButtonSize === 'small'
      ? { buttonSize: 30, iconSize: 16, paddingRem: 0.35 }
      : searchButtonSize === 'big'
        ? { buttonSize: 44, iconSize: 24, paddingRem: 0.65 }
        : { buttonSize: 36, iconSize: 20, paddingRem: 0.5 };

  const GAP = 8;
  const PADDING = 12;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Calculate button position
  let left = rect.left;
  let top = rect.bottom + GAP;

  // Ensure button stays within viewport (button is ~36px with icon + padding)
  const BUTTON_SIZE = sizeConfig.buttonSize;
  if (left + BUTTON_SIZE > viewportWidth - PADDING) {
    left = viewportWidth - BUTTON_SIZE - PADDING;
  }
  if (top + BUTTON_SIZE > viewportHeight - PADDING) {
    top = rect.top - BUTTON_SIZE - GAP;
  }
  left = Math.max(PADDING, left);
  top = Math.max(PADDING, top);

  buttonContainer.style.left = `${left}px`;
  buttonContainer.style.top = `${top}px`;

  // Create button element
  const button = document.createElement('button');
  button.innerHTML = `
    <svg width="${sizeConfig.iconSize}px" height="${sizeConfig.iconSize}px" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.545 15.467l-3.779-3.779a6.15 6.15 0 0 0 .898-3.21c0-3.417-2.961-6.377-6.378-6.377A6.185 6.185 0 0 0 2.1 8.287c0 3.416 2.961 6.377 6.377 6.377a6.15 6.15 0 0 0 3.115-.844l3.799 3.801a.953.953 0 0 0 1.346 0l.943-.943c.371-.371.236-.84-.135-1.211zM4.004 8.287a4.282 4.282 0 0 1 4.282-4.283c2.366 0 4.474 2.107 4.474 4.474a4.284 4.284 0 0 1-4.283 4.283c-2.366-.001-4.473-2.109-4.473-4.474z" fill="white"/>
    </svg>
  `;
  button.style.cssText = `
    padding: ${sizeConfig.paddingRem}rem;
    background-color: #f87171;
    color: white;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    transition: background-color 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  button.onmouseenter = () => {
    button.style.backgroundColor = '#ef4444';
  };
  button.onmouseleave = () => {
    button.style.backgroundColor = '#f87171';
  };

  button.onclick = (e) => {
    e.stopPropagation();
    removeButton();
    showPopupNear(rect, text, sourceRange, isTextTruncated);
  };

  buttonContainer.appendChild(button);
  document.body.appendChild(buttonContainer);

  // The trigger button is temporary and disappears when focus moves elsewhere.
  const handleClickOutside = (ev: MouseEvent) => {
    if (buttonContainer && !buttonContainer.contains(ev.target as Node)) {
      removeButton();
      document.removeEventListener('mousedown', handleClickOutside);
    }
  };
  setTimeout(() => {
    document.addEventListener('mousedown', handleClickOutside);
  }, 0);
}

function showPopupNear(
  rect: DOMRect,
  text: string,
  sourceRange?: Range | null,
  isTextTruncated = false,
) {
  // Remove existing popup and button
  removePopup();
  removeButton();

  // Create container for the Svelte component
  popupContainer = document.createElement('div');
  popupContainer.id = 'jisho-go-selection-popup-container';
  popupContainer.style.position = 'absolute';
  popupContainer.style.zIndex = '2147483647';
  document.body.appendChild(popupContainer);
  applyPopupOpacity();

  // Store the text so we can keep the popup even if selection is cleared
  popupText = text;

  // Popup dimensions (from CSS)
  const POPUP_MAX_WIDTH = 700;
  const POPUP_MAX_HEIGHT = Math.min(600, window.innerHeight * 0.8); // 600px or 80vh, whichever is smaller
  const GAP = 8; // Gap between selection and popup
  const PADDING = 12; // Padding from viewport edges

  // Calculate optimal position
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Horizontal positioning
  let left = rect.left;
  // If popup would overflow on the right, align to the right edge of selection or viewport
  if (left + POPUP_MAX_WIDTH > viewportWidth - PADDING) {
    // Try positioning to the left of the selection
    if (rect.left - POPUP_MAX_WIDTH >= PADDING) {
      left = rect.left - POPUP_MAX_WIDTH;
    } else {
      // If that doesn't fit, align to viewport edge
      left = viewportWidth - POPUP_MAX_WIDTH - PADDING;
    }
  }
  // Ensure we don't go off the left edge
  left = Math.max(PADDING, left);

  // Vertical positioning - prioritize keeping popup near the selection
  // Always try to position below the selection first
  let top = rect.bottom + GAP;

  // If popup would overflow the bottom, adjust to fit within viewport
  if (top + POPUP_MAX_HEIGHT > viewportHeight - PADDING) {
    // Keep it below the selection but constrain to viewport bottom
    const maxTopForBottom = viewportHeight - POPUP_MAX_HEIGHT - PADDING;

    // Only move above if there's VERY little space below (less than 100px)
    const spaceBelow = viewportHeight - rect.bottom - GAP - PADDING;
    if (spaceBelow < 100 && rect.top - PADDING >= 300) {
      // Position above selection, but keep it close
      top = rect.top - Math.min(POPUP_MAX_HEIGHT, rect.top - PADDING) - GAP;
    } else {
      // Position below but fit within viewport - keep as close to selection as possible
      top = Math.max(PADDING, Math.min(rect.bottom + GAP, maxTopForBottom));
    }
  }

  // Final safety check
  top = Math.max(PADDING, top);

  // Mount the Svelte component
  mount(SelectionPopup, {
    target: popupContainer,
    props: {
      text,
      isTextTruncated,
      sourceRange: sourceRange?.cloneRange() ?? null,
      position: {
        left,
        top,
      },
    },
  });

  // Stop clicks inside popup from propagating, but allow button clicks
  // Use capture phase to catch events on child elements
  const stopPropagation = (ev: Event) => {
    const target = ev.target as HTMLElement;
    // Don't stop propagation for buttons - they need to handle their own clicks
    if (
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('.source-match, .source-kanji-clickable, .popup-drag-handle')
    ) {
      return;
    }
    ev.stopPropagation();
  };
  popupContainer.addEventListener('mousedown', stopPropagation, true);
  popupContainer.addEventListener('mouseup', stopPropagation, true);
}

// Check if a character is a kanji
function isKanji(char: string): boolean {
  const kanjiRegex = /[\u4E00-\u9FAF]/;
  return kanjiRegex.test(char);
}

// Get character at cursor position
function getCharAtPosition(x: number, y: number): { char: string; rect: DOMRect | null } {
  // Try caretRangeFromPoint first (Chrome, Firefox)
  let range: Range | null = null;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(x, y);
  } else if ((document as any).caretPositionFromPoint) {
    // Firefox fallback
    const pos = (document as any).caretPositionFromPoint(x, y);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.setEnd(pos.offsetNode, pos.offset);
    }
  }

  if (!range) {
    return { char: '', rect: null };
  }

  const container = range.startContainer;
  let char = '';
  let rect: DOMRect | null = null;

  if (container.nodeType === Node.TEXT_NODE) {
    const text = container.textContent || '';
    const offset = range.startOffset;

    // Try to get character at or before the offset
    char = text.charAt(offset) || text.charAt(Math.max(0, offset - 1)) || '';

    // Only proceed if it's a kanji
    if (char && isKanji(char)) {
      // Create a range for the character to get its position
      const charRange = document.createRange();
      const charOffset = text.charAt(offset) === char ? offset : Math.max(0, offset - 1);

      if (charOffset >= 0 && charOffset < text.length) {
        try {
          charRange.setStart(container, charOffset);
          charRange.setEnd(container, charOffset + 1);
          rect = charRange.getBoundingClientRect();
        } catch (e) {
          // Fallback to using the container's position
          const parentRect = (container.parentElement as HTMLElement)?.getBoundingClientRect();
          if (parentRect) {
            rect = new DOMRect(parentRect.left, parentRect.top, 0, parentRect.height);
          }
        }
      }
    }
  }

  return { char, rect };
}

let hoverMouseMoveHandler: ((e: MouseEvent) => void) | null = null;
let hoverMouseLeaveHandler: ((e: MouseEvent) => void) | null = null;
let hoverLeaveTimeout: number | null = null;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isLikelyBlockElement(el: Element): boolean {
  const tag = el.tagName.toUpperCase();
  if (/^H[1-6]$/.test(tag)) return true;
  const display = window.getComputedStyle(el).display;
  return (
    display === 'block' ||
    display === 'list-item' ||
    display === 'table-cell' ||
    display === 'table-row' ||
    display === 'flex' ||
    display === 'grid'
  );
}

type TextChunkCaptureMode = 'legacy' | 'semantic-only' | 'bounded-block';

const TEXT_CHUNK_CAPTURE_MODE_OPTIONS: Array<{ mode: TextChunkCaptureMode; description: string }> = [
  {
    mode: 'legacy',
    description:
      'Current behavior: semantic tags first, then nearest block ancestor, then target text fallback.',
  },
  {
    mode: 'semantic-only',
    description:
      'Strict mode: only capture from semantic text containers (p/li/headings/etc), otherwise return empty.',
  },
  {
    mode: 'bounded-block',
    description:
      'Balanced mode: semantic first; otherwise allow nearby block elements but reject huge page-level wrappers.',
  },
];

// Change this value directly in code to compare strategies quickly.
const CURRENT_TEXT_CHUNK_CAPTURE_MODE: TextChunkCaptureMode = 'bounded-block';

function getTextChunkFromTargetLegacy(target: EventTarget | null): string {
  if (!(target instanceof Element)) return '';

  // Prefer explicit text containers first.
  const preferred = target.closest(
    'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,td,th,figcaption,label',
  );
  if (preferred) {
    const preferredText = normalizeWhitespace(preferred.textContent || '');
    if (preferredText) return preferredText;
  }

  // Fallback: find nearest block-like ancestor that has meaningful text.
  let current: Element | null = target;
  while (current && current !== document.body) {
    const text = normalizeWhitespace(current.textContent || '');
    if (text && isLikelyBlockElement(current)) {
      return text;
    }
    current = current.parentElement;
  }

  // Last resort for inline-only fragments.
  return normalizeWhitespace(target.textContent || '');
}

function getTextChunkFromTargetSemanticOnly(target: EventTarget | null): string {
  if (!(target instanceof Element)) return '';

  const preferred = target.closest(
    'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,td,th,figcaption,label',
  );
  if (!preferred) return '';

  return normalizeWhitespace(preferred.textContent || '');
}

function getTextChunkFromTargetBoundedBlock(target: EventTarget | null): string {
  if (!(target instanceof Element)) return '';

  const semantic = getTextChunkFromTargetSemanticOnly(target);
  if (semantic) return semantic;

  const viewportArea = window.innerWidth * window.innerHeight;
  let current: Element | null = target;
  while (current && current !== document.body && current !== document.documentElement) {
    const text = normalizeWhitespace(current.textContent || '');
    if (!text || !isLikelyBlockElement(current)) {
      current = current.parentElement;
      continue;
    }

    const rect = current.getBoundingClientRect();
    const area = Math.max(0, rect.width) * Math.max(0, rect.height);
    const isTooLarge = viewportArea > 0 && area / viewportArea > 0.7;
    const isTooLong = text.length > 800;
    if (!isTooLarge && !isTooLong) {
      return text;
    }
    current = current.parentElement;
  }

  return '';
}

function getTextChunkFromTarget(target: EventTarget | null): string {
  switch (CURRENT_TEXT_CHUNK_CAPTURE_MODE) {
    case 'semantic-only':
      return getTextChunkFromTargetSemanticOnly(target);
    case 'bounded-block':
      return getTextChunkFromTargetBoundedBlock(target);
    case 'legacy':
    default:
      return getTextChunkFromTargetLegacy(target);
  }
}

function getTargetRect(target: EventTarget | null): DOMRect | null {
  if (!(target instanceof Element)) return null;
  const rect = target.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return rect;
}

function setupHoverMode() {
  cleanupHoverMode();

  hoverMouseMoveHandler = (e: MouseEvent) => {
    if (hoverLeaveTimeout !== null) {
      clearTimeout(hoverLeaveTimeout);
      hoverLeaveTimeout = null;
    }

    // Do nothing on blacklisted sites
    if (isBlacklistedLocation()) {
      removeHoverPopup();
      return;
    }
    // Priority: Selection mode popup/button takes precedence - skip hover if they exist
    // This ensures click/selection mode always has priority over hover mode
    if (popupContainer || buttonContainer) {
      return;
    }

    // Don't trigger if hovering over hover popup itself
    if (hoverPopupContainer && hoverPopupContainer.contains(e.target as Node)) {
      return;
    }

    // Don't trigger if user is actively selecting text (mouse is down)
    if (e.buttons !== 0) {
      removeHoverPopup();
      return;
    }

    // Don't trigger if there's an active text selection
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      removeHoverPopup();
      return;
    }

    // Clear any existing timeout
    if (hoverTimeout !== null) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }

    // Add small delay to avoid flickering
    hoverTimeout = window.setTimeout(() => {
      if (hoverGrabMode === 'paragraph') {
        const textChunk = getTextChunkFromTarget(e.target);
        
        // Skip reload if we're still hovering over the same content
        if (textChunk && textChunk === lastHoveredText && hoverPopupContainer) {
          return;
        }

        removeHoverPopup();
        
        if (textChunk) {
          lastHoveredText = textChunk;
          showHoverParagraphPopupNear(e.clientX, e.clientY, textChunk);
        } else {
          removeHoverPopup();
        }
        return;
      }

      const { char, rect } = getCharAtPosition(e.clientX, e.clientY);

      if (char && isKanji(char) && rect) {
        showHoverPopupNear(rect, char);
      } else {
        removeHoverPopup();
      }
    }, hoverDelayMs);
  };

  hoverMouseLeaveHandler = (e: MouseEvent) => {
    if (hoverTimeout !== null) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    // Don't remove if moving to hover popup - let it stay open
    if (hoverPopupContainer && e.relatedTarget && hoverPopupContainer.contains(e.relatedTarget as Node)) {
      return;
    }
    // Only remove if not hovering over the popup itself
    if (hoverLeaveTimeout !== null) {
      clearTimeout(hoverLeaveTimeout);
      hoverLeaveTimeout = null;
    }
    hoverLeaveTimeout = window.setTimeout(() => {
      if (hoverPopupContainer && !hoverPopupContainer.matches(':hover')) {
        // Check if mouse is still over the popup
        const rect = hoverPopupContainer.getBoundingClientRect();
        const x = (e as any).clientX || 0;
        const y = (e as any).clientY || 0;
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
          removeHoverPopup();
        }
      }
      hoverLeaveTimeout = null;
    }, 500); // Longer delay to allow moving to popup
  };

  document.addEventListener('mousemove', hoverMouseMoveHandler);
  document.addEventListener('mouseout', hoverMouseLeaveHandler);
}

function showHoverPopupNear(rect: DOMRect, kanji: string) {
  // Remove existing hover popup
  removeHoverPopup();

  // Don't show hover popup if click popup is active
  if (popupContainer || buttonContainer) {
    return;
  }

  // Create container for the hover popup
  hoverPopupContainer = document.createElement('div');
  hoverPopupContainer.id = 'jisho-go-hover-popup-container';
  hoverPopupContainer.style.position = 'absolute';
  hoverPopupContainer.style.zIndex = '2147483647';
  document.body.appendChild(hoverPopupContainer);
  applyPopupOpacity();

  // Popup dimensions
  const POPUP_WIDTH = 500;
  const POPUP_MAX_HEIGHT = Math.min(500, window.innerHeight * 0.8);
  const GAP = 8;
  const PADDING = 12;

  // Calculate position
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Horizontal positioning
  let left = rect.right + GAP;
  if (left + POPUP_WIDTH > viewportWidth - PADDING) {
    left = rect.left - POPUP_WIDTH - GAP;
  }
  left = Math.max(PADDING, Math.min(left, viewportWidth - POPUP_WIDTH - PADDING));

  // Vertical positioning
  let top = rect.top;
  if (top + POPUP_MAX_HEIGHT > viewportHeight - PADDING) {
    top = viewportHeight - POPUP_MAX_HEIGHT - PADDING;
  }
  top = Math.max(PADDING, top);

  // Mount the hover popup component
  mount(HoverPopup, {
    target: hoverPopupContainer,
    props: {
      text: kanji,
      position: {
        left,
        top,
      },
    },
  });

  // Stop clicks inside hover popup from propagating
  const stopPropagation = (ev: Event) => {
    ev.stopPropagation();
  };
  hoverPopupContainer.addEventListener('mousedown', stopPropagation, true);
  hoverPopupContainer.addEventListener('mouseup', stopPropagation, true);
  hoverPopupContainer.addEventListener('click', stopPropagation, true);

  // Keep hover popup open when hovering over it
  hoverPopupContainer.addEventListener('mouseenter', () => {
    if (hoverTimeout !== null) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
  });
}

function showHoverParagraphPopupNear(x: number, y: number, text: string) {
  // Remove existing hover popup
  removeHoverPopup();

  // Don't show hover popup if click popup is active
  if (popupContainer || buttonContainer) {
    return;
  }

  // Create container for the hover popup
  hoverPopupContainer = document.createElement('div');
  hoverPopupContainer.id = 'jisho-go-hover-popup-container';
  hoverPopupContainer.style.position = 'absolute';
  hoverPopupContainer.style.zIndex = '2147483647';
  document.body.appendChild(hoverPopupContainer);
  applyPopupOpacity();

  // Popup dimensions
  const POPUP_WIDTH = 440; // Match CSS width in HoverParagraphPopup.svelte
  const POPUP_MAX_HEIGHT = Math.min(440, window.innerHeight * 0.8);
  const GAP = 15; // Slightly larger gap for mouse positioning
  const PADDING = 12;

  // Calculate position
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Horizontal positioning - try to center or align to mouse
  let left = x + GAP;
  if (left + POPUP_WIDTH > viewportWidth - PADDING) {
    left = x - POPUP_WIDTH - GAP;
  }
  left = Math.max(PADDING, Math.min(left, viewportWidth - POPUP_WIDTH - PADDING));

  // Vertical positioning - below mouse, or above if no space
  let top = y + GAP;
  if (top + POPUP_MAX_HEIGHT > viewportHeight - PADDING) {
    top = y - POPUP_MAX_HEIGHT - GAP;
  }
  top = Math.max(PADDING, top);

  // Mount the paragraph hover popup component
  mount(HoverParagraphPopup, {
    target: hoverPopupContainer,
    props: {
      text,
      sections: hoverParagraphSections,
      position: {
        left,
        top,
      },
    },
  });

  // Stop clicks inside hover popup from propagating
  const stopPropagation = (ev: Event) => {
    ev.stopPropagation();
  };
  hoverPopupContainer.addEventListener('mousedown', stopPropagation, true);
  hoverPopupContainer.addEventListener('mouseup', stopPropagation, true);
  hoverPopupContainer.addEventListener('click', stopPropagation, true);

  // Keep hover popup open when hovering over it
  hoverPopupContainer.addEventListener('mouseenter', () => {
    if (hoverTimeout !== null) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
  });
}

function cleanupHoverMode() {
  if (hoverMouseMoveHandler) {
    document.removeEventListener('mousemove', hoverMouseMoveHandler);
    hoverMouseMoveHandler = null;
  }
  if (hoverMouseLeaveHandler) {
    document.removeEventListener('mouseout', hoverMouseLeaveHandler);
    hoverMouseLeaveHandler = null;
  }
  if (hoverTimeout !== null) {
    clearTimeout(hoverTimeout);
    hoverTimeout = null;
  }
  removeHoverPopup();
}

// Ảnh nằm dưới overlay nên phải soi cả stack phía dưới, không dùng elementFromPoint.
function findImageAtPoint(x: number, y: number): HTMLImageElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el instanceof HTMLImageElement) return el;
  }
  return null;
}

function startSelectionOcr() {
  const overlay = document.createElement("div");
  removeSelectionOverlay();
  selectionOverlay = overlay;
  overlay.style.position = "fixed";
  overlay.style.top = "0";
  overlay.style.left = "0";
  overlay.style.width = "100vw";
  overlay.style.height = "100vh";
  overlay.style.cursor = "crosshair";
  overlay.style.zIndex = "999999";
  document.body.appendChild(overlay);

  // Nền mờ tách riêng để lúc hover trúng ảnh có thể tắt đi, nhường chỗ cho
  // spotlight bên dưới (ảnh sáng nguyên, phần còn lại vẫn tối như cũ).
  const dim = document.createElement("div");
  dim.style.position = "absolute";
  dim.style.inset = "0";
  dim.style.background = "rgba(0,0,0,0.2)";
  dim.style.pointerEvents = "none";
  overlay.appendChild(dim);

  const highlight = document.createElement("div");
  highlight.style.position = "absolute";
  highlight.style.border = "2px solid #4ea1ff";
  highlight.style.borderRadius = "4px";
  highlight.style.boxShadow = "0 0 0 9999px rgba(0,0,0,0.2)";
  highlight.style.pointerEvents = "none";
  highlight.style.display = "none";
  overlay.appendChild(highlight);

  let startX = 0, startY = 0, downX = 0, downY = 0;
  let rect: HTMLDivElement | null = null;
  let isDrawing = false;
  let hoveredImage: HTMLImageElement | null = null;

  const removeOverlay = () => {
    if (selectionOverlay === overlay) {
      removeSelectionOverlay();
    } else {
      overlay.remove();
    }
  };

  const showHighlight = (img: HTMLImageElement) => {
    const bounds = img.getBoundingClientRect();
    highlight.style.left = `${bounds.left}px`;
    highlight.style.top = `${bounds.top}px`;
    highlight.style.width = `${bounds.width}px`;
    highlight.style.height = `${bounds.height}px`;
    highlight.style.display = "block";
    dim.style.display = "none";
  };

  const hideHighlight = () => {
    highlight.style.display = "none";
    dim.style.display = "block";
  };

  overlay.onmousedown = (e) => {
    // Prevent creating multiple rectangles
    if (isDrawing) return;

    isDrawing = true;
    startX = e.clientX;
    startY = e.clientY;
    downX = e.clientX;
    downY = e.clientY;

    // Chốt ảnh ngay tại điểm bấm (không phụ thuộc lần mousemove trước đó) để
    // biết đây là click vào ảnh hay kéo khoanh vùng.
    hoveredImage = findImageAtPoint(e.clientX, e.clientY);

    hideHighlight();

    // Remove any existing rect
    if (rect && overlay.contains(rect)) {
      overlay.removeChild(rect);
    }

    rect = document.createElement("div");
    rect.style.position = "absolute";
    rect.style.border = "2px dashed red";
    rect.style.left = `${startX}px`;
    rect.style.top = `${startY}px`;
    rect.style.pointerEvents = "none"; // Important: let events pass through
    overlay.appendChild(rect);
  };

  overlay.onmousemove = (e) => {
    if (isDrawing) {
      if (!rect) return;
      const width = e.clientX - startX;
      const height = e.clientY - startY;
      rect.style.width = `${Math.abs(width)}px`;
      rect.style.height = `${Math.abs(height)}px`;
      rect.style.left = `${width < 0 ? e.clientX : startX}px`;
      rect.style.top = `${height < 0 ? e.clientY : startY}px`;
      return;
    }

    const img = findImageAtPoint(e.clientX, e.clientY);
    if (img === hoveredImage) return;

    hoveredImage = img;
    if (img) {
      showHighlight(img);
    } else {
      hideHighlight();
    }
  };

  overlay.onmouseup = async (e) => {
    if (!isDrawing) {
      return;
    }

    isDrawing = false;

    const moved =
      Math.abs(e.clientX - downX) > OCR_CLICK_SLOP_PX ||
      Math.abs(e.clientY - downY) > OCR_CLICK_SLOP_PX;
    const clickedImage = moved ? null : hoveredImage;
    hoveredImage = null;

    // Click (không kéo) trúng ảnh → OCR luôn cả ảnh đó.
    if (clickedImage) {
      const imageBounds = clickedImage.getBoundingClientRect();
      removeOverlay();
      await runOcrFromBounds(imageBounds);
      return;
    }

    if (!rect) {
      removeOverlay();
      return;
    }
    const rectBounds = rect.getBoundingClientRect();
    // Remove overlay immediately to prevent blocking
    removeOverlay();

    // Capture the selected area
    await runOcrFromBounds(rectBounds);
  };
}

function toggleSelectionOcr() {
  if (selectionOverlay) {
    removeSelectionOverlay();
    return;
  }

  startSelectionOcr();
}

function handleOcrShortcutKeydown(event: KeyboardEvent) {
  if (event.repeat) return;
  if (!matchesOcrShortcut(ocrShortcut, event)) return;

  event.preventDefault();
  event.stopPropagation();
  toggleSelectionOcr();
}

window.addEventListener("message", (event) => {
  if (event.data.type === "START_IMAGE_OCR") {
    const image = getImageFromContextMenu(event.data.srcUrl);
    if (!image) {
      alert("Không tìm thấy ảnh để OCR.");
      return;
    }

    const rectBounds = image.getBoundingClientRect();
    void runOcrFromBounds(rectBounds);
  }

  if (event.data.type === "START_SELECTION") {
    startSelectionOcr();
  }
});
