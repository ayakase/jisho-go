<script lang="ts">
  import dict from "../assets/lib/dict-ver-3.json";

  interface Position {
    left: number;
    top: number;
  }

  type DictEntry = {
    w: string;
    h: string;
    detail?: string;
    example_kun?: Record<string, Array<{ w: string; m: string; p: string }>>;
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

  let result: DictEntry | null = $state(null);
  let error: string | null = $state(null);
  let loading = $state(true);

  $effect(() => {
    if (text) {
      searchKanji(text);
    }
  });

  function searchKanji(query: string) {
    loading = true;
    error = null;
    result = null;

    const trimmed = query.trim();
    if (!trimmed) {
      loading = false;
      return;
    }

    // Search for exact match
    const found = (dict as DictEntry[]).find((entry) => entry.w === trimmed);

    if (found) {
      result = found;
      error = null;
    } else {
      result = null;
      error = `Kanji "${trimmed}" not found`;
    }

    loading = false;
  }
</script>

<div
  id="jisho-go-selection-popup"
  class="popup"
  style="left: {position.left}px; top: {position.top}px;"
>
  {#if loading}
    <div class="loading">Searching...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if result}
    <div class="result">
      <div class="kanji-header">
        <div class="kanji-char">{result.w}</div>
        <div class="kanji-reading">{result.h}</div>
      </div>

      {#if result.detail}
        <div class="detail-section">
          <div class="detail-text">
            {#each result.detail.split("##").slice(0, 2) as paragraph}
              {#if paragraph.trim()}
                <p>{paragraph.trim()}</p>
              {/if}
            {/each}
          </div>
        </div>
      {/if}

      {#if result.examples && result.examples.length > 0}
        <div class="examples-section">
          <div class="section-title">Examples</div>
          <div class="examples-list">
            {#each result.examples.slice(0, 3) as example}
              <div class="example-item">
                <span class="example-word">{example.w}</span>
                <span class="example-reading">({example.p})</span>
                <span class="example-mean">- {example.m}</span>
              </div>
            {/each}
            {#if result.examples.length > 3}
              <div class="more-examples">
                +{result.examples.length - 3} more
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .popup {
    position: fixed;
    max-width: 320px;
    max-height: 500px;
    overflow-y: auto;
    background: #111827;
    color: #f9fafb;
    border-radius: 0.5rem;
    padding: 1rem;
    font-size: 14px;
    line-height: 1.4;
    box-shadow:
      0 10px 15px -3px rgba(15, 23, 42, 0.4),
      0 4px 6px -4px rgba(15, 23, 42, 0.4);
    z-index: 2147483647;
    cursor: default;
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      system-ui,
      -system-ui,
      sans-serif;
  }

  .loading {
    padding: 0.5rem;
    text-align: center;
    color: #9ca3af;
  }

  .error {
    padding: 0.5rem;
    color: #ef4444;
    text-align: center;
  }

  .result {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .kanji-header {
    text-align: center;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #374151;
  }

  .kanji-char {
    font-size: 2.5rem;
    font-weight: bold;
    margin-bottom: 0.25rem;
    color: #f9fafb;
  }

  .kanji-reading {
    font-size: 1rem;
    color: #9ca3af;
  }

  .detail-section {
    margin-top: 0.5rem;
  }

  .detail-text {
    color: #d1d5db;
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
    margin-top: 0.5rem;
  }

  .section-title {
    font-weight: 600;
    color: #f9fafb;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .examples-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .example-item {
    padding: 0.5rem;
    background: #1f2937;
    border-radius: 0.25rem;
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .example-word {
    font-weight: 500;
    color: #f9fafb;
    margin-right: 0.25rem;
  }

  .example-reading {
    color: #9ca3af;
    margin-right: 0.25rem;
  }

  .example-mean {
    color: #d1d5db;
  }

  .more-examples {
    text-align: center;
    color: #9ca3af;
    font-size: 0.8rem;
    font-style: italic;
    padding: 0.25rem;
  }
</style>
