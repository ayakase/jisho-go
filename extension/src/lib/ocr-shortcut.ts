export type OcrShortcut = {
  enabled: boolean;
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
};

export const OCR_SHORTCUT_STORAGE_KEY = "local:ocrShortcut";

export const DEFAULT_OCR_SHORTCUT: OcrShortcut = {
  enabled: true,
  code: "KeyO",
  ctrl: true,
  alt: true,
  shift: false,
  meta: false,
};

const MODIFIER_CODES = new Set([
  "AltLeft",
  "AltRight",
  "AltGraph",
  "CapsLock",
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight",
]);

const KEY_LABELS: Record<string, string> = {
  Backquote: "`",
  Backslash: "\\",
  Backspace: "Backspace",
  BracketLeft: "[",
  BracketRight: "]",
  Comma: ",",
  Delete: "Delete",
  End: "End",
  Enter: "Enter",
  Equal: "=",
  Escape: "Esc",
  Home: "Home",
  Insert: "Insert",
  Minus: "-",
  NumpadEnter: "Enter",
  PageDown: "PageDown",
  PageUp: "PageUp",
  Period: ".",
  Quote: "'",
  Semicolon: ";",
  Slash: "/",
  Space: "Space",
  Tab: "Tab",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
};

const FUNCTION_KEY = /^F([1-9]|1[0-2])$/;

export function isModifierCode(code: string): boolean {
  return MODIFIER_CODES.has(code);
}

export function formatKeyCode(code: string): string {
  if (!code) return "";
  const label = KEY_LABELS[code];
  if (label) return label;
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  return code;
}

function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}

export function formatShortcut(shortcut: OcrShortcut): string {
  if (!shortcut.code) return "";
  const mac = isMacPlatform();
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push("Ctrl");
  if (shortcut.alt) parts.push(mac ? "Option" : "Alt");
  if (shortcut.shift) parts.push("Shift");
  if (shortcut.meta) parts.push(mac ? "Cmd" : "Win");
  parts.push(formatKeyCode(shortcut.code));
  return parts.join(" + ");
}

export function isValidShortcut(shortcut: OcrShortcut): boolean {
  if (!shortcut.code || isModifierCode(shortcut.code)) return false;
  if (shortcut.ctrl || shortcut.alt || shortcut.meta) return true;
  return FUNCTION_KEY.test(shortcut.code);
}

function comboKey(shortcut: OcrShortcut): string {
  return [
    shortcut.ctrl ? "c" : "-",
    shortcut.alt ? "a" : "-",
    shortcut.shift ? "s" : "-",
    shortcut.meta ? "m" : "-",
    shortcut.code,
  ].join(":");
}

function combo(
  code: string,
  modifiers: Partial<Pick<OcrShortcut, "ctrl" | "alt" | "shift" | "meta">> = {},
): OcrShortcut {
  return {
    enabled: true,
    code,
    ctrl: modifiers.ctrl === true,
    alt: modifiers.alt === true,
    shift: modifiers.shift === true,
    meta: modifiers.meta === true,
  };
}

const RESERVED_COMBOS = new Set(
  [
    combo("KeyT", { ctrl: true }),
    combo("KeyN", { ctrl: true }),
    combo("KeyW", { ctrl: true }),
    combo("KeyT", { ctrl: true, shift: true }),
    combo("KeyN", { ctrl: true, shift: true }),
    combo("KeyW", { ctrl: true, shift: true }),
    combo("KeyO", { ctrl: true, shift: true }),
    combo("KeyB", { ctrl: true, shift: true }),
    combo("KeyJ", { ctrl: true, shift: true }),
    combo("KeyI", { ctrl: true, shift: true }),
    combo("KeyC", { ctrl: true, shift: true }),
    combo("KeyL", { ctrl: true }),
    combo("KeyR", { ctrl: true }),
    combo("KeyR", { ctrl: true, shift: true }),
    combo("KeyP", { ctrl: true }),
    combo("KeyS", { ctrl: true }),
    combo("KeyF", { ctrl: true }),
    combo("KeyD", { ctrl: true }),
    combo("KeyJ", { ctrl: true }),
    combo("KeyH", { ctrl: true }),
    combo("Tab", { ctrl: true }),
    combo("Tab", { ctrl: true, shift: true }),
    combo("KeyT", { meta: true }),
    combo("KeyN", { meta: true }),
    combo("KeyW", { meta: true }),
    combo("KeyL", { meta: true }),
    combo("KeyR", { meta: true }),
    combo("KeyQ", { meta: true }),
    combo("F5"),
    combo("F11"),
    combo("F12"),
    ...Array.from({ length: 9 }, (_, index) => combo(`Digit${index + 1}`, { ctrl: true })),
    ...Array.from({ length: 9 }, (_, index) => combo(`Digit${index + 1}`, { alt: true })),
    ...Array.from({ length: 9 }, (_, index) => combo(`Digit${index + 1}`, { meta: true })),
  ].map(comboKey),
);

export function isReservedShortcut(shortcut: OcrShortcut): boolean {
  return RESERVED_COMBOS.has(comboKey(shortcut));
}

export function shortcutFromEvent(event: KeyboardEvent): OcrShortcut {
  return {
    enabled: true,
    code: event.code,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
  };
}

export function matchesOcrShortcut(
  shortcut: OcrShortcut,
  event: KeyboardEvent,
): boolean {
  if (!shortcut.enabled || !shortcut.code) return false;
  if (event.code !== shortcut.code) return false;
  if (event.ctrlKey !== shortcut.ctrl) return false;
  if (event.altKey !== shortcut.alt) return false;
  if (event.shiftKey !== shortcut.shift) return false;
  if (event.metaKey !== shortcut.meta) return false;
  return true;
}

export function normalizeOcrShortcut(value: unknown): OcrShortcut {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_OCR_SHORTCUT };
  }

  const raw = value as Partial<OcrShortcut>;
  const next: OcrShortcut = {
    enabled:
      typeof raw.enabled === "boolean"
        ? raw.enabled
        : DEFAULT_OCR_SHORTCUT.enabled,
    code: typeof raw.code === "string" ? raw.code : DEFAULT_OCR_SHORTCUT.code,
    ctrl: raw.ctrl === true,
    alt: raw.alt === true,
    shift: raw.shift === true,
    meta: raw.meta === true,
  };

  if (!isValidShortcut(next)) {
    return { ...DEFAULT_OCR_SHORTCUT };
  }

  return next;
}
