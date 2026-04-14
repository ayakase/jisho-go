<script lang="ts">
  interface Position {
    left: number;
    top: number;
  }

  let { text, position }: { text: string; position: Position } = $props();
  let translatedText = $state<string | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

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
    if (!trimmed) {
      translatedText = null;
      error = null;
      loading = false;
      return;
    }

    loading = true;
    error = null;
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

      if (!translated) {
        error = "Không lấy được bản dịch.";
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Lỗi dịch văn bản.";
    } finally {
      loading = false;
    }
  }

  (async () => {
    if (text) {
      await translate(text);
    }
  })();
</script>

<div
  id="kanji-go-hover-paragraph-popup"
  class="hover-paragraph-popup"
  style="left: {position.left}px; top: {position.top}px;"
  role="tooltip"
  aria-label="Paragraph hover popup"
>
  <div class="source-text">{text}</div>
  <div class="translated-text-section">
    {#if loading}
      <span class="translated-text-loading">Đang dịch...</span>
    {:else if translatedText}
      <span class="translated-text">{translatedText}</span>
    {:else if error}
      <span class="translated-text-error">{error}</span>
    {/if}
  </div>
</div>

<style>
  .hover-paragraph-popup {
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
    font-size: 1.05rem;
    color: #1f2937;
    line-height: 1.55;
    word-break: break-word;
    margin-bottom: 0.5rem;
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
</style>
