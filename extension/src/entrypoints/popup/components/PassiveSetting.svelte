<script lang="ts">
  import { onMount } from "svelte";
  import { storage } from "#imports";
  import {
    clearRecentKanji,
    getRecentKanji,
    getRecentKanjiLimit,
    setRecentKanjiLimit,
  } from "../../../lib/recent-kanji";

  type IntervalItem = {
    label: string;
    seconds: number;
  };

  const INTERVAL_OPTIONS: IntervalItem[] = [
    { label: "10 giây (Test)", seconds: 10 },
    { label: "5 phút", seconds: 5 * 60 },
    { label: "10 phút", seconds: 10 * 60 },
    { label: "15 phút", seconds: 15 * 60 },
    { label: "20 phút", seconds: 20 * 60 },
    { label: "30 phút", seconds: 30 * 60 },
    { label: "45 phút", seconds: 45 * 60 },
    { label: "60 phút", seconds: 60 * 60 },
  ];

  let enabled = $state(false);
  let recentLimit = $state(30);
  let intervalSeconds = $state(20 * 60);
  let recentKanjiStr = $state("");
  let testStatus = $state<{ type: "success" | "error"; text: string } | null>(null);
  let isTesting = $state(false);
  let saveFeedback = $state<string | null>(null);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  let recentList = $derived(Array.from(recentKanjiStr));

  function flashSaveFeedback(message = "✓ Đã áp dụng cài đặt") {
    if (saveTimer) clearTimeout(saveTimer);
    saveFeedback = message;
    saveTimer = setTimeout(() => {
      saveFeedback = null;
    }, 2500);
  }

  onMount(async () => {
    try {
      enabled = (await storage.getItem<boolean>("local:passiveLearnEnabled")) ?? false;
      recentLimit = await getRecentKanjiLimit();
      
      const storedSecs = await storage.getItem<number>("local:passiveLearnIntervalSeconds");
      if (storedSecs !== null && storedSecs !== undefined) {
        intervalSeconds = storedSecs;
      } else {
        const storedMins = await storage.getItem<number>("local:passiveLearnInterval");
        intervalSeconds = storedMins ? storedMins * 60 : 20 * 60;
      }

      recentKanjiStr = await getRecentKanji();
    } catch (e) {
      console.error("Failed to load passive learn settings:", e);
    }
  });

  async function toggleEnabled() {
    enabled = !enabled;
    await storage.setItem("local:passiveLearnEnabled", enabled);
    flashSaveFeedback(enabled ? "✓ Đã bật & áp dụng học thụ động" : "✓ Đã tắt học thụ động");
  }

  async function handleLimitChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const val = parseInt(target.value, 10);
    if (!Number.isNaN(val)) {
      recentLimit = await setRecentKanjiLimit(val);
      recentKanjiStr = await getRecentKanji();
      flashSaveFeedback(`✓ Đã lưu giới hạn ${recentLimit} chữ`);
    }
  }

  async function handleIntervalChange(secs: number) {
    intervalSeconds = secs;
    await storage.setItem("local:passiveLearnIntervalSeconds", secs);
    await storage.setItem("local:passiveLearnInterval", Math.max(1, Math.round(secs / 60)));
    flashSaveFeedback("✓ Đã lưu tần suất mới");
  }

  async function handleApplyAll() {
    await storage.setItem("local:passiveLearnEnabled", enabled);
    await storage.setItem("local:passiveLearnIntervalSeconds", intervalSeconds);
    await storage.setItem("local:passiveLearnInterval", Math.max(1, Math.round(intervalSeconds / 60)));
    await setRecentKanjiLimit(recentLimit);
    flashSaveFeedback("✓ Đã lưu & áp dụng toàn bộ cài đặt!");
  }

  async function handleClearHistory() {
    if (recentList.length === 0) return;
    await clearRecentKanji();
    recentKanjiStr = "";
    flashSaveFeedback("✓ Đã xóa toàn bộ lịch sử Kanji");
  }

  async function handleTestNow() {
    if (isTesting) return;
    isTesting = true;
    testStatus = null;

    try {
      const res = (await browser.runtime.sendMessage({
        type: "TRIGGER_TEST_PASSIVE_LEARN",
      })) as { ok: boolean; error?: string } | undefined;

      if (res?.ok) {
        testStatus = {
          type: "success",
          text: "Đã hiển thị thẻ học thử ở góc dưới bên phải tab đang mở!",
        };
      } else {
        testStatus = {
          type: "error",
          text: res?.error || "Không thể hiển thị thẻ học. Hãy mở một tab trang web bất kỳ và F5 lại trang đó.",
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

<div class="setting-container">
  <div class="setting-card">
    <div class="setting-card-header">
      <div>
        <h2 class="setting-title">Học Kanji thụ động</h2>
        <p class="setting-description">
          Thỉnh thoảng hiển thị 1 chữ Kanji đã tra kèm ví dụ ở góc màn hình để ôn tập tự nhiên khi bạn lướt web.
        </p>
      </div>
      <button
        type="button"
        class="toggle-switch {enabled ? 'active' : ''}"
        onclick={toggleEnabled}
        aria-label="Bật hoặc tắt học thụ động"
      >
        <span class="toggle-slider"></span>
      </button>
    </div>

    {#if saveFeedback}
      <div class="save-toast">
        {saveFeedback}
      </div>
    {/if}

    {#if enabled}
      <div class="setting-section">
        <label for="passive-interval" class="section-label">
          Tần suất xuất hiện
        </label>
        <div class="interval-options" id="passive-interval">
          {#each INTERVAL_OPTIONS as opt}
            <button
              type="button"
              class="btn-option {intervalSeconds === opt.seconds ? 'selected' : ''} {opt.seconds <= 30 ? 'test-pill' : ''}"
              onclick={() => handleIntervalChange(opt.seconds)}
            >
              {opt.label}
            </button>
          {/each}
        </div>
      </div>

      <div class="setting-section">
        <div class="section-label-row">
          <label for="limit-slider" class="section-label">
            Số lượng Kanji lưu tối đa
          </label>
          <span class="slider-value">{recentLimit} chữ</span>
        </div>
        <input
          id="limit-slider"
          type="range"
          min="10"
          max="100"
          step="5"
          value={recentLimit}
          oninput={handleLimitChange}
          class="range-slider"
        />
        <div class="slider-hints">
          <span>10 chữ</span>
          <span>50 chữ</span>
          <span>100 chữ</span>
        </div>
      </div>

      <div class="action-buttons-row">
        <button
          type="button"
          class="btn-apply"
          onclick={handleApplyAll}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="apply-icon"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Áp dụng cài đặt
        </button>

        <button
          type="button"
          class="btn-test"
          onclick={handleTestNow}
          disabled={isTesting}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="test-icon"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          {isTesting ? "Đang gửi..." : "Hiện thử 1 thẻ ngay"}
        </button>
      </div>

      {#if recentList.length === 0}
        <div class="sample-badge">
          ℹ️ Chưa có lịch sử tra cứu: Thẻ học thử sẽ dùng danh sách Kanji mẫu N5.
        </div>
      {/if}

      {#if testStatus}
        <div class="test-message {testStatus.type}">
          {testStatus.text}
        </div>
      {/if}

      <div class="test-guide-card">
        <div class="guide-header">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="guide-icon"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>Hướng dẫn kiểm tra:</span>
        </div>
        <div class="guide-text">
          Hãy <strong>F5 (tải lại)</strong> tab trang web bạn đang duyệt để nhận tính năng mới, sau đó bấm <em>"Hiện thử 1 thẻ ngay"</em> hoặc chọn mốc <em>10 giây (Test)</em> để kiểm tra thẻ học xuất hiện ở góc phải màn hình!
        </div>
      </div>
    {/if}
  </div>

  <div class="setting-card">
    <div class="history-header">
      <div class="history-title-row">
        <h3 class="setting-subtitle">Lịch sử Kanji gần đây</h3>
        <span class="history-count">({recentList.length}/{recentLimit})</span>
      </div>
      {#if recentList.length > 0}
        <button
          type="button"
          class="btn-clear"
          onclick={handleClearHistory}
          title="Xóa toàn bộ lịch sử Kanji đã lưu"
        >
          Xóa lịch sử
        </button>
      {/if}
    </div>

    {#if recentList.length > 0}
      <div class="kanji-grid">
        {#each recentList as kanji}
          <span class="kanji-chip">{kanji}</span>
        {/each}
      </div>
    {:else}
      <div class="empty-hint">
        Chưa có chữ Kanji nào trong danh sách. Tiện ích sẽ tự động ghi nhớ các chữ bạn tra cứu khi bôi đen hoặc rê chuột trên trang web.
      </div>
    {/if}
  </div>
</div>

<style>
  .setting-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .setting-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 1.15rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  :global(main.dark-mode) .setting-card {
    background: #18181b;
    border-color: #27272a;
  }

  .setting-card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .setting-title {
    margin: 0 0 0.35rem 0;
    font-size: 1rem;
    font-weight: 700;
    color: #111827;
  }

  :global(main.dark-mode) .setting-title {
    color: #f4f4f5;
  }

  .setting-description {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.45;
    color: #6b7280;
  }

  :global(main.dark-mode) .setting-description {
    color: #a1a1aa;
  }

  .toggle-switch {
    position: relative;
    width: 44px;
    height: 24px;
    background: #e5e7eb;
    border-radius: 999px;
    border: none;
    cursor: pointer;
    padding: 2px;
    transition: background-color 0.2s ease;
    flex-shrink: 0;
  }

  .toggle-switch.active {
    background: #ef4444;
  }

  :global(main.dark-mode) .toggle-switch {
    background: #3f3f46;
  }

  :global(main.dark-mode) .toggle-switch.active {
    background: #f87171;
  }

  .toggle-slider {
    display: block;
    width: 20px;
    height: 20px;
    background: #ffffff;
    border-radius: 50%;
    transition: transform 0.2s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }

  .toggle-switch.active .toggle-slider {
    transform: translateX(20px);
  }

  .setting-section {
    margin-top: 1.15rem;
    padding-top: 1rem;
    border-top: 1px solid #f3f4f6;
  }

  :global(main.dark-mode) .setting-section {
    border-top-color: #27272a;
  }

  .section-label {
    display: block;
    font-size: 0.85rem;
    font-weight: 600;
    color: #374151;
    margin-bottom: 0.5rem;
  }

  :global(main.dark-mode) .section-label {
    color: #d4d4d8;
  }

  .section-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .slider-value {
    font-size: 0.85rem;
    font-weight: 700;
    color: #ef4444;
  }

  :global(main.dark-mode) .slider-value {
    color: #f87171;
  }

  .interval-options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .btn-option {
    padding: 0.35rem 0.65rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #ffffff;
    font-size: 0.78rem;
    font-weight: 500;
    color: #4b5563;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-option:hover {
    border-color: #ef4444;
    color: #ef4444;
  }

  .btn-option.selected {
    background: #ef4444;
    border-color: #ef4444;
    color: #ffffff;
    font-weight: 700;
  }

  :global(main.dark-mode) .btn-option {
    background: #27272a;
    border-color: #3f3f46;
    color: #d4d4d8;
  }

  :global(main.dark-mode) .btn-option:hover {
    border-color: #f87171;
    color: #f87171;
  }

  :global(main.dark-mode) .btn-option.selected {
    background: #f87171;
    border-color: #f87171;
    color: #18181b;
  }

  .range-slider {
    width: 100%;
    margin: 0.4rem 0;
    accent-color: #ef4444;
    cursor: pointer;
  }

  .slider-hints {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    color: #9ca3af;
  }

  .save-toast {
    margin-top: 0.75rem;
    padding: 0.45rem 0.75rem;
    border-radius: 6px;
    background: #ecfdf5;
    color: #065f46;
    border: 1px solid #a7f3d0;
    font-size: 0.8rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
    animation: fadeIn 0.2s ease-in-out;
  }

  :global(main.dark-mode) .save-toast {
    background: #064e3b;
    color: #a7f3d0;
    border-color: #047857;
  }

  .test-pill {
    border-style: dashed;
    border-color: #f59e0b;
    color: #b45309;
    font-weight: 600;
  }

  .test-pill.selected {
    background: #f59e0b;
    border-color: #f59e0b;
    color: #ffffff;
  }

  :global(main.dark-mode) .test-pill {
    border-color: #f59e0b;
    color: #fbbf24;
  }

  :global(main.dark-mode) .test-pill.selected {
    background: #f59e0b;
    color: #18181b;
  }

  .action-buttons-row {
    margin-top: 1.15rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .btn-apply {
    flex: 1;
    min-width: 140px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0.5rem 0.85rem;
    border-radius: 6px;
    border: 1px solid #10b981;
    background: #10b981;
    color: #ffffff;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-apply:hover {
    background: #059669;
    border-color: #059669;
  }

  :global(main.dark-mode) .btn-apply {
    background: #059669;
    border-color: #059669;
    color: #ffffff;
  }

  :global(main.dark-mode) .btn-apply:hover {
    background: #10b981;
    border-color: #10b981;
  }

  .apply-icon {
    width: 14px;
    height: 14px;
  }

  .btn-test {
    flex: 1;
    min-width: 140px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0.5rem 0.85rem;
    border-radius: 6px;
    border: 1px solid #ef4444;
    background: transparent;
    color: #ef4444;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-test:hover:not(:disabled) {
    background: #ef4444;
    color: #ffffff;
  }

  .btn-test:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    border-color: #d1d5db;
    color: #9ca3af;
  }

  :global(main.dark-mode) .btn-test {
    border-color: #f87171;
    color: #f87171;
  }

  :global(main.dark-mode) .btn-test:hover:not(:disabled) {
    background: #f87171;
    color: #18181b;
  }

  .test-icon {
    width: 13px;
    height: 13px;
  }

  .sample-badge {
    margin-top: 0.5rem;
    font-size: 0.73rem;
    color: #6b7280;
    background: #f9fafb;
    padding: 0.35rem 0.6rem;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
  }

  :global(main.dark-mode) .sample-badge {
    background: #27272a;
    border-color: #3f3f46;
    color: #a1a1aa;
  }

  .test-message {
    margin-top: 0.5rem;
    font-size: 0.78rem;
    padding: 6px 10px;
    border-radius: 6px;
    line-height: 1.4;
  }

  .test-message.success {
    background: #ecfdf5;
    color: #065f46;
    border: 1px solid #a7f3d0;
  }

  .test-message.error {
    background: #fef2f2;
    color: #991b1b;
    border: 1px solid #fecaca;
  }

  :global(main.dark-mode) .test-message.success {
    background: #064e3b;
    color: #a7f3d0;
    border-color: #047857;
  }

  :global(main.dark-mode) .test-message.error {
    background: #450a0a;
    color: #fca5a5;
    border-color: #7f1d1d;
  }

  .test-guide-card {
    margin-top: 0.85rem;
    padding: 0.65rem 0.8rem;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 8px;
  }

  :global(main.dark-mode) .test-guide-card {
    background: #1e293b;
    border-color: #334155;
  }

  .guide-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    font-weight: 700;
    color: #1e40af;
    margin-bottom: 0.3rem;
  }

  :global(main.dark-mode) .guide-header {
    color: #93c5fd;
  }

  .guide-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  .guide-text {
    font-size: 0.74rem;
    line-height: 1.45;
    color: #1e3a8a;
  }

  :global(main.dark-mode) .guide-text {
    color: #cbd5e1;
  }

  .history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .history-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .setting-subtitle {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 700;
    color: #111827;
  }

  :global(main.dark-mode) .setting-subtitle {
    color: #f4f4f5;
  }

  .history-count {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
  }

  :global(main.dark-mode) .history-count {
    color: #a1a1aa;
  }

  .btn-clear {
    border: none;
    background: transparent;
    color: #ef4444;
    font-size: 0.78rem;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
    font-weight: 600;
  }

  .btn-clear:hover {
    text-decoration: underline;
  }

  :global(main.dark-mode) .btn-clear {
    color: #f87171;
  }

  .kanji-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-height: 180px;
    overflow-y: auto;
    padding: 2px;
  }

  .kanji-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: #f3f4f6;
    color: #1f2937;
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
    transform: scale(1.08);
  }

  :global(main.dark-mode) .kanji-chip {
    background: #27272a;
    color: #f4f4f5;
    border-color: #3f3f46;
  }

  :global(main.dark-mode) .kanji-chip:hover {
    background: #450a0a;
    color: #f87171;
    border-color: #7f1d1d;
  }

  .empty-hint {
    font-size: 0.78rem;
    color: #9ca3af;
    line-height: 1.5;
    text-align: center;
    padding: 1.5rem 0.5rem;
  }
</style>

