<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { findKanjiDictEntry } from "../lib/dict-loaders";
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
    d?: string;
    on?: string;
    o?: string;
    kun?: string;
    k?: string;
    level?: string[];
    l?: string[];
    stroke_count?: string;
    sc?: string;
    example_kun?: Record<string, Array<{ w: string; m: string; p: string }>>;
    ek?: Record<string, Array<{ w: string; m: string; p: string }>>;
    example_on?: Record<string, Array<{ w: string; m: string; p: string }>>;
    examples?: Array<{
      w: string;
      m: string;
      p: string;
      h: string;
    }>;
    e?: Array<{
      w: string;
      m: string;
      p: string;
      h: string;
    }>;
  };
  let {
    text,
    position,
    darkMode: initialDarkMode = false,
  }: {
    text: string;
    position: Position;
    darkMode?: boolean;
  } = $props();
  let kanjiResult: DictEntry | null = $state(null);
  let error: string | null = $state(null);
  let loading = $state(true);
  let showRomaji = $state<boolean>(false);
  let darkMode = $state<boolean>(untrack(() => initialDarkMode));
  let unwatchDarkMode: (() => void) | null = null;
  let unwatchRomaji: (() => void) | null = null;

  // Load settings
  (async () => {
    try {
      const stored = await storage.getItem<boolean>("local:showRomaji");
      if (stored !== null && stored !== undefined) {
        showRomaji = stored;
      }
      const storedDark = await storage.getItem<boolean>("local:darkMode");
      if (storedDark !== null && storedDark !== undefined) {
        darkMode = storedDark;
      }
      unwatchRomaji = storage.watch<boolean>("local:showRomaji", (newMode) => {
        showRomaji = newMode ?? false;
      });
      unwatchDarkMode = storage.watch<boolean>("local:darkMode", (newMode) => {
        darkMode = newMode ?? false;
      });
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  })();

  onDestroy(() => {
    unwatchRomaji?.();
    unwatchDarkMode?.();
  });

  function convertIfRomaji(text: string | undefined): string {
    if (!text) return "";
    if (showRomaji) {
      const romaji = kanaToRomajiConvert(text);
      return `${text} (${romaji})`;
    }
    return text;
  }

  function normalizeKanjiEntry(entry: DictEntry): DictEntry {
    return {
      ...entry,
      detail: entry.detail ?? entry.d,
      on: entry.on ?? entry.o,
      kun: entry.kun ?? entry.k,
      level: entry.level ?? entry.l,
      stroke_count: entry.stroke_count ?? entry.sc,
      example_kun: entry.example_kun ?? entry.ek,
      examples: entry.examples ?? entry.e,
    };
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

    const { entry: found, error: lookupError } =
      await findKanjiDictEntry(trimmed);
    if (lookupError) {
      error = lookupError;
    } else if (found) {
      kanjiResult = normalizeKanjiEntry(found as DictEntry);
    } else {
      error = "Không tìm thấy chữ Kanji này";
    }

    loading = false;
  }
</script>

<div
  id="jisho-go-hover-popup"
  class="hover-popup"
  class:dark-mode={darkMode}
  style="left: {position.left}px; top: {position.top}px;"
  role="tooltip"
  aria-label="Kanji hover popup"
>
  {#if loading}
    <div class="loading">Đang tải...</div>
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
          <div class="kanji-section-title">Chi tiết</div>
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

      {#if kanjiResult.example_kun}
        <div class="examples-section">
          <div class="kanji-section-title">Từ vựng (Kun)</div>
          <div class="examples-list">
            {#each Object.entries(kanjiResult.example_kun) as [reading, examples]}
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

      {#if kanjiResult.example_on}
        <div class="examples-section">
          <div class="kanji-section-title">Từ vựng (On)</div>
          <div class="examples-list">
            {#each Object.entries(kanjiResult.example_on) as [reading, examples]}
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

      {#if kanjiResult.examples && kanjiResult.examples.length > 0}
        <div class="examples-section">
          <div class="kanji-section-title">Từ vựng</div>
          <div class="examples-list">
            {#each kanjiResult.examples as example}
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

<style>
  .hover-popup,
  .hover-popup *,
  .hover-popup *::before,
  .hover-popup *::after {
    box-sizing: border-box;
  }

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
    text-align: left;
    letter-spacing: normal;
    word-spacing: normal;
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
  .examples-section {
    margin-top: 0.5rem;
  }

  .kanji-section-title {
    margin: 0 0 0.5rem 0 !important;
    padding: 0 !important;
    font-weight: 600 !important;
    color: #111827 !important;
    font-size: 0.9rem !important;
    text-transform: uppercase !important;
    letter-spacing: 0.05em !important;
    line-height: 1.3 !important;
  }

  .detail-text {
    color: #374151;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .detail-text p {
    margin: 0 0 0.5rem 0 !important;
    padding: 0 !important;
    line-height: 1.5 !important;
  }

  .detail-text p:last-child {
    margin-bottom: 0 !important;
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

  /* Dark mode */
  .hover-popup.dark-mode {
    color-scheme: dark;
    background: #111827;
    color: #e5e7eb;
    border-color: #374151;
    box-shadow:
      0 10px 15px -3px rgba(0, 0, 0, 0.5),
      0 4px 6px -4px rgba(0, 0, 0, 0.4);
  }

  .hover-popup.dark-mode .kanji-header {
    border-bottom-color: #374151;
  }

  .hover-popup.dark-mode .kanji-char {
    color: #f87171;
  }

  .hover-popup.dark-mode .kanji-reading {
    color: #9ca3af;
  }

  .hover-popup.dark-mode .meta-row,
  .hover-popup.dark-mode .meta-item {
    color: #9ca3af;
  }

  .hover-popup.dark-mode .kanji-section-title {
    color: #f3f4f6 !important;
  }

  .hover-popup.dark-mode .detail-text,
  .hover-popup.dark-mode .detail-text p {
    color: #d1d5db;
  }

  .hover-popup.dark-mode .example-item {
    background: #1f2937;
    border-color: #374151;
  }

  .hover-popup.dark-mode .example-word {
    color: #f3f4f6;
  }

  .hover-popup.dark-mode .example-reading {
    color: #9ca3af;
  }

  .hover-popup.dark-mode .example-mean {
    color: #d1d5db;
  }

  .hover-popup.dark-mode .loading,
  .hover-popup.dark-mode .error {
    color: #9ca3af;
  }
</style>
