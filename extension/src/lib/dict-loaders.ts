const KANJI_DICT_URL = browser.runtime.getURL('assets/kanji-dict.min.json');
const VOCAB_DICT_URL = browser.runtime.getURL('assets/vocabulary-dict.min.json');

let kanjiDictPromise: Promise<unknown> | null = null;
let vocabDictPromise: Promise<unknown> | null = null;

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load dictionary (${res.status}): ${url}`);
  }
  return res.json() as Promise<unknown>;
}

export function loadKanjiDict() {
  if (!kanjiDictPromise) {
    kanjiDictPromise = fetchJson(KANJI_DICT_URL);
  }
  return kanjiDictPromise;
}

export function loadVocabDict() {
  if (!vocabDictPromise) {
    vocabDictPromise = fetchJson(VOCAB_DICT_URL);
  }
  return vocabDictPromise;
}
