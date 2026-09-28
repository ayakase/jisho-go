<script lang="ts">
  import { onMount } from "svelte";
  import { storage } from "#imports";
  type Unit = "s" | "m" | "h";

  let modeFlashcard = $state(false);
  let modeQuiz = $state(false);
  let enabled = $derived(modeFlashcard || modeQuiz);

  let displaySeconds = $state(20);
  let intervalValue = $state(10);
  let intervalUnit = $state<Unit>("m");
  let testStatus = $state<{ type: "error"; text: string } | null>(null);
  let isTesting = $state(false);

  let positionSide = $state<"left" | "right">("right");
  let sideOffset = $state<number>(10);
  let bottomOffset = $state<number>(10);

  function getCalculatedSeconds(val: number, unit: Unit, dispSec: number): number {
    if (unit === "s") {
      return Math.max(dispSec, val);
    }
    if (unit === "m") {
      return Math.max(1, val) * 60;
    }
    if (unit === "h") {
      return Math.max(1, val) * 3600;
    }
    return 10 * 60;
  }

  onMount(async () => {
    try {
      const storedFlash = await storage.getItem<boolean>("local:passiveLearnModeFlashcard");
      const storedQuiz = await storage.getItem<boolean>("local:passiveLearnModeQuiz");
      const storedEnabled = await storage.getItem<boolean>("local:passiveLearnEnabled");

      if (storedFlash !== null && storedFlash !== undefined) {
        modeFlashcard = storedFlash;
      } else if (storedEnabled === true) {
        modeFlashcard = true;
      } else {
        modeFlashcard = false;
      }

      if (storedQuiz !== null && storedQuiz !== undefined) {
        modeQuiz = storedQuiz;
      } else if (storedEnabled === true) {
        modeQuiz = true;
      } else {
        modeQuiz = false;
      }

      const storedDisplaySeconds = await storage.getItem<number>("local:passiveLearnDisplaySeconds");
      if (storedDisplaySeconds !== null && storedDisplaySeconds !== undefined) {
        displaySeconds = storedDisplaySeconds;
      } else {
        displaySeconds = 20;
      }

      const storedUnit = await storage.getItem<Unit>("local:passiveLearnIntervalUnit");
      const storedVal = await storage.getItem<number>("local:passiveLearnIntervalValue");
      const storedSecs = await storage.getItem<number>("local:passiveLearnIntervalSeconds");
      const storedLegacyMin = await storage.getItem<number>("local:passiveLearnInterval");

      if (storedUnit && storedVal) {
        intervalUnit = storedUnit;
        intervalValue = storedVal;
      } else if (storedSecs) {
        if (storedSecs % 3600 === 0 && storedSecs >= 3600) {
          intervalUnit = "h";
          intervalValue = storedSecs / 3600;
        } else if (storedSecs % 60 === 0 && storedSecs >= 60) {
          intervalUnit = "m";
          intervalValue = storedSecs / 60;
        } else {
          intervalUnit = "s";
          intervalValue = storedSecs;
        }
      } else if (storedLegacyMin) {
        intervalUnit = "m";
        intervalValue = storedLegacyMin;
      } else {
        intervalUnit = "m";
        intervalValue = 10;
      }

      const storedSide = await storage.getItem<"left" | "right">("local:passiveLearnPositionSide");
      if (storedSide === "left" || storedSide === "right") {
        positionSide = storedSide;
      } else {
        positionSide = "right";
      }

      const storedSideOffset = await storage.getItem<number>("local:passiveLearnSideOffset");
      if (typeof storedSideOffset === "number" && !Number.isNaN(storedSideOffset)) {
        sideOffset = storedSideOffset;
      } else {
        sideOffset = 10;
      }

      const storedBottomOffset = await storage.getItem<number>("local:passiveLearnBottomOffset");
      if (typeof storedBottomOffset === "number" && !Number.isNaN(storedBottomOffset)) {
        bottomOffset = storedBottomOffset;
      } else {
        bottomOffset = 10;
      }

      if (modeFlashcard || modeQuiz) {
        await ensureDefaultSettingsSaved({
          storedDisplaySeconds,
          storedUnit,
          storedVal,
          storedSide,
          storedSideOffset,
          storedBottomOffset,
        });
      }
    } catch (e) {
      console.error("Failed to load passive learn settings:", e);
    }
  });

  async function ensureDefaultSettingsSaved(existing?: {
    storedDisplaySeconds?: number | null;
    storedUnit?: Unit | null;
    storedVal?: number | null;
    storedSide?: "left" | "right" | null;
    storedSideOffset?: number | null;
    storedBottomOffset?: number | null;
  }) {
    try {
      const disp = existing?.storedDisplaySeconds ?? (await storage.getItem<number>("local:passiveLearnDisplaySeconds"));
      if (disp === null || disp === undefined) {
        await storage.setItem("local:passiveLearnDisplaySeconds", displaySeconds);
      }

      const unit = existing?.storedUnit ?? (await storage.getItem<Unit>("local:passiveLearnIntervalUnit"));
      const val = existing?.storedVal ?? (await storage.getItem<number>("local:passiveLearnIntervalValue"));
      if (!unit || !val) {
        const totalSecs = getCalculatedSeconds(intervalValue, intervalUnit, displaySeconds);
        await storage.setItem("local:passiveLearnIntervalSeconds", totalSecs);
        await storage.setItem("local:passiveLearnIntervalValue", intervalValue);
        await storage.setItem("local:passiveLearnIntervalUnit", intervalUnit);
        await storage.setItem("local:passiveLearnInterval", Math.max(1, Math.round(totalSecs / 60)));
      }

      const side = existing?.storedSide ?? (await storage.getItem<"left" | "right">("local:passiveLearnPositionSide"));
      if (!side) {
        await storage.setItem("local:passiveLearnPositionSide", positionSide);
      }

      const sOffset = existing?.storedSideOffset ?? (await storage.getItem<number>("local:passiveLearnSideOffset"));
      if (sOffset === null || sOffset === undefined) {
        await storage.setItem("local:passiveLearnSideOffset", sideOffset);
      }

      const bOffset = existing?.storedBottomOffset ?? (await storage.getItem<number>("local:passiveLearnBottomOffset"));
      if (bOffset === null || bOffset === undefined) {
        await storage.setItem("local:passiveLearnBottomOffset", bottomOffset);
      }
    } catch (e) {
      console.error("Failed to ensure default passive settings:", e);
    }
  }

  async function handleToggleFlashcard(checked: boolean) {
    modeFlashcard = checked;
    await storage.setItem("local:passiveLearnModeFlashcard", checked);
    await storage.setItem("local:passiveLearnEnabled", checked || modeQuiz);
    if (checked) {
      await ensureDefaultSettingsSaved();
    }
  }

  async function handleToggleQuiz(checked: boolean) {
    modeQuiz = checked;
    await storage.setItem("local:passiveLearnModeQuiz", checked);
    await storage.setItem("local:passiveLearnEnabled", modeFlashcard || checked);
    if (checked) {
      await ensureDefaultSettingsSaved();
    }
  }

  async function handleDisplaySecondsChange(e: Event) {
    const target = e.target as HTMLInputElement;
    let val = parseInt(target.value, 10);
    if (Number.isNaN(val)) val = 20;
    val = Math.max(10, val);
    target.value = String(val);
    displaySeconds = val;
    await storage.setItem("local:passiveLearnDisplaySeconds", val);

    if (intervalUnit === "s" && intervalValue < displaySeconds) {
      intervalValue = displaySeconds;
      await saveInterval();
    }
  }

  async function handleIntervalValueChange(e: Event) {
    const target = e.target as HTMLInputElement;
    let val = parseInt(target.value, 10);
    if (Number.isNaN(val)) val = 1;
    if (intervalUnit === "s") {
      val = Math.max(displaySeconds, val);
    } else {
      val = Math.max(1, val);
    }
    target.value = String(val);
    intervalValue = val;
    await saveInterval();
  }

  async function handleIntervalUnitChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    intervalUnit = target.value as Unit;
    if (intervalUnit === "s" && intervalValue < displaySeconds) {
      intervalValue = displaySeconds;
    }
    await saveInterval();
  }

  async function saveInterval() {
    const totalSecs = getCalculatedSeconds(intervalValue, intervalUnit, displaySeconds);
    await storage.setItem("local:passiveLearnIntervalSeconds", totalSecs);
    await storage.setItem("local:passiveLearnIntervalValue", intervalValue);
    await storage.setItem("local:passiveLearnIntervalUnit", intervalUnit);
    await storage.setItem("local:passiveLearnInterval", Math.max(1, Math.round(totalSecs / 60)));
  }

  async function handlePositionSideChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    const val = target.value as "left" | "right";
    positionSide = val;
    await storage.setItem("local:passiveLearnPositionSide", val);
  }

  async function handleSideOffsetChange(e: Event) {
    const target = e.target as HTMLInputElement;
    let val = parseInt(target.value, 10);
    if (Number.isNaN(val)) val = 10;
    val = Math.max(0, Math.min(500, val));
    target.value = String(val);
    sideOffset = val;
    await storage.setItem("local:passiveLearnSideOffset", val);
  }

  async function handleBottomOffsetChange(e: Event) {
    const target = e.target as HTMLInputElement;
    let val = parseInt(target.value, 10);
    if (Number.isNaN(val)) val = 10;
    val = Math.max(0, Math.min(500, val));
    target.value = String(val);
    bottomOffset = val;
    await storage.setItem("local:passiveLearnBottomOffset", val);
  }

  async function handleTestNow() {
    if (isTesting) return;
    isTesting = true;
    testStatus = null;

    try {
      const res = (await browser.runtime.sendMessage({
        type: "TRIGGER_TEST_PASSIVE_LEARN",
      })) as { ok: boolean; error?: string } | undefined;

      if (!res?.ok) {
        testStatus = {
          type: "error",
          text: res?.error || "Không thể hiển thị thẻ học. Hãy F5 lại tab web đang mở rồi thử lại.",
        };
      }
    } catch (e) {
      testStatus = {
        type: "error",
        text: "Lỗi kết nối background service.",
      };
    } finally {
      isTesting = false;
      setTimeout(() => {
        testStatus = null;
      }, 5000);
    }
  }
</script>

<div class="settings-container">
  <!-- Giải thích tính năng học thụ động -->
  <div class="passive-intro-hint">
    <span class="intro-bulb">💡</span>
    <span>
      Tự động hiển thị thẻ ôn tập hoặc câu đố trắc nghiệm từ các chữ Kanji bạn đã tra cứu theo chu kỳ, giúp ghi nhớ thụ động tự nhiên khi đang lướt web.
    </span>
  </div>

  <!-- Cài đặt chính -->
  <div class="setting-item">
    <div class="setting-controls">
      <!-- 1. Thẻ ghi nhớ Kanji -->
      <label class="toggle-option">
        <input
          type="checkbox"
          checked={modeFlashcard}
          onchange={(e) => handleToggleFlashcard((e.target as HTMLInputElement).checked)}
        />
        <span class="toggle-label">
          <strong>Thẻ ghi nhớ Kanji</strong>
          <span class="toggle-description">
            Hiển thị trực tiếp chữ Kanji đã tra, âm On/Kun, nghĩa và từ vựng ví dụ
          </span>
        </span>
      </label>

      <!-- 2. Trắc nghiệm Hán-Việt -->
      <label class="toggle-option">
        <input
          type="checkbox"
          checked={modeQuiz}
          onchange={(e) => handleToggleQuiz((e.target as HTMLInputElement).checked)}
        />
        <span class="toggle-label">
          <strong>Trắc nghiệm Hán-Việt</strong>
          <span class="toggle-description">
            Đố vui 4 đáp án chọn âm Hán-Việt đúng của chữ Kanji
          </span>
        </span>
      </label>
      {#if enabled}

        <!-- Tần suất xuất hiện -->
        <div class="passive-field-row">
          <div class="field-label-col">
            <strong>Tần suất xuất hiện</strong>
            {#if intervalUnit === "s"}
              <span class="field-sub-hint">
                * Không nhỏ hơn thời gian hiển thị ({displaySeconds}s)
              </span>
            {/if}
          </div>
          <div class="field-controls">
            <input
              type="number"
              min={intervalUnit === "s" ? displaySeconds : 1}
              step="1"
              value={intervalValue}
              onchange={handleIntervalValueChange}
              class="passive-num-input"
            />
            <select
              class="passive-unit-select"
              value={intervalUnit}
              onchange={handleIntervalUnitChange}
              aria-label="Đơn vị tần suất"
            >
              <option value="s">giây</option>
              <option value="m">phút</option>
              <option value="h">giờ</option>
            </select>
          </div>
        </div>

        <!-- Thời gian thẻ hiển thị -->
        <div class="passive-field-row">
          <div class="field-label-col">
            <strong>Thời gian hiển thị</strong>
            <span class="field-sub-hint">* Tối thiểu 10s</span>
          </div>
          <div class="field-controls">
            <input
              type="number"
              min="10"
              max="120"
              step="1"
              value={displaySeconds}
              onchange={handleDisplaySecondsChange}
              class="passive-num-input"
            />
            <span class="field-unit">giây</span>
          </div>
        </div>

        <!-- Cấu hình vị trí và khoảng cách (gộp 1 hàng) -->
        <div class="passive-field-row position-row-group">
          <!-- Vị trí -->
          <div class="pos-config-item">
            <span class="pos-config-label">Vị trí</span>
            <div class="field-controls">
              <select
                class="passive-unit-select"
                value={positionSide}
                onchange={handlePositionSideChange}
                aria-label="Vị trí hiển thị"
              >
                <option value="right">Bên phải</option>
                <option value="left">Bên trái</option>
              </select>
            </div>
          </div>

          <div class="pos-divider"></div>

          <!-- Cách lề -->
          <div class="pos-config-item">
            <span class="pos-config-label">Cách lề</span>
            <div class="field-controls">
              <input
                type="number"
                min="0"
                max="500"
                step="1"
                value={sideOffset}
                onchange={handleSideOffsetChange}
                class="passive-num-input pos-num-input"
              />
              <span class="field-unit">px</span>
            </div>
          </div>

          <div class="pos-divider"></div>

          <!-- Cách đáy -->
          <div class="pos-config-item">
            <span class="pos-config-label">Cách đáy</span>
            <div class="field-controls">
              <input
                type="number"
                min="0"
                max="500"
                step="1"
                value={bottomOffset}
                onchange={handleBottomOffsetChange}
                class="passive-num-input pos-num-input"
              />
              <span class="field-unit">px</span>
            </div>
          </div>
        </div>

        <!-- Nút Test chuẩn style add-button -->
        <div class="test-action-row">
          <button
            type="button"
            class="add-button btn-test-standard"
            onclick={handleTestNow}
            disabled={isTesting}
            title="Thử hiển thị thẻ học ngay trên tab đang duyệt"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              class="test-icon"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
            <span>{isTesting ? "..." : "Test"}</span>
          </button>
          {#if testStatus}
            <span class="test-error-hint">{testStatus.text}</span>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .passive-intro-hint {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    font-size: 0.78rem;
    line-height: 1.45;
    color: #475569;
  }

  .intro-bulb {
    font-size: 0.95rem;
    line-height: 1.1;
    flex-shrink: 0;
  }

  :global(main.dark-mode) .passive-intro-hint {
    background: #1e293b;
    border-color: #334155;
    color: #94a3b8;
  }

  .passive-field-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    background-color: #ffffff;
    transition: all 0.2s;
  }

  .passive-field-row:hover {
    border-color: #d1d5db;
    background-color: #f9fafb;
  }

  :global(main.dark-mode) .passive-field-row {
    border-color: #4b5563;
    background: #1f2937;
  }

  :global(main.dark-mode) .passive-field-row:hover {
    border-color: #6b7280;
    background-color: #374151;
  }

  .position-row-group {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    padding: 0.5rem 0.65rem;
  }

  .pos-config-item {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    flex: 1;
    min-width: 0;
  }

  .pos-config-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: #111827;
    white-space: nowrap;
  }

  :global(main.dark-mode) .pos-config-label {
    color: #f3f4f6;
  }

  .pos-num-input {
    width: 52px;
  }

  .pos-divider {
    width: 1px;
    height: 22px;
    background-color: #e5e7eb;
    flex-shrink: 0;
  }

  :global(main.dark-mode) .pos-divider {
    background-color: #4b5563;
  }

  .field-label-col {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    flex: 1;
    min-width: 0;
  }

  .field-label-col strong {
    font-size: 0.9rem;
    color: #111827;
  }

  :global(main.dark-mode) .field-label-col strong {
    color: #f3f4f6;
  }

  .field-sub-hint {
    font-size: 0.75rem;
    color: #ef4444;
    line-height: 1.3;
  }

  :global(main.dark-mode) .field-sub-hint {
    color: #f87171;
  }

  .field-controls {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .passive-num-input {
    width: 68px;
    padding: 0.35rem 0.45rem;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 700;
    text-align: center;
    outline: none;
    background: #ffffff;
    color: #111827;
    transition: border-color 0.2s;
  }

  .passive-num-input:focus {
    border-color: #f87171;
  }

  :global(main.dark-mode) .passive-num-input {
    background: #111827;
    border-color: #4b5563;
    color: #f3f4f6;
  }

  :global(main.dark-mode) .passive-num-input:focus {
    border-color: #f87171;
  }

  .passive-unit-select {
    padding: 0.35rem 0.45rem;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
    outline: none;
    background: #ffffff;
    color: #111827;
    cursor: pointer;
    transition: border-color 0.2s;
  }

  .passive-unit-select:focus {
    border-color: #f87171;
  }

  :global(main.dark-mode) .passive-unit-select {
    background: #111827;
    border-color: #4b5563;
    color: #f3f4f6;
  }

  :global(main.dark-mode) .passive-unit-select:focus {
    border-color: #f87171;
  }

  .field-unit {
    font-size: 0.8rem;
    color: #6b7280;
    min-width: 24px;
  }

  :global(main.dark-mode) .field-unit {
    color: #9ca3af;
  }

  .test-action-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.35rem;
  }

  .btn-test-standard {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0.45rem 1rem;
    font-size: 0.85rem;
  }

  .test-icon {
    width: 14px;
    height: 14px;
  }

  .test-error-hint {
    font-size: 0.78rem;
    color: #ef4444;
    line-height: 1.35;
  }

  :global(main.dark-mode) .test-error-hint {
    color: #f87171;
  }
</style>
