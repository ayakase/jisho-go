<script lang="ts">
  import { searchSelectionDicts } from "../lib/dict-loaders";

  interface Position {
    left: number;
    top: number;
  }

  type HoverParagraphSections = {
    translate: boolean;
    vocab: boolean;
    kanji: boolean;
  };

  type DictEntry = {
    w: string;
    h: string;
    detail?: string;
    d?: string;
  };

  type VocabEntry = {
    word: string;
    r: string;
    m: string;
  };
  type VocabReadingGroup = {
    reading: string;
    entries: VocabEntry[];
  };

  const MAX_KANJI_ITEMS = 5;

  let {
    text,
    position,
    sections = { translate: true, vocab: true, kanji: false },
  }: { text: string; position: Position; sections?: HoverParagraphSections } = $props();

  let translatedText = $state<string | null>(null);
  let translateLoading = $state(false);
  let translateError = $state<string | null>(null);

  let dictLoading = $state(false);
  let dictError = $state<string | null>(null);
  let vocabResults = $state<VocabEntry[]>([]);
  let kanjiResults = $state<DictEntry[]>([]);

  function groupVocabResults(results: VocabEntry[]): VocabReadingGroup[] {
    const groups: VocabReadingGroup[] = [];
    const byReading = new Map<string, VocabReadingGroup>();

    for (const entry of results) {
      let group = byReading.get(entry.r);
      if (!group) {
        group = { reading: entry.r, entries: [] };
        byReading.set(entry.r, group);
        groups.push(group);
      }
      group.entries.push(entry);
    }

    return groups;
  }

  function parseTranslatePayload(data: unknown): string | null {
    if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
    const firstRow = data[0] as unknown[];
    if (typeof firstRow[0] === "string") return firstRow[0];
    if (Array.isArray(firstRow[0]) && typeof (firstRow[0] as unknown[])[0] === "string") {
      return (firstRow[0] as unknown[])[0] as string;
    }
    return null;
  }

  async function translate(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;

    translateLoading = true;
    translateError = null;
    translatedText = null;

    try {
      const params = new URLSearchParams({
        client: "gtx",
        sl: "auto",
        tl: "vi",
        dt: "t",
        q: trimmed,
      });

      const res = await fetch(
        `https://translate.googleapis.com/translate_a/single?${params.toString()}`,
      );
      if (!res.ok) throw new Error(`Translate failed: ${res.status}`);

      const data = (await res.json()) as unknown;
      const translated = parseTranslatePayload(data);
      translatedText = translated;
      if (!translated) translateError = "Không lấy được bản dịch.";
    } catch (e) {
      translateError = e instanceof Error ? e.message : "Lỗi dịch văn bản.";
    } finally {
      translateLoading = false;
    }
  }

  async function searchCompact(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;

    dictLoading = true;
    dictError = null;
    vocabResults = [];
    kanjiResults = [];

    const { skipped, kanjiResults: foundKanji, vocabResults: foundVocab, error } =
      await searchSelectionDicts(trimmed);

    if (error) {
      dictError = error;
      dictLoading = false;
      return;
    }
    if (skipped) {
      dictLoading = false;
      return;
    }

    if (sections.vocab) {
      vocabResults = foundVocab;
    }
    if (sections.kanji) {
      kanjiResults = foundKanji.slice(0, MAX_KANJI_ITEMS).map((k) => ({
        ...k,
        detail: k.detail,
      }));
    }
    dictLoading = false;
  }

  (async () => {
    if (!text) return;
    if (sections.translate) {
      void translate(text);
    }
    if (sections.vocab || sections.kanji) {
      await searchCompact(text);
    }
  })();
</script>

<div
  id="jisho-go-hover-paragraph-popup"
  class="hover-paragraph-popup"
  style="left: {position.left}px; top: {position.top}px;"
  role="tooltip"
  aria-label="Paragraph hover popup"
>
  <div class="source-text">{text}</div>

  {#if sections.translate}
    <div class="section">
      <div class="section-title">Dịch nhanh</div>
      {#if translateLoading}
        <div class="muted">Đang dịch...</div>
      {:else if translatedText}
        <div class="translated-text">{translatedText}</div>
      {:else if translateError}
        <div class="error-text">{translateError}</div>
      {/if}
    </div>
  {/if}

  {#if sections.vocab || sections.kanji}
    <div class="section">
      <div class="section-title">Tra cứu nhanh</div>
      {#if dictLoading}
        <div class="muted">Đang tải từ điển...</div>
      {:else if dictError}
        <div class="error-text">{dictError}</div>
      {:else}
        {#if sections.vocab && vocabResults.length > 0}
          <div class="mini-list">
            {#each groupVocabResults(vocabResults) as group}
              <div class="mini-group">
                <div class="mini-head">{group.reading}</div>
                {#each group.entries as v}
                  <div class="mini-item">
                    <div class="mini-sub">{v.word}</div>
                    <div class="mini-mean">{v.m}</div>
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        {/if}

        {#if sections.kanji && kanjiResults.length > 0}
          <div class="kanji-row">
            {#each kanjiResults as k}
              <div class="kanji-chip" title={k.detail || ""}>
                <span class="kanji-char">{k.w}</span>
                <span class="kanji-read">{k.h}</span>
              </div>
            {/each}
          </div>
        {/if}

        {#if (sections.vocab && vocabResults.length === 0) && (sections.kanji && kanjiResults.length === 0)}
          <div class="muted">Không có kết quả phù hợp.</div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .hover-paragraph-popup {
    position: fixed;
    width: 440px;
    max-width: 90vw;
    max-height: min(440px, 78vh);
    overflow-y: auto;
    overflow-x: hidden;
    background: #ffffff;
    color: #111827;
    border-radius: 0.5rem;
    padding: 0.75rem;
    font-size: 13px;
    line-height: 1.4;
    box-shadow:
      0 10px 15px -3px rgba(0, 0, 0, 0.1),
      0 4px 6px -4px rgba(0, 0, 0, 0.1);
    border: 1px solid #e5e7eb;
    z-index: 2147483646;
    cursor: default;
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      system-ui,
      -system-ui,
      sans-serif;
  }

  .source-text {
    font-size: 0.98rem;
    color: #1f2937;
    line-height: 1.5;
    word-break: break-word;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.4rem;
    padding: 0.55rem 0.6rem;
  }

  .section {
    margin-top: 0.55rem;
    border-top: 1px dashed #e5e7eb;
    padding-top: 0.5rem;
  }

  .section-title {
    font-size: 0.74rem;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.35rem;
  }

  .translated-text {
    color: #374151;
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .mini-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .mini-group {
    border: 1px solid #e5e7eb;
    border-radius: 0.35rem;
    padding: 0.35rem 0.45rem;
    background: #ffffff;
  }

  .mini-item {
    border-top: 1px dashed #e5e7eb;
    padding-top: 0.35rem;
    margin-top: 0.35rem;
  }

  .mini-head {
    font-size: 0.98rem;
    font-weight: 600;
    color: #f87171;
    margin-bottom: 0.2rem;
  }

  .mini-sub {
    font-size: 0.82rem;
    color: #374151;
  }

  .mini-mean {
    margin-top: 0.2rem;
    color: #374151;
    font-size: 0.84rem;
  }

  .kanji-row {
    margin-top: 0.45rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .kanji-chip {
    display: inline-flex;
    align-items: baseline;
    gap: 0.25rem;
    border: 1px solid #e5e7eb;
    border-radius: 999px;
    padding: 0.2rem 0.45rem;
    background: #f9fafb;
  }

  .kanji-char {
    font-size: 1.05rem;
    font-weight: 700;
    color: #ef4444;
    line-height: 1;
  }

  .kanji-read {
    font-size: 0.74rem;
    color: #6b7280;
  }

  .muted {
    color: #6b7280;
    font-size: 0.84rem;
  }

  .error-text {
    color: #b91c1c;
    font-size: 0.82rem;
  }
</style>
