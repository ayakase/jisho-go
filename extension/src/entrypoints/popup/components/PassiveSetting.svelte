<script lang="ts">
  import { onMount } from "svelte";
  import { storage } from "#imports";
  import {
    clearRecentKanji,
    getRecentKanji,
    getRecentKanjiLimit,
    setRecentKanjiLimit,
  } from "../../../lib/recent-kanji";

  type Unit = "s" | "m" | "h";

  let modeFlashcard = $state(false);
  let modeQuiz = $state(false);
  let enabled = $derived(modeFlashcard || modeQuiz);

  let recentLimit = $state(30);
  let displaySeconds = $state(20);
  let intervalValue = $state(20);
  let intervalUnit = $state<Unit>("m");
  let recentKanjiStr = $state("");
  let testStatus = $state<{ type: "error"; text: string } | null>(null);
  let isTesting = $state(false);

  let recentList = $derived(Array.from(recentKanjiStr));

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
    return 20 * 60;
  }

  onMount(async () => {
    try {
      const storedFlash = await storage.getItem<boolean>("local:passiveLearnModeFlashcard");
      const storedQuiz = await storage.getItem<boolean>("local:passiveLearnModeQuiz");
      const storedEnabled = await storage.getItem<boolean>("local:passiveLearnEnabled");

      if (storedFlash !== null && storedFlash !== undefined) {
        modeFlashcard = storedFlash;
      } else if (storedEnabled === false) {
        modeFlashcard = false;
      } else {
        modeFlashcard = true;
      }

      if (storedQuiz !== null && storedQuiz !== undefined) {
        modeQuiz = storedQuiz;
      } else if (storedEnabled === false) {
        modeQuiz = false;
      } else {
        modeQuiz = true;
      }

      recentLimit = await getRecentKanjiLimit();
      displaySeconds = (await storage.getItem<number>("local:passiveLearnDisplaySeconds")) || 20;

      const storedUnit = await storage.getItem<Unit>("local:passiveLearnIntervalUnit");
      const storedVal = await storage.getItem<number>("local:passiveLearnIntervalValue");
      const storedSecs = await storage.getItem<number>("local:passiveLearnIntervalSeconds");

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
      } else {
        intervalUnit = "m";
        intervalValue = 20;
      }

      recentKanjiStr = await getRecentKanji();
    } catch (e) {
      console.error("Failed to load passive learn settings:", e);
    }
  });

  async function handleToggleFlashcard(checked: boolean) {
    modeFlashcard = checked;
    await storage.setItem("local:passiveLearnModeFlashcard", checked);
    await storage.setItem("local:passiveLearnEnabled", checked || modeQuiz);
  }

  async function handleToggleQuiz(checked: boolean) {
    modeQuiz = checked;
    await storage.setItem("local:passiveLearnModeQuiz", checked);
    await storage.setItem("local:passiveLearnEnabled", modeFlashcard || checked);
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

  async function handleLimitChange(e: Event) {
    const target = e.target as HTMLInputElement;
    let val = parseInt(target.value, 10);
    if (Number.isNaN(val)) return;
    val = Math.max(10, Math.min(100, val));
    target.value = String(val);
    recentLimit = await setRecentKanjiLimit(val);
    recentKanjiStr = await getRecentKanji();
  }

  async function handleClearHistory() {
    if (recentList.length === 0) return;
    await clearRecentKanji();
    recentKanjiStr = "";
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

      {#if modeFlashcard && modeQuiz}
        <span class="field-sub-hint mode-hint">
          * Đang bật cả 2: Thẻ học sẽ xuất hiện ngẫu nhiên giữa Thẻ ghi nhớ và Trắc nghiệm
        </span>
      {:else if !enabled}
        <span class="field-sub-hint mode-hint">
          * Hãy bật ít nhất 1 chế độ để bắt đầu học Kanji thụ động
        </span>
      {/if}

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

        <!-- Số lượng Kanji lưu tối đa -->
        <div class="passive-field-row">
          <div class="field-label-col">
            <strong>Số lượng Kanji lưu</strong>
            <span class="field-sub-hint">* Từ 10 đến 100 chữ</span>
          </div>
          <div class="field-controls">
            <input
              type="number"
              min="10"
              max="100"
              step="1"
              value={recentLimit}
              onchange={handleLimitChange}
              class="passive-num-input"
            />
            <span class="field-unit">chữ</span>
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

  <!-- Lịch sử Kanji gần đây -->
  <div class="setting-item">
    <div class="history-title-bar">
      <h3>Lịch sử Kanji gần đây ({recentList.length}/{recentLimit})</h3>
      {#if recentList.length > 0}
        <button
          type="button"
          class="clear-history-btn"
          onclick={handleClearHistory}
          title="Xóa toàn bộ lịch sử Kanji đã lưu"
        >
          Xóa lịch sử
        </button>
      {/if}
    </div>

    <div class="setting-controls">
      {#if recentList.length > 0}
        <div class="kanji-list-box">
          {#each recentList as kanji}
            <span class="kanji-chip">{kanji}</span>
          {/each}
        </div>
      {:else}
        <div class="blacklist-empty">
          Chưa có chữ Kanji nào trong danh sách. Tiện ích sẽ tự động ghi nhớ các chữ bạn tra cứu khi bôi đen hoặc rê chuột trên trang web.
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .mode-hint {
    padding-left: 0.25rem;
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

  .history-title-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .history-title-bar h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: #374151;
  }

  :global(main.dark-mode) .history-title-bar h3 {
    color: #e5e7eb;
  }

  .clear-history-btn {
    border: none;
    background: transparent;
    color: #f87171;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    padding: 0;
    transition: color 0.15s ease;
  }

  .clear-history-btn:hover {
    color: #ef4444;
    text-decoration: underline;
  }

  .kanji-list-box {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0.65rem;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    background: #ffffff;
    max-height: 160px;
    overflow-y: auto;
  }

  :global(main.dark-mode) .kanji-list-box {
    border-color: #4b5563;
    background: #1f2937;
  }

  .kanji-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: #f3f4f6;
    color: #111827;
    font-weight: 700;
    font-size: 1rem;
    font-family: "Noto Sans JP", sans-serif;
    border: 1px solid #e5e7eb;
    transition: all 0.15s ease;
  }

  .kanji-chip:hover {
    background: #fee2e2;
    color: #dc2626;
    border-color: #fca5a5;
  }

  :global(main.dark-mode) .kanji-chip {
    background: #111827;
    color: #f3f4f6;
    border-color: #374151;
  }

  :global(main.dark-mode) .kanji-chip:hover {
    background: #450a0a;
    color: #f87171;
    border-color: #7f1d1d;
  }
</style>
