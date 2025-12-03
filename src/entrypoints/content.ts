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
        document.getElementById('jisho-go-selection-popup')?.remove();
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

function showPopupNear(rect: DOMRect, text: string) {
  // Remove existing popup if any
  document.getElementById('jisho-go-selection-popup')?.remove();

  const popup = document.createElement('div');
  popup.id = 'jisho-go-selection-popup';
  popup.textContent = text;

  Object.assign(popup.style, {
    position: 'fixed',
    // DOMRect from getBoundingClientRect is already viewport-relative,
    // so we don't add scroll offsets when using position: fixed.
    left: `${rect.left}px`,
    top: `${rect.bottom + 8}px`,
    maxWidth: '260px',
    background: '#111827',
    color: '#f9fafb',
    borderRadius: '0.5rem',
    padding: '0.5rem 0.75rem',
    fontSize: '14px',
    lineHeight: '1.4',
    boxShadow:
      '0 10px 15px -3px rgba(15,23,42,0.4), 0 4px 6px -4px rgba(15,23,42,0.4)',
    zIndex: '2147483647',
    cursor: 'default',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, system-ui, -system-ui, sans-serif',
  } as CSSStyleDeclaration);

  // Simple close on click outside
  const handleClick = (ev: MouseEvent) => {
    if (!popup.contains(ev.target as Node)) {
      popup.remove();
      document.removeEventListener('mousedown', handleClick);
    }
  };

  document.body.appendChild(popup);
  document.addEventListener('mousedown', handleClick);
}
