<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { storage } from "#imports";

  export type PassiveLearnPayload = {
    kanji: string;
    hanViet: string;
    on?: string;
    kun?: string;
    level?: string;
    example?: { w: string; p: string; m: string } | null;
  };

  interface Props {
    payload: PassiveLearnPayload;
    onClose: () => void;
  }

  let { payload, onClose }: Props = $props();

  const TOTAL_DURATION_MS = 20000; // 20 giây
  let remainingMs = $state(TOTAL_DURATION_MS);
  let isPaused = $state(false);
  let darkMode = $state(false);
  let intervalTimer: ReturnType<typeof setInterval> | null = null;

  let progressPct = $derived(
    Math.max(0, Math.min(100, (remainingMs / TOTAL_DURATION_MS) * 100))
  );

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }

  onMount(() => {
    void (async () => {
      try {
        darkMode = (await storage.getItem<boolean>("local:darkMode")) ?? false;
      } catch {
        darkMode = false;
      }
    })();

    const TICK_INTERVAL = 100;
    intervalTimer = setInterval(() => {
      if (!isPaused) {
        remainingMs -= TICK_INTERVAL;
        if (remainingMs <= 0) {
          clearInterval(intervalTimer!);
          onClose();
        }
      }
    }, TICK_INTERVAL);

    window.addEventListener("keydown", handleKeydown);
  });

  onDestroy(() => {
    if (intervalTimer) clearInterval(intervalTimer);
    window.removeEventListener("keydown", handleKeydown);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="passive-card-wrapper"
  class:dark-mode={darkMode}
  onmouseenter={() => (isPaused = true)}
  onmouseleave={() => (isPaused = false)}
>
  <div class="passive-header">
    <div class="brand-tag">
      <svg
        class="bell-icon"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 3a6 6 0 0 0 -6 6v5l-2 2h16l-2 -2v-5a6 6 0 0 0 -6 -6" />
        <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
      </svg>
      <span>Jisho Go • Ôn tập</span>
    </div>
    <button
      type="button"
      class="btn-close"
      onclick={onClose}
      aria-label="Đóng"
      title="Đóng (Esc)"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M18 6l-12 12" />
        <path d="M6 6l12 12" />
      </svg>
    </button>
  </div>

  <div class="passive-body">
    <div class="kanji-main-row">
      <div class="kanji-glyph">{payload.kanji}</div>
      <div class="kanji-meta">
        <div class="hanviet-row">
          <span class="hanviet">{payload.hanViet || "HÁN TỰ"}</span>
          {#if payload.level}
            <span class="level-badge">{payload.level}</span>
          {/if}
        </div>
        {#if payload.on}
          <div class="reading-row">
            <span class="reading-label">On:</span>
            <span class="reading-val">{payload.on}</span>
          </div>
        {/if}
        {#if payload.kun}
          <div class="reading-row">
            <span class="reading-label">Kun:</span>
            <span class="reading-val">{payload.kun}</span>
          </div>
        {/if}
      </div>
    </div>

    {#if payload.example}
      <div class="example-box">
        <div class="example-title">Ví dụ gợi nhớ:</div>
        <div class="example-content">
          <span class="example-word">{payload.example.w}</span>
          {#if payload.example.p}
            <span class="example-reading">({payload.example.p})</span>
          {/if}
          <span class="example-meaning">- {payload.example.m}</span>
        </div>
      </div>
    {/if}
  </div>

  <div class="progress-bar-track">
    <div
      class="progress-bar-fill"
      style="width: {progressPct}%; transition: {isPaused ? 'none' : 'width 0.1s linear'};"
    ></div>
  </div>
</div>

<style>
  .passive-card-wrapper {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 320px;
    background: #ffffff;
    color: #1f2937;
    border-radius: 12px;
    box-shadow:
      0 10px 25px -5px rgba(0, 0, 0, 0.1),
      0 8px 10px -6px rgba(0, 0, 0, 0.1),
      0 0 0 1px rgba(0, 0, 0, 0.08);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    z-index: 2147483646;
    overflow: hidden;
    animation: passiveSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    box-sizing: border-box;
  }

  .passive-card-wrapper.dark-mode {
    background: #18181b;
    color: #f4f4f5;
    border: 1px solid #27272a;
    box-shadow:
      0 12px 30px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(255, 255, 255, 0.08);
  }

  @keyframes passiveSlideUp {
    from {
      opacity: 0;
      transform: translateY(24px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .passive-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 6px 14px;
  }

  .brand-tag {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    color: #ef4444;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .passive-card-wrapper.dark-mode .brand-tag {
    color: #f87171;
  }

  .bell-icon {
    width: 14px;
    height: 14px;
    stroke: currentColor;
  }

  .btn-close {
    background: transparent;
    border: none;
    cursor: pointer;
    color: #9ca3af;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .btn-close:hover {
    color: #1f2937;
    background: #f3f4f6;
  }

  .passive-card-wrapper.dark-mode .btn-close:hover {
    color: #ffffff;
    background: #27272a;
  }

  .btn-close svg {
    width: 14px;
    height: 14px;
  }

  .passive-body {
    padding: 6px 14px 14px 14px;
  }

  .kanji-main-row {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 10px;
  }

  .kanji-glyph {
    font-size: 2.75rem;
    font-weight: 700;
    color: #dc2626;
    line-height: 1;
    font-family: "Noto Sans JP", sans-serif;
  }

  .passive-card-wrapper.dark-mode .kanji-glyph {
    color: #f87171;
  }

  .kanji-meta {
    flex: 1;
    min-width: 0;
  }

  .hanviet-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .hanviet {
    font-size: 1.15rem;
    font-weight: 800;
    color: #111827;
    letter-spacing: 0.03em;
  }

  .passive-card-wrapper.dark-mode .hanviet {
    color: #f4f4f5;
  }

  .level-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 4px;
    background: #fee2e2;
    color: #991b1b;
  }

  .passive-card-wrapper.dark-mode .level-badge {
    background: #450a0a;
    color: #fca5a5;
    border: 1px solid #7f1d1d;
  }

  .reading-row {
    font-size: 12px;
    color: #4b5563;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .passive-card-wrapper.dark-mode .reading-row {
    color: #a1a1aa;
  }

  .reading-label {
    font-weight: 600;
    color: #6b7280;
    margin-right: 4px;
  }

  .passive-card-wrapper.dark-mode .reading-label {
    color: #71717a;
  }

  .example-box {
    background: #f9fafb;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12px;
    border: 1px solid #f3f4f6;
  }

  .passive-card-wrapper.dark-mode .example-box {
    background: #202024;
    border-color: #27272a;
  }

  .example-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    color: #9ca3af;
    margin-bottom: 3px;
    letter-spacing: 0.02em;
  }

  .example-content {
    line-height: 1.45;
  }

  .example-word {
    font-weight: 700;
    color: #111827;
  }

  .passive-card-wrapper.dark-mode .example-word {
    color: #f4f4f5;
  }

  .example-reading {
    color: #6b7280;
    margin-left: 2px;
  }

  .passive-card-wrapper.dark-mode .example-reading {
    color: #a1a1aa;
  }

  .example-meaning {
    color: #374151;
    margin-left: 4px;
  }

  .passive-card-wrapper.dark-mode .example-meaning {
    color: #d4d4d8;
  }

  .progress-bar-track {
    height: 3px;
    width: 100%;
    background: rgba(0, 0, 0, 0.05);
    overflow: hidden;
  }

  .passive-card-wrapper.dark-mode .progress-bar-track {
    background: rgba(255, 255, 255, 0.06);
  }

  .progress-bar-fill {
    height: 100%;
    background: #ef4444;
  }

  .passive-card-wrapper.dark-mode .progress-bar-fill {
    background: #f87171;
  }
</style>
