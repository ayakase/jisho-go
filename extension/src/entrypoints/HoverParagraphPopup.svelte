<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { searchSelectionDicts } from "../lib/dict-loaders";
  import { storage } from "#imports";
  import { kanaToRomajiConvert } from "../lib/romaji";

  interface Position {
    left: number;
    top: number;
  }

  type HoverParagraphSections = {
    kanji: boolean;
    translate: boolean;
    vocab: boolean;
  };

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

  type VocabEntry = {
    word: string;
    r: string;
    m: string;
  };

  type VocabReadingGroup = {
    reading: string;
    entries: VocabEntry[];
  };

  let {
    text,
    position,
    sections = { translate: true, kanji: true, vocab: true },
    darkMode: initialDarkMode = false,
  }: {
    text: string;
    position: Position;
    sections?: HoverParagraphSections;
    darkMode?: boolean;
  } = $props();

  let translatedText = $state<string | null>(null);
  let translateLoading = $state(false);
  let translateError = $state<string | null>(null);

  let dictLoading = $state(false);
  let dictError = $state<string | null>(null);
  let vocabResults = $state<VocabEntry[]>([]);
  let kanjiResults = $state<DictEntry[]>([]);

  let selectedKanjiWord = $state<string | null>(null);
  let selectedKanjiEntry = $derived(
    kanjiResults.find((k) => k.w === selectedKanjiWord) ?? null
  );
  let expandedOn = $state(false);
  let expandedKun = $state(false);
  let showRomaji = $state<boolean>(false);
  let darkMode = $state<boolean>(untrack(() => initialDarkMode));
  let unwatchDarkMode: (() => void) | null = null;
  let unwatchRomaji: (() => void) | null = null;

  (async () => {
    try {
      const storedRomaji = await storage.getItem<boolean>("local:showRomaji");
      if (storedRomaji !== null && storedRomaji !== undefined) {
        showRomaji = storedRomaji;
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
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  })();

  onDestroy(() => {
    unwatchRomaji?.();
    unwatchDarkMode?.();
  });

  function convertIfRomaji(textVal: string | undefined): string {
    if (!textVal) return "";
    if (showRomaji) {
      const romaji = kanaToRomajiConvert(textVal);
      return `${textVal} (${romaji})`;
    }
    return textVal;
  }

  function normalizeKanjiEntry(entry: any): DictEntry {
    return {
      w: entry.w,
      h: entry.h,
      detail: entry.detail ?? entry.d,
      on: entry.on ?? entry.o,
      kun: entry.kun ?? entry.k,
      level: entry.level ?? entry.l,
      stroke_count: entry.stroke_count ?? entry.sc,
      example_kun: entry.example_kun ?? entry.ek,
      example_on: entry.example_on,
      examples: entry.examples ?? entry.e,
    };
  }

  function toggleKanji(word: string) {
    if (selectedKanjiWord === word) {
      selectedKanjiWord = null;
    } else {
      selectedKanjiWord = word;
      expandedOn = false;
      expandedKun = false;
    }
  }

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
    selectedKanjiWord = null;

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

    if (sections.kanji) {
      kanjiResults = foundKanji.map(normalizeKanjiEntry);
    }
    if (sections.vocab) {
      vocabResults = foundVocab;
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
  class:dark-mode={darkMode}
  style="left: {position.left}px; top: {position.top}px;"
  role="tooltip"
  aria-label="Paragraph hover popup"
>
  <div class="source-text">
    {#if sections.kanji && kanjiResults.length > 0}
      {#each Array.from(text) as char}
        {@const isKanji = kanjiResults.some((k) => k.w === char)}
        {#if isKanji}
          <span
            class="source-kanji-clickable"
            class:source-highlight={selectedKanjiWord === char}
            role="button"
            tabindex="0"
            onclick={(e) => {
              e.stopPropagation();
              toggleKanji(char);
            }}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleKanji(char);
              }
            }}
          >{char}</span>
        {:else}
          <span>{char}</span>
        {/if}
      {/each}
    {:else}
      {text}
    {/if}
  </div>

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

  {#if sections.kanji}
    <div class="section kanji-section">
      <div class="section-title">
        Kanji {#if kanjiResults.length > 0}({kanjiResults.length}){/if}
      </div>

      {#if dictLoading}
        <div class="muted">Đang tải kanji...</div>
      {:else if kanjiResults.length > 0}
        <div class="kanji-chips-row">
          {#each kanjiResults as k}
            <button
              type="button"
              class="kanji-chip"
              class:active={selectedKanjiWord === k.w}
              onclick={(e) => {
                e.stopPropagation();
                toggleKanji(k.w);
              }}
              title="Bấm để xem chi tiết {k.w} ({k.h})"
            >
              <span class="kanji-chip-char">{k.w}</span>
              <span class="kanji-chip-read">{k.h}</span>
            </button>
          {/each}
        </div>

        {#if selectedKanjiEntry}
          <div class="kanji-detail-card">
            <div class="kanji-detail-header">
              <div class="kanji-detail-main">
                <div class="kanji-detail-char">{selectedKanjiEntry.w}</div>
                <div class="kanji-detail-info">
                  <div class="kanji-detail-reading">{selectedKanjiEntry.h}</div>
                  <div class="kanji-meta-row">
                    {#if selectedKanjiEntry.on}
                      <span class="meta-item">On: {convertIfRomaji(selectedKanjiEntry.on)}</span>
                    {/if}
                    {#if selectedKanjiEntry.kun}
                      <span class="meta-item">Kun: {convertIfRomaji(selectedKanjiEntry.kun)}</span>
                    {/if}
                    {#if selectedKanjiEntry.level && selectedKanjiEntry.level.length > 0}
                      <span class="meta-item">Level: {selectedKanjiEntry.level.join(", ")}</span>
                    {/if}
                    {#if selectedKanjiEntry.stroke_count}
                      <span class="meta-item">Số nét: {selectedKanjiEntry.stroke_count}</span>
                    {/if}
                  </div>
                </div>
              </div>
              <button
                type="button"
                class="kanji-detail-close"
                onclick={(e) => {
                  e.stopPropagation();
                  selectedKanjiWord = null;
                }}
                title="Đóng chi tiết"
                aria-label="Đóng chi tiết"
              >×</button>
            </div>

            {#if selectedKanjiEntry.detail}
              <div class="detail-section">
                <div class="detail-subheading">Chi tiết {selectedKanjiEntry.w}</div>
                <div class="detail-text">
                  {#each selectedKanjiEntry.detail.split("##") as paragraph}
                    {#if paragraph.trim()}
                      <p>{paragraph.trim()}</p>
                    {/if}
                  {/each}
                </div>
              </div>
            {/if}

            {#if selectedKanjiEntry.examples && selectedKanjiEntry.examples.length > 0}
              <div class="examples-section">
                <div class="detail-subheading">Từ vựng hay gặp</div>
                <div class="examples-list">
                  {#each selectedKanjiEntry.examples as example}
                    <div class="example-item">
                      <span class="example-word">{example.w}</span>
                      <span class="example-reading">({convertIfRomaji(example.p)})</span>
                      <span class="example-mean">- {example.m}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            {#if selectedKanjiEntry.example_on}
              <div class="examples-section examples-collapse">
                <button
                  type="button"
                  class="examples-collapse-header"
                  onclick={(e) => {
                    e.stopPropagation();
                    expandedOn = !expandedOn;
                  }}
                >
                  <span class="detail-subheading">Từ vựng On</span>
                  <span class="examples-collapse-icon">{expandedOn ? "⌃" : "⌄"}</span>
                </button>
                {#if expandedOn}
                  <div class="examples-list">
                    {#each Object.entries(selectedKanjiEntry.example_on) as [reading, examples]}
                      {#each examples as example}
                        <div class="example-item">
                          <span class="example-word">{example.w}</span>
                          <span class="example-reading">({convertIfRomaji(example.p)})</span>
                          <span class="example-mean">- {example.m}</span>
                        </div>
                      {/each}
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}

            {#if selectedKanjiEntry.example_kun}
              <div class="examples-section examples-collapse">
                <button
                  type="button"
                  class="examples-collapse-header"
                  onclick={(e) => {
                    e.stopPropagation();
                    expandedKun = !expandedKun;
                  }}
                >
                  <span class="detail-subheading">Từ vựng Kun</span>
                  <span class="examples-collapse-icon">{expandedKun ? "⌃" : "⌄"}</span>
                </button>
                {#if expandedKun}
                  <div class="examples-list">
                    {#each Object.entries(selectedKanjiEntry.example_kun) as [reading, examples]}
                      {#each examples as example}
                        <div class="example-item">
                          <span class="example-word">{example.w}</span>
                          <span class="example-reading">({convertIfRomaji(example.p)})</span>
                          <span class="example-mean">- {example.m}</span>
                        </div>
                      {/each}
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      {:else}
        <div class="muted">Không tìm thấy Kanji trong đoạn.</div>
      {/if}
    </div>
  {/if}

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

  {#if sections.vocab}
    <div class="section">
      <div class="section-title">
        Từ vựng {#if vocabResults.length > 0}({vocabResults.length}){/if}
      </div>
      {#if dictLoading}
        <div class="muted">Đang tải từ vựng...</div>
      {:else if dictError}
        <div class="error-text">{dictError}</div>
      {:else if vocabResults.length > 0}
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
      {:else}
        <div class="muted">Không có từ vựng phù hợp.</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .hover-paragraph-popup {
    position: fixed;
    width: 440px;
    max-width: 90vw;
    max-height: min(520px, 80vh);
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

  .source-kanji-clickable {
    cursor: pointer;
    border-radius: 0.2rem;
    color: #ef4444;
    transition: background-color 0.12s, color 0.12s;
  }

  .source-kanji-clickable:hover {
    background: #fee2e2;
    color: #b91c1c;
  }

  .source-highlight {
    background: #fecaca;
    color: #b91c1c;
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.3);
    border-radius: 0.2rem;
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

  .kanji-chips-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.25rem;
  }

  .kanji-chip {
    appearance: none;
    border: 1px solid #e5e7eb;
    background: #f9fafb;
    border-radius: 999px;
    padding: 0.2rem 0.55rem;
    display: inline-flex;
    align-items: baseline;
    gap: 0.3rem;
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;
  }

  .kanji-chip:hover {
    background: #fee2e2;
    border-color: #fca5a5;
  }

  .kanji-chip.active {
    background: #fee2e2;
    border-color: #ef4444;
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.25);
  }

  .kanji-chip-char {
    font-size: 1.05rem;
    font-weight: 700;
    color: #ef4444;
    line-height: 1;
  }

  .kanji-chip-read {
    font-size: 0.75rem;
    font-weight: 500;
    color: #4b5563;
  }

  .kanji-chip.active .kanji-chip-read {
    color: #991b1b;
    font-weight: 600;
  }

  .kanji-detail-card {
    margin-top: 0.5rem;
    background: #fffaf5;
    border: 1px solid #fed7aa;
    border-radius: 0.45rem;
    padding: 0.65rem 0.75rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.03);
  }

  .kanji-detail-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    padding-bottom: 0.45rem;
    border-bottom: 1px solid #fed7aa;
  }

  .kanji-detail-main {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
  }

  .kanji-detail-char {
    font-size: 2.1rem;
    font-weight: 700;
    color: #f87171;
    line-height: 1;
    flex-shrink: 0;
  }

  .kanji-detail-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
    min-width: 0;
  }

  .kanji-detail-reading {
    font-size: 0.95rem;
    font-weight: 700;
    color: #111827;
  }

  .kanji-meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 0.65rem;
    font-size: 0.78rem;
    color: #4b5563;
  }

  .meta-item {
    white-space: nowrap;
  }

  .kanji-detail-close {
    appearance: none;
    background: transparent;
    border: none;
    color: #9ca3af;
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    padding: 0.15rem 0.35rem;
    border-radius: 0.25rem;
    transition: color 0.12s, background-color 0.12s;
  }

  .kanji-detail-close:hover {
    color: #111827;
    background: #fee2e2;
  }

  .detail-section,
  .examples-section {
    margin-top: 0.45rem;
  }

  .detail-subheading {
    font-size: 0.74rem;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.25rem;
  }

  .detail-text {
    color: #374151;
    font-size: 0.85rem;
    line-height: 1.45;
  }

  .detail-text p {
    margin: 0 0 0.3rem;
  }

  .detail-text p:last-child {
    margin-bottom: 0;
  }

  .examples-collapse {
    border-top: 1px dashed #fed7aa;
    padding-top: 0.35rem;
  }

  .examples-collapse-header {
    display: flex;
    align-items: center;
    width: fit-content;
    gap: 0.35rem;
    padding: 0.15rem 0;
    border: 0;
    background: transparent;
    color: #111827;
    cursor: pointer;
    text-align: left;
  }

  .examples-collapse-header:hover {
    color: #991b1b;
  }

  .examples-collapse-header .detail-subheading {
    margin-bottom: 0;
  }

  .examples-collapse-icon {
    color: #6b7280;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .examples-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.35rem;
    margin-top: 0.3rem;
  }

  @media (max-width: 420px) {
    .examples-list {
      grid-template-columns: 1fr;
    }
  }

  .example-item {
    padding: 0.35rem 0.45rem;
    background: #ffffff;
    border-radius: 0.25rem;
    border: 1px solid #fed7aa;
    font-size: 0.8rem;
    line-height: 1.35;
  }

  .example-word {
    font-weight: 600;
    color: #111827;
    margin-right: 0.25rem;
  }

  .example-reading {
    color: #6b7280;
    margin-right: 0.25rem;
    font-size: 0.75rem;
  }

  .example-mean {
    color: #374151;
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

  .muted {
    color: #6b7280;
    font-size: 0.84rem;
  }

  .error-text {
    color: #b91c1c;
    font-size: 0.82rem;
  }

  /* Dark mode */
  .hover-paragraph-popup.dark-mode {
    color-scheme: dark;
    background: #111827;
    color: #e5e7eb;
    border-color: #374151;
    box-shadow:
      0 10px 15px -3px rgba(0, 0, 0, 0.5),
      0 4px 6px -4px rgba(0, 0, 0, 0.4);
  }

  .hover-paragraph-popup.dark-mode .source-text {
    background: #1f2937;
    border-color: #374151;
    color: #f3f4f6;
  }

  .hover-paragraph-popup.dark-mode .source-kanji-clickable {
    color: #f87171;
  }

  .hover-paragraph-popup.dark-mode .source-kanji-clickable:hover {
    background: #450a0a;
    color: #fca5a5;
  }

  .hover-paragraph-popup.dark-mode .source-highlight {
    background: #7f1d1d;
    color: #fecaca;
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.5);
  }

  .hover-paragraph-popup.dark-mode .section {
    border-top-color: #374151;
  }

  .hover-paragraph-popup.dark-mode .section-title {
    color: #9ca3af;
  }

  .hover-paragraph-popup.dark-mode .kanji-chip {
    background: #1f2937;
    border-color: #374151;
  }

  .hover-paragraph-popup.dark-mode .kanji-chip:hover {
    background: #374151;
    border-color: #4b5563;
  }

  .hover-paragraph-popup.dark-mode .kanji-chip.active {
    background: #450a0a;
    border-color: #f87171;
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.35);
  }

  .hover-paragraph-popup.dark-mode .kanji-chip-char {
    color: #f87171;
  }

  .hover-paragraph-popup.dark-mode .kanji-chip-read {
    color: #9ca3af;
  }

  .hover-paragraph-popup.dark-mode .kanji-chip.active .kanji-chip-read {
    color: #fecaca;
  }

  .hover-paragraph-popup.dark-mode .kanji-detail-card {
    background: #1f2937;
    border-color: #374151;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .hover-paragraph-popup.dark-mode .kanji-detail-header {
    border-bottom-color: #374151;
  }

  .hover-paragraph-popup.dark-mode .kanji-detail-char {
    color: #f87171;
  }

  .hover-paragraph-popup.dark-mode .kanji-detail-reading {
    color: #f3f4f6;
  }

  .hover-paragraph-popup.dark-mode .kanji-meta-row,
  .hover-paragraph-popup.dark-mode .meta-item {
    color: #9ca3af;
  }

  .hover-paragraph-popup.dark-mode .kanji-detail-close {
    color: #9ca3af;
  }

  .hover-paragraph-popup.dark-mode .kanji-detail-close:hover {
    color: #f3f4f6;
    background: #374151;
  }

  .hover-paragraph-popup.dark-mode .detail-subheading {
    color: #9ca3af;
  }

  .hover-paragraph-popup.dark-mode .detail-text,
  .hover-paragraph-popup.dark-mode .detail-text p {
    color: #d1d5db;
  }

  .hover-paragraph-popup.dark-mode .examples-collapse {
    border-top-color: #374151;
  }

  .hover-paragraph-popup.dark-mode .examples-collapse-header {
    color: #f3f4f6;
  }

  .hover-paragraph-popup.dark-mode .examples-collapse-header:hover {
    color: #fca5a5;
  }

  .hover-paragraph-popup.dark-mode .examples-collapse-icon {
    color: #9ca3af;
  }

  .hover-paragraph-popup.dark-mode .example-item {
    background: #111827;
    border-color: #374151;
  }

  .hover-paragraph-popup.dark-mode .example-word {
    color: #f3f4f6;
  }

  .hover-paragraph-popup.dark-mode .example-reading {
    color: #9ca3af;
  }

  .hover-paragraph-popup.dark-mode .example-mean {
    color: #d1d5db;
  }

  .hover-paragraph-popup.dark-mode .translated-text {
    color: #e5e7eb;
  }

  .hover-paragraph-popup.dark-mode .mini-group {
    background: #1f2937;
    border-color: #374151;
  }

  .hover-paragraph-popup.dark-mode .mini-item {
    border-top-color: #374151;
  }

  .hover-paragraph-popup.dark-mode .mini-head {
    color: #f87171;
  }

  .hover-paragraph-popup.dark-mode .mini-sub {
    color: #9ca3af;
  }

  .hover-paragraph-popup.dark-mode .mini-mean {
    color: #d1d5db;
  }

  .hover-paragraph-popup.dark-mode .muted {
    color: #9ca3af;
  }

  .hover-paragraph-popup.dark-mode .error-text {
    color: #f87171;
  }
</style>
