<script lang="ts">
  import { searchSelectionDicts } from "../lib/dict-loaders";
  import { storage } from "#imports";
  import { getStoredSession } from "../lib/auth";
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
  type VocabEntry = {
    word: string;
    r: string;
    m: string;
    matchStart?: number;
    matchLength?: number;
  };
  type VocabReadingGroup = {
    reading: string;
    entries: VocabEntry[];
  };
  let {
    text,
    position,
    sourceRange,
  }: { text: string; position: Position; sourceRange?: Range | null } = $props();
  let kanjiResults: DictEntry[] = $state([]);
  let vocabResults: VocabEntry[] = $state([]);
  let error: string | null = $state(null);
  let loading = $state(true);
  let skipped = $state(false);
  let expandedKanjiWord = $state<string | null>(null);
  let isSearching = false;
  let showRomaji = $state<boolean>(false);
  let darkMode = $state(false);
  type ResultTab = "vocab" | "kanji" | "explain";
  let activeTab = $state<ResultTab>("kanji");
  let translatedText = $state<string | null>(null);
  let translateLoading = $state(false);
  let translateError = $state<string | null>(null);
  let hoveredVocabEntry = $state<VocabEntry | null>(null);
  let selectedSourceMatch = $state<{
    start: number;
    length: number;
  } | null>(null);
  let activeKanjiSource = $state<{
    index: number;
    char: string;
  } | null>(null);
  let selectedKanjiWord = $state<string | null>(null);

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

  function getSourceSegments() {
    if (activeTab === "kanji") {
      if (!activeKanjiSource) {
        return [{ text, start: 0, end: text.length }];
      }

      const activeIndex = activeKanjiSource.index;
      return [
        ...(activeIndex > 0
          ? [{ text: text.slice(0, activeIndex), start: 0, end: activeIndex }]
          : []),
        {
          text: activeKanjiSource.char,
          start: activeIndex,
          end: activeIndex + 1,
          isActiveKanji: true,
        },
        ...(activeIndex + 1 < text.length
          ? [{
              text: text.slice(activeIndex + 1),
              start: activeIndex + 1,
              end: text.length,
            }]
          : []),
      ];
    }

    const trimmedOffset = text.length - text.trimStart().length;
    let candidates = vocabResults
      .filter(
        (entry) =>
          entry.matchStart !== undefined &&
          entry.matchLength !== undefined &&
          entry.matchLength > 0,
      )
      .map((entry) => ({
        entry,
        start: trimmedOffset + entry.matchStart!,
        end: trimmedOffset + entry.matchStart! + entry.matchLength!,
      }))
      .filter(
        (match) =>
          match.start >= 0 &&
          match.end <= text.length &&
          match.end > match.start,
      )
      .sort(
        (a, b) =>
          a.start - b.start ||
          b.entry.matchLength! - a.entry.matchLength!,
      );

    const activeEntry = hoveredVocabEntry;
    if (
      activeEntry?.matchStart !== undefined &&
      activeEntry.matchLength !== undefined &&
      activeEntry.matchLength > 0
    ) {
      const activeStart = trimmedOffset + activeEntry.matchStart;
      const activeEnd = activeStart + activeEntry.matchLength;
      candidates = candidates.filter(
        (match) =>
          match.entry === activeEntry ||
          match.end <= activeStart ||
          match.start >= activeEnd,
      );
      if (
        activeStart >= 0 &&
        activeEnd <= text.length &&
        activeEnd > activeStart &&
        !candidates.some((match) => match.entry === activeEntry)
      ) {
        candidates.push({
          entry: activeEntry,
          start: activeStart,
          end: activeEnd,
        });
        candidates.sort(
          (a, b) =>
            a.start - b.start ||
            b.entry.matchLength! - a.entry.matchLength!,
        );
      }
    }

    const segments: Array<{
      text: string;
      entry?: VocabEntry;
      start: number;
      end: number;
      isActiveKanji?: boolean;
    }> = [];
    let cursor = 0;

    for (const match of candidates) {
      if (match.start < cursor) continue;
      if (match.start > cursor) {
        segments.push({
          text: text.slice(cursor, match.start),
          start: cursor,
          end: match.start,
        });
      }
      segments.push({
        text: text.slice(match.start, match.end),
        entry: match.entry,
        start: match.start,
        end: match.end,
      });
      cursor = match.end;
    }

    if (cursor < text.length) {
      segments.push({ text: text.slice(cursor), start: cursor, end: text.length });
    }

    const sourceSegments = segments.length > 0
      ? segments
      : [{ text, start: 0, end: text.length }];

    return sourceSegments;
  }

  function getDisplayedVocabResults(): VocabEntry[] {
    if (!selectedSourceMatch) return vocabResults;
    return vocabResults.filter(
      (entry) => {
        if (entry.matchStart === undefined || entry.matchLength === undefined) {
          return false;
        }

        const selectedEnd =
          selectedSourceMatch.start + selectedSourceMatch.length;
        const entryEnd = entry.matchStart + entry.matchLength;

        return (
          entry.matchStart >= selectedSourceMatch.start &&
          entryEnd <= selectedEnd
        );
      },
    );
  }

  function getDisplayedKanjiResults(): DictEntry[] {
    if (!selectedKanjiWord) return kanjiResults;

    const selected = kanjiResults.filter((entry) => entry.w === selectedKanjiWord);
    const rest = kanjiResults.filter((entry) => entry.w !== selectedKanjiWord);
    return [...selected, ...rest];
  }

  function isSourceMatchActive(entry: VocabEntry): boolean {
    return (
      hoveredVocabEntry?.r === entry.r ||
      (selectedSourceMatch?.start === entry.matchStart &&
        selectedSourceMatch?.length === entry.matchLength)
    );
  }

  function handleSourceMatchClick(entry: VocabEntry) {
    if (entry.matchStart === undefined || entry.matchLength === undefined) return;
    if (
      selectedSourceMatch?.start === entry.matchStart &&
      selectedSourceMatch.length === entry.matchLength
    ) {
      selectedSourceMatch = null;
    } else {
      selectedSourceMatch = {
        start: entry.matchStart,
        length: entry.matchLength,
      };
    }
  }

  function handleKanjiClick(entry: DictEntry) {
    const index = text.indexOf(entry.w);
    if (index < 0) return;

    if (
      selectedKanjiWord === entry.w &&
      expandedKanjiWord === entry.w
    ) {
      clearSourceSelection();
      return;
    }

    handleKanjiSourceClick(entry.w, index);
  }

  function handleKanjiSourceClick(char: string, index: number) {
    const entry = kanjiResults.find((kanji) => kanji.w === char);
    if (!entry) return;

    selectedKanjiWord = entry.w;
    expandedKanjiWord = entry.w;
    activeKanjiSource = { index, char };
    hoveredVocabEntry = null;
    selectedSourceMatch = null;
  }

  function clearSourceSelection() {
    selectedKanjiWord = null;
    activeKanjiSource = null;
    selectedSourceMatch = null;
    hoveredVocabEntry = null;
    expandedKanjiWord = null;
  }

  // Drag the whole popup (fixed-position panel).
  let popupLeft = $state(position.left);
  let popupTop = $state(position.top);
  let popupDragging = $state(false);
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  let positionMode = $state<"highlight" | "remember" | "static">("highlight");
  let staticConfig = $state<{
    corner: string;
    offsetX: number;
    offsetY: number;
  }>({
    corner: "top-right",
    offsetX: 20,
    offsetY: 20,
  });
  let isPositionLoaded = $state(false);

  function isExtensionContextInvalidated(error: unknown): boolean {
    return error instanceof Error && error.message.includes("Extension context invalidated");
  }

  (async () => {
    try {
      darkMode = (await storage.getItem<boolean>("local:darkMode")) ?? false;
      const mode = await storage.getItem<"highlight" | "remember" | "static">(
        "local:popupPositionMode",
      );
      if (mode) positionMode = mode;

      if (positionMode === "remember") {
        const storedRemember = await storage.getItem<{
          left: number;
          top: number;
        }>("local:popupRememberPosition");
        if (storedRemember) {
          popupLeft = storedRemember.left;
          popupTop = storedRemember.top;
        }
      } else if (positionMode === "static") {
        const storedStatic = await storage.getItem<any>(
          "local:popupStaticConfig",
        );
        if (storedStatic) {
          staticConfig = storedStatic;
        }
      }
    } catch (e) {
      if (!isExtensionContextInvalidated(e)) {
        console.error("Failed to load position config:", e);
      }
    } finally {
      isPositionLoaded = true;
    }
  })();

  let popupStyle = $derived.by(() => {
    let base = isPositionLoaded
      ? ""
      : "visibility: hidden; pointer-events: none; ";
    if (positionMode === "static") {
      const { corner, offsetX, offsetY } = staticConfig;
      let s = base;
      if (corner.includes("top")) s += `top: ${offsetY}px; `;
      else s += `bottom: ${offsetY}px; `;

      if (corner.includes("left")) s += `left: ${offsetX}px; `;
      else s += `right: ${offsetX}px; `;

      return s;
    }
    return base + `left: ${popupLeft}px; top: ${popupTop}px;`;
  });

  function startDragPopup(e: PointerEvent) {
    if (positionMode === "static") return;

    const target = e.target as HTMLElement | null;

    // Don't steal the interaction from form controls / buttons.
    if (target?.closest("button, input, textarea, select, a, .source-match")) return;

    e.stopPropagation();
    e.preventDefault();

    popupDragging = true;
    dragOffsetX = e.clientX - popupLeft;
    dragOffsetY = e.clientY - popupTop;

    const onMove = (ev: PointerEvent) => {
      popupLeft = ev.clientX - dragOffsetX;
      popupTop = ev.clientY - dragOffsetY;
    };

    const onUp = () => {
      popupDragging = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (positionMode === "remember") {
        void storage.setItem("local:popupRememberPosition", {
          left: popupLeft,
          top: popupTop,
        }).catch((error) => {
          if (!isExtensionContextInvalidated(error)) {
            console.error("Failed to save popup position:", error);
          }
        });
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    (e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId);
  }

  $effect(() => {
    void text;
    explainPayload = null;
    explainError = null;
    explainFetchedText = null;
  });

  async function translateSelectedText(query: string) {
    const trimmed = query.trim();
    if (!trimmed) {
      translatedText = null;
      translateError = null;
      translateLoading = false;
      return;
    }

    translateLoading = true;
    translateError = null;
    translatedText = null;

    const parseTranslatePayload = (data: unknown): string | null => {
      if (!Array.isArray(data) || !Array.isArray(data[0])) return null;
      const firstRow = data[0] as unknown[];
      if (typeof firstRow[0] === "string") return firstRow[0];
      if (Array.isArray(firstRow[0]) && typeof (firstRow[0] as unknown[])[0] === "string") {
        return (firstRow[0] as unknown[])[0] as string;
      }
      return null;
    };

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
      if (!translated) {
        translateError = "Không lấy được bản dịch.";
      }
    } catch (e) {
      translateError = e instanceof Error ? e.message : "Lỗi dịch văn bản.";
    } finally {
      translateLoading = false;
    }
  }

  function toggleKanji(word: string) {
    expandedKanjiWord = expandedKanjiWord === word ? null : word;
  }

  function getDetailSummary(detail: string | undefined): string {
    if (!detail) return "";
    const firstParagraph = detail.split("##")[0].trim();
    return firstParagraph.length > 150
      ? firstParagraph.substring(0, 150) + "..."
      : firstParagraph;
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

  // Load romaji setting
  (async () => {
    try {
      const stored = await storage.getItem<boolean>("local:showRomaji");
      if (stored !== null && stored !== undefined) {
        showRomaji = stored;
      }
    } catch (error) {
      if (!isExtensionContextInvalidated(error)) {
        console.error("Failed to load romaji setting:", error);
      }
    }
  })();

  $effect(() => {
    let unwatchRomaji: (() => void) | undefined;
    let unwatchDarkMode: (() => void) | undefined;
    let unwatchPosition: (() => void) | undefined;
    let unwatchStatic: (() => void) | undefined;

    try {
      unwatchRomaji = storage.watch<boolean>("local:showRomaji", (newMode) => {
        showRomaji = newMode ?? false;
      });
      unwatchDarkMode = storage.watch<boolean>("local:darkMode", (newMode) => {
        darkMode = newMode ?? false;
      });
      unwatchPosition = storage.watch<"highlight" | "remember" | "static">(
        "local:popupPositionMode",
        (newMode) => {
          if (newMode) positionMode = newMode;
        },
      );
      unwatchStatic = storage.watch<any>("local:popupStaticConfig", (newConfig) => {
        if (newConfig) staticConfig = newConfig;
      });
    } catch (error) {
      if (!isExtensionContextInvalidated(error)) {
        console.error("Failed to watch popup settings:", error);
      }
    }

    return () => {
      unwatchRomaji?.();
      unwatchDarkMode?.();
      unwatchPosition?.();
      unwatchStatic?.();
    };
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
      void translateSelectedText(text);
      await search(text);
    }
  })();
  async function search(query: string) {
    if (isSearching) return; // Prevent concurrent searches
    isSearching = true;
    loading = true;
    error = null;
    kanjiResults = [];
    vocabResults = [];
    hoveredVocabEntry = null;
    selectedSourceMatch = null;
    activeKanjiSource = null;
    selectedKanjiWord = null;
    skipped = false;
    expandedKanjiWord = null;

    const trimmed = query.trim();
    if (!trimmed) {
      loading = false;
      isSearching = false;
      return;
    }

    const {
      skipped: bgSkipped,
      kanjiResults: bgKanji,
      vocabResults: bgVocab,
      error: bgError,
    } = await searchSelectionDicts(trimmed);

    if (bgError) {
      error = bgError;
      loading = false;
      isSearching = false;
      return;
    }

    if (bgSkipped) {
      skipped = true;
      loading = false;
      isSearching = false;
      return;
    }

    kanjiResults = bgKanji.map(normalizeKanjiEntry);
    vocabResults = bgVocab;

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
        const url = `${base}/explain`;
        const session = await getStoredSession();
        const headers = new Headers();
        headers.set("Content-Type", "application/json");
        if (session?.accessToken) {
          headers.set("Authorization", `Bearer ${session.accessToken}`);
        }
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify({ q: text.trim(), sourceUrl: window.location.href }),
        });
        const data = (await res.json()) as Record<string, unknown>;
        if (cancelled) return;
        if (!res.ok) {
          explainError =
            res.status === 401
              ? "Hãy đăng nhập để sử dụng Giải thích AI."
              : res.status === 402 && (data.code === "WALLET_LOW_BALANCE" || data.code === "WALLET_INSUFFICIENT")
                ? "Số dư AI không đủ. Vui lòng nạp tiền trên trang tài khoản để tiếp tục sử dụng."
              : typeof data.detail === "string"
                ? data.detail
                : typeof data.error === "string"
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
  id="jisho-go-selection-popup"
  class="popup {popupDragging ? 'dragging' : ''}"
  class:dark-mode={darkMode}
  style={popupStyle}
  role="dialog"
  aria-label="Dictionary popup"
  onclick={clearSourceSelection}
>
  <div
    class="popup-drag-handle"
    role="presentation"
    aria-hidden="true"
    onpointerdown={startDragPopup}
  >
    <span class="drag-grip" aria-hidden="true">
      <span></span><span></span><span></span>
      <span></span><span></span><span></span>
    </span>
  </div>
  {#if loading}
    <div class="loading">Searching...</div>
  {:else if skipped}
    <div class="skipped">No Japanese characters found</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else}
    <div class="result">
      <div class="result-header">
        <div class="extracted-text-section">
          <div class="source-text">
            {#each getSourceSegments() as segment}
              {#if activeTab === "kanji"}
                {#each Array.from(segment.text) as char, charOffset}
                  {@const charIndex = segment.start + charOffset}
                  {@const isKanji = kanjiResults.some((entry) => entry.w === char)}
                  {#if isKanji}
                    <span
                      class:source-highlight={activeKanjiSource?.index === charIndex}
                      class="source-kanji-clickable"
                      role="button"
                      tabindex="0"
                      onpointerdown={(event) => event.stopPropagation()}
                      onclick={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        handleKanjiSourceClick(char, charIndex);
                      }}
                      onkeydown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleKanjiSourceClick(char, charIndex);
                        }
                      }}
                    >{char}</span>
                  {:else}
                    <span>{char}</span>
                  {/if}
                {/each}
              {:else if segment.entry}
                <span
                  class:source-highlight={isSourceMatchActive(segment.entry)}
                  class="source-match"
                  role="button"
                  tabindex="0"
                  aria-pressed={selectedSourceMatch?.start === segment.entry.matchStart && selectedSourceMatch?.length === segment.entry.matchLength}
                  onpointerdown={(event) => event.stopPropagation()}
                  onpointerup={(event) => {
                    event.stopPropagation();
                    handleSourceMatchClick(segment.entry!);
                  }}
                  onclick={(event) => event.stopPropagation()}
                  onkeydown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleSourceMatchClick(segment.entry!);
                    }
                  }}
                >{segment.text}</span>
              {:else}
                <span>{segment.text}</span>
              {/if}
            {/each}
          </div>
          <div class="translated-text-section">
            {#if translateLoading}
              <span class="translated-text-loading">Đang dịch...</span>
            {:else if translatedText}
              <span class="translated-text">{translatedText}</span>
            {:else if translateError}
              <span class="translated-text-error">{translateError}</span>
            {/if}
          </div>
        </div>
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

      <div class="result-body">
        {#if activeTab === "vocab" && vocabResults.length > 0}
          <div class="vocab-section">
            <div class="vocab-list">
            {#each groupVocabResults(getDisplayedVocabResults()) as group}
                <div
                  class="vocab-group"
                  role="article"
                  onmouseenter={() => (hoveredVocabEntry = group.entries[0])}
                  onmouseleave={() => (hoveredVocabEntry = null)}
                >
                  <div class="vocab-group-reading">{group.reading}</div>
                  {#each group.entries as v}
                    <div class="vocab-item">
                      <div class="vocab-header">
                        <div class="vocab-word">{v.word}</div>
                      </div>
                      <div class="vocab-meaning">
                        {v.m}
                      </div>
                    </div>
                  {/each}
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if activeTab === "kanji" && kanjiResults.length > 0}
          <div class="kanji-section">
            {#each getDisplayedKanjiResults() as kanjiEntry}
              {@const isExpanded = expandedKanjiWord === kanjiEntry.w}
              <div class="kanji-accordion-item">
                <button
                  class:kanji-selected={selectedKanjiWord === kanjiEntry.w}
                  class="kanji-accordion-header"
                  onclick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleKanjiClick(kanjiEntry);
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
                    {@const hira =
                      item.hiragana?.trim() || item.reading?.trim()}
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
                              <span class="ev-hiragana"
                                >{g.example.hiragana}</span
                              >
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
              <div class="explain-empty">
                Không có mục nào trong phản hồi AI.
              </div>
            {/if}
          {/if}
          </div>
        {/if}

        {#if kanjiResults.length === 0 && vocabResults.length === 0 && activeTab !== "explain"}
          <div class="no-results">Không tìm thấy Kanji hoặc Từ vựng</div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .popup {
    position: fixed;
    width: 700px;
    max-width: 90vw;
    max-height: min(600px, 80vh);
    overflow: hidden;
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

  .popup-drag-handle {
    flex: 0 0 0.7rem;
    width: 100%;
    background: #f3f4f6;
    border-bottom: 1px solid #e5e7eb;
    cursor: grab;
    touch-action: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .drag-grip {
    display: grid;
    grid-template-columns: repeat(3, 0.22rem);
    grid-template-rows: repeat(2, 0.22rem);
    gap: 0.12rem 0.18rem;
    pointer-events: none;
  }

  .drag-grip span {
    width: 0.22rem;
    height: 0.22rem;
    border-radius: 50%;
    background: #9ca3af;
  }

  .popup.dragging .popup-drag-handle {
    cursor: grabbing;
  }

  .popup.dark-mode {
    background: #111827;
    color: #e5e7eb;
    border-color: #374151;
  }

  .popup.dark-mode .result-header,
  .popup.dark-mode .extracted-text-section,
  .popup.dark-mode .vocab-section,
  .popup.dark-mode .kanji-accordion-header,
  .popup.dark-mode .kanji-accordion-content,
  .popup.dark-mode .explain-section {
    background: #111827;
    color: #e5e7eb;
  }

  .popup.dark-mode .popup-drag-handle {
    background: #1f2937;
    border-bottom-color: #374151;
  }

  .popup.dark-mode .drag-grip span {
    background: #9ca3af;
  }

  .popup.dark-mode .extracted-text-section {
    border-bottom-color: #374151;
  }

  .popup.dark-mode .translated-text,
  .popup.dark-mode .kanji-detail-summary,
  .popup.dark-mode .translated-text-loading,
  .popup.dark-mode .example-reading,
  .popup.dark-mode .radio-description {
    color: #9ca3af;
  }

  .popup.dark-mode .tabs {
    background: #111827;
    border-bottom-color: #374151;
  }

  .popup.dark-mode .tab {
    background: #1f2937;
    border-color: #4b5563;
    color: #d1d5db;
  }

  .popup.dark-mode .tab:hover:not(:disabled) {
    background: #374151;
    border-color: #6b7280;
  }

  .popup.dark-mode .tab.active {
    background: #4c1d1d;
    border-color: #f87171;
    color: #fecaca;
  }

  .popup.dark-mode .vocab-group,
  .popup.dark-mode .kanji-accordion-item {
    border-bottom-color: #374151;
  }

  .popup.dark-mode .vocab-group:hover,
  .popup.dark-mode .kanji-accordion-header:hover,
  .popup.dark-mode .kanji-selected {
    background: #292524;
  }

  .popup.dark-mode .vocab-item {
    border-bottom-color: #374151;
  }

  .popup.dark-mode .vocab-word,
  .popup.dark-mode .vocab-meaning,
  .popup.dark-mode .vocab-group-reading,
  .popup.dark-mode .kanji-reading-summary,
  .popup.dark-mode .kanji-detail-summary,
  .popup.dark-mode .meta-item,
  .popup.dark-mode .section-title,
  .popup.dark-mode .example-word,
  .popup.dark-mode .example-mean,
  .popup.dark-mode .detail-text,
  .popup.dark-mode .detail-text p,
  .popup.dark-mode .kanji-meta-summary,
  .popup.dark-mode .explain-section,
  .popup.dark-mode .ev-mean,
  .popup.dark-mode .ev-jp,
  .popup.dark-mode .ev-hiragana,
  .popup.dark-mode .grammar-example-label {
    color: #f3f4f6 !important;
  }

  .popup.dark-mode .vocab-meaning,
  .popup.dark-mode .translated-text {
    color: #d1d5db !important;
  }

  .popup.dark-mode .kanji-accordion-content {
    border-top-color: #374151;
  }

  .popup.dark-mode .example-item {
    background: #1f2937;
    border-color: #374151;
  }

  .popup.dark-mode .source-kanji-clickable:hover {
    background: #450a0a;
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
    min-height: 0;
    height: 100%;
  }

  .result-header {
    flex: 0 0 auto;
    background: #ffffff;
    position: relative;
    z-index: 1;
  }

  .result-body {
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
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

  .source-text {
    white-space: pre-wrap;
  }

  .source-highlight {
    background: #fecaca;
    color: #b91c1c;
    border-radius: 0.2rem;
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.3);
  }

  .source-match {
    cursor: pointer;
  }

  .source-kanji-clickable {
    cursor: pointer;
    border-radius: 0.2rem;
  }

  .source-kanji-clickable:hover {
    background: #fee2e2;
  }

  .translated-text-section {
    margin-top: 0.35rem;
    font-size: 0.95rem;
    line-height: 1.4;
  }

  .translated-text {
    color: #4b5563;
  }

  .translated-text-loading {
    color: #6b7280;
    font-style: italic;
  }

  .translated-text-error {
    color: #b91c1c;
    font-size: 0.85rem;
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
    transition:
      background-color 0.15s,
      border-color 0.15s,
      color 0.15s;
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

  .vocab-group {
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #e5e7eb;
    border-radius: 0.35rem;
    transition: background-color 0.12s ease;
  }

  .vocab-group:hover {
    background: #fff7ed;
  }

  .vocab-group:last-child {
    padding-bottom: 0;
    border-bottom: none;
  }

  .vocab-group-reading {
    margin-bottom: 0.35rem;
    font-size: 24px;
    font-weight: bold;
    color: #f87171;
  }

  .vocab-item {
    padding-bottom: 0.5rem;
    border-bottom: 1px dashed #e5e7eb;
    padding-left: 0.5rem;
    padding-right: 0.5rem;
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
    font-size: 1.25rem;
    font-weight: 700;
    color: #374151;
  }

  .vocab-meaning {
    color: #374151;
    font-size: 0.95rem;
    line-height: 1.5;
    white-space: pre-line;
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

  .kanji-selected {
    background: #fff7ed;
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
    color: #374151 !important;
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      system-ui,
      -system-ui,
      sans-serif !important;
    font-size: 14px !important;
    font-weight: 400 !important;
    line-height: 1.5 !important;
    opacity: 1 !important;
    border-top: 1px solid #e5e7eb;
  }

  .kanji-accordion-content * {
    font-family: inherit !important;
    opacity: 1 !important;
  }

  .detail-section {
    /* margin-top: 1rem; */
    margin-bottom: 0.75rem;
  }

  .detail-text {
    color: #374151 !important;
    font-family: inherit !important;
    font-size: 0.9rem !important;
    font-weight: 400 !important;
    line-height: 1.5 !important;
    text-shadow: none !important;
  }

  .detail-text p {
    color: #374151 !important;
    font-family: inherit !important;
    font-size: inherit !important;
    font-weight: 400 !important;
    line-height: inherit !important;
    margin: 0 0 0.35rem !important;
    text-shadow: none !important;
  }

  .detail-text p:last-child {
    margin-bottom: 0 !important;
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
