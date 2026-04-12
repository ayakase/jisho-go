import {
  findKanjiEntry,
  searchSelection,
} from "./dict-search";
import type { DictEntry, VocabMeta } from "./dict-types";

const KANJI_DICT_URL = browser.runtime.getURL("/assets/kanji-dict.min.json");
const VOCAB_DICT_URL = browser.runtime.getURL("/assets/vocabulary-dict.min.json");

let kanjiDictPromise: Promise<DictEntry[]> | null = null;
let vocabDictPromise: Promise<Record<string, VocabMeta>> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load dictionary (${res.status}): ${url}`);
  }
  return res.json() as Promise<T>;
}

function ensureKanjiDict(): Promise<DictEntry[]> {
  if (!kanjiDictPromise) {
    kanjiDictPromise = fetchJson<DictEntry[]>(KANJI_DICT_URL);
  }
  return kanjiDictPromise;
}

function ensureVocabDict(): Promise<Record<string, VocabMeta>> {
  if (!vocabDictPromise) {
    vocabDictPromise = fetchJson<Record<string, VocabMeta>>(VOCAB_DICT_URL);
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
