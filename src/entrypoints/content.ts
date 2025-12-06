import { mount } from 'svelte';
import { storage } from '#imports';
import SelectionPopup from './SelectionPopup.svelte';
import HoverPopup from './HoverPopup.svelte';

let popupContainer: HTMLElement | null = null; // Click/selection popup
let hoverPopupContainer: HTMLElement | null = null; // Hover popup (separate)
let buttonContainer: HTMLElement | null = null;
let popupText: string | null = null;
let popupMode: 'immediate' | 'button' = 'immediate';
let hoverMode = false;
let hoverTimeout: number | null = null;

export default defineContentScript({
  // Run on all pages so selection works everywhere, not just on google.com
  matches: ['<all_urls>'],
  async main() {
    // Load popup mode setting
    await loadPopupMode();
    await loadHoverMode();

    // Listen for storage changes using WXT storage watch
    storage.watch<'immediate' | 'button'>('local:popupMode', (newMode, oldMode) => {
      if (newMode) {
        popupMode = newMode;
      }
    });

    // Show a small popup next to highlighted text on the page
    document.addEventListener('mouseup', (event) => {
      // Don't process if clicking inside the popup, hover popup, or button
      if (
        (popupContainer && popupContainer.contains(event.target as Node)) ||
        (hoverPopupContainer && hoverPopupContainer.contains(event.target as Node)) ||
        (buttonContainer && buttonContainer.contains(event.target as Node))
      ) {
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
    const stored = await storage.getItem<'immediate' | 'button'>('local:popupMode');
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
  buttonContainer.id = 'jisho-go-search-button';
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

  // Ensure button stays within viewport
  if (left + 100 > viewportWidth - PADDING) {
    left = viewportWidth - 100 - PADDING;
  }
  if (top + 40 > viewportHeight - PADDING) {
    top = rect.top - 40 - GAP;
  }
  left = Math.max(PADDING, left);
  top = Math.max(PADDING, top);

  buttonContainer.style.left = `${left}px`;
  buttonContainer.style.top = `${top}px`;

  // Create button element
  const button = document.createElement('button');
  button.textContent = 'Search';
  button.style.cssText = `
    padding: 0.5rem 1rem;
    background-color: #f87171;
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    transition: background-color 0.2s;
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
  hoverPopupContainer.id = 'jisho-go-hover-popup-container';
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
