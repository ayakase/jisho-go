import { mount } from 'svelte';
import { storage } from '#imports';
import SelectionPopup from './SelectionPopup.svelte';
import HoverPopup from './HoverPopup.svelte';

type PopupMode = 'off' | 'immediate' | 'button';

let popupContainer: HTMLElement | null = null; // Click/selection popup
let hoverPopupContainer: HTMLElement | null = null; // Hover popup (separate)
let buttonContainer: HTMLElement | null = null;
let popupText: string | null = null;
let popupMode: PopupMode = 'immediate';
let hoverMode = false;
let hoverTimeout: number | null = null;
let blacklist: string[] = [];

export default defineContentScript({
  // Run on all pages so selection works everywhere, not just on google.com
  matches: ['<all_urls>'],
  async main() {
    // Load settings
    await loadPopupMode();
    await loadHoverMode();
    await loadBlacklist();

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

    // Show a small popup next to highlighted text on the page
    document.addEventListener('mouseup', (event) => {
      // Do nothing on blacklisted sites
      if (isBlacklistedLocation()) {
        removePopup();
        removeButton();
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

      // Clear any hover popup when showing selection popup
      removeHoverPopup();

      if (popupMode === 'button') {
        showButtonNear(rect, text);
      } else {
        showPopupNear(rect, text);
      }
    });
    // document.addEventListener('keydown', (event) => {
    //   console.log('keydown', event.key);
    // });

    // Watch for hover mode changes
    storage.watch<boolean>('local:hoverMode', (newMode) => {
      hoverMode = newMode ?? false;
      if (hoverMode) {
        setupHoverMode();
      } else {
        cleanupHoverMode();
      }
    });

    // Initialize hover mode if enabled
    if (hoverMode) {
      setupHoverMode();
    }
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
  }
}

function removeButton() {
  if (buttonContainer) {
    buttonContainer.remove();
    buttonContainer = null;
  }
}

// Check if string contains Japanese characters (kanji, hiragana, katakana)
function hasJapaneseChars(str: string): boolean {
  const kanjiRegex = /[\u4E00-\u9FAF]/;
  const hiraganaRegex = /[\u3040-\u309F]/;
  const katakanaRegex = /[\u30A0-\u30FF]/;
  return kanjiRegex.test(str) || hiraganaRegex.test(str) || katakanaRegex.test(str);
}

function showButtonNear(rect: DOMRect, text: string) {
  // Remove existing button and popup
  removeButton();
  removePopup();

  // Create button container
  buttonContainer = document.createElement('div');
  buttonContainer.id = 'kanji-go-search-button';
  buttonContainer.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    font-family: system-ui, -apple-system, sans-serif;
  `;

  const GAP = 8;
  const PADDING = 12;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Calculate button position
  let left = rect.left;
  let top = rect.bottom + GAP;

  // Ensure button stays within viewport (button is ~36px with icon + padding)
  const BUTTON_SIZE = 36;
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
    <svg width="20px" height="20px" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.545 15.467l-3.779-3.779a6.15 6.15 0 0 0 .898-3.21c0-3.417-2.961-6.377-6.378-6.377A6.185 6.185 0 0 0 2.1 8.287c0 3.416 2.961 6.377 6.377 6.377a6.15 6.15 0 0 0 3.115-.844l3.799 3.801a.953.953 0 0 0 1.346 0l.943-.943c.371-.371.236-.84-.135-1.211zM4.004 8.287a4.282 4.282 0 0 1 4.282-4.283c2.366 0 4.474 2.107 4.474 4.474a4.284 4.284 0 0 1-4.283 4.283c-2.366-.001-4.473-2.109-4.473-4.474z" fill="white"/>
    </svg>
  `;
  button.style.cssText = `
    padding: 0.5rem;
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
    showPopupNear(rect, text);
  };

  buttonContainer.appendChild(button);
  document.body.appendChild(buttonContainer);

  // Remove button on click outside
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

function showPopupNear(rect: DOMRect, text: string) {
  // Remove existing popup and button
  removePopup();
  removeButton();

  // Create container for the Svelte component
  popupContainer = document.createElement('div');
  document.body.appendChild(popupContainer);

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
      position: {
        left,
        top,
      },
    },
  });

  // Simple close on click outside (but not if clicking on hover popup)
  const handleClickOutside = (ev: MouseEvent) => {
    if (
      popupContainer &&
      !popupContainer.contains(ev.target as Node) &&
      !(hoverPopupContainer && hoverPopupContainer.contains(ev.target as Node))
    ) {
      removePopup();
      document.removeEventListener('mousedown', handleClickOutside);
    }
  };

  // Stop clicks inside popup from propagating, but allow button clicks
  // Use capture phase to catch events on child elements
  const stopPropagation = (ev: Event) => {
    const target = ev.target as HTMLElement;
    // Don't stop propagation for buttons - they need to handle their own clicks
    if (target.tagName === 'BUTTON' || target.closest('button')) {
      return;
    }
    ev.stopPropagation();
  };
  popupContainer.addEventListener('mousedown', stopPropagation, true);
  popupContainer.addEventListener('mouseup', stopPropagation, true);
  popupContainer.addEventListener('click', stopPropagation, true);

  document.addEventListener('mousedown', handleClickOutside);
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

function setupHoverMode() {
  cleanupHoverMode();

  hoverMouseMoveHandler = (e: MouseEvent) => {
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
      const { char, rect } = getCharAtPosition(e.clientX, e.clientY);

      if (char && isKanji(char) && rect) {
        showHoverPopupNear(rect, char);
      } else {
        removeHoverPopup();
      }
    }, 300); // 300ms delay to avoid too frequent updates
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
    setTimeout(() => {
      if (hoverPopupContainer && !hoverPopupContainer.matches(':hover')) {
        // Check if mouse is still over the popup
        const rect = hoverPopupContainer.getBoundingClientRect();
        const x = (e as any).clientX || 0;
        const y = (e as any).clientY || 0;
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
          removeHoverPopup();
        }
      }
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
  hoverPopupContainer.id = 'kanji-go-hover-popup-container';
  document.body.appendChild(hoverPopupContainer);

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

window.addEventListener("message", (event) => {
  if (event.data.type === "START_SELECTION") {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100vw";
    overlay.style.height = "100vh";
    overlay.style.background = "rgba(0,0,0,0.2)";
    overlay.style.cursor = "crosshair";
    overlay.style.zIndex = "999999";
    document.body.appendChild(overlay);

    let startX = 0, startY = 0, rect: HTMLDivElement | null = null;
    let isDrawing = false;

    overlay.onmousedown = (e) => {
      console.log("Mouse down on overlay");
      // Prevent creating multiple rectangles
      if (isDrawing) return;

      isDrawing = true;
      startX = e.clientX;
      startY = e.clientY;

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
      if (!rect) return;
      const width = e.clientX - startX;
      const height = e.clientY - startY;
      rect.style.width = `${Math.abs(width)}px`;
      rect.style.height = `${Math.abs(height)}px`;
      rect.style.left = `${width < 0 ? e.clientX : startX}px`;
      rect.style.top = `${height < 0 ? e.clientY : startY}px`;
    };

    overlay.onmouseup = async (e) => {
      console.log("Mouse up triggered! isDrawing:", isDrawing);

      if (!isDrawing) {
        console.log("Not drawing, ignoring mouseup");
        return;
      }

      isDrawing = false;

      if (!rect) {
        console.log("No rect found, removing overlay");
        if (document.body.contains(overlay)) {
          document.body.removeChild(overlay);
        }
        return;
      }

      const rectBounds = rect.getBoundingClientRect();
      console.log("Rect bounds:", rectBounds);

      // Remove overlay immediately to prevent blocking
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }

      // Capture the selected area
      try {
        console.log("Sending capture message...");
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

        console.log("Response received:", response);

        if (response && response.imageDataUrl) {
          console.log("Captured image:", response.imageDataUrl.substring(0, 50) + "...");

          // Show preview of captured image
          const preview = document.createElement("img");
          preview.src = response.imageDataUrl;
          preview.style.position = "fixed";
          preview.style.top = "10px";
          preview.style.right = "10px";
          preview.style.maxWidth = "300px";
          preview.style.maxHeight = "300px";
          preview.style.border = "2px solid red";
          preview.style.zIndex = "999999";
          document.body.appendChild(preview);

          // Remove preview after 3 seconds
          setTimeout(() => {
            if (document.body.contains(preview)) {
              document.body.removeChild(preview);
            }
          }, 3000);
        } else if (response && response.error) {
          console.error("Capture error from background:", response.error);
          alert("Failed to capture: " + response.error);
        }
      } catch (error) {
        console.error("Failed to capture screenshot:", error);
        alert("Error capturing screenshot: " + error);
      }
    };

    document.body.onkeydown = (e) => {
      if (e.key === "Escape") {
        document.body.removeChild(overlay);
      }
    };
  }
});
