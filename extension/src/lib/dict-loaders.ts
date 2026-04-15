import type { DictEntry, VocabEntry } from "./dict-types";
import { storage } from "#imports";

type FindKanjiResponse =
  | { ok: true; entry: DictEntry | null }
  | { ok: false; error: string };

type SearchSelectionResponse =
  | {
      ok: true;
      skipped: boolean;
      kanjiResults: DictEntry[];
      vocabResults: VocabEntry[];
    }
  | { ok: false; error: string };

export async function findKanjiDictEntry(
  query: string,
): Promise<{ entry: DictEntry | null; error?: string }> {
  const res = (await browser.runtime.sendMessage({
    type: "DICT_FIND_KANJI",
    query,
  })) as FindKanjiResponse | undefined;

  if (!res) {
    return { entry: null, error: "No response from background" };
  }
  if (!res.ok) {
    return { entry: null, error: res.error };
  }
  return { entry: res.entry };
}

export async function searchSelectionDicts(query: string): Promise<{
  skipped: boolean;
  kanjiResults: DictEntry[];
  vocabResults: VocabEntry[];
  error?: string;
}> {
  const res = (await browser.runtime.sendMessage({
    type: "DICT_SEARCH_SELECTION",
    query,
    includeLongerMatches:
      (await storage.getItem<boolean>("local:includeLongerVocabMatches")) ??
      false,
  })) as SearchSelectionResponse | undefined;

  if (!res) {
    return {
      skipped: false,
      kanjiResults: [],
      vocabResults: [],
      error: "No response from background",
    };
  }
  if (!res.ok) {
    return {
      skipped: false,
      kanjiResults: [],
      vocabResults: [],
      error: res.error,
    };
  }
  return {
    skipped: res.skipped,
    kanjiResults: res.kanjiResults,
    vocabResults: res.vocabResults,
  };
}
