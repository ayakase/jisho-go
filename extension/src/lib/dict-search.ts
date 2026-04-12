import type { DictEntry, VocabEntry, VocabMeta } from "./dict-types";

export function hasJapaneseChars(str: string): boolean {
  const kanjiRegex = /[\u4E00-\u9FAF]/;
  const hiraganaRegex = /[\u3040-\u309F]/;
  const katakanaRegex = /[\u30A0-\u30FF]/;
  return (
    kanjiRegex.test(str) || hiraganaRegex.test(str) || katakanaRegex.test(str)
  );
}

export function extractKanji(str: string): string[] {
  const kanjiRegex = /[\u4E00-\u9FAF]/g;
  const matches = str.match(kanjiRegex);
  return matches ? [...new Set(matches)] : [];
}

export function findKanjiEntry(
  trimmed: string,
  kanjiDict: DictEntry[],
): DictEntry | undefined {
  return kanjiDict.find((entry) => entry.w === trimmed);
}

export function searchSelection(
  trimmed: string,
  kanjiDict: DictEntry[],
  vocabData: Record<string, VocabMeta>,
): {
  skipped: boolean;
  kanjiResults: DictEntry[];
  vocabResults: VocabEntry[];
} {
  if (!trimmed) {
    return { skipped: false, kanjiResults: [], vocabResults: [] };
  }
  if (!hasJapaneseChars(trimmed)) {
    return { skipped: true, kanjiResults: [], vocabResults: [] };
  }

  const vocabResults: VocabEntry[] = [];
  if (vocabData[trimmed]) {
    vocabResults.push({
      word: trimmed,
      r: vocabData[trimmed].r,
      m: vocabData[trimmed].m,
    });
  }

  let matchCount = 0;
  for (const key in vocabData) {
    if (key === trimmed) continue;

    const containsTrimmed = key.includes(trimmed);
    const isContained = trimmed.includes(key) && key.length > 1;

    if (containsTrimmed || isContained) {
      vocabResults.push({
        word: key,
        r: vocabData[key].r,
        m: vocabData[key].m,
      });
      matchCount++;
      if (matchCount >= 10) break;
    }
  }

  const kanjiList = extractKanji(trimmed);
  const foundKanji: DictEntry[] = [];
  for (const kanji of kanjiList) {
    const found = findKanjiEntry(kanji, kanjiDict);
    if (found) {
      foundKanji.push(found);
    }
  }

  return { skipped: false, kanjiResults: foundKanji, vocabResults };
}
