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
  let kanjiResult: DictEntry | null = $state(null);
  let error: string | null = $state(null);
  let loading = $state(true);
  let showRomaji = $state<boolean>(false);

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

  // Search immediately when component is created
  (async () => {
    if (text) {
      await search(text);
    }
  })();

  async function search(query: string) {
    loading = true;
    error = null;
    kanjiResult = null;

    const trimmed = query.trim();
    if (!trimmed) {
      loading = false;
      return;
    }

    // Find the kanji in the dictionary
    const found = (dict as DictEntry[]).find((entry) => entry.w === trimmed);
    if (found) {
      kanjiResult = found;
    } else {
      error = "Kanji not found";
    }

    loading = false;
  }
</script>

<div
  id="kanji-go-hover-popup"
  class="hover-popup"
  style="left: {position.left}px; top: {position.top}px;"
  role="tooltip"
  aria-label="Kanji hover popup"
>
  {#if loading}
    <div class="loading">Loading...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if kanjiResult}
    <div class="hover-content">
      <div class="kanji-header">
        <div class="kanji-char">{kanjiResult.w}</div>
        <div class="kanji-reading">{kanjiResult.h}</div>
      </div>

      {#if kanjiResult.detail}
        <div class="detail-section">
          <div class="section-title">Chi tiết</div>
          <div class="detail-text">
            {#each kanjiResult.detail.split("##") as paragraph}
              {#if paragraph.trim()}
                <p>{paragraph.trim()}</p>
              {/if}
            {/each}
          </div>
        </div>
      {/if}

      <div class="meta-row">
        {#if kanjiResult.on}
          <span class="meta-item">On: {convertIfRomaji(kanjiResult.on)}</span>
        {/if}
        {#if kanjiResult.kun}
          <span class="meta-item">Kun: {convertIfRomaji(kanjiResult.kun)}</span>
        {/if}
        {#if kanjiResult.level && kanjiResult.level.length > 0}
          <span class="meta-item">Level: {kanjiResult.level.join(", ")}</span>
        {/if}
        {#if kanjiResult.stroke_count}
          <span class="meta-item">Số nét: {kanjiResult.stroke_count}</span>
        {/if}
      </div>

      {#if kanjiResult.grammar && kanjiResult.grammar.length > 0}
        <div class="grammar-section">
          <div class="section-title">Ngữ pháp</div>
          <div class="grammar-list">
            {#each kanjiResult.grammar as grammar}
              <div class="grammar-item">
                <span class="grammar-title">{grammar.title}</span>
                {#if grammar.level}
                  <span class="grammar-level">({grammar.level})</span>
                {/if}
                {#if grammar.category}
                  <span class="grammar-category">- {grammar.category}</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if kanjiResult.example_kun}
        <div class="examples-section">
          <div class="section-title">Từ vựng (Kun)</div>
          <div class="examples-list">
            {#each Object.entries(kanjiResult.example_kun) as [reading, examples]}
              {#each examples as example}
                <div class="example-item">
                  <span class="example-word">{example.w}</span>
                  <span class="example-reading">({convertIfRomaji(example.p)})</span>
                  <span class="example-mean">- {example.m}</span>
                </div>
              {/each}
            {/each}
          </div>
        </div>
      {/if}

      {#if kanjiResult.example_on}
        <div class="examples-section">
          <div class="section-title">Từ vựng (On)</div>
          <div class="examples-list">
            {#each Object.entries(kanjiResult.example_on) as [reading, examples]}
              {#each examples as example}
                <div class="example-item">
                  <span class="example-word">{example.w}</span>
                  <span class="example-reading">({convertIfRomaji(example.p)})</span>
                  <span class="example-mean">- {example.m}</span>
                </div>
              {/each}
            {/each}
          </div>
        </div>
      {/if}

      {#if kanjiResult.examples && kanjiResult.examples.length > 0}
        <div class="examples-section">
          <div class="section-title">Từ vựng</div>
          <div class="examples-list">
            {#each kanjiResult.examples as example}
              <div class="example-item">
                <span class="example-word">{example.w}</span>
                <span class="example-reading">({convertIfRomaji(example.p)})</span>
                <span class="example-mean">- {example.m}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .hover-popup {
    position: fixed;
    width: 500px;
    max-width: 90vw;
    max-height: min(500px, 80vh);
    overflow-y: auto;
    overflow-x: hidden;
    background: #ffffff;
    color: #111827;
    border-radius: 0.5rem;
    padding: 1rem;
    font-size: 14px;
    line-height: 1.4;
    box-shadow:
      0 10px 15px -3px rgba(0, 0, 0, 0.1),
      0 4px 6px -4px rgba(0, 0, 0, 0.1);
    border: 1px solid #e5e7eb;
    z-index: 2147483646; /* Lower than click popup */
    cursor: default;
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      system-ui,
      -system-ui,
      sans-serif;
  }

  .loading {
    padding: 1rem;
    text-align: center;
    color: #6b7280;
  }

  .error {
    padding: 1rem;
    color: #ef4444;
    text-align: center;
  }

  .hover-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .kanji-header {
    text-align: center;
    padding-bottom: 1rem;
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

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    font-size: 0.85rem;
    color: #374151;
    padding: 0.5rem 0;
  }

  .meta-item {
    white-space: nowrap;
  }

  .detail-section,
  .grammar-section,
  .examples-section {
    margin-top: 0.5rem;
  }

  .section-title {
    font-weight: 600;
    color: #111827;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
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

  .grammar-list,
  .examples-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .grammar-item,
  .example-item {
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
</style>

