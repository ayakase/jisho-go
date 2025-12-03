import { mount } from 'svelte';
import SelectionPopup from './SelectionPopup.svelte';

let popupContainer: HTMLElement | null = null;

export default defineContentScript({
  // Run on all pages so selection works everywhere, not just on google.com
  matches: ['<all_urls>'],
  main() {
    // Show a small popup next to highlighted text on the page
    document.addEventListener('mouseup', () => {
      console.log('mouseup');
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      console.log('text', text);
      if (!text || !selection || selection.rangeCount === 0) {
        // If no text is selected, remove any existing popup
        console.log('no text');
        removePopup();
        return;
      }
      console.log('text found');
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      console.log('text', text);
      showPopupNear(rect, text);
    });
    document.addEventListener('keydown', (event) => {
      console.log('keydown', event.key);
    });
  },
});

function removePopup() {
  if (popupContainer) {
    popupContainer.remove();
    popupContainer = null;
  }
}

function showPopupNear(rect: DOMRect, text: string) {
  // Remove existing popup if any
  removePopup();

  // Create container for the Svelte component
  popupContainer = document.createElement('div');
  document.body.appendChild(popupContainer);

  // Mount the Svelte component
  mount(SelectionPopup, {
    target: popupContainer,
    props: {
      text,
      position: {
        left: rect.left,
        top: rect.bottom + 8,
      },
    },
  });

  // Simple close on click outside
  const handleClick = (ev: MouseEvent) => {
    if (popupContainer && !popupContainer.contains(ev.target as Node)) {
      removePopup();
      document.removeEventListener('mousedown', handleClick);
    }
  };

  document.addEventListener('mousedown', handleClick);
}
