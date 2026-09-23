<script lang="ts">
  import { tick, untrack } from "svelte";
  import { searchSelectionDicts } from "../lib/dict-loaders";
  import { storage } from "#imports";
  // import { getStoredSession } from "../lib/auth";
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
  // Yêu cầu đọc bản chữ dọc do content script truyền vào cho kết quả OCR.
  type VerticalRequest = {
    pending: boolean;
    request: () => Promise<string | null>;
  };

  let {
    text: initialText,
    position,
    sourceRange,
    isTextTruncated = false,
    vertical = null,
    onClose,
  }: {
    text: string;
    position: Position;
    sourceRange?: Range | null;
    isTextTruncated?: boolean;
    vertical?: VerticalRequest | null;
    onClose?: () => void;
  } = $props();

  function handleClose() {
    if (onClose) {
      onClose();
    } else {
      document.getElementById("jisho-go-selection-popup-container")?.remove();
    }
  }

  // `text` là đoạn đang được tra: mặc định là bản ngang, đổi sang bản dọc được khi
  // đã có kết quả. `verticalBusy` = đang đọc bản dọc (đọc trước, hoặc vừa bấm nút).
  let verticalText = $state<string | null>(null);
  let verticalBusy = $state(untrack(() => vertical?.pending ?? false));
  let activeSource = $state<"horizontal" | "vertical">("horizontal");
  let text = $derived(
    activeSource === "vertical" && verticalText ? verticalText : initialText
  );

  // Content script gọi khi đọc xong bản dọc. null = đọc không ra, chỉ tắt trạng
  // thái đang đọc để nút bấm lại được.
  export function setVerticalText(value: string | null) {
    verticalBusy = false;
    if (value) verticalText = value;
  }

  function applySource(source: "horizontal" | "vertical") {
    const next = source === "vertical" ? verticalText : initialText;
    if (!next) return;

    activeSource = source;

    // Kết quả cũ không còn ứng với đoạn đang tra nữa.
    selectedSourceMatch = null;
    activeKanjiSource = null;
    selectedKanjiWord = null;
    hoveredVocabEntry = null;
    expandedKanjiWord = null;
    expandedOnKanjiWord = null;
    expandedKunKanjiWord = null;

    void translateSelectedText(next);
    void search(next);
  }

  function selectSource(source: "horizontal" | "vertical") {
    if (source === activeSource) return;

    if (source === "horizontal" || verticalText) {
      applySource(source);
      return;
    }

    // Chưa có bản dọc (vùng rộng hơn cao thì content script không đọc trước) nên
    // đọc ngay lúc bấm.
    if (!vertical || verticalBusy) return;

    verticalBusy = true;
    void (async () => {
      const verticalResult = await vertical.request();
      verticalBusy = false;
      if (verticalResult) {
        verticalText = verticalResult;
        applySource("vertical");
      }
    })();
  }

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
  let resultBodyElement = $state<HTMLDivElement | null>(null);
  let expandedOnKanjiWord = $state<string | null>(null);
  let expandedKunKanjiWord = $state<string | null>(null);

  /*
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
  */

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
        (entry) => entry.word.length > 0,
      )
      .map((entry) => {
        const wordIndex = text.trim().indexOf(entry.word);
        const readingIndex = entry.r ? text.trim().indexOf(entry.r) : -1;
        const startIndex = entry.matchStart !== undefined
          ? entry.matchStart
          : [wordIndex, readingIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0];
        const length = entry.matchLength !== undefined && entry.matchLength > 0
          ? entry.matchLength
          : entry.word.length;

        return {
          entry,
          start: trimmedOffset + (startIndex ?? -1),
          end: trimmedOffset + (startIndex ?? -1) + length,
        };
      })
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
    const sourceMatch = selectedSourceMatch;
    if (!sourceMatch) return vocabResults;
    return vocabResults.filter(
      (entry) => {
        if (entry.matchStart === undefined || entry.matchLength === undefined) {
          return false;
        }

        const selectedEnd =
          sourceMatch.start + sourceMatch.length;
        const entryEnd = entry.matchStart + entry.matchLength;

        return (
          entry.matchStart >= sourceMatch.start &&
          entryEnd <= selectedEnd
        );
      },
    );
  }

  function getDisplayedKanjiResults(): DictEntry[] {
    return kanjiResults;
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

  async function scrollToKanji(word: string) {
    await tick();
    requestAnimationFrame(() => {
      const item = document
        .querySelectorAll<HTMLElement>(
          "#jisho-go-selection-popup [data-kanji-word]",
        );
      const selectedItem = [...item].find(
        (element) => element.dataset.kanjiWord === word,
      );
      if (!selectedItem || !resultBodyElement) return;

      const top =
        selectedItem.getBoundingClientRect().top -
        resultBodyElement.getBoundingClientRect().top +
        resultBodyElement.scrollTop;
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches
        ? "auto"
        : "smooth";

      resultBodyElement.scrollTo({ top, behavior });
    });
  }

  function handleKanjiSourceClick(char: string, index: number) {
    if (
      activeKanjiSource?.index === index &&
      activeKanjiSource.char === char &&
      selectedKanjiWord === char
    ) {
      clearSourceSelection();
      return;
    }

    const entry = kanjiResults.find((kanji) => kanji.w === char);
    if (!entry) return;

    selectedKanjiWord = entry.w;
    expandedKanjiWord = entry.w;
    activeKanjiSource = { index, char };
    hoveredVocabEntry = null;
    selectedSourceMatch = null;
    expandedOnKanjiWord = null;
    expandedKunKanjiWord = null;
    void scrollToKanji(entry.w);
  }

  function clearSourceSelection() {
    selectedKanjiWord = null;
    activeKanjiSource = null;
    selectedSourceMatch = null;
    hoveredVocabEntry = null;
    expandedKanjiWord = null;
    expandedOnKanjiWord = null;
    expandedKunKanjiWord = null;
  }

  // Drag the whole popup (fixed-position panel).
  // `position` chỉ dùng làm giá trị khởi tạo: component được mount lại mỗi lần
  // bôi đen nên không cần đồng bộ theo prop, sau đó popup tự quản lý vị trí.
  let popupLeft = $state(untrack(() => position.left));
  let popupTop = $state(untrack(() => position.top));
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

  async function toggleDarkMode() {
    darkMode = !darkMode;
    try {
      await storage.setItem("local:darkMode", darkMode);
    } catch (e) {
      if (!isExtensionContextInvalidated(e)) {
        console.error("Failed to save darkMode:", e);
      }
    }
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

    // Don't steal the interaction from form controls / close button / other buttons (except drag button itself).
    if (target?.closest("button.popup-btn-close, input, textarea, select, a, .source-match")) return;
    if (target?.closest("button:not(.popup-btn-drag)")) return;

    e.stopPropagation();
    e.preventDefault();

    popupDragging = true;
    dragOffsetX = e.clientX - popupLeft;
    dragOffsetY = e.clientY - popupTop;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const onMove = (ev: PointerEvent) => {
      popupLeft = ev.clientX - dragOffsetX;
      popupTop = ev.clientY - dragOffsetY;
    };

    const onUp = () => {
      popupDragging = false;
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
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

  /*
  $effect(() => {
    void text;
    explainPayload = null;
    explainError = null;
    explainFetchedText = null;
  });
  */

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

  function toggleOnExamples(word: string) {
    expandedOnKanjiWord = expandedOnKanjiWord === word ? null : word;
  }

  function toggleKunExamples(word: string) {
    expandedKunKanjiWord = expandedKunKanjiWord === word ? null : word;
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

  function getExampleCount(
    examplesObj?: Record<string, Array<any>> | null
  ): number {
    if (!examplesObj) return 0;
    return Object.values(examplesObj).reduce(
      (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
      0
    );
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
    expandedOnKanjiWord = null;
    expandedKunKanjiWord = null;

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
    // else activeTab = "explain";

    loading = false;
    isSearching = false;
  }

  /*
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
  */
</script>

<div
  id="jisho-go-selection-popup"
  class="popup {popupDragging ? 'dragging' : ''}"
  class:dark-mode={darkMode}
  class:static-mode={positionMode === "static"}
  style={popupStyle}
  role="dialog"
  aria-label="Dictionary popup"
  tabindex="-1"
  onkeydown={(event) => {
    if (event.key === "Escape") {
      if (selectedKanjiWord || activeKanjiSource || selectedSourceMatch) {
        clearSourceSelection();
      } else {
        handleClose();
      }
    }
  }}
>
  <div class="popup-top-dock">
    <div class="popup-controls" role="toolbar" aria-label="Điều khiển popup">
      <button
        type="button"
        class="popup-control-btn popup-btn-theme"
        aria-label={darkMode ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
        title={darkMode ? "Giao diện sáng" : "Giao diện tối"}
        onclick={(e) => {
          e.stopPropagation();
          toggleDarkMode();
        }}
        onpointerdown={(e) => {
          e.stopPropagation();
        }}
      >
        {#if darkMode}
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
            <path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" />
          </svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" />
          </svg>
        {/if}
      </button>
      <button
        type="button"
        class="popup-control-btn popup-btn-drag"
        aria-label="Kéo để di chuyển"
        title={positionMode === "static" ? undefined : "Kéo để di chuyển popup"}
        onpointerdown={startDragPopup}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 1L11 4H9V7H12V5L15 8L12 11V9H9V12H11L8 15L5 12H7V9H4V11L1 8L4 5V7H7V4H5L8 1Z" />
        </svg>
      </button>
      <button
        type="button"
        class="popup-control-btn popup-btn-close"
        aria-label="Đóng popup (ESC)"
        title="Đóng (ESC)"
        onclick={(e) => {
          e.stopPropagation();
          handleClose();
        }}
        onpointerdown={(e) => {
          e.stopPropagation();
        }}
      >
        <svg width="11" height="11" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">
          <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" />
          <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" />
        </svg>
      </button>
    </div>
  </div>

  <div class="popup-card">
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
          {#if isTextTruncated}
            <div class="text-truncated-warning">
              Đoạn chọn quá dài, chỉ tra 300 ký tự đầu.
            </div>
          {/if}
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
                  onclick={(event) => {
                    event.stopPropagation();
                    event.preventDefault();
                    handleSourceMatchClick(segment.entry!);
                  }}
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
      {#if vertical}
        <div class="source-switch">
          <span class="source-switch-label">Hướng của chữ</span>
          <button
            type="button"
            class="tab {activeSource === 'horizontal' ? 'active' : ''}"
            onclick={() => selectSource("horizontal")}
          >
            Ngang
          </button>
          <button
            type="button"
            class="tab {activeSource === 'vertical' ? 'active' : ''}"
            disabled={verticalBusy}
            title={verticalBusy
              ? "Đang đọc lại theo chiều dọc…"
              : "Xem bản đọc chữ dọc"}
            onclick={() => selectSource("vertical")}
          >
            {verticalBusy ? "Dọc…" : "Dọc"}
          </button>
        </div>
      {/if}
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
          <!--
          <button
            type="button"
            class="tab {activeTab === 'explain' ? 'active' : ''}"
            onclick={() => (activeTab = "explain")}
          >
            Giải thích AI
          </button>
          -->
        </div>
      {/if}

      <div class="result-body" bind:this={resultBodyElement}>
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
              <div
                class="kanji-accordion-item"
                class:kanji-selected={selectedKanjiWord === kanjiEntry.w}
                data-kanji-word={kanjiEntry.w}
              >
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
                  <div
                    class="kanji-accordion-content"
                    class:kanji-selected={selectedKanjiWord === kanjiEntry.w}
                  >
                  {#if kanjiEntry.detail}
                    <div class="detail-section">
                      <div class="popup-section-title">Chi tiết {kanjiEntry.w}</div>
                      <div class="detail-text">
                        {#each kanjiEntry.detail.split("##") as paragraph}
                          {#if paragraph.trim()}
                            <p>{paragraph.trim()}</p>
                          {/if}
                        {/each}
                      </div>
                    </div>
                  {/if}

                  {#if kanjiEntry.examples && kanjiEntry.examples.length > 0}
                    <div class="examples-section">
                      <div class="popup-section-title">Từ vựng hay gặp ({kanjiEntry.examples.length})</div>
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

                  {#if kanjiEntry.example_on}
                    <div class="examples-section examples-collapse">
                      <button
                        type="button"
                        class="examples-collapse-header"
                        aria-expanded={expandedOnKanjiWord === kanjiEntry.w}
                        onclick={(event) => {
                          event.stopPropagation();
                          toggleOnExamples(kanjiEntry.w);
                        }}
                      >
                        <span class="popup-section-title">
                          Từ vựng On ({getExampleCount(kanjiEntry.example_on)})
                        </span>
                        <svg
                          class="examples-collapse-icon"
                          class:expanded={expandedOnKanjiWord === kanjiEntry.w}
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            fill-rule="evenodd"
                            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                            clip-rule="evenodd"
                          />
                        </svg>
                      </button>
                      {#if expandedOnKanjiWord === kanjiEntry.w}
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
                      {/if}
                    </div>
                  {/if}

                  {#if kanjiEntry.example_kun}
                    <div class="examples-section examples-collapse">
                      <button
                        type="button"
                        class="examples-collapse-header"
                        aria-expanded={expandedKunKanjiWord === kanjiEntry.w}
                        onclick={(event) => {
                          event.stopPropagation();
                          toggleKunExamples(kanjiEntry.w);
                        }}
                      >
                        <span class="popup-section-title">
                          Từ vựng Kun ({getExampleCount(kanjiEntry.example_kun)})
                        </span>
                        <svg
                          class="examples-collapse-icon"
                          class:expanded={expandedKunKanjiWord === kanjiEntry.w}
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path
                            fill-rule="evenodd"
                            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                            clip-rule="evenodd"
                          />
                        </svg>
                      </button>
                      {#if expandedKunKanjiWord === kanjiEntry.w}
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
                      {/if}
                    </div>
                  {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        <!--
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
                <div class="popup-section-title">Nghĩa cả câu / đoạn chọn</div>
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
                <div class="popup-section-title">Ghi chú</div>
                <div class="explain-notes-text">{explainPayload.notes}</div>
              </div>
            {/if}
            {#if explainPayload.vocabularies.length > 0}
              <div class="explain-block">
                <div class="popup-section-title">Từ vựng</div>
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
                <div class="popup-section-title">Ngữ pháp</div>
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
        -->

        {#if kanjiResults.length === 0 && vocabResults.length === 0 && activeTab !== "explain"}
          <div class="no-results">Không tìm thấy Kanji hoặc Từ vựng</div>
        {/if}
      </div>
    </div>
  {/if}
  </div>
</div>

<style>
  .popup,
  .popup *,
  .popup *::before,
  .popup *::after {
    box-sizing: border-box;
  }

  .popup {
    position: fixed;
    width: 700px;
    max-width: 90vw;
    max-height: min(624px, calc(80vh + 24px));
    overflow: visible;
    background: transparent;
    padding: 0;
    font-size: 14px;
    line-height: 1.4;
    text-align: left;
    letter-spacing: normal;
    word-spacing: normal;
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
    pointer-events: none;
  }

  .popup-top-dock {
    display: flex;
    justify-content: flex-end;
    align-items: flex-end;
    height: 28px;
    width: 100%;
    background: transparent;
    pointer-events: none;
    flex-shrink: 0;
  }

  .popup-controls {
    display: inline-flex;
    align-items: stretch;
    height: 28px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-bottom: none;
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
    overflow: hidden;
    pointer-events: auto;
    box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.04);
    margin-bottom: -1px;
    z-index: 2;
  }

  .popup-control-btn {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    padding: 0;
    margin: 0;
    color: #6b7280;
    transition: background-color 0.12s ease, color 0.12s ease;
    user-select: none;
    outline: none;
  }

  .popup-btn-theme {
    cursor: pointer;
    border-right: 1px solid #e5e7eb;
  }

  .popup-btn-theme:hover {
    background: #f3f4f6;
    color: #111827;
  }

  .popup-btn-theme:active {
    background: #e5e7eb;
  }

  .popup-btn-drag {
    cursor: grab;
    border-right: 1px solid #e5e7eb;
  }

  .popup-btn-drag:hover {
    background: #f3f4f6;
    color: #111827;
    cursor: grab;
  }

  .popup-btn-drag:active {
    cursor: grabbing;
    background: #e5e7eb;
  }

  .popup-btn-close {
    cursor: pointer;
  }

  .popup-btn-close:hover {
    background: #e81123 !important;
    color: #ffffff !important;
  }

  .popup-btn-close:active {
    background: #c4101e !important;
    color: #ffffff !important;
  }

  .popup.dragging,
  .popup.dragging * {
    cursor: grabbing !important;
    user-select: none !important;
  }

  .popup.static-mode .popup-btn-drag {
    cursor: default;
    opacity: 0.35;
    pointer-events: none;
  }

  .popup-card {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    min-height: min(320px, 60vh);
    max-height: min(600px, 80vh);
    overflow: hidden;
    overflow-x: hidden;
    background: #ffffff;
    color: #111827;
    border-radius: 0.5rem;
    border-top-right-radius: 0;
    border: 1px solid #e5e7eb;
    box-shadow:
      0 10px 15px -3px rgba(0, 0, 0, 0.1),
      0 4px 6px -4px rgba(0, 0, 0, 0.1);
    pointer-events: auto;
  }

  .popup.dark-mode {
    color: #e5e7eb;
  }

  .popup.dark-mode .popup-controls {
    background: #111827;
    border-color: #374151;
    box-shadow: 0 -2px 6px rgba(0, 0, 0, 0.25);
  }

  .popup.dark-mode .popup-control-btn {
    color: #9ca3af;
  }

  .popup.dark-mode .popup-btn-theme {
    border-right-color: #374151;
  }

  .popup.dark-mode .popup-btn-theme:hover {
    background: #374151;
    color: #f3f4f6;
  }

  .popup.dark-mode .popup-btn-theme:active {
    background: #4b5563;
  }

  .popup.dark-mode .popup-btn-drag {
    border-right-color: #374151;
  }

  .popup.dark-mode .popup-btn-drag:hover {
    background: #374151;
    color: #f3f4f6;
  }

  .popup.dark-mode .popup-btn-drag:active {
    background: #4b5563;
  }

  .popup.dark-mode .popup-btn-close:hover {
    background: #e81123 !important;
    color: #ffffff !important;
  }

  .popup.dark-mode .popup-card {
    background: #111827;
    color: #e5e7eb;
    border-color: #374151;
  }

  .popup.dark-mode .result-header,
  .popup.dark-mode .extracted-text-section,
  .popup.dark-mode .vocab-section,
  .popup.dark-mode .kanji-accordion-header,
  .popup.dark-mode .kanji-accordion-content {
    background: #111827;
    color: #e5e7eb;
  }

  .popup.dark-mode .extracted-text-section {
    border-bottom-color: #374151;
  }

  .popup.dark-mode .text-truncated-warning {
    border-color: #92400e;
    background: #451a03;
    color: #fde68a;
  }

  .popup.dark-mode .translated-text,
  .popup.dark-mode .kanji-detail-summary,
  .popup.dark-mode .translated-text-loading,
  .popup.dark-mode .example-reading {
    color: #9ca3af;
  }

  .popup.dark-mode .tabs {
    background: #111827;
    border-bottom-color: #374151;
  }

  .popup.dark-mode .source-switch {
    background: #111827;
    border-bottom-color: #374151;
  }

  .popup.dark-mode .source-switch-label {
    color: #9ca3af;
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
  .popup.dark-mode .kanji-accordion-header:hover {
    background: #292524;
  }

  .popup.dark-mode .kanji-selected,
  .popup.dark-mode .kanji-accordion-item.kanji-selected,
  .popup.dark-mode .kanji-accordion-item.kanji-selected .kanji-accordion-header,
  .popup.dark-mode .kanji-accordion-item.kanji-selected .kanji-accordion-content {
    background: #292524 !important;
  }

  .popup.dark-mode .kanji-accordion-item.kanji-selected .kanji-accordion-header:hover {
    background: #362f2d !important;
  }

  .popup.dark-mode .kanji-accordion-item.kanji-selected .kanji-accordion-content {
    border-top-color: #44403c !important;
  }

  .popup.dark-mode .kanji-accordion-item.kanji-selected .example-item {
    background: #1c1917 !important;
    border-color: #44403c !important;
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
  .popup.dark-mode .popup-section-title,
  .popup.dark-mode .example-word,
  .popup.dark-mode .example-mean,
  .popup.dark-mode .detail-text,
  .popup.dark-mode .detail-text p,
  .popup.dark-mode .kanji-meta-summary
  /*
  .popup.dark-mode .explain-section,
  .popup.dark-mode .ev-mean,
  .popup.dark-mode .ev-jp,
  .popup.dark-mode .ev-hiragana,
  .popup.dark-mode .grammar-example-label
  */ {
    color: #f3f4f6 !important;
  }

  .popup.dark-mode .vocab-meaning,
  .popup.dark-mode .translated-text {
    color: #d1d5db !important;
  }

  .popup.dark-mode .kanji-accordion-content {
    border-top-color: #374151;
  }

  .popup.dark-mode .examples-collapse {
    border-top-color: #374151;
  }

  .popup.dark-mode .examples-collapse-header {
    color: #f3f4f6;
  }

  .popup.dark-mode .examples-collapse-header:hover {
    color: #fca5a5;
  }

  .popup.dark-mode .examples-collapse-icon {
    color: #9ca3af;
  }

  .popup.dark-mode .examples-collapse-header:hover .examples-collapse-icon {
    color: #fca5a5;
  }

  .popup.dark-mode .example-item {
    background: #1f2937;
    border-color: #374151;
  }

  .popup.dark-mode .source-kanji-clickable {
    color: #f87171;
  }

  .popup.dark-mode .source-kanji-clickable:hover {
    background: #450a0a;
    color: #fca5a5;
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
    flex: 1 1 auto;
    overflow: hidden;
  }

  .result-header {
    flex: 0 0 auto;
    min-height: 0;
    max-height: min(260px, 36vh);
    overflow-y: auto;
    overflow-x: hidden;
    background: #ffffff;
    position: relative;
    z-index: 1;
  }

  .result-body {
    flex: 1 1 auto;
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

  .text-truncated-warning {
    margin-bottom: 0.5rem;
    padding: 0.35rem 0.5rem;
    border: 1px solid #fbbf24;
    border-radius: 0.25rem;
    background: #fffbeb;
    color: #92400e;
    font-size: 0.78rem;
    line-height: 1.35;
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
    color: #ef4444;
    transition: background-color 0.12s, color 0.12s;
  }

  .source-kanji-clickable:hover {
    background: #fee2e2;
    color: #b91c1c;
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

  .source-switch {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid #e5e7eb;
    background: #ffffff;
  }

  .source-switch-label {
    margin-right: auto;
    font-size: 0.75rem;
    font-weight: 600;
    color: #6b7280;
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

  .kanji-selected,
  .kanji-accordion-item.kanji-selected,
  .kanji-accordion-item.kanji-selected .kanji-accordion-header,
  .kanji-accordion-item.kanji-selected .kanji-accordion-content {
    background: #fffbeb !important;
    background: #fffaf5 !important;
  }

  .kanji-accordion-item.kanji-selected .kanji-accordion-header:hover {
    background: #fef3c7 !important;
    background: #fff1e6 !important;
  }

  .kanji-accordion-item.kanji-selected .kanji-accordion-content {
    border-top: 1px solid #fde68a !important;
    border-top: 1px solid #fed7aa !important;
  }

  .kanji-accordion-item.kanji-selected .example-item {
    background: #ffffff !important;
    border-color: #fde68a !important;
    border-color: #fed7aa !important;
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

  .examples-collapse {
    border-top: 1px solid #e5e7eb;
    padding-top: 0.45rem;
  }

  .examples-collapse-header {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    gap: 0.35rem;
    padding: 0.25rem 0;
    border: 0;
    background: transparent;
    color: #111827;
    cursor: pointer;
    text-align: left;
    line-height: 1;
  }

  .examples-collapse-header:hover {
    color: #991b1b;
  }

  .examples-collapse-header:focus-visible {
    outline: 2px solid #f87171;
    outline-offset: 2px;
  }

  .examples-collapse-header .popup-section-title {
    margin: 0 !important;
  }

  .examples-collapse-icon {
    width: 13px;
    height: 13px;
    color: #6b7280;
    flex-shrink: 0;
    transition: transform 0.18s ease;
    display: inline-block;
  }

  .examples-collapse-icon.expanded {
    transform: rotate(180deg);
  }

  .examples-collapse-header:hover .examples-collapse-icon {
    color: #991b1b;
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

  .popup-section-title {
    margin: 0 0 0.5rem 0 !important;
    padding: 0 !important;
    font-weight: 600 !important;
    color: #111827 !important;
    font-size: 0.9rem !important;
    text-transform: uppercase !important;
    letter-spacing: 0.05em !important;
    line-height: 1.3 !important;
  }

  .no-results {
    padding: 0.5rem;
    color: #6b7280;
    text-align: center;
    font-style: italic;
  }

  /*
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
  */

  @media (max-width: 520px) {
    .examples-list {
      grid-template-columns: 1fr;
    }
  }
</style>
