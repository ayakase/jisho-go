<script lang="ts">
  import { storage } from "#imports";

  type HoverGrabMode = "single-kanji" | "paragraph";
  type HoverParagraphSections = {
    translate: boolean;
    vocab: boolean;
    kanji: boolean;
  };
  const DEFAULT_HOVER_PARAGRAPH_SECTIONS: HoverParagraphSections = {
    translate: true,
    vocab: true,
    kanji: false,
  };

  let hoverMode = $state<boolean>(false);
  let hoverGrabMode = $state<HoverGrabMode>("single-kanji");
  let hoverDelayMs = $state(300);
  let hoverParagraphSections = $state<HoverParagraphSections>({
    ...DEFAULT_HOVER_PARAGRAPH_SECTIONS,
  });
  let isInitialized = $state(false);
  function normalizeHoverParagraphSections(value: unknown): HoverParagraphSections {
    if (!value || typeof value !== "object") {
      return { ...DEFAULT_HOVER_PARAGRAPH_SECTIONS };
    }
    const raw = value as Partial<HoverParagraphSections>;
    return {
      translate:
        typeof raw.translate === "boolean"
          ? raw.translate
          : DEFAULT_HOVER_PARAGRAPH_SECTIONS.translate,
      vocab:
        typeof raw.vocab === "boolean"
          ? raw.vocab
          : DEFAULT_HOVER_PARAGRAPH_SECTIONS.vocab,
      kanji:
        typeof raw.kanji === "boolean"
          ? raw.kanji
          : DEFAULT_HOVER_PARAGRAPH_SECTIONS.kanji,
    };
  }


  function clampHoverDelayMs(value: number): number {
    if (!Number.isFinite(value)) return 300;
    return Math.max(0, Math.min(3000, Math.round(value)));
  }

  async function loadSettings() {
    try {
      const storedHover = await storage.getItem<boolean>("local:hoverMode");
      if (storedHover !== null && storedHover !== undefined) {
        hoverMode = storedHover;
      }

      const storedHoverGrabMode = await storage.getItem<HoverGrabMode>(
        "local:hoverGrabMode",
      );
      if (
        storedHoverGrabMode === "single-kanji" ||
        storedHoverGrabMode === "paragraph"
      ) {
        hoverGrabMode = storedHoverGrabMode;
      }

      const storedHoverDelayMs = await storage.getItem<number>("local:hoverDelayMs");
      if (typeof storedHoverDelayMs === "number" && Number.isFinite(storedHoverDelayMs)) {
        hoverDelayMs = clampHoverDelayMs(storedHoverDelayMs);
      }

      const storedHoverParagraphSections = await storage.getItem<unknown>(
        "local:hoverParagraphSections",
      );
      hoverParagraphSections = normalizeHoverParagraphSections(
        storedHoverParagraphSections,
      );

      isInitialized = true;
    } catch (error) {
      console.error("Failed to load hover settings:", error);
      isInitialized = true;
    }
  }

  async function saveHoverMode() {
    try {
      await storage.setItem("local:hoverMode", hoverMode);
    } catch (error) {
      console.error("Failed to save hover mode:", error);
    }
  }

  async function saveHoverGrabMode() {
    try {
      await storage.setItem("local:hoverGrabMode", hoverGrabMode);
    } catch (error) {
      console.error("Failed to save hover grab mode:", error);
    }
  }

  async function saveHoverDelayMs() {
    try {
      await storage.setItem("local:hoverDelayMs", clampHoverDelayMs(hoverDelayMs));
    } catch (error) {
      console.error("Failed to save hover delay:", error);
    }
  }

  async function saveHoverParagraphSections() {
    try {
      await storage.setItem(
        "local:hoverParagraphSections",
        normalizeHoverParagraphSections(hoverParagraphSections),
      );
    } catch (error) {
      console.error("Failed to save hover paragraph sections:", error);
    }
  }

  loadSettings();

  $effect(() => {
    if (isInitialized) saveHoverMode();
  });

  $effect(() => {
    if (isInitialized) saveHoverGrabMode();
  });

  $effect(() => {
    if (isInitialized) saveHoverDelayMs();
  });

  $effect(() => {
    if (isInitialized) saveHoverParagraphSections();
  });
</script>

<div class="settings-container">
  <div class="setting-item">
    <div class="setting-controls">
      <label class="toggle-option">
        <input
          type="checkbox"
          checked={hoverMode}
          onchange={(e) => (hoverMode = (e.target as HTMLInputElement).checked)}
        />
        <span class="toggle-label">
          <strong>Bật chế độ di chuột</strong>
          <span class="toggle-description"
            >Bật chức năng tra cứu khi di chuột</span
          >
        </span>
      </label>

      {#if hoverMode}
        <div class="hover-mode-options">
          <label class="radio-option">
            <input
              type="radio"
              name="hoverGrabMode"
              value="single-kanji"
              checked={hoverGrabMode === "single-kanji"}
              onchange={() => (hoverGrabMode = "single-kanji")}
            />
            <span class="radio-label">
              <strong>Từng kanji</strong>
              <span class="radio-description"
                >Di chuột vào 1 kanji để hiện popup</span
              >
            </span>
          </label>
          <label class="radio-option">
            <input
              type="radio"
              name="hoverGrabMode"
              value="paragraph"
              checked={hoverGrabMode === "paragraph"}
              onchange={() => (hoverGrabMode = "paragraph")}
            />
            <span class="radio-label">
              <strong>Cả đoạn</strong>
              <span class="radio-description"
                >Lấy toàn bộ đoạn văn đang trỏ và hiện popup</span
              >
            </span>
          </label>
        </div>
        <div class="hover-delay-setting">
          <label class="hover-delay-option" for="hover-delay-ms">
            <span class="hover-delay-label">
              <strong>Độ trễ hiển thị popup</strong>
              <span class="hover-delay-description"
                >Thời gian chờ trước khi popup hiện khi di chuột</span
              >
            </span>
          </label>
          <input
            id="hover-delay-ms"
            type="number"
            min="0"
            max="3000"
            step="50"
            bind:value={hoverDelayMs}
          />
          <span class="hover-delay-unit">ms</span>
        </div>
        {#if hoverGrabMode === "paragraph"}
          <div class="hover-paragraph-sections">
            <div class="hover-paragraph-sections-title">Nội dung hiển thị khi hover đoạn</div>
            <label class="toggle-option">
              <input
                type="checkbox"
                checked={hoverParagraphSections.translate}
                onchange={(e) =>
                  (hoverParagraphSections = {
                    ...hoverParagraphSections,
                    translate: (e.target as HTMLInputElement).checked,
                  })}
              />
              <span class="toggle-label">
                <strong>Dịch nghĩa</strong>
                <span class="toggle-description">Hiển thị bản dịch nhanh của đoạn</span>
              </span>
            </label>
            <label class="toggle-option">
              <input
                type="checkbox"
                checked={hoverParagraphSections.vocab}
                onchange={(e) =>
                  (hoverParagraphSections = {
                    ...hoverParagraphSections,
                    vocab: (e.target as HTMLInputElement).checked,
                  })}
              />
              <span class="toggle-label">
                <strong>Từ vựng</strong>
                <span class="toggle-description">Hiển thị danh sách từ vựng rút gọn</span>
              </span>
            </label>
            <label class="toggle-option">
              <input
                type="checkbox"
                checked={hoverParagraphSections.kanji}
                onchange={(e) =>
                  (hoverParagraphSections = {
                    ...hoverParagraphSections,
                    kanji: (e.target as HTMLInputElement).checked,
                  })}
              />
              <span class="toggle-label">
                <strong>Kanji</strong>
                <span class="toggle-description">Hiển thị các kanji chính trong đoạn</span>
              </span>
            </label>
          </div>
        {/if}
      {/if}
    </div>
  </div>

</div>

<style>
  .hover-mode-options {
    display: flex;
    flex-direction: row;
    gap: 0.65rem;
    margin-top: 0;
  }

  .hover-delay-setting {
    margin-top: 0.65rem;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    transition: all 0.2s;
  }

  .hover-delay-setting:hover {
    border-color: #d1d5db;
    background-color: #f9fafb;
  }

  .hover-delay-option {
    flex: 1;
    cursor: default;
  }

  .hover-delay-label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .hover-delay-label strong {
    font-size: 0.9rem;
    color: #111827;
  }

  .hover-delay-description {
    font-size: 0.8rem;
    color: #6b7280;
    line-height: 1.3;
  }

  .hover-delay-setting input {
    width: 88px;
    padding: 0.35rem 0.45rem;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    font-size: 0.875rem;
    outline: none;
  }

  .hover-delay-setting input:focus {
    border-color: #f87171;
  }

  .hover-delay-unit {
    font-size: 0.8rem;
    color: #6b7280;
    min-width: 22px;
  }

  .hover-paragraph-sections {
    margin-top: 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .hover-paragraph-sections-title {
    font-size: 0.82rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-bottom: 0.1rem;
  }
</style>
