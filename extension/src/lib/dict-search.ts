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

type RankedVocabEntry = VocabEntry & {
  matchLength: number;
  matchIndex: number;
  order: number;
};

export function searchSelection(
  trimmed: string,
  kanjiDict: DictEntry[],
  vocabData: Record<string, VocabMeta>,
  options?: { includeLongerMatches?: boolean },
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

  const vocabResults: RankedVocabEntry[] = [];
  const seenWords = new Set<string>();
  let order = 0;
  if (vocabData[trimmed]) {
    vocabResults.push({
      word: trimmed,
      r: vocabData[trimmed].r,
      m: vocabData[trimmed].m,
      matchStart: 0,
      matchLength: trimmed.length,
      matchIndex: 0,
      order: order++,
    });
    seenWords.add(trimmed);
  }

  const includeLongerMatches = options?.includeLongerMatches ?? false;
  for (const key in vocabData) {
    if (seenWords.has(key)) continue;

    const containsTrimmed = key.includes(trimmed);
    const isContained = trimmed.includes(key) && key.length > 1;
    const reading = vocabData[key].r;
    const readingContainsTrimmed = reading.includes(trimmed);
    const trimmedContainsReading = reading.length > 1 && trimmed.includes(reading);

    const strictMatch = isContained || trimmedContainsReading;
    const broaderMatch = containsTrimmed || readingContainsTrimmed;

    if (strictMatch || (includeLongerMatches && broaderMatch)) {
      const keyIndex = trimmed.indexOf(key);
      const readingIndex = trimmed.indexOf(reading);
      const matchIndexes = [keyIndex, readingIndex].filter((index) => index >= 0);
      const matchIndex = matchIndexes.length > 0 ? Math.min(...matchIndexes) : Number.MAX_SAFE_INTEGER;
      const matchLength = Math.max(
        keyIndex >= 0 ? key.length : 0,
        readingIndex >= 0 ? reading.length : 0,
      );
      vocabResults.push({
        word: key,
        r: reading,
        m: vocabData[key].m,
        matchStart: matchIndex,
        matchLength,
        matchIndex,
        order: order++,
      });
      seenWords.add(key);
    }
  }

  vocabResults.sort(
    (a, b) =>
      b.matchLength - a.matchLength ||
      a.matchIndex - b.matchIndex ||
      a.order - b.order,
  );

  const kanjiList = extractKanji(trimmed);
  const foundKanji: DictEntry[] = [];
  for (const kanji of kanjiList) {
    const found = findKanjiEntry(kanji, kanjiDict);
    if (found) {
      foundKanji.push(found);
    }
  }

  return {
    skipped: false,
    kanjiResults: foundKanji,
    vocabResults: vocabResults.map(({ matchIndex, order, ...entry }) => entry),
  };
}
