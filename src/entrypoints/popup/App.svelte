<script lang="ts">
  import dict from "../../assets/lib/dict-ver-2.json";

  type DictEntry = {
    w: string;
    h: string;
    mazii?: {
      mean: string;
      detail: string;
      example_kun?: Record<string, Array<{ w: string; m: string; p: string }>>;
      examples?: Array<{ w: string; m: string; p: string; h: string }>;
      kanji?: string;
      kun?: string;
      level?: string[];
    };
    grammar?: Array<{
      title: string;
      level: string;
      category: string;
    }>;
    examples?: Array<{
      content: string;
      transcription: string;
      mean: string;
    }>;
  };

  let searchQuery = "";
  let result: DictEntry | null = null;
  let error: string | null = null;

  function search() {
    if (!searchQuery.trim()) {
      result = null;
      error = null;
      return;
    }

    const found = (dict as DictEntry[]).find(
      (entry) => entry.w === searchQuery.trim()
    );

    if (found) {
      result = found;
      error = null;
    } else {
      result = null;
      error = `Kanji "${searchQuery}" not found`;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      search();
    }
  }
</script>

<main>
  <h1>Kanji Dictionary</h1>

  <div class="search-container">
    <input
      type="text"
      placeholder="Enter kanji to search..."
      bind:value={searchQuery}
      on:keydown={handleKeydown}
      class="search-input"
    />
    <button on:click={search} class="search-button">Search</button>
  </div>

  {#if error}
    <div class="error">{error}</div>
  {/if}

  {#if result}
    <div class="result-container">
      <div class="kanji-header">
        <div class="kanji-char">{result.w}</div>
        <div class="kanji-reading">{result.h}</div>
      </div>

      {#if result.mazii}
        <div class="section">
          <h2>Meaning</h2>
          <p class="meaning">{result.mazii.mean}</p>

          {#if result.mazii.detail}
            <div class="detail">
              {#each result.mazii.detail.split("##") as paragraph}
                {#if paragraph.trim()}
                  <p>{paragraph.trim()}</p>
                {/if}
              {/each}
            </div>
          {/if}

          {#if result.mazii.level}
            <div class="level">
              Level: {result.mazii.level.join(", ")}
            </div>
          {/if}

          {#if result.mazii.kun}
            <div class="kun-reading">
              Kun: {result.mazii.kun}
            </div>
          {/if}
        </div>
      {/if}

      {#if result.grammar && result.grammar.length > 0}
        <div class="section">
          <h2>Grammar ({result.grammar.length})</h2>
          <div class="grammar-list">
            {#each result.grammar as item}
              <div class="grammar-item">
                <div class="grammar-title">{item.title}</div>
                {#if item.level}
                  <span class="grammar-level">{item.level}</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if result.examples && result.examples.length > 0}
        <div class="section">
          <h2>Examples ({result.examples.length})</h2>
          <div class="examples-list">
            {#each result.examples.slice(0, 10) as example}
              <div class="example-item">
                <div class="example-content">{example.content}</div>
                <div class="example-transcription">{example.transcription}</div>
                <div class="example-mean">{example.mean}</div>
              </div>
            {/each}
            {#if result.examples.length > 10}
              <div class="more-examples">
                ... and {result.examples.length - 10} more
              </div>
            {/if}
          </div>
        </div>
      {/if}

      {#if result.mazii?.examples && result.mazii.examples.length > 0}
        <div class="section">
          <h2>Word Examples ({result.mazii.examples.length})</h2>
          <div class="word-examples-list">
            {#each result.mazii.examples.slice(0, 10) as example}
              <div class="word-example-item">
                <span class="word-example-word">{example.w}</span>
                <span class="word-example-reading">({example.p})</span>
                <span class="word-example-mean">- {example.m}</span>
              </div>
            {/each}
            {#if result.mazii.examples.length > 10}
              <div class="more-examples">
                ... and {result.mazii.examples.length - 10} more
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</main>

<style>
  main {
    padding: 1.5rem;
    max-width: 800px;
    margin: 0 auto;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    background-color: #ffffff;
    color: #000000;
  }

  h1 {
    text-align: center;
    margin-bottom: 1.5rem;
    color: #333333;
  }

  .search-container {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .search-input {
    flex: 1;
    padding: 0.75rem;
    font-size: 1rem;
    border: 2px solid #dddddd;
    border-radius: 4px;
    outline: none;
    background-color: #ffffff;
    color: #000000;
  }

  .search-input:focus {
    border-color: #4caf50;
  }

  .search-button {
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
    background-color: #4caf50;
    color: #ffffff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .search-button:hover {
    background-color: #45a049;
  }

  .error {
    padding: 1rem;
    background-color: #ffebee;
    color: #c62828;
    border-radius: 4px;
    margin-bottom: 1rem;
  }

  .result-container {
    background-color: #f9f9f9;
    border-radius: 8px;
    padding: 1.5rem;
    color: #000000;
  }

  .kanji-header {
    text-align: center;
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #dddddd;
  }

  .kanji-char {
    font-size: 4rem;
    font-weight: bold;
    margin-bottom: 0.5rem;
    color: #000000;
  }

  .kanji-reading {
    font-size: 1.2rem;
    color: #666666;
  }

  .section {
    margin-bottom: 2rem;
  }

  .section h2 {
    font-size: 1.3rem;
    margin-bottom: 1rem;
    color: #333333;
    border-bottom: 1px solid #dddddd;
    padding-bottom: 0.5rem;
  }

  .meaning {
    font-size: 1.1rem;
    font-weight: 500;
    color: #2c3e50;
    margin-bottom: 1rem;
  }

  .detail {
    margin-top: 1rem;
    line-height: 1.6;
    color: #555555;
  }

  .detail p {
    margin-bottom: 0.5rem;
    color: #555555;
  }

  .level,
  .kun-reading {
    margin-top: 0.5rem;
    font-size: 0.9rem;
    color: #666666;
  }

  .grammar-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .grammar-item {
    padding: 0.75rem;
    background-color: #ffffff;
    border-radius: 4px;
    border-left: 3px solid #4caf50;
    color: #000000;
  }

  .grammar-title {
    font-weight: 500;
    margin-bottom: 0.25rem;
    color: #000000;
  }

  .grammar-level {
    font-size: 0.85rem;
    color: #666666;
    background-color: #e8f5e9;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    display: inline-block;
  }

  .examples-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .example-item {
    padding: 1rem;
    background-color: #ffffff;
    border-radius: 4px;
    border-left: 3px solid #2196f3;
    color: #000000;
  }

  .example-content {
    font-size: 1.1rem;
    font-weight: 500;
    margin-bottom: 0.5rem;
    color: #000000;
  }

  .example-transcription {
    font-size: 0.9rem;
    color: #666666;
    margin-bottom: 0.5rem;
    font-style: italic;
  }

  .example-mean {
    color: #555555;
  }

  .word-examples-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .word-example-item {
    padding: 0.5rem;
    background-color: #ffffff;
    border-radius: 4px;
    font-size: 0.95rem;
    color: #000000;
  }

  .word-example-word {
    font-weight: 500;
    margin-right: 0.5rem;
    color: #000000;
  }

  .word-example-reading {
    color: #666666;
    margin-right: 0.5rem;
  }

  .word-example-mean {
    color: #555555;
  }

  .more-examples {
    text-align: center;
    color: #999999;
    font-style: italic;
    margin-top: 0.5rem;
  }
</style>
