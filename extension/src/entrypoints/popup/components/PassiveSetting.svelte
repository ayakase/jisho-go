<script lang="ts">
  import { onMount } from "svelte";
  import { storage } from "#imports";
  type Unit = "m" | "h";

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

  let snoozeUntil = $state<number>(0);
  let now = $state<number>(Date.now());
  let snoozeRemainingMs = $derived(Math.max(0, snoozeUntil - now));
  let isSnoozed = $derived(snoozeRemainingMs > 0);

  function formatCountdown(ms: number): string {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    if (h > 0) {
      return `${h}:${pad(m)}:${pad(s)}`;
    }
    return `${pad(m)}:${pad(s)}`;
  }

  let countdownTimer: ReturnType<typeof setInterval> | null = null;
  $effect(() => {
    if (snoozeUntil > Date.now()) {
      if (!countdownTimer) {
        countdownTimer = setInterval(() => {
          now = Date.now();
          if (snoozeUntil <= Date.now() && countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
          }
        }, 1000);
      }
    } else if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    return () => {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    };
  });

  async function handleCancelSnooze() {
    snoozeUntil = 0;
    now = Date.now();
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    await storage.setItem("local:passiveLearnSnoozeUntil", 0);
    try {
      await browser.runtime?.sendMessage({
        type: "SET_PASSIVE_SNOOZE",
        snoozeUntil: 0,
      });
    } catch {}
  }

  function getCalculatedSeconds(val: number, unit: Unit): number {
    if (unit === "h") {
      return Math.max(1, val) * 3600;
    }
    return Math.max(1, val) * 60;
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

      const storedUnit = await storage.getItem<string>("local:passiveLearnIntervalUnit");
      const storedVal = await storage.getItem<number>("local:passiveLearnIntervalValue");
      const storedSecs = await storage.getItem<number>("local:passiveLearnIntervalSeconds");
      const storedLegacyMin = await storage.getItem<number>("local:passiveLearnInterval");

      if (storedUnit === "h" && storedVal) {
        intervalUnit = "h";
        intervalValue = Math.max(1, storedVal);
      } else if (storedUnit === "m" && storedVal) {
        intervalUnit = "m";
        intervalValue = Math.max(1, storedVal);
      } else if (storedSecs) {
        if (storedSecs % 3600 === 0 && storedSecs >= 3600) {
          intervalUnit = "h";
          intervalValue = Math.max(1, Math.round(storedSecs / 3600));
        } else {
          intervalUnit = "m";
          intervalValue = Math.max(1, Math.round(storedSecs / 60));
        }
      } else if (storedLegacyMin) {
        intervalUnit = "m";
        intervalValue = Math.max(1, storedLegacyMin);
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

      const storedSnooze = await storage.getItem<number>("local:passiveLearnSnoozeUntil");
      if (typeof storedSnooze === "number") {
        snoozeUntil = storedSnooze;
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
        const totalSecs = getCalculatedSeconds(intervalValue, intervalUnit);
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
  }

  async function handleIntervalValueChange(e: Event) {
    const target = e.target as HTMLInputElement;
    let val = parseInt(target.value, 10);
    if (Number.isNaN(val)) val = 1;
    val = Math.max(1, val);
    target.value = String(val);
    intervalValue = val;
    await saveInterval();
  }

  async function handleIntervalUnitChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    intervalUnit = target.value as Unit;
    await saveInterval();
  }

  async function saveInterval() {
    const totalSecs = getCalculatedSeconds(intervalValue, intervalUnit);
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
          </div>
          <div class="field-controls">
            <input
              type="number"
              min="1"
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

          <div class="hint-tooltip-wrap">
            <button
              type="button"
              class="hint-icon-btn"
              aria-label="Xem giải thích tính năng"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.8"
                stroke="currentColor"
                class="heroicon-bulb"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.516 0c.85.493 1.508 1.333 1.508 2.316V18"
                />
              </svg>
            </button>
            <div class="hint-tooltip-bubble" role="tooltip">
              Tự động hiển thị thẻ ôn tập hoặc câu đố trắc nghiệm từ các chữ Kanji bạn đã tra cứu theo chu kỳ, giúp ghi nhớ thụ động tự nhiên khi đang lướt web.
            </div>
          </div>

          {#if isSnoozed}
            <div class="snooze-inline-badge" title="Thời gian tạm dừng còn lại">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.8"
                stroke="currentColor"
                class="snooze-inline-icon"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M14.25 9v6m-4.5-6v6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
              <span class="snooze-inline-text">Đang tạm dừng</span>
              <span class="snooze-inline-timer">{formatCountdown(snoozeRemainingMs)}</span>
              <div class="snooze-btn-wrap">
                <button
                  type="button"
                  class="snooze-play-btn"
                  onclick={handleCancelSnooze}
                  aria-label="Tiếp tục"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    class="snooze-play-icon"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </button>
                <div class="snooze-tooltip" role="tooltip">Tiếp tục</div>
              </div>
            </div>
          {/if}

          {#if testStatus}
            <span class="test-error-hint">{testStatus.text}</span>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .hint-tooltip-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .hint-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: #9ca3af;
    cursor: pointer;
    transition: color 0.15s ease, background-color 0.15s ease;
  }

  .hint-icon-btn:hover,
  .hint-tooltip-wrap:focus-within .hint-icon-btn {
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.1);
  }

  :global(main.dark-mode) .hint-icon-btn {
    color: #6b7280;
  }

  :global(main.dark-mode) .hint-icon-btn:hover,
  :global(main.dark-mode) .hint-tooltip-wrap:focus-within .hint-icon-btn {
    color: #fbbf24;
    background: rgba(251, 191, 36, 0.15);
  }

  .heroicon-bulb {
    width: 17px;
    height: 17px;
  }

  .hint-tooltip-bubble {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 0;
    width: 250px;
    padding: 0.55rem 0.75rem;
    background: #18181b;
    color: #f4f4f5;
    border: 1px solid #3f3f46;
    border-radius: 8px;
    font-size: 0.75rem;
    line-height: 1.45;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.28);
    pointer-events: none;
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 0.15s ease, transform 0.15s ease;
    z-index: 100;
  }

  .hint-tooltip-bubble::before {
    content: "";
    position: absolute;
    top: 100%;
    left: 8px;
    border: 5px solid transparent;
    border-top-color: #3f3f46;
  }

  .hint-tooltip-bubble::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 9px;
    border: 4px solid transparent;
    border-top-color: #18181b;
  }

  .hint-tooltip-wrap:hover .hint-tooltip-bubble,
  .hint-tooltip-wrap:focus-within .hint-tooltip-bubble {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  :global(main.dark-mode) .hint-tooltip-bubble {
    background: #27272a;
    border-color: #52525b;
    color: #f4f4f5;
  }

  :global(main.dark-mode) .hint-tooltip-bubble::before {
    border-top-color: #52525b;
  }

  :global(main.dark-mode) .hint-tooltip-bubble::after {
    border-top-color: #27272a;
  }

  /* Trạng thái tạm dừng đặt cạnh nút Test */
  .snooze-inline-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    box-sizing: border-box;
    padding: 0 4px 0 8px;
    background: #fff7ed;
    border: 1.5px solid #fed7aa;
    border-radius: 6px;
    margin-left: auto;
  }

  :global(main.dark-mode) .snooze-inline-badge {
    background: #431407;
    border-color: #9a3412;
  }

  .snooze-inline-icon {
    width: 14px;
    height: 14px;
    color: #ea580c;
    flex-shrink: 0;
  }

  :global(main.dark-mode) .snooze-inline-icon {
    color: #fb923c;
  }

  .snooze-inline-text {
    font-size: 0.78rem;
    font-weight: 600;
    color: #9a3412;
    white-space: nowrap;
  }

  :global(main.dark-mode) .snooze-inline-text {
    color: #fdba74;
  }

  .snooze-inline-timer {
    font-size: 0.8rem;
    font-weight: 700;
    color: #c2410c;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.03em;
    white-space: nowrap;
    min-width: 38px;
  }

  :global(main.dark-mode) .snooze-inline-timer {
    color: #fed7aa;
  }

  .snooze-btn-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .snooze-tooltip {
    position: absolute;
    bottom: calc(100% + 7px);
    left: 50%;
    transform: translateX(-50%) translateY(2px);
    padding: 3px 7px;
    background: #18181b;
    color: #f4f4f5;
    font-size: 0.7rem;
    font-weight: 600;
    white-space: nowrap;
    border-radius: 5px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease, transform 0.15s ease;
    z-index: 100;
  }

  .snooze-tooltip::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 4px solid transparent;
    border-top-color: #18181b;
  }

  .snooze-btn-wrap:hover .snooze-tooltip,
  .snooze-btn-wrap:focus-within .snooze-tooltip {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }

  :global(main.dark-mode) .snooze-tooltip {
    background: #27272a;
    border: 1px solid #52525b;
  }

  :global(main.dark-mode) .snooze-tooltip::after {
    border-top-color: #27272a;
  }

  .snooze-play-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: #ea580c;
    color: #ffffff;
    cursor: pointer;
    transition: background-color 0.15s ease;
    flex-shrink: 0;
  }

  .snooze-play-btn:hover {
    background: #c2410c;
  }

  :global(main.dark-mode) .snooze-play-btn {
    background: #ea580c;
  }

  :global(main.dark-mode) .snooze-play-btn:hover {
    background: #f97316;
  }

  .snooze-play-icon {
    width: 12px;
    height: 12px;
    display: block;
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
    height: 34px;
    box-sizing: border-box;
    padding: 0 1rem;
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
