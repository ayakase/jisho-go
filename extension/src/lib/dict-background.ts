import { findKanjiEntry, searchSelection } from "./dict-search";
import type { DictEntry, VocabMeta } from "./dict-types";

const KANJI_DICT_URL = browser.runtime.getURL("/dict/kanji-dict.min.json.gz");
const VOCAB_DICT_URL = browser.runtime.getURL(
  "/dict/vocabulary-dict.min.json.gz",
);

let kanjiDictPromise: Promise<DictEntry[]> | null = null;
let vocabDictPromise: Promise<Record<string, VocabMeta>> | null = null;
type VocabArrayEntry = [word: string, reading: string, meaning: string];
type CompactKanjiEntry = Omit<
  DictEntry,
  | "detail"
  | "example_kun"
  | "examples"
  | "level"
  | "kun"
  | "on"
  | "stroke_count"
> & {
  d?: string;
  ek?: DictEntry["example_kun"];
  e?: DictEntry["examples"];
  l?: string[];
  k?: string;
  o?: string;
  sc?: string;
};

function normalizeKanjiEntry(entry: DictEntry | CompactKanjiEntry): DictEntry {
  const raw = entry as DictEntry & CompactKanjiEntry;
  return {
    ...entry,
    detail: raw.detail ?? raw.d,
    example_kun: raw.example_kun ?? raw.ek,
    examples: raw.examples ?? raw.e,
    level: raw.level ?? raw.l,
    kun: raw.kun ?? raw.k,
    on: raw.on ?? raw.o,
    stroke_count: raw.stroke_count ?? raw.sc,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load dictionary (${res.status}): ${url}`);
  }
  if (!res.body) {
    throw new Error(`Failed to read dictionary stream: ${url}`);
  }
  const stream = res.body.pipeThrough(new DecompressionStream("gzip"));
  const text = await new Response(stream).text();
  return JSON.parse(text) as T;
}

function ensureKanjiDict(): Promise<DictEntry[]> {
  if (!kanjiDictPromise) {
    kanjiDictPromise = fetchJson<Array<DictEntry | CompactKanjiEntry>>(
      KANJI_DICT_URL,
    ).then((entries) => entries.map(normalizeKanjiEntry));
  }
  return kanjiDictPromise;
}

function ensureVocabDict(): Promise<Record<string, VocabMeta>> {
  if (!vocabDictPromise) {
    vocabDictPromise = fetchJson<VocabArrayEntry[]>(VOCAB_DICT_URL).then(
      (entries) =>
        Object.fromEntries(
          entries.map(([word, r, m]) => [word, { r, m } satisfies VocabMeta]),
        ),
    );
  }
  return vocabDictPromise;
}

export async function backgroundFindKanji(query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return { entry: null as DictEntry | null };
  }
  const kanjiDict = await ensureKanjiDict();
  const found = findKanjiEntry(trimmed, kanjiDict);
  return { entry: found ?? null };
}

export async function backgroundSearchSelection(query: string) {
  const trimmed = query.trim();
  const [kanjiDict, vocabData] = await Promise.all([
    ensureKanjiDict(),
    ensureVocabDict(),
  ]);
  return searchSelection(trimmed, kanjiDict, vocabData);
}

export type QuizOption = {
  kanji: string;
  hanViet: string;
  isCorrect: boolean;
};

export async function backgroundGetQuizOptions(
  targetKanji: string,
  targetHanViet: string,
  recentKanjiStr: string = "",
  count: number = 3,
): Promise<QuizOption[]> {
  const kanjiDict = await ensureKanjiDict();
  const cleanTargetHV = targetHanViet.split(",")[0].trim().toUpperCase();
  const seenHanViet = new Set<string>([cleanTargetHV]);
  const distractors: Array<{ kanji: string; hanViet: string }> = [];

  // 1. Thử lấy từ các kanji trong lịch sử gần đây của người dùng trước
  if (recentKanjiStr) {
    const chars = Array.from(recentKanjiStr).filter((c) => c !== targetKanji);
    chars.sort(() => Math.random() - 0.5);
    for (const char of chars) {
      if (distractors.length >= count) break;
      const found = findKanjiEntry(char, kanjiDict);
      if (found?.w && found?.h) {
        const cleanH = found.h.split(",")[0].trim().toUpperCase();
        if (cleanH && !seenHanViet.has(cleanH)) {
          seenHanViet.add(cleanH);
          distractors.push({ kanji: found.w, hanViet: cleanH });
        }
      }
    }
  }

  // 2. Nếu chưa đủ số đáp án sai, lấy thêm từ từ điển (ưu tiên các chữ có JLPT level)
  const commonEntries = kanjiDict.filter(
    (e) =>
      (e.level && e.level.length > 0) ||
      ((e as any).l && (e as any).l.length > 0),
  );
  const pool = commonEntries.length >= count * 10 ? commonEntries : kanjiDict;

  let attempts = 0;
  while (distractors.length < count && attempts < 1000) {
    attempts++;
    const idx = Math.floor(Math.random() * pool.length);
    const item = pool[idx];
    if (!item?.w || !item?.h || item.w === targetKanji) continue;
    const cleanH = item.h.split(",")[0].trim().toUpperCase();
    if (!cleanH || seenHanViet.has(cleanH)) continue;
    seenHanViet.add(cleanH);
    distractors.push({ kanji: item.w, hanViet: cleanH });
  }

  const options: QuizOption[] = [
    { kanji: targetKanji, hanViet: cleanTargetHV, isCorrect: true },
    ...distractors.map((d) => ({
      kanji: d.kanji,
      hanViet: d.hanViet,
      isCorrect: false,
    })),
  ];

  return options.sort(() => Math.random() - 0.5);
}
