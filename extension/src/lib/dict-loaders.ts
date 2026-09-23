import type { DictEntry, VocabEntry } from "./dict-types";

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
  try {
    const res = (await browser.runtime.sendMessage({
      type: "DICT_FIND_KANJI",
      query,
    })) as FindKanjiResponse | undefined;

    if (!res) {
      return { entry: null, error: "Không nhận được phản hồi từ tiện ích" };
    }
    if (!res.ok) {
      return { entry: null, error: res.error };
    }
    return { entry: res.entry };
  } catch (err) {
    console.debug("findKanjiDictEntry error:", err);
    return { entry: null, error: "Không thể kết nối đến từ điển" };
  }
}

export async function searchSelectionDicts(query: string): Promise<{
  skipped: boolean;
  kanjiResults: DictEntry[];
  vocabResults: VocabEntry[];
  error?: string;
}> {
  try {
    const res = (await browser.runtime.sendMessage({
      type: "DICT_SEARCH_SELECTION",
      query,
    })) as SearchSelectionResponse | undefined;

    if (!res) {
      return {
        skipped: false,
        kanjiResults: [],
        vocabResults: [],
        error: "Không nhận được phản hồi từ tiện ích",
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
  } catch (err) {
    console.debug("searchSelectionDicts error:", err);
    return {
      skipped: false,
      kanjiResults: [],
      vocabResults: [],
      error: "Không thể kết nối đến từ điển",
    };
  }
}
