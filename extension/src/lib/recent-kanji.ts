import { storage } from "#imports";

export const DEFAULT_RECENT_LIMIT = 30;
export const MIN_RECENT_LIMIT = 10;
export const MAX_RECENT_LIMIT = 100;

const KANJI_REGEX = /[\u4E00-\u9FAF]/;

export function isKanjiChar(char: string): boolean {
  return char.length === 1 && KANJI_REGEX.test(char);
}

export async function getRecentKanjiLimit(): Promise<number> {
  try {
    const val = await storage.getItem<number>("local:recentKanjiLimit");
    if (typeof val === "number" && !Number.isNaN(val)) {
      return Math.max(MIN_RECENT_LIMIT, Math.min(MAX_RECENT_LIMIT, Math.round(val)));
    }
  } catch (e) {
    console.error("Failed to read recentKanjiLimit:", e);
  }
  return DEFAULT_RECENT_LIMIT;
}

export async function setRecentKanjiLimit(limit: number): Promise<number> {
  const safe = Math.max(MIN_RECENT_LIMIT, Math.min(MAX_RECENT_LIMIT, Math.round(limit)));
  try {
    await storage.setItem("local:recentKanjiLimit", safe);
    // Trim existing if needed
    const current = await getRecentKanji();
    if (current.length > safe) {
      await storage.setItem("local:recentKanji", current.slice(0, safe));
    }
  } catch (e) {
    console.error("Failed to set recentKanjiLimit:", e);
  }
  return safe;
}

export async function getRecentKanji(): Promise<string> {
  try {
    const val = await storage.getItem<string>("local:recentKanji");
    return typeof val === "string" ? val : "";
  } catch (e) {
    console.error("Failed to read recentKanji:", e);
    return "";
  }
}

export async function clearRecentKanji(): Promise<void> {
  try {
    await storage.setItem("local:recentKanji", "");
  } catch (e) {
    console.error("Failed to clear recentKanji:", e);
  }
}

/**
 * Adds one or more kanji characters to the front of recent history (LRU).
 * Removes duplicates and enforces capacity limit.
 */
export async function addRecentKanji(chars: string[]): Promise<string> {
  const validKanji: string[] = [];
  for (const c of chars) {
    for (const char of Array.from(c)) {
      if (isKanjiChar(char) && !validKanji.includes(char)) {
        validKanji.push(char);
      }
    }
  }

  if (validKanji.length === 0) {
    return await getRecentKanji();
  }

  const [current, limit] = await Promise.all([getRecentKanji(), getRecentKanjiLimit()]);

  // LRU: New characters at front, followed by current characters that are not in validKanji
  const existingChars = Array.from(current).filter((c) => !validKanji.includes(c));
  const combined = [...validKanji, ...existingChars].slice(0, limit).join("");

  try {
    await storage.setItem("local:recentKanji", combined);
  } catch (e) {
    console.error("Failed to save recentKanji:", e);
  }

  return combined;
}

