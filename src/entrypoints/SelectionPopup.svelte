<script lang="ts">
  import kanjiDictData from "../assets/lib/kanji-dict.json";
  import vocabDictData from "../assets/lib/vocabulary-dict.json";
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

    loading = false;
    isSearching = false;
  }
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
      {#if vocabResults.length > 0}
        <div class="vocab-section">
          <div class="section-title">Từ vựng</div>
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
        {#if kanjiResults.length > 0}
          <div class="divider"></div>
        {/if}
      {/if}

      {#if kanjiResults.length > 0}
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
                  <!-- <div class="kanji-header">
                    <div class="kanji-char">{kanjiEntry.w}</div>
                    <div class="kanji-reading">{kanjiEntry.h}</div>
                  </div> -->

                  {#if kanjiEntry.detail}
                    <div class="detail-section">
                      <div class="section-title">Chi tiết</div>
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

      {#if kanjiResults.length === 0 && vocabResults.length === 0}
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

  .divider {
    height: 1px;
    background-color: #e5e7eb;
    margin: 0;
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
    padding: 1rem;
    background: #ffffff;
    border-top: 1px solid #e5e7eb;
  }

  .detail-section {
    /* margin-top: 1rem; */
    margin-bottom: 1rem;
  }

  .detail-text {
    color: #374151;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .detail-text p {
    margin-bottom: 0.5rem;
  }

  .detail-text p:last-child {
    margin-bottom: 0;
  }

  .examples-section {
    margin-top: 1rem;
    margin-bottom: 1rem;
  }

  .examples-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .example-item {
    padding: 0.5rem;
    background: #f9fafb;
    border-radius: 0.25rem;
    font-size: 0.85rem;
    line-height: 1.4;
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
</style>
