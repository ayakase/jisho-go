import {
  findKanjiEntry,
  searchSelection,
} from "./dict-search";
import type { DictEntry, VocabMeta } from "./dict-types";

const KANJI_DICT_URL = browser.runtime.getURL("/assets/kanji-dict.min.json");
const VOCAB_DICT_URL = browser.runtime.getURL("/assets/vocabulary-dict.min.json");

let kanjiDictPromise: Promise<DictEntry[]> | null = null;
let vocabDictPromise: Promise<Record<string, VocabMeta>> | null = null;
type VocabArrayEntry = [word: string, reading: string, meaning: string];
type CompactKanjiEntry = Omit<
  DictEntry,
  "detail" | "example_kun" | "examples" | "level" | "kun" | "on" | "stroke_count"
> & {
  d?: string;
  ek?: DictEntry["example_kun"];
  e?: DictEntry["examples"];
  l?: string[];
  k?: string;
  o?: string;
  sc?: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load dictionary (${res.status}): ${url}`);
  }
  return res.json() as Promise<T>;
}

function ensureKanjiDict(): Promise<DictEntry[]> {
  if (!kanjiDictPromise) {
    kanjiDictPromise = fetchJson<Array<DictEntry | CompactKanjiEntry>>(
      KANJI_DICT_URL,
    ).then((entries) =>
      entries.map((entry) => ({
        ...entry,
        detail: entry.detail ?? entry.d,
        example_kun: entry.example_kun ?? entry.ek,
        examples: entry.examples ?? entry.e,
        level: entry.level ?? entry.l,
        kun: entry.kun ?? entry.k,
        on: entry.on ?? entry.o,
        stroke_count: entry.stroke_count ?? entry.sc,
      })),
    );
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
