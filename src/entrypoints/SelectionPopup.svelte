<script lang="ts">
  import dict from "../assets/lib/dict-ver-3.json";
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
    grammar?: Array<{
      title: string;
      level: string;
      category: string;
    }>;
    examples?: Array<{
      w: string;
      m: string;
      p: string;
      h: string;
    }>;
  };
  let { text, position }: { text: string; position: Position } = $props();
  let kanjiResults: DictEntry[] = $state([]);
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

    // Extract all kanji from the string
    const kanjiList = extractKanji(trimmed);

    // Search for each kanji in the dictionary
    const foundKanji: DictEntry[] = [];
    for (const kanji of kanjiList) {
      const found = (dict as DictEntry[]).find((entry) => entry.w === kanji);
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
  id="jisho-go-selection-popup"
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
                  <div class="kanji-char-small">{kanjiEntry.w}</div>
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

                  {#if kanjiEntry.grammar && kanjiEntry.grammar.length > 0}
                    <div class="grammar-section">
                      <div class="section-title">Ngữ pháp</div>
                      <div class="grammar-list">
                        {#each kanjiEntry.grammar as grammar}
                          <div class="grammar-item">
                            <span class="grammar-title">{grammar.title}</span>
                            {#if grammar.level}
                              <span class="grammar-level"
                                >({grammar.level})</span
                              >
                            {/if}
                            {#if grammar.category}
                              <span class="grammar-category"
                                >- {grammar.category}</span
                              >
                            {/if}
                          </div>
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

      {#if kanjiResults.length === 0}
        <div class="no-results">Không tìm thấy Kanji</div>
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

  .kanji-char-small {
    font-size: 2rem;
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

  .kanji-header {
    text-align: center;
    padding-bottom: 1rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .kanji-char {
    font-size: 2.5rem;
    font-weight: bold;
    margin-bottom: 0.25rem;
    color: #f87171;
  }

  .kanji-reading {
    font-size: 1rem;
    color: #6b7280;
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

  .grammar-section {
    margin-top: 1rem;
    margin-bottom: 1rem;
  }

  .grammar-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .grammar-item {
    padding: 0.5rem;
    background: #f9fafb;
    border-radius: 0.25rem;
    font-size: 0.85rem;
    line-height: 1.4;
    border: 1px solid #e5e7eb;
  }

  .grammar-title {
    font-weight: 500;
    color: #111827;
    margin-right: 0.25rem;
  }

  .grammar-level {
    color: #6b7280;
    margin-right: 0.25rem;
  }

  .grammar-category {
    color: #374151;
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
