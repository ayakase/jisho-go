<script lang="ts">
  import { loadKanjiDict, loadVocabDict } from "../lib/dict-loaders";
  import { storage } from "#imports";
  import { kanaToRomajiConvert } from "../lib/romaji";
  interface Position {
    left: number;
    top: number;
  }
  type DictEntry = {
    w: string;
    h: string;
    detail?: string;
    on?: string;
    kun?: string;
    level?: string[];
    stroke_count?: string;
    example_kun?: Record<string, Array<{ w: string; m: string; p: string }>>;
    example_on?: Record<string, Array<{ w: string; m: string; p: string }>>;
    examples?: Array<{
      w: string;
      m: string;
      p: string;
      h: string;
    }>;
  };
  type VocabEntry = {
    word: string;
    reading: string;
    meaning: string;
  };
  let { text, position }: { text: string; position: Position } = $props();
  let kanjiResults: DictEntry[] = $state([]);
  let vocabResults: VocabEntry[] = $state([]);
  let error: string | null = $state(null);
  let loading = $state(true);
  let skipped = $state(false);
  let expandedKanji = $state<Set<number>>(new Set());
  let isSearching = false;
  let showRomaji = $state<boolean>(false);
  type ResultTab = "vocab" | "kanji" | "explain";
  let activeTab = $state<ResultTab>("kanji");

  type ExplainVocab = {
    word?: string;
    hiragana?: string;
    reading?: string;
    meaning_vi?: string;
  };
  type GrammarExample = {
    japanese?: string;
    hiragana?: string;
    meaning_vi?: string;
  };
  type ExplainGrammar = {
    point?: string;
    explanation_vi?: string;
    example?: GrammarExample;
  };
  let explainLoading = $state(false);
  let explainError = $state<string | null>(null);
  let explainPayload = $state<{
    sentence_hiragana?: string;
    sentence_meaning_vi?: string;
    notes?: string;
    vocabularies: ExplainVocab[];
    grammar: ExplainGrammar[];
  } | null>(null);
  let explainFetchedText = $state<string | null>(null);

  $effect(() => {
    void text;
    explainPayload = null;
    explainError = null;
    explainFetchedText = null;
  });

  function toggleKanji(index: number) {
    const newSet = new Set(expandedKanji);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    expandedKanji = newSet;
  }

  function getDetailSummary(detail: string | undefined): string {
    if (!detail) return "";
    const firstParagraph = detail.split("##")[0].trim();
    return firstParagraph.length > 150
      ? firstParagraph.substring(0, 150) + "..."
      : firstParagraph;
  }

  // Load romaji setting
  (async () => {
    try {
      const stored = await storage.getItem<boolean>("local:showRomaji");
      if (stored !== null && stored !== undefined) {
        showRomaji = stored;
      }
    } catch (error) {
      console.error("Failed to load romaji setting:", error);
    }
  })();

  // Watch for romaji setting changes
  storage.watch<boolean>("local:showRomaji", (newMode) => {
    showRomaji = newMode ?? false;
  });

  function convertIfRomaji(text: string | undefined): string {
    if (!text) return "";
    if (showRomaji) {
      const romaji = kanaToRomajiConvert(text);
      return `${text} (${romaji})`;
    }
    return text;
  }

  // Search immediately when component is created (component is remounted each time)
  (async () => {
    if (text) {
      await search(text);
    }
  })();
  // Check if string contains Japanese characters (kanji, hiragana, katakana)
  function hasJapaneseChars(str: string): boolean {
    const kanjiRegex = /[\u4E00-\u9FAF]/;
    const hiraganaRegex = /[\u3040-\u309F]/;
    const katakanaRegex = /[\u30A0-\u30FF]/;
    return (
      kanjiRegex.test(str) || hiraganaRegex.test(str) || katakanaRegex.test(str)
    );
  }
  // Extract all kanji from a string
  function extractKanji(str: string): string[] {
    const kanjiRegex = /[\u4E00-\u9FAF]/g;
    const matches = str.match(kanjiRegex);
    return matches ? [...new Set(matches)] : []; // Remove duplicates
  }
  async function search(query: string) {
    if (isSearching) return; // Prevent concurrent searches
    isSearching = true;
    loading = true;
    error = null;
    kanjiResults = [];
    vocabResults = [];
    skipped = false;
    expandedKanji = new Set(); // Reset expanded state when starting new search

    const trimmed = query.trim();
    if (!trimmed) {
      loading = false;
      isSearching = false;
      return;
    }

    // Skip if no Japanese characters
    if (!hasJapaneseChars(trimmed)) {
      loading = false;
      skipped = true;
      isSearching = false;
      return;
    }

    const [kanjiDictData, vocabDictData] = await Promise.all([
      loadKanjiDict(),
      loadVocabDict(),
    ]);

    // Find the word in the vocabulary dictionary
    const vocabData = vocabDictData as Record<
      string,
      { reading: string; meaning: string }
    >;
    if (vocabData[trimmed]) {
      vocabResults.push({
        word: trimmed,
        reading: vocabData[trimmed].reading,
        meaning: vocabData[trimmed].meaning,
      });
    }

    let matchCount = 0;
    for (const key in vocabData) {
      if (key === trimmed) continue;

      const containsTrimmed = key.includes(trimmed); // Highlighted part of a word e.g "学" -> "学生"
      const isContained = trimmed.includes(key) && key.length > 1; // Highlighted full sentence shows words contained in it

      if (containsTrimmed || isContained) {
        vocabResults.push({
          word: key,
          reading: vocabData[key].reading,
          meaning: vocabData[key].meaning,
        });
        matchCount++;
        // Limit the results so we do not flood the UI and to keep perf high
        if (matchCount >= 10) break;
      }
    }

    // Extract all kanji from the string
    const kanjiList = extractKanji(trimmed);

    // Search for each kanji in the dictionary
    const foundKanji: DictEntry[] = [];
    for (const kanji of kanjiList) {
      const found = (kanjiDictData as DictEntry[]).find(
        (entry) => entry.w === kanji,
      );
      if (found) {
        foundKanji.push(found);
      }
    }
    kanjiResults = foundKanji;

    // Choose default tab based on available results (kanji first)
    if (kanjiResults.length > 0) activeTab = "kanji";
    else if (vocabResults.length > 0) activeTab = "vocab";
    else activeTab = "explain";

    loading = false;
    isSearching = false;
  }

  $effect(() => {
    if (activeTab !== "explain" || skipped || !text?.trim()) return;
    if (explainFetchedText === text) return;

    let cancelled = false;

    (async () => {
      explainLoading = true;
      explainError = null;
      try {
        const base =
          import.meta.env.WXT_API_URL?.replace(/\/$/, "") ??
          "http://localhost:8787";
        const url = `${base}/explain?q=${encodeURIComponent(text.trim())}`;
        const res = await fetch(url);
        const data = (await res.json()) as Record<string, unknown>;
        if (cancelled) return;
        if (!res.ok) {
          explainError =
            typeof data.error === "string"
              ? data.error
              : res.statusText || "Request failed";
          return;
        }
        explainPayload = {
          sentence_hiragana:
            typeof data.sentence_hiragana === "string"
              ? data.sentence_hiragana
              : "",
          sentence_meaning_vi:
            typeof data.sentence_meaning_vi === "string"
              ? data.sentence_meaning_vi
              : "",
          notes: typeof data.notes === "string" ? data.notes : "",
          vocabularies: Array.isArray(data.vocabularies)
            ? (data.vocabularies as ExplainVocab[])
            : [],
          grammar: Array.isArray(data.grammar)
            ? (data.grammar as ExplainGrammar[])
            : [],
        };
        explainFetchedText = text;
      } catch (e) {
        if (!cancelled) {
          explainError =
            e instanceof Error ? e.message : "Không gọi được API giải thích";
        }
      } finally {
        if (!cancelled) explainLoading = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  });
</script>

<div
  id="kanji-go-selection-popup"
  class="popup"
  style="left: {position.left}px; top: {position.top}px;"
  role="dialog"
  aria-label="Dictionary popup"
>
  {#if loading}
    <div class="loading">Searching...</div>
  {:else if skipped}
    <div class="skipped">No Japanese characters found</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else}
    <div class="result">
      <div class="extracted-text-section">
        {text}
      </div>
      {#if vocabResults.length > 0 || kanjiResults.length > 0 || !skipped}
        <div class="tabs">
          <button
            type="button"
            class="tab {activeTab === 'kanji' ? 'active' : ''}"
            disabled={kanjiResults.length === 0}
            onclick={() => (activeTab = "kanji")}
          >
            Kanji ({kanjiResults.length})
          </button>
          <button
            type="button"
            class="tab {activeTab === 'vocab' ? 'active' : ''}"
            disabled={vocabResults.length === 0}
            onclick={() => (activeTab = "vocab")}
          >
            Từ vựng ({vocabResults.length})
          </button>
          <button
            type="button"
            class="tab {activeTab === 'explain' ? 'active' : ''}"
            onclick={() => (activeTab = "explain")}
          >
            Giải thích AI
          </button>
        </div>
      {/if}

      {#if activeTab === "vocab" && vocabResults.length > 0}
        <div class="vocab-section">
          <div class="vocab-list">
            {#each vocabResults as v}
              <div class="vocab-item">
                <div class="vocab-header">
                  <div class="vocab-word">{v.word}</div>
                  <div class="vocab-reading">{v.reading}</div>
                </div>
                <div class="vocab-meaning">
                  {v.meaning}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if activeTab === "kanji" && kanjiResults.length > 0}
        <div class="kanji-section">
          {#each kanjiResults as kanjiEntry, index}
            {@const isExpanded = expandedKanji.has(index)}
            <div class="kanji-accordion-item">
              <button
                class="kanji-accordion-header"
                onclick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  toggleKanji(index);
                }}
                type="button"
              >
                <div class="kanji-summary">
                  <div class="kanji-char-small-111">{kanjiEntry.w}</div>
                  <div class="kanji-summary-info">
                    <div class="kanji-reading-summary">{kanjiEntry.h}</div>
                    {#if kanjiEntry.detail}
                      <div class="kanji-detail-summary">
                        {getDetailSummary(kanjiEntry.detail)}
                      </div>
                    {/if}
                    <div class="kanji-meta-summary">
                      {#if kanjiEntry.on}
                        <span class="meta-item"
                          >On: {convertIfRomaji(kanjiEntry.on)}</span
                        >
                      {/if}
                      {#if kanjiEntry.kun}
                        <span class="meta-item"
                          >Kun: {convertIfRomaji(kanjiEntry.kun)}</span
                        >
                      {/if}
                      {#if kanjiEntry.level && kanjiEntry.level.length > 0}
                        <span class="meta-item"
                          >Level: {kanjiEntry.level.join(", ")}</span
                        >
                      {/if}
                      {#if kanjiEntry.stroke_count}
                        <span class="meta-item"
                          >Số nét: {kanjiEntry.stroke_count}</span
                        >
                      {/if}
                    </div>
                  </div>
                </div>
                <div class="accordion-icon">{isExpanded ? "−" : "+"}</div>
              </button>

              {#if isExpanded}
                <div class="kanji-accordion-content">
                  {#if kanjiEntry.detail}
                    <div class="detail-section">
                      <div class="section-title">Chi tiết {kanjiEntry.w}</div>
                      <div class="detail-text">
                        {#each kanjiEntry.detail.split("##") as paragraph}
                          {#if paragraph.trim()}
                            <p>{paragraph.trim()}</p>
                          {/if}
                        {/each}
                      </div>
                    </div>
                  {/if}

                  {#if kanjiEntry.example_kun}
                    <div class="examples-section">
                      <div class="section-title">Từ vựng (Kun)</div>
                      <div class="examples-list">
                        {#each Object.entries(kanjiEntry.example_kun) as [reading, examples]}
                          {#each examples as example}
                            <div class="example-item">
                              <span class="example-word">{example.w}</span>
                              <span class="example-reading"
                                >({convertIfRomaji(example.p)})</span
                              >
                              <span class="example-mean">- {example.m}</span>
                            </div>
                          {/each}
                        {/each}
                      </div>
                    </div>
                  {/if}

                  {#if kanjiEntry.example_on}
                    <div class="examples-section">
                      <div class="section-title">Từ vựng (On)</div>
                      <div class="examples-list">
                        {#each Object.entries(kanjiEntry.example_on) as [reading, examples]}
                          {#each examples as example}
                            <div class="example-item">
                              <span class="example-word">{example.w}</span>
                              <span class="example-reading"
                                >({convertIfRomaji(example.p)})</span
                              >
                              <span class="example-mean">- {example.m}</span>
                            </div>
                          {/each}
                        {/each}
                      </div>
                    </div>
                  {/if}

                  {#if kanjiEntry.examples && kanjiEntry.examples.length > 0}
                    <div class="examples-section">
                      <div class="section-title">Từ vựng</div>
                      <div class="examples-list">
                        {#each kanjiEntry.examples as example}
                          <div class="example-item">
                            <span class="example-word">{example.w}</span>
                            <span class="example-reading"
                              >({convertIfRomaji(example.p)})</span
                            >
                            <span class="example-mean">- {example.m}</span>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      {#if activeTab === "explain"}
        <div class="explain-section">
          {#if explainLoading}
            <div class="explain-loading">Đang tải giải thích…</div>
          {:else if explainError}
            <div class="explain-error">{explainError}</div>
          {:else if explainPayload}
            {@const hasAny =
              !!explainPayload.sentence_hiragana?.trim() ||
              !!explainPayload.sentence_meaning_vi?.trim() ||
              !!explainPayload.notes?.trim() ||
              explainPayload.vocabularies.length > 0 ||
              explainPayload.grammar.length > 0}
            {#if explainPayload.sentence_hiragana?.trim() || explainPayload.sentence_meaning_vi?.trim()}
              <div class="explain-block explain-sentence-block">
                <div class="section-title">Nghĩa cả câu / đoạn chọn</div>
                {#if explainPayload.sentence_hiragana?.trim()}
                  <div class="ev-hiragana-line sentence-hiragana">
                    <span class="ev-label">Hiragana</span>
                    <span class="ev-hiragana"
                      >{explainPayload.sentence_hiragana}</span
                    >
                  </div>
                {/if}
                {#if explainPayload.sentence_meaning_vi?.trim()}
                  <div class="ev-mean sentence-meaning-vi">
                    {explainPayload.sentence_meaning_vi}
                  </div>
                {/if}
              </div>
            {/if}
            {#if explainPayload.notes?.trim()}
              <div class="explain-block explain-notes-block">
                <div class="section-title">Ghi chú</div>
                <div class="explain-notes-text">{explainPayload.notes}</div>
              </div>
            {/if}
            {#if explainPayload.vocabularies.length > 0}
              <div class="explain-block">
                <div class="section-title">Từ vựng</div>
                <ul class="explain-vocab-list">
                  {#each explainPayload.vocabularies as item}
                    {@const hira = item.hiragana?.trim() || item.reading?.trim()}
                    <li class="explain-vocab-item">
                      <div class="ev-head">
                        <span class="ev-word">{item.word ?? ""}</span>
                      </div>
                      {#if hira}
                        <div class="ev-hiragana-line">
                          <span class="ev-label">Hiragana</span>
                          <span class="ev-hiragana">{hira}</span>
                        </div>
                      {/if}
                      {#if item.meaning_vi}
                        <div class="ev-mean">{item.meaning_vi}</div>
                      {/if}
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
            {#if explainPayload.grammar.length > 0}
              <div class="explain-block">
                <div class="section-title">Ngữ pháp</div>
                <ul class="explain-grammar-list">
                  {#each explainPayload.grammar as g}
                    <li class="explain-grammar-item">
                      <div class="ev-grammar-point">{g.point ?? ""}</div>
                      {#if g.explanation_vi}
                        <div class="ev-mean">{g.explanation_vi}</div>
                      {/if}
                      {#if g.example && (g.example.japanese?.trim() || g.example.hiragana?.trim() || g.example.meaning_vi?.trim())}
                        <div class="grammar-example-wrap">
                          <div class="grammar-example-label">Ví dụ</div>
                          {#if g.example.japanese?.trim()}
                            <div class="ev-jp grammar-example-jp">
                              {g.example.japanese}
                            </div>
                          {/if}
                          {#if g.example.hiragana?.trim()}
                            <div class="ev-hiragana-line">
                              <span class="ev-label">Hiragana</span>
                              <span class="ev-hiragana">{g.example.hiragana}</span>
                            </div>
                          {/if}
                          {#if g.example.meaning_vi?.trim()}
                            <div class="ev-mean">{g.example.meaning_vi}</div>
                          {/if}
                        </div>
                      {/if}
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
            {#if !hasAny}
              <div class="explain-empty">Không có mục nào trong phản hồi AI.</div>
            {/if}
          {/if}
        </div>
      {/if}

      {#if kanjiResults.length === 0 && vocabResults.length === 0 && activeTab !== "explain"}
        <div class="no-results">Không tìm thấy Kanji hoặc Từ vựng</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .popup {
    position: fixed;
    width: 700px;
    max-width: 90vw;
    max-height: min(600px, 80vh);
    overflow-y: auto;
    overflow-x: hidden;
    background: #ffffff;
    color: #111827;
    border-radius: 0.5rem;
    padding: 0;
    font-size: 14px;
    line-height: 1.4;
    box-shadow:
      0 10px 15px -3px rgba(0, 0, 0, 0.1),
      0 4px 6px -4px rgba(0, 0, 0, 0.1);
    border: 1px solid #e5e7eb;
    z-index: 2147483647;
    cursor: default;
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      system-ui,
      -system-ui,
      sans-serif;
    display: flex;
    flex-direction: column;
  }

  .loading {
    padding: 2rem;
    text-align: center;
    color: #6b7280;
  }

  .error {
    padding: 2rem;
    color: #ef4444;
    text-align: center;
  }

  .skipped {
    padding: 2rem;
    color: #6b7280;
    text-align: center;
    font-style: italic;
  }

  .result {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .extracted-text-section {
    padding: 1rem;
    font-size: 1.25rem;
    color: #1f2937;
    background-color: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    line-height: 1.5;
    word-break: break-word;
  }

  .vocab-section {
    padding: 1rem;
    background: #ffffff;
    margin-bottom: 0.5rem;
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e5e7eb;
    background: #ffffff;
  }

  .tab {
    appearance: none;
    border: 1px solid #e5e7eb;
    background: #f9fafb;
    color: #374151;
    font-size: 0.85rem;
    font-weight: 600;
    padding: 0.4rem 0.65rem;
    border-radius: 999px;
    cursor: pointer;
    transition: background-color 0.15s, border-color 0.15s, color 0.15s;
    user-select: none;
  }

  .tab:hover:not(:disabled) {
    background: #f3f4f6;
    border-color: #d1d5db;
  }

  .tab.active {
    background: #fee2e2;
    border-color: #fca5a5;
    color: #991b1b;
  }

  .tab:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .vocab-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .vocab-item {
    padding-bottom: 0.5rem;
    border-bottom: 1px dashed #e5e7eb;
  }

  .vocab-item:last-child {
    padding-bottom: 0;
    border-bottom: none;
  }

  .vocab-header {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    margin-bottom: 0.25rem;
  }

  .vocab-word {
    font-size: 24px;
    font-weight: bold;
    color: #f87171;
  }

  .vocab-reading {
    font-size: 1rem;
    color: #6b7280;
  }

  .vocab-meaning {
    color: #374151;
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .kanji-section {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .kanji-accordion-item {
    border-bottom: 1px solid #e5e7eb;
  }

  .kanji-accordion-item:last-child {
    border-bottom: none;
  }

  .kanji-accordion-header {
    width: 100%;
    padding: 1rem;
    background: #ffffff;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    text-align: left;
    transition: background-color 0.2s;
  }

  .kanji-accordion-header:hover {
    background: #f9fafb;
  }

  .kanji-summary {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    flex: 1;
    min-width: 0;
  }

  .kanji-char-small-111 {
    font-size: 20px !important;
    font-weight: bold;
    color: #f87171;
    flex-shrink: 0;
  }

  .kanji-summary-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
  }

  .kanji-reading-summary {
    font-weight: 500;
    color: #111827;
    font-size: 0.95rem;
  }

  .kanji-detail-summary {
    color: #6b7280;
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .kanji-meta-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    font-size: 0.8rem;
    color: #374151;
  }

  .meta-item {
    white-space: nowrap;
  }

  .accordion-icon {
    font-size: 1.5rem;
    font-weight: bold;
    color: #6b7280;
    flex-shrink: 0;
    width: 1.5rem;
    text-align: center;
  }

  .kanji-accordion-content {
    padding: 0.75rem;
    background: #ffffff;
    border-top: 1px solid #e5e7eb;
  }

  .detail-section {
    /* margin-top: 1rem; */
    margin-bottom: 0.75rem;
  }

  .detail-text {
    color: #374151;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .detail-text p {
    margin-bottom: 0.35rem;
  }

  .detail-text p:last-child {
    margin-bottom: 0;
  }

  .examples-section {
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .examples-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.35rem;
  }

  .example-item {
    padding: 0.35rem 0.45rem;
    background: #f9fafb;
    border-radius: 0.25rem;
    font-size: 0.82rem;
    line-height: 1.25;
    border: 1px solid #e5e7eb;
  }

  .example-word {
    font-weight: 500;
    color: #111827;
    margin-right: 0.25rem;
  }

  .example-reading {
    color: #6b7280;
    margin-right: 0.25rem;
  }

  .example-mean {
    color: #374151;
  }

  .section-title {
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .no-results {
    padding: 0.5rem;
    color: #6b7280;
    text-align: center;
    font-style: italic;
  }

  .explain-section {
    padding: 1rem;
    background: #ffffff;
    min-height: 4rem;
  }

  .explain-loading {
    color: #6b7280;
    text-align: center;
    padding: 1rem;
  }

  .explain-error {
    color: #b91c1c;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.375rem;
    padding: 0.75rem 1rem;
    font-size: 0.9rem;
  }

  .explain-empty {
    color: #6b7280;
    text-align: center;
    font-style: italic;
    padding: 0.5rem;
  }

  .explain-block {
    margin-bottom: 1rem;
  }

  .explain-block:last-child {
    margin-bottom: 0;
  }

  .explain-sentence-block {
    padding: 0.65rem 0.75rem;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 0.35rem;
  }

  .sentence-hiragana {
    margin-top: 0.25rem;
  }

  .sentence-meaning-vi {
    margin-top: 0.35rem;
    font-size: 0.95rem;
  }

  .explain-notes-block {
    padding: 0.5rem 0.65rem;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 0.35rem;
  }

  .explain-notes-text {
    color: #166534;
    font-size: 0.88rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .grammar-example-wrap {
    margin-top: 0.55rem;
    padding: 0.45rem 0.55rem;
    background: #ffffff;
    border-left: 3px solid #fca5a5;
    border-radius: 0.25rem;
  }

  .grammar-example-label {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #9ca3af;
    margin-bottom: 0.35rem;
  }

  .grammar-example-jp {
    margin-bottom: 0.15rem;
  }

  .explain-vocab-list,
  .explain-grammar-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .explain-vocab-item,
  .explain-grammar-item {
    padding: 0.5rem 0.65rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.35rem;
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .ev-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.2rem;
  }

  .ev-word {
    font-weight: 600;
    color: #111827;
    font-size: 1.05rem;
  }

  .ev-hiragana-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;
    margin: 0.15rem 0 0.35rem;
  }

  .ev-label {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #9ca3af;
  }

  .ev-hiragana {
    color: #4b5563;
    font-size: 0.95rem;
  }

  .ev-mean {
    color: #374151;
  }

  .ev-grammar-point {
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 0.2rem;
  }

  .ev-jp {
    font-weight: 500;
    color: #111827;
    margin-bottom: 0.2rem;
  }

  @media (max-width: 520px) {
    .examples-list {
      grid-template-columns: 1fr;
    }
  }
</style>
