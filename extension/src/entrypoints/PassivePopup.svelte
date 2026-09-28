<!--
  PassivePopup.svelte
  Card = speech bubble (thẻ học Kanji).
  Mascot Onigiri đứng BÊN DƯỚI bubble, đuôi bubble chỉ xuống đầu mascot
  → nhìn như con Onigiri đang nói nội dung trong card.
  Mascot chui lên từ mép dưới màn hình với stack animation pure CSS (jelly pop, bob, sway, hover wiggle).
  Nút tắt có vòng tròn đếm ngược (countdown circle timer) bo quanh dấu X.
-->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { storage } from "#imports";

  export type QuizOption = {
    kanji: string;
    hanViet: string;
    isCorrect: boolean;
  };

  export type PassiveLearnPayload = {
    mode?: "flashcard" | "quiz";
    kanji: string;
    hanViet: string;
    on?: string;
    kun?: string;
    level?: string;
    example?: { w: string; p: string; m: string } | null;
    displaySeconds?: number;
    quiz?: {
      questionKanji: string;
      options: QuizOption[];
    };
  };

  interface Props {
    payload: PassiveLearnPayload;
    onClose: () => void;
  }

  let { payload, onClose }: Props = $props();

  let totalDurationMs = $state(20000);
  let remainingMs = $state(20000);
  let isPaused = $state(false);
  let darkMode = $state(false);
  let mascotSrc = $state("https://i.ibb.co/WWn5BGrV/Gemini-Generated-Image-p6r6kxp6r6kxp6r6.webp");
  let intervalTimer: ReturnType<typeof setInterval> | null = null;

  // Trạng thái câu hỏi trắc nghiệm
  let hasAnswered = $state(false);
  let selectedAnswerIndex = $state<number | null>(null);
  let isUserCorrect = $state<boolean | null>(null);

  function handleSelectAnswer(opt: QuizOption, index: number) {
    if (hasAnswered) return;
    hasAnswered = true;
    selectedAnswerIndex = index;
    isUserCorrect = opt.isCorrect;

    // Reset lại thời gian hiển thị để người dùng có đủ thời gian đọc kết quả và giải thích
    remainingMs = totalDurationMs;
  }

  // Chu vi vòng tròn: 2 * PI * 11.5 ≈ 72.257
  const CIRCLE_CIRCUMFERENCE = 72.257;

  let progressPct = $derived(
    Math.max(0, Math.min(100, (remainingMs / totalDurationMs) * 100))
  );

  let strokeOffset = $derived(
    CIRCLE_CIRCUMFERENCE * (1 - progressPct / 100)
  );

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (payload.mode === "quiz" && payload.quiz && !hasAnswered) {
      if (["1", "2", "3", "4"].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (idx >= 0 && idx < payload.quiz.options.length) {
          handleSelectAnswer(payload.quiz.options[idx], idx);
        }
      }
    }
  }

  onMount(() => {
    try {
      mascotSrc = browser.runtime.getURL("/icon/mascot.webp");
    } catch {
      // fallback to remote webp
    }

    void (async () => {
      try {
        darkMode = (await storage.getItem<boolean>("local:darkMode")) ?? false;
      } catch {
        darkMode = false;
      }

      let durSec = payload.displaySeconds;
      if (!durSec) {
        try {
          durSec = (await storage.getItem<number>("local:passiveLearnDisplaySeconds")) || 20;
        } catch {
          durSec = 20;
        }
      }
      totalDurationMs = Math.max(10, durSec) * 1000;
      remainingMs = totalDurationMs;

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
    })();

    window.addEventListener("keydown", handleKeydown);
  });

  onDestroy(() => {
    if (intervalTimer) clearInterval(intervalTimer);
    window.removeEventListener("keydown", handleKeydown);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="wrap"
  class:dark-mode={darkMode}
  onmouseenter={() => (isPaused = true)}
  onmouseleave={() => (isPaused = false)}
>
  <article class="card">
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
        <span>
          {payload.mode === "quiz" ? "Jisho Go • Trắc nghiệm Kanji" : "Jisho Go • Ôn tập"}
        </span>
      </div>

      <!-- Nút tắt có vòng tròn đếm ngược bo quanh dấu X -->
      <button
        type="button"
        class="btn-close-circle"
        onclick={onClose}
        aria-label="Đóng (Esc)"
        title="Đóng (Esc)"
      >
        <svg class="countdown-svg" viewBox="0 0 28 28" aria-hidden="true">
          <circle
            class="circle-bg"
            cx="14"
            cy="14"
            r="11.5"
          />
          <circle
            class="circle-progress"
            cx="14"
            cy="14"
            r="11.5"
            style="stroke-dashoffset: {strokeOffset}; transition: {isPaused ? 'none' : 'stroke-dashoffset 0.1s linear'};"
          />
        </svg>
        <svg
          class="x-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.3"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="passive-body">
      {#if payload.mode === "quiz" && payload.quiz}
        <!-- Chế độ trắc nghiệm -->
        <div class="quiz-section">
          <div class="quiz-question-prompt">
            <span class="quiz-prompt-badge">Đố vui</span>
            <span class="quiz-prompt-text">Chữ Kanji này có âm Hán-Việt là gì?</span>
          </div>

          <div class="quiz-kanji-display">
            {payload.quiz.questionKanji || payload.kanji}
          </div>

          <!-- 4 Đáp án trắc nghiệm (2x2 grid) -->
          <div class="quiz-options-grid">
            {#each payload.quiz.options as opt, i}
              <button
                type="button"
                class="quiz-opt-btn"
                class:opt-correct={hasAnswered && opt.isCorrect}
                class:opt-wrong={hasAnswered && !opt.isCorrect}
                class:opt-user-picked={hasAnswered && selectedAnswerIndex === i}
                disabled={hasAnswered}
                onclick={() => handleSelectAnswer(opt, i)}
              >
                <!-- Khi đã trả lời: hiển thị kanji gốc của âm đó -->
                {#if hasAnswered}
                  <span
                    class="opt-kanji-root"
                    class:root-correct={opt.isCorrect}
                    class:root-wrong={!opt.isCorrect}
                  >
                    {opt.kanji}
                  </span>
                {/if}

                <span class="opt-hanviet-text">{opt.hanViet}</span>

                {#if hasAnswered}
                  {#if opt.isCorrect}
                    <span class="opt-status-icon status-correct">✓</span>
                  {:else if selectedAnswerIndex === i}
                    <span class="opt-status-icon status-wrong">✗</span>
                  {/if}
                {/if}
              </button>
            {/each}
          </div>

          <!-- Banner kết quả -->
          {#if hasAnswered}
            <div
              class="quiz-result-banner"
              class:result-correct={isUserCorrect}
              class:result-wrong={!isUserCorrect}
            >
              {#if isUserCorrect}
                <span class="result-icon">🎉</span>
                <span><strong>Chính xác!</strong> Bạn nhớ rất chuẩn!</span>
              {:else}
                <span class="result-icon">💡</span>
                <span>Chưa đúng rồi! Đáp án là <strong>{payload.hanViet}</strong></span>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Thông tin chi tiết Kanji (luôn hiện ở flashcard, hiện bên dưới khi đã trả lời trắc nghiệm) -->
      {#if payload.mode !== "quiz" || hasAnswered}
        <div class="details-section" class:details-quiz-revealed={payload.mode === "quiz"}>
          {#if payload.mode === "quiz"}
            <div class="details-divider">
              <span>Thông tin chi tiết</span>
            </div>
          {/if}

          <div class="kanji-main-row" class:quiz-sub-row={payload.mode === "quiz"}>
            {#if payload.mode !== "quiz"}
              <div class="kanji-glyph">{payload.kanji}</div>
            {/if}
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
      {/if}
    </div>

    <!-- Đuôi bubble chỉ XUỐNG mascot. Đáy svg đè lên border dưới của card -->
    <svg class="tail" viewBox="0 0 44 32" aria-hidden="true">
      <path class="tail-fill" d="M12 0 L12 4 Q14 20 22 30 Q26 16 32 4 L32 0 Z" fill="#fff" />
      <path
        class="tail-stroke"
        d="M12 4 Q14 20 22 30 Q26 16 32 4"
        fill="none"
        stroke="#e5e7eb"
        stroke-width="1.5"
        stroke-linejoin="round"
      />
    </svg>
  </article>

  <div class="mascot" aria-hidden="true">
    <div class="mascot__pop">
      <div class="mascot__bob">
        <div class="mascot__sway">
          <img src={mascotSrc} alt="Onigiri Mascot" draggable="false" />
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  /* ============================================================
     TUNING KNOBS – biến cấu hình mascot & card
     ============================================================ */
  .wrap {
    --mascot-size: 76px;     /* chiều rộng mascot */
    --pop-time: 0.95s;       /* thời gian entrance */
    --bounce-height: 7px;    /* độ cao mỗi cú nhún idle */
    --idle-speed: 2.4s;      /* 1 chu kỳ nhún (lớn hơn = chậm hơn) */
    --sway-speed: 4.8s;      /* 1 chu kỳ nghiêng trái→phải→trái */
    --sway-angle: 4deg;      /* góc nghiêng (3–5deg) */
    --idle-delay: 1.1s;      /* chờ entrance xong mới idle */

    position: fixed;
    right: 24px;
    bottom: 0;               /* mascot đứng sát đáy màn hình */
    width: 320px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    z-index: 2147483646;
    pointer-events: none;    /* để không chặn click ngoài card */
    box-sizing: border-box;
  }

  .card {
    position: relative;
    padding: 0;
    background: #ffffff;
    color: #111827;
    border: 1.5px solid #e5e7eb;
    border-radius: 18px;
    box-shadow:
      0 10px 25px -5px rgba(0, 0, 0, 0.08),
      0 8px 10px -6px rgba(0, 0, 0, 0.04);
    pointer-events: auto;
    box-sizing: border-box;
    overflow: visible;
  }

  .wrap.dark-mode .card {
    background: #18181b;
    color: #f4f4f5;
    border-color: #374151;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
  }

  /* ============================================================
     TAIL – đuôi bubble chỉ XUỐNG mascot
     ============================================================ */
  .tail {
    position: absolute;
    left: 240px;
    top: calc(100% - 1.5px); /* đè border dưới 1.5px của card */
    width: 44px;
    height: 32px;
    transform-origin: 50% 0; /* neo ở chân đuôi (sát card) */
    will-change: transform, opacity;
    animation: tail-pop 0.35s calc(var(--pop-time) * 0.55) both;
    pointer-events: none;
    z-index: 10;
  }

  .tail-fill {
    fill: #ffffff;
  }

  .tail-stroke {
    stroke: #e5e7eb;
    stroke-width: 1.5;
  }

  .wrap.dark-mode .tail-fill {
    fill: #18181b;
  }

  .wrap.dark-mode .tail-stroke {
    stroke: #374151;
  }

  @keyframes tail-pop {
    0% {
      opacity: 0;
      transform: scale(0.3);
      animation-timing-function: cubic-bezier(0.3, 1.6, 0.5, 1);
    }
    65% {
      opacity: 1;
      transform: scale(1.1, 1.18);
    }
    100% {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* ============================================================
     CLIP BOX MASCOT
     ============================================================ */
  .mascot {
    margin-top: 10px;
    margin-left: auto;       /* đẩy mascot sang bên phải card */
    width: calc(var(--mascot-size) + 40px);
    height: calc(var(--mascot-size) + 20px);
    padding: 0 20px;
    box-sizing: border-box;
    display: flex;
    align-items: flex-end;   /* chân mascot = đáy màn hình */
    justify-content: center;
    overflow: hidden;
    pointer-events: none;
  }

  .mascot__pop,
  .mascot__bob,
  .mascot__sway {
    transform-origin: bottom center; /* squash/tilt neo vào chân mascot */
    will-change: transform;
  }

  .mascot__sway {
    pointer-events: auto;    /* để hover được vào mascot */
  }

  img {
    display: block;
    width: var(--mascot-size);
    height: auto;
    user-select: none;
    transform-origin: bottom center;
    will-change: transform;
  }

  /* 1. ENTRANCE */
  .mascot__pop {
    animation: pop var(--pop-time) both;
  }

  @keyframes pop {
    0% {
      transform: translateY(105%) scale(0.85, 1.1);
      animation-timing-function: cubic-bezier(0.2, 0.9, 0.3, 1.2);
    }
    35% {
      transform: translateY(-16%) scale(0.88, 1.2);
      animation-timing-function: cubic-bezier(0.5, 0, 0.9, 0.6);
    }
    52% {
      transform: translateY(0) scale(1.18, 0.78);
      animation-timing-function: cubic-bezier(0.2, 0.8, 0.3, 1);
    }
    68% {
      transform: translateY(-6%) scale(0.96, 1.07);
      animation-timing-function: cubic-bezier(0.5, 0, 0.9, 0.6);
    }
    82% {
      transform: translateY(0) scale(1.05, 0.95);
      animation-timing-function: ease-out;
    }
    100% {
      transform: translateY(0) scale(1, 1);
    }
  }

  /* 2a. IDLE BOB */
  .mascot__bob {
    animation: bob var(--idle-speed) var(--idle-delay) infinite;
  }

  @keyframes bob {
    0%, 100% { transform: translateY(0) scale(1, 1); }
    55% {
      transform: translateY(0) scale(1, 1);
      animation-timing-function: ease-out;
    }
    63% {
      transform: translateY(0) scale(1.06, 0.93);
      animation-timing-function: cubic-bezier(0.2, 0.7, 0.4, 1);
    }
    74% {
      transform: translateY(calc(var(--bounce-height) * -1)) scale(0.96, 1.05);
      animation-timing-function: cubic-bezier(0.6, 0, 0.9, 0.6);
    }
    84% {
      transform: translateY(0) scale(1.07, 0.92);
      animation-timing-function: ease-out;
    }
    92% {
      transform: translateY(0) scale(0.99, 1.02);
    }
  }

  /* 2b. IDLE SWAY */
  .mascot__sway {
    animation: sway var(--sway-speed) var(--idle-delay) ease-in-out infinite;
  }

  @keyframes sway {
    0%, 100% { transform: rotate(0deg); }
    25%      { transform: rotate(calc(var(--sway-angle) * -1)); }
    75%      { transform: rotate(var(--sway-angle)); }
  }

  /* 3. HOVER WIGGLE */
  .wrap:hover img {
    animation: wiggle 0.7s ease-in-out 2;
  }

  @keyframes wiggle {
    0%   { transform: translateY(0) scale(1, 1) rotate(0deg); }
    15%  { transform: translateY(0) scale(1.14, 0.84) rotate(0deg); }
    35%  { transform: translateY(-14%) scale(0.92, 1.13) rotate(-7deg); }
    50%  { transform: translateY(0) scale(1.08, 0.92) rotate(6deg); }
    65%  { transform: translateY(-8%) scale(0.96, 1.06) rotate(-5deg); }
    80%  { transform: translateY(0) scale(1.03, 0.97) rotate(4deg); }
    100% { transform: translateY(0) scale(1, 1) rotate(0deg); }
  }

  /* ============================================================
     NỘI DUNG CARD CHI TIẾT
     ============================================================ */
  .passive-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px 6px 14px;
  }

  .brand-tag {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 700;
    color: #ef4444;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .wrap.dark-mode .brand-tag {
    color: #f87171;
  }

  .bell-icon {
    width: 14px;
    height: 14px;
    stroke: currentColor;
  }

  /* ============================================================
     NÚT TẮT VÒNG TRÒN PROGRESS
     ============================================================ */
  .btn-close-circle {
    position: relative;
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
    border-radius: 50%;
    outline: none;
    transition: transform 0.15s ease;
  }

  .btn-close-circle:hover {
    transform: scale(1.12);
  }

  .countdown-svg {
    position: absolute;
    top: 0;
    left: 0;
    width: 26px;
    height: 26px;
    transform: rotate(-90deg); /* Bắt đầu chạy từ vị trí 12h */
  }

  .circle-bg {
    fill: none;
    stroke: rgba(0, 0, 0, 0.07);
    stroke-width: 2.2;
  }

  .wrap.dark-mode .circle-bg {
    stroke: rgba(255, 255, 255, 0.1);
  }

  .circle-progress {
    fill: none;
    stroke: #ef4444;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-dasharray: 72.257; /* 2 * PI * 11.5 */
  }

  .wrap.dark-mode .circle-progress {
    stroke: #f87171;
  }

  .x-icon {
    width: 11px;
    height: 11px;
    color: #6b7280;
    position: relative;
    z-index: 2;
    transition: color 0.15s ease;
  }

  .btn-close-circle:hover .x-icon {
    color: #ef4444;
  }

  .wrap.dark-mode .x-icon {
    color: #9ca3af;
  }

  .wrap.dark-mode .btn-close-circle:hover .x-icon {
    color: #f87171;
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

  .wrap.dark-mode .kanji-glyph {
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

  .wrap.dark-mode .hanviet {
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

  .wrap.dark-mode .level-badge {
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

  .wrap.dark-mode .reading-row {
    color: #a1a1aa;
  }

  .reading-label {
    font-weight: 600;
    color: #6b7280;
    margin-right: 4px;
  }

  .wrap.dark-mode .reading-label {
    color: #71717a;
  }

  .example-box {
    background: #f9fafb;
    border-radius: 10px;
    padding: 8px 10px;
    font-size: 12px;
    border: 1px solid #f3f4f6;
  }

  .wrap.dark-mode .example-box {
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

  .wrap.dark-mode .example-word {
    color: #f4f4f5;
  }

  .example-reading {
    color: #6b7280;
    margin-left: 2px;
  }

  .wrap.dark-mode .example-reading {
    color: #a1a1aa;
  }

  .example-meaning {
    color: #374151;
    margin-left: 4px;
  }

  .wrap.dark-mode .example-meaning {
    color: #d4d4d8;
  }

  /* ============================================================
     QUIZ MODE STYLES
     ============================================================ */
  .quiz-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 6px;
  }

  .quiz-question-prompt {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: #4b5563;
  }

  .wrap.dark-mode .quiz-question-prompt {
    color: #9ca3af;
  }

  .quiz-prompt-badge {
    background: #fee2e2;
    color: #dc2626;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .wrap.dark-mode .quiz-prompt-badge {
    background: #450a0a;
    color: #fca5a5;
    border: 1px solid #7f1d1d;
  }

  .quiz-prompt-text {
    font-weight: 600;
    line-height: 1.3;
  }

  .quiz-kanji-display {
    font-size: 2.5rem;
    line-height: 1;
    font-weight: 800;
    font-family: "Noto Sans JP", sans-serif;
    text-align: center;
    color: #111827;
    padding: 2px 0;
  }

  .wrap.dark-mode .quiz-kanji-display {
    color: #f9fafb;
  }

  .quiz-options-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin: 3px 0 2px;
  }

  .quiz-opt-btn {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 5px 4px;
    min-height: 42px;
    border: 1.5px solid #e5e7eb;
    border-radius: 8px;
    background: #f9fafb;
    color: #111827;
    cursor: pointer;
    transition: all 0.15s ease;
    outline: none;
    box-sizing: border-box;
  }

  .quiz-opt-btn:hover:enabled {
    border-color: #f87171;
    background: #fff1f2;
    transform: translateY(-1px);
  }

  .wrap.dark-mode .quiz-opt-btn {
    background: #27272a;
    border-color: #3f3f46;
    color: #f4f4f5;
  }

  .wrap.dark-mode .quiz-opt-btn:hover:enabled {
    border-color: #f87171;
    background: #381a1c;
  }

  .opt-hanviet-text {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-align: center;
  }

  .opt-kanji-root {
    display: inline-block;
    font-size: 11px;
    font-weight: 800;
    font-family: "Noto Sans JP", sans-serif;
    margin-bottom: 2px;
  }

  .root-correct {
    color: #16a34a !important;
  }

  .root-wrong {
    color: #dc2626 !important;
  }

  .quiz-opt-btn.opt-correct {
    background: #f0fdf4 !important;
    border-color: #22c55e !important;
    color: #15803d !important;
  }

  .wrap.dark-mode .quiz-opt-btn.opt-correct {
    background: #052e16 !important;
    border-color: #22c55e !important;
    color: #86efac !important;
  }

  .quiz-opt-btn.opt-wrong {
    background: #fef2f2 !important;
    border-color: #ef4444 !important;
    color: #b91c1c !important;
  }

  .wrap.dark-mode .quiz-opt-btn.opt-wrong {
    background: #450a0a !important;
    border-color: #ef4444 !important;
    color: #fca5a5 !important;
  }

  .quiz-opt-btn.opt-user-picked.opt-wrong {
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.4);
  }

  .opt-status-icon {
    position: absolute;
    top: 3px;
    right: 5px;
    font-size: 10px;
    font-weight: 900;
  }

  .status-correct {
    color: #16a34a;
  }

  .status-wrong {
    color: #dc2626;
  }

  .quiz-result-banner {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 7px;
    font-size: 11.5px;
    margin-top: 3px;
  }

  .result-correct {
    background: #ecfdf5;
    color: #065f46;
    border: 1px solid #a7f3d0;
  }

  .wrap.dark-mode .result-correct {
    background: #064e3b;
    color: #a7f3d0;
    border-color: #047857;
  }

  .result-wrong {
    background: #fff1f2;
    color: #9f1239;
    border: 1px solid #fecdd3;
  }

  .wrap.dark-mode .result-wrong {
    background: #4c1d1d;
    color: #fecdd3;
    border-color: #991b1b;
  }

  .details-divider {
    position: relative;
    text-align: center;
    margin: 8px 0 6px;
  }

  .details-divider::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 1px;
    background: #e5e7eb;
  }

  .wrap.dark-mode .details-divider::before {
    background: #374151;
  }

  .details-divider span {
    position: relative;
    padding: 0 8px;
    background: #ffffff;
    font-size: 10px;
    color: #6b7280;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .wrap.dark-mode .details-divider span {
    background: #18181b;
    color: #9ca3af;
  }

  .details-quiz-revealed {
    animation: fadeSlideDown 0.25s ease-out both;
  }

  @keyframes fadeSlideDown {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .quiz-sub-row {
    padding-top: 2px;
  }

  /* Accessibility: tắt loop nếu bật reduce motion */
  @media (prefers-reduced-motion: reduce) {
    .mascot__bob,
    .mascot__sway,
    .wrap:hover img {
      animation: none;
    }
    .mascot__pop,
    .tail {
      animation-duration: 0.01s;
      animation-delay: 0s;
    }
  }
</style>
