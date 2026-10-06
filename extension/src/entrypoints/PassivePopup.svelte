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
    positionSide?: "left" | "right";
    sideOffset?: number;
    bottomOffset?: number;
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

  let customSide = $state<"left" | "right" | null>(null);
  let customSideOffset = $state<number | null>(null);
  let customBottomOffset = $state<number | null>(null);

  let positionSide = $derived<"left" | "right">(customSide ?? payload.positionSide ?? "right");
  let sideOffset = $derived<number>(customSideOffset ?? payload.sideOffset ?? 10);
  let bottomOffset = $derived<number>(customBottomOffset ?? payload.bottomOffset ?? 10);

  let totalDurationMs = $state(20000);
  let remainingMs = $state(20000);
  let isPaused = $state(false);
  let isSnoozeOpen = $state(false);
  let darkMode = $state(false);
  let mascotNormalSrc = $state(
    typeof browser !== "undefined" && browser.runtime?.getURL
      ? browser.runtime.getURL("/icon/mascot.webp")
      : "https://i.ibb.co/WWn5BGrV/Gemini-Generated-Image-p6r6kxp6r6kxp6r6.webp"
  );
  let mascotCrySrc = $state(
    typeof browser !== "undefined" && browser.runtime?.getURL
      ? browser.runtime.getURL("/icon/mascot-cry.webp")
      : ""
  );
  let mascotHappySrc = $state(
    typeof browser !== "undefined" && browser.runtime?.getURL
      ? browser.runtime.getURL("/icon/mascot-happy.webp")
      : ""
  );

  // Trạng thái câu hỏi trắc nghiệm
  let hasAnswered = $state(false);
  let selectedAnswerIndex = $state<number | null>(null);
  let isUserCorrect = $state<boolean | null>(null);
  let storedQuizRate = $state("");
  let feedbackMessage = $state("");
  let currentAccuracy = $state<number | null>(null);

  const feedbackMessages: Record<string, { c: string[]; w: string[] }> = {
  "95-100": {
    c: ["Đỉnh vl!", "Chuẩn bài luôn!", "Vl đẳng cấp!"],
    w: ["Ơ hay sai à?", "Sơ suất vl!", "Tí nữa thì perfecto!"]
  },
  "90-94": {
    c: ["Quá đỉnh!", "Bay vl!", "Xuất sắc thật!"],
    w: ["Sai rồi à?", "Hơi phí!", "Gần lắm rồi còn sai!"]
  },
  "85-89": {
    c: ["Đỉnh thật!", "Chuẩn luôn!", "Ổn áp vl!"],
    w: ["Ơ kìa!", "Sơ suất rồi!", "Hơi tiếc!"]
  },
  "80-84": {
    c: ["Tốt vl!", "Đúng bài!", "Chuẩn không cần chỉnh!"],
    w: ["Sai mất tiêu!", "Hơi ẩu!", "Cẩn thận tí đi!"]
  },
  "75-79": {
    c: ["Được đấy!", "Ổn áp!", "Đúng rồi đó!"],
    w: ["Sai rồi!", "Hơi chủ quan!", "Chú ý hơn đi!"]
  },
  "70-74": {
    c: ["Đúng!", "Ổn!", "Được luôn!"],
    w: ["Sai cmnr!", "Hơi lơ!", "Cẩn thận nào!"]
  },
  "65-69": {
    c: ["Đúng rồi!", "Ổn đấy!", "Được!"],
    w: ["Sai rồi!", "Hơi yếu!", "Chú ý đi!"]
  },
  "60-64": {
    c: ["Đúng!", "Ổn!", "Giữ phong độ nha!"],
    w: ["Sai!", "Hơi ẩu đấy!", "Cẩn thận hơn!"]
  },
  "55-59": {
    c: ["Đúng rồi!", "Ổn!", "Được!"],
    w: ["Sai rồi!", "Hơi đuối!", "Chú ý nào!"]
  },
  "50-54": {
    c: ["Đúng!", "Được, cố lên!", "Được đấy!"],
    w: ["Sai!", "Hơi kém!", "Cẩn thận đi!"]
  },
  "45-49": {
    c: ["Đúng rồi!", "Ồ đúng!", "Được!"],
    w: ["Sai rồi!", "Yếu rồi đó!", "Chú ý hơn!"]
  },
  "40-44": {
    c: ["Đúng!", "Đúng à?", "Được rồi!"],
    w: ["Sai vl!", "Yếu thật!", "Học gì vậy má?"]
  },
  "35-39": {
    c: ["Ồ đúng luôn!", "Đúng à?", "Bất ngờ!"],
    w: ["Sai nhiều quá!", "Yếu vl!", "Học hành kiểu gì vậy?"]
  },
  "30-34": {
    c: ["Ồ đúng!", "Đúng luôn à?", "Hay đấy!"],
    w: ["Sai nhiều quá má!", "Yếu quá!", "Có học không vậy má?"]
  },
  "25-29": {
    c: ["Ồ đúng luôn!", "Học hay khoanh bừa vậy?", "Bất ngờ thật!"],
    w: ["Sai quá trời!", "Yếu vl thật!", "Học gì vậy má?"]
  },
  "20-24": {
    c: ["Ồ đúng!", "Đúng luôn?", "Có chút hi vọng rồi"],
    w: ["Sai quá nhiều!", "Học chăm chỉ vào má ơi!", "Có làm đc không má?"]
  },
  "15-19": {
    c: ["Ồ đúng luôn!", "Đúng thật luôn?", "Bất ngờ!"],
    w: ["Sai quá trời sai!", "Yếu vl!", "Học hành ra sao vậy má?"]
  },
  "10-14": {
    c: ["Ồ đúng!", "Đúng luôn à?", "Hay đấy!"],
    w: ["Bruh...", "Có học không vậy?", "Dude..."]
  },
  "5-9": {
    c: ["Ồ đúng luôn!", "Chắc khoanh bừa rồi", "Bất ngờ thật!"],
    w: ["Lại sai!", "Có nghiêm túc học không má?", "Wtf?"]
  },
  "0-4": {
    c: ["Ồ đúng luôn!", "Tầm này chắc bừa?", "Bất ngờ!"],
    w: ["Dude...", "Hết cứu rồi", "?????"]
  }
};
  function getFeedbackKey(rate: number): string {
    const clamped = Math.max(0, Math.min(100, rate));
    if (clamped >= 95) return "95-100";
    const lower = Math.floor(clamped / 5) * 5;
    const upper = lower + 4;
    return `${lower}-${upper}`;
  }

  function getRandomFeedbackMessage(rate: number, isCorrect: boolean): string {
    const key = getFeedbackKey(rate);
    const bucket = feedbackMessages[key] || feedbackMessages["50-54"];
    const list = isCorrect ? bucket.c : bucket.w;
    const randomIndex = Math.floor(Math.random() * list.length);
    return list[randomIndex] || (isCorrect ? "Chính xác!" : "Sai rồi!");
  }

  function handleSelectAnswer(opt: QuizOption, index: number) {
    if (hasAnswered) return;
    hasAnswered = true;
    selectedAnswerIndex = index;
    isUserCorrect = opt.isCorrect;

    // Khi đã hiện đáp án: reset lại thời gian hiển thị đầy đủ
    // Cho tối thiểu 20 giây để người dùng kịp đọc kết quả, phản hồi và thông tin Kanji gốc
    const revealDurationSec = Math.max(Math.round(totalDurationMs / 1000), 20);
    totalDurationMs = revealDurationSec * 1000;
    remainingMs = totalDurationMs;

    // Reset lại bộ đếm interval hiển thị từ đầu
    if (intervalTimer) {
      clearInterval(intervalTimer);
      intervalTimer = null;
    }
    const TICK_INTERVAL = 100;
    intervalTimer = setInterval(() => {
      if (!isPaused && !isSnoozeOpen) {
        remainingMs -= TICK_INTERVAL;
        if (remainingMs <= 0) {
          clearInterval(intervalTimer!);
          intervalTimer = null;
          onClose();
        }
      }
    }, TICK_INTERVAL);

    // Cập nhật chuỗi kết quả (c: đúng, w: sai) và lưu tối đa 100 lần gần nhất
    const newChar = opt.isCorrect ? "c" : "w";
    const nextHistory = (storedQuizRate + newChar).slice(-100);
    storedQuizRate = nextHistory;

    const total = nextHistory.length;
    const cCount = (nextHistory.match(/c/g) || []).length;
    const rate = total > 0 ? Math.round((cCount / total) * 100) : (opt.isCorrect ? 100 : 0);
    currentAccuracy = rate;
    feedbackMessage = getRandomFeedbackMessage(rate, opt.isCorrect);

    void storage.setItem("local:passiveQuizRate", nextHistory).catch((err) => {
      console.error("Failed to save passive quiz rate:", err);
    });

    // Cập nhật danh sách chữ hay làm sai (weakKanji)
    const targetKanji = payload.quiz?.questionKanji || payload.kanji;
    if (targetKanji) {
      void (async () => {
        try {
          const currentWeak =
            (await storage.getItem<string>("local:passiveWeakKanji")) || "";
          if (!opt.isCorrect) {
            // Trả lời SAI -> Đưa chữ này lên đầu danh sách ôn tập (tối đa 40 chữ)
            const nextWeak = (
              targetKanji + currentWeak.replace(targetKanji, "")
            ).slice(0, 40);
            await storage.setItem("local:passiveWeakKanji", nextWeak);
          } else if (currentWeak.includes(targetKanji)) {
            // Trả lời ĐÚNG -> Gỡ chữ này khỏi danh sách yếu
            await storage.setItem(
              "local:passiveWeakKanji",
              currentWeak.replace(targetKanji, ""),
            );
          }
        } catch (err) {
          console.error("Failed to update weak kanji list:", err);
        }
      })();
    }

    // Báo background hoãn và đặt lại lịch chạy tiếp theo, không được nhảy câu khi đang đọc đáp án
    void browser.runtime?.sendMessage({ type: "RESET_PASSIVE_TIMER" }).catch(() => {});
  }

  let currentMascotSrc = $derived.by(() => {
    if (hasAnswered) {
      if (isUserCorrect === true && mascotHappySrc) {
        return mascotHappySrc;
      }
      if (isUserCorrect === false && mascotCrySrc) {
        return mascotCrySrc;
      }
    }
    return mascotNormalSrc;
  });

  let intervalTimer: ReturnType<typeof setInterval> | null = null;

  // Chu vi vòng tròn: 2 * PI * 11.5 ≈ 72.257
  const CIRCLE_CIRCUMFERENCE = 72.257;

  let progressPct = $derived(
    Math.max(0, Math.min(100, (remainingMs / totalDurationMs) * 100))
  );

  let strokeOffset = $derived(
    CIRCLE_CIRCUMFERENCE * (1 - progressPct / 100)
  );

  let isNextLoading = $state(false);

  async function handleNext() {
    if (isNextLoading) return;
    isNextLoading = true;
    try {
      if (typeof browser !== "undefined" && browser.runtime?.sendMessage) {
        await browser.runtime.sendMessage({
          type: "TRIGGER_TEST_PASSIVE_LEARN",
        });
      }
    } catch (e) {
      console.error("Failed to trigger next passive learn card:", e);
    } finally {
      setTimeout(() => {
        isNextLoading = false;
      }, 400);
    }
  }

  async function handleApplySnooze(
    amount: number,
    unit: "m" | "h" | "d" | "today"
  ) {
    let snoozeUntil = Date.now();
    if (unit === "m") {
      snoozeUntil += amount * 60 * 1000;
    } else if (unit === "h") {
      snoozeUntil += amount * 60 * 60 * 1000;
    } else if (unit === "d") {
      snoozeUntil += amount * 24 * 60 * 60 * 1000;
    } else if (unit === "today") {
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      snoozeUntil = endOfDay.getTime();
    }

    try {
      await storage.setItem("local:passiveLearnSnoozeUntil", snoozeUntil);
      if (typeof browser !== "undefined" && browser.runtime?.sendMessage) {
        await browser.runtime.sendMessage({
          type: "SET_PASSIVE_SNOOZE",
          snoozeUntil,
        });
      }
    } catch (e) {
      console.error("Failed to set passive snooze:", e);
    }
    onClose();
  }

  onMount(() => {
    try {
      mascotNormalSrc = browser.runtime.getURL("/icon/mascot.webp");
      mascotCrySrc = browser.runtime.getURL("/icon/mascot-cry.webp");
      mascotHappySrc = browser.runtime.getURL("/icon/mascot-happy.webp");
    } catch {
      // fallback to remote webp
    }

    void (async () => {
      try {
        darkMode = (await storage.getItem<boolean>("local:darkMode")) ?? false;
      } catch {
        darkMode = false;
      }

      try {
        const rawRate = await storage.getItem<string>("local:passiveQuizRate");
        if (typeof rawRate === "string") {
          storedQuizRate = rawRate.replace(/[^cw]/g, "");
        }
      } catch {
        storedQuizRate = "";
      }

      if (!payload.positionSide) {
        try {
          const s = await storage.getItem<"left" | "right">("local:passiveLearnPositionSide");
          if (s === "left" || s === "right") customSide = s;
        } catch {}
      }
      if (payload.sideOffset === undefined) {
        try {
          const o = await storage.getItem<number>("local:passiveLearnSideOffset");
          if (typeof o === "number" && !Number.isNaN(o)) customSideOffset = o;
        } catch {}
      }
      if (payload.bottomOffset === undefined) {
        try {
          const b = await storage.getItem<number>("local:passiveLearnBottomOffset");
          if (typeof b === "number" && !Number.isNaN(b)) customBottomOffset = b;
        } catch {}
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
        if (!isPaused && !isSnoozeOpen) {
          remainingMs -= TICK_INTERVAL;
          if (remainingMs <= 0) {
            clearInterval(intervalTimer!);
            onClose();
          }
        }
      }, TICK_INTERVAL);
    })();
  });

  onDestroy(() => {
    if (intervalTimer) clearInterval(intervalTimer);
    void browser.runtime?.sendMessage({ type: "PASSIVE_CARD_CLOSED" }).catch(() => {});
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="wrap"
  class:dark-mode={darkMode}
  class:pos-left={positionSide === "left"}
  class:pos-right={positionSide !== "left"}
  style="
    {positionSide === 'left' ? `left: ${sideOffset}px; right: auto;` : `right: ${sideOffset}px; left: auto;`}
    bottom: {bottomOffset}px;
  "
  onmouseenter={() => (isPaused = true)}
  onmouseleave={() => (isPaused = false)}
>
  <article class="card" class:has-snooze-open={isSnoozeOpen}>
    {#if isSnoozeOpen}
      <div class="snooze-overlay">
        <div class="snooze-header">
          <div class="snooze-title">
            <svg
              class="snooze-title-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="10" y1="15" x2="10" y2="9" />
              <line x1="14" y1="15" x2="14" y2="9" />
            </svg>
            <span>Tạm dừng ôn tập</span>
          </div>
          <button
            type="button"
            class="snooze-close-btn"
            onclick={() => (isSnoozeOpen = false)}
            aria-label="Đóng bảng tạm dừng"
            title="Quay lại"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="snooze-desc">Không nhắc nhở cho đến:</div>

        <div class="snooze-options-grid">
          <button
            type="button"
            class="snooze-opt-btn"
            onclick={() => handleApplySnooze(30, "m")}
          >
            <span>30 phút</span>
          </button>
          <button
            type="button"
            class="snooze-opt-btn"
            onclick={() => handleApplySnooze(1, "h")}
          >
            <span>1 giờ</span>
          </button>
          <button
            type="button"
            class="snooze-opt-btn"
            onclick={() => handleApplySnooze(6, "h")}
          >
            <span>6 giờ</span>
          </button>
          <button
            type="button"
            class="snooze-opt-btn"
            onclick={() => handleApplySnooze(12, "h")}
          >
            <span>12 giờ</span>
          </button>
          <button
            type="button"
            class="snooze-opt-btn"
            onclick={() => handleApplySnooze(1, "d")}
          >
            <span>1 ngày</span>
          </button>
          <button
            type="button"
            class="snooze-opt-btn snooze-opt-today"
            onclick={() => handleApplySnooze(0, "today")}
          >
            <span>Hết hôm nay</span>
          </button>
        </div>
      </div>
    {/if}

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
          {payload.mode === "quiz" ? "Jisho Go • Đố chút nào" : "Jisho Go • Ôn tập đi bạn ơi"}
        </span>
      </div>

      <div class="header-actions">
        <!-- Nút tạm dừng -->
        <button
          type="button"
          class="btn-snooze"
          class:btn-snooze-active={isSnoozeOpen}
          onclick={() => (isSnoozeOpen = !isSnoozeOpen)}
          aria-label="Tạm dừng hiển thị"
          title="Tạm dừng hiển thị"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="10" y1="15" x2="10" y2="9" />
            <line x1="14" y1="15" x2="14" y2="9" />
          </svg>
        </button>

        <!-- Nút sang câu tiếp theo -->
        <button
          type="button"
          class="btn-next"
          onclick={handleNext}
          disabled={isNextLoading}
          aria-label="Câu tiếp theo"
          title="Câu tiếp theo"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M5 12l14 0" />
            <path d="M13 18l6 -6" />
            <path d="M13 6l6 6" />
          </svg>
        </button>

        <!-- Nút tắt có vòng tròn đếm ngược bo quanh dấu X -->
        <button
          type="button"
          class="btn-close-circle"
          onclick={onClose}
          aria-label="Đóng"
          title="Đóng"
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
              style="stroke-dashoffset: {strokeOffset}; transition: {isPaused || isSnoozeOpen ? 'none' : 'stroke-dashoffset 0.1s linear'};"
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
                    <span class="opt-status-icon status-correct">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="opt-status-svg">
                        <path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" />
                      </svg>
                    </span>
                  {:else if selectedAnswerIndex === i}
                    <span class="opt-status-icon status-wrong">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="opt-status-svg">
                        <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                      </svg>
                    </span>
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
              <span class="result-icon">
                {#if isUserCorrect}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="result-status-svg">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clip-rule="evenodd" />
                  </svg>
                {:else}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="result-status-svg">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clip-rule="evenodd" />
                  </svg>
                {/if}
              </span>
              <span class="result-text">
                <strong>{feedbackMessage}</strong>
                {#if currentAccuracy !== null}
                  <span class="accuracy-tag">({currentAccuracy}%)</span>
                {/if}
              </span>
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
              <div class="example-title">Ví dụ ngẫu nhiên:</div>
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
          <img
            src={currentMascotSrc}
            alt="Onigiri Mascot"
            class:cry-shake={hasAnswered && isUserCorrect === false}
            class:happy-hop={hasAnswered && isUserCorrect === true}
            draggable="false"
          />
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

  .wrap.pos-left {
    right: auto;
    left: 24px;
  }

  /* Định vị đuôi và mascot cho vị trí bên phải (mặc định) */
  .wrap.pos-right .card {
    transform-origin: 240px bottom;
  }

  .wrap.pos-right .tail {
    left: 240px;
  }

  .wrap.pos-right .mascot {
    margin-left: auto;
    margin-right: 0;
  }

  /* Định vị đuôi và mascot cho vị trí bên trái */
  .wrap.pos-left .card {
    transform-origin: 58px bottom;
  }

  .wrap.pos-left .tail {
    left: 36px;
  }

  .wrap.pos-left .mascot {
    margin-left: 0;
    margin-right: auto;
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
    transform-origin: 240px bottom;
    will-change: transform, opacity;
    animation: card-pop 0.38s calc(var(--pop-time) * 0.48) cubic-bezier(0.2, 0.9, 0.3, 1.25) both;
  }

  .card.has-snooze-open {
    min-height: 200px;
  }

  @keyframes card-pop {
    0% {
      opacity: 0;
      transform: scale(0.35) translateY(20px);
    }
    60% {
      opacity: 1;
      transform: scale(1.03) translateY(-3px);
    }
    82% {
      transform: scale(0.985) translateY(1px);
    }
    100% {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
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
    overflow: visible;
    clip-path: inset(-200px -50px 0 -50px); /* chỉ clip mép dưới đáy màn hình, đỉnh đầu thoải mái bung cao */
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

  img.cry-shake {
    animation: cry-wobble 0.5s ease-in-out;
  }

  @keyframes cry-wobble {
    0%, 100% {
      transform: rotate(0deg);
    }
    15% {
      transform: rotate(-8deg) scale(0.96);
    }
    35% {
      transform: rotate(8deg) scale(1.02);
    }
    55% {
      transform: rotate(-6deg);
    }
    75% {
      transform: rotate(4deg);
    }
  }

  img.happy-hop {
    animation: happy-bounce 0.45s cubic-bezier(0.2, 0.8, 0.4, 1.3);
  }

  @keyframes happy-bounce {
    0%, 100% {
      transform: translateY(0) scale(1, 1);
    }
    30% {
      transform: translateY(-9px) scale(0.96, 1.07);
    }
    50% {
      transform: translateY(0) scale(1.05, 0.95);
    }
    70% {
      transform: translateY(-3px) scale(0.99, 1.02);
    }
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

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* Nút tạm dừng */
  .btn-snooze {
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
    color: #607d8b;
    outline: none;
    transition: transform 0.15s ease, background-color 0.15s ease, color 0.15s ease;
  }

  .btn-snooze:hover {
    transform: scale(1.12);
    color: #374151;
    background: rgba(0, 0, 0, 0.05);
  }

  .btn-snooze:active {
    transform: scale(0.95);
  }

  .btn-snooze svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
  }

  .btn-snooze-active {
    color: #ef4444 !important;
    background: rgba(239, 68, 68, 0.1) !important;
  }

  .wrap.dark-mode .btn-snooze {
    color: #90a4ae;
  }

  .wrap.dark-mode .btn-snooze:hover {
    color: #f3f4f6;
    background: rgba(255, 255, 255, 0.08);
  }

  .wrap.dark-mode .btn-snooze-active {
    color: #f87171 !important;
    background: rgba(248, 113, 113, 0.15) !important;
  }

  /* Overlay tạm dừng bao quanh bên trong popup */
  .snooze-overlay {
    position: absolute;
    inset: 0;
    z-index: 40;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(8px);
    border-radius: 17px;
    padding: 13px 14px 12px 14px;
    display: flex;
    flex-direction: column;
    animation: snooze-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1) both;
    box-sizing: border-box;
  }

  .wrap.dark-mode .snooze-overlay {
    background: rgba(24, 24, 27, 0.98);
  }

  @keyframes snooze-pop {
    from {
      opacity: 0;
      transform: scale(0.96);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .snooze-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 2px;
  }

  .snooze-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    color: #111827;
  }

  .wrap.dark-mode .snooze-title {
    color: #f4f4f5;
  }

  .snooze-title-icon {
    width: 16px;
    height: 16px;
    color: #ef4444;
  }

  .wrap.dark-mode .snooze-title-icon {
    color: #f87171;
  }

  .snooze-close-btn {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 50%;
    color: #6b7280;
    cursor: pointer;
    padding: 0;
    transition: all 0.15s ease;
  }

  .snooze-close-btn:hover {
    background: rgba(0, 0, 0, 0.06);
    color: #111827;
  }

  .wrap.dark-mode .snooze-close-btn {
    color: #9ca3af;
  }

  .wrap.dark-mode .snooze-close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #f3f4f6;
  }

  .snooze-close-btn svg {
    width: 13px;
    height: 13px;
  }

  .snooze-desc {
    font-size: 11px;
    color: #6b7280;
    margin-bottom: 9px;
    font-weight: 500;
  }

  .wrap.dark-mode .snooze-desc {
    color: #a1a1aa;
  }

  .snooze-options-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
    flex: 1;
  }

  .snooze-opt-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 6px;
    border: 1.5px solid #e5e7eb;
    border-radius: 9px;
    background: #f9fafb;
    color: #1f2937;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    outline: none;
    user-select: none;
  }

  .snooze-opt-btn:hover {
    border-color: #f87171;
    background: #fff1f2;
    color: #dc2626;
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(239, 68, 68, 0.12);
  }

  .snooze-opt-btn:active {
    transform: scale(0.97);
  }

  .wrap.dark-mode .snooze-opt-btn {
    background: #27272a;
    border-color: #3f3f46;
    color: #f4f4f5;
  }

  .wrap.dark-mode .snooze-opt-btn:hover {
    border-color: #f87171;
    background: #381a1c;
    color: #fca5a5;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .snooze-opt-today {
    font-weight: 700;
  }

  /* Nút sang câu tiếp theo */
  .btn-next {
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
    color: #607d8b;
    outline: none;
    transition: transform 0.15s ease, background-color 0.15s ease, color 0.15s ease;
  }

  .btn-next:hover:not(:disabled) {
    transform: scale(1.12);
    color: #374151;
    background: rgba(0, 0, 0, 0.05);
  }

  .btn-next:active:not(:disabled) {
    transform: scale(0.95);
  }

  .btn-next:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-next svg {
    width: 17px;
    height: 17px;
    stroke: currentColor;
    transition: transform 0.15s ease;
  }

  .btn-next:hover:not(:disabled) svg {
    transform: translateX(1.5px);
  }

  .wrap.dark-mode .btn-next {
    color: #90a4ae;
  }

  .wrap.dark-mode .btn-next:hover:not(:disabled) {
    color: #f3f4f6;
    background: rgba(255, 255, 255, 0.08);
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .opt-status-svg {
    width: 13px;
    height: 13px;
  }

  .status-correct {
    color: #16a34a;
  }

  .status-wrong {
    color: #dc2626;
  }

  .result-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .result-status-svg {
    width: 15px;
    height: 15px;
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

  .accuracy-tag {
    font-size: 10px;
    font-weight: 700;
    opacity: 0.85;
    margin-left: 5px;
    display: inline-block;
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
    .card,
    .mascot__bob,
    .mascot__sway {
      animation: none;
    }
    .card,
    .mascot__pop,
    .tail {
      animation-duration: 0.01s;
      animation-delay: 0s;
    }
  }
</style>
