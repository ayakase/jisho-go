<script lang="ts">
  import { onMount } from "svelte";
  import { storage } from "#imports";
  import {
    getRecentKanji,
    getRecentKanjiLimit,
    setRecentKanjiLimit,
    removeRecentKanji,
    clearRecentKanji,
  } from "../../../lib/recent-kanji";

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  let recentKanjiStr = $state("");
  let recentLimit = $state(30);
  let recentList = $derived(Array.from(recentKanjiStr));
  let showClearConfirm = $state(false);
  let isClearing = $state(false);

  $effect(() => {
    if (!isOpen) {
      showClearConfirm = false;
    }
  });

  onMount(() => {
    void (async () => {
      recentKanjiStr = await getRecentKanji();
      recentLimit = await getRecentKanjiLimit();
    })();

    const unwatchKanji = storage.watch<string>("local:recentKanji", (val) => {
      recentKanjiStr = val || "";
    });

    const unwatchLimit = storage.watch<number>("local:recentKanjiLimit", (val) => {
      if (val) recentLimit = val;
    });

    return () => {
      unwatchKanji();
      unwatchLimit();
    };
  });

  async function handleDeleteOne(char: string) {
    const next = await removeRecentKanji(char);
    recentKanjiStr = next;
  }

  async function handleClearAll() {
    isClearing = true;
    try {
      await clearRecentKanji();
      recentKanjiStr = "";
    } finally {
      isClearing = false;
      showClearConfirm = false;
    }
  }

  async function handleLimitChange(e: Event) {
    const target = e.target as HTMLInputElement;
    let val = parseInt(target.value, 10);
    if (Number.isNaN(val)) val = 30;
    val = Math.max(10, Math.min(100, val));
    target.value = String(val);
    recentLimit = await setRecentKanjiLimit(val);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && isOpen) {
      if (showClearConfirm) {
        showClearConfirm = false;
        return;
      }
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <div
    class="history-backdrop"
    onclick={onClose}
    role="presentation"
  >
    <!-- Modal container -->
    <div
      class="history-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Lịch sử Kanji"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => {
        if (e.key === "Escape") {
          onClose();
        }
        e.stopPropagation();
      }}
    >
      <!-- Header -->
      <div class="history-modal-header">
        <div class="header-title-group">
          <svg
            class="header-history-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M10 20.777a8.942 8.942 0 0 1 -2.48 -.969" />
            <path d="M14 3.223a9.003 9.003 0 0 1 0 17.554" />
            <path d="M4.579 17.093a8.961 8.961 0 0 1 -1.227 -2.592" />
            <path d="M3.124 10.5c.16 -.95 .468 -1.85 .9 -2.675l.169 -.305" />
            <path d="M6.907 4.579a8.954 8.954 0 0 1 3.093 -1.356" />
            <path d="M12 8v4l3 3" />
          </svg>
          <span class="header-title">Lịch sử Kanji</span>
          <span class="count-badge">({recentList.length}/{recentLimit})</span>
        </div>

        <div class="header-actions">
          {#if recentList.length > 0}
            {#if showClearConfirm}
              <div class="clear-confirm-box">
                <span class="clear-confirm-text">Xác nhận xóa hết?</span>
                <div class="clear-confirm-btns">
                  <button
                    type="button"
                    class="clear-btn-confirm"
                    onclick={handleClearAll}
                    disabled={isClearing}
                  >
                    {isClearing ? "..." : "Đồng ý"}
                  </button>
                  <button
                    type="button"
                    class="clear-btn-cancel"
                    onclick={() => (showClearConfirm = false)}
                    disabled={isClearing}
                  >
                    Hủy
                  </button>
                </div>
              </div>
            {:else}
              <button
                type="button"
                class="clear-all-btn"
                onclick={() => (showClearConfirm = true)}
                title="Xóa toàn bộ lịch sử Kanji"
              >
                Xóa tất cả
              </button>
            {/if}
          {/if}
          <button
            type="button"
            class="close-modal-btn"
            onclick={onClose}
            aria-label="Đóng"
            title="Đóng (Esc)"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="history-modal-body">
        {#if recentList.length > 0}
          <div class="kanji-grid">
            {#each recentList as kanji (kanji)}
              <div class="kanji-card" title="Chữ {kanji}">
                <span class="kanji-char">{kanji}</span>
                <button
                  type="button"
                  class="card-delete-btn"
                  onclick={(e) => {
                    e.stopPropagation();
                    void handleDeleteOne(kanji);
                  }}
                  title="Xóa chữ {kanji} khỏi lịch sử"
                  aria-label="Xóa chữ {kanji}"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty-state">
            <div class="empty-icon">📖</div>
            <div class="empty-text">Chưa có chữ Kanji nào trong lịch sử</div>
            <div class="empty-sub">
              Các chữ Kanji tra cứu qua bôi đen, rê chuột hoặc quét ảnh OCR sẽ tự động lưu vào đây.
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="history-modal-footer">
        <div class="footer-limit-row">
          <label class="limit-label-group">
            <span class="limit-title">Số lượng lưu tối đa:</span>
            <div class="limit-input-wrapper">
              <input
                type="number"
                min="10"
                max="100"
                step="1"
                value={recentLimit}
                onchange={handleLimitChange}
                class="limit-input"
              />
              <span class="limit-unit">chữ</span>
            </div>
            <span class="limit-hint">(10 - 100)</span>
          </label>
        </div>
        <span class="footer-tip">
          💡 Rê chuột vào từng chữ và bấm nút đỏ để xóa nhanh khỏi danh sách.
        </span>
      </div>
    </div>
  </div>
{/if}

<style>
  .history-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background-color: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .history-modal {
    width: 100%;
    max-width: 480px;
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
    border: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: scaleUp 0.15s ease-out;
  }

  @keyframes scaleUp {
    from {
      transform: scale(0.96);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  :global(main.dark-mode) .history-modal {
    background: #1e293b;
    border-color: #334155;
    box-shadow: 0 25px 30px -5px rgba(0, 0, 0, 0.5);
  }

  .history-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1rem;
    border-bottom: 1px solid #f1f5f9;
  }

  :global(main.dark-mode) .history-modal-header {
    border-color: #334155;
  }

  .header-title-group {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .header-history-icon {
    width: 1.25rem;
    height: 1.25rem;
    color: #475569;
  }

  :global(main.dark-mode) .header-history-icon {
    color: #94a3b8;
  }

  .header-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: #0f172a;
  }

  :global(main.dark-mode) .header-title {
    color: #f8fafc;
  }

  .count-badge {
    font-size: 0.8rem;
    font-weight: 600;
    color: #64748b;
  }

  :global(main.dark-mode) .count-badge {
    color: #94a3b8;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .clear-all-btn {
    padding: 0.25rem 0.6rem;
    font-size: 0.76rem;
    font-weight: 600;
    color: #ef4444;
    background: transparent;
    border: 1px solid #fca5a5;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .clear-all-btn:hover {
    background: #fee2e2;
    color: #dc2626;
  }

  :global(main.dark-mode) .clear-all-btn {
    border-color: #7f1d1d;
    color: #f87171;
  }

  :global(main.dark-mode) .clear-all-btn:hover {
    background: #450a0a;
    color: #fca5a5;
  }

  .clear-confirm-box {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    animation: fadeIn 0.12s ease-out;
  }

  .clear-confirm-text {
    font-size: 0.76rem;
    font-weight: 600;
    color: #b91c1c;
    white-space: nowrap;
  }

  :global(main.dark-mode) .clear-confirm-text {
    color: #fca5a5;
  }

  .clear-confirm-btns {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }

  .clear-btn-confirm {
    padding: 0.22rem 0.55rem;
    font-size: 0.74rem;
    font-weight: 600;
    color: #ffffff;
    background-color: #dc2626;
    border: 1px solid #dc2626;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .clear-btn-confirm:hover {
    background-color: #b91c1c;
  }

  .clear-btn-cancel {
    padding: 0.22rem 0.55rem;
    font-size: 0.74rem;
    font-weight: 500;
    color: #4b5563;
    background-color: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .clear-btn-cancel:hover {
    background-color: #e5e7eb;
  }

  :global(main.dark-mode) .clear-btn-cancel {
    background-color: #334155;
    border-color: #475569;
    color: #e2e8f0;
  }

  :global(main.dark-mode) .clear-btn-cancel:hover {
    background-color: #475569;
  }

  .close-modal-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: #f1f5f9;
    color: #64748b;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .close-modal-btn:hover {
    background: #e2e8f0;
    color: #0f172a;
  }

  :global(main.dark-mode) .close-modal-btn {
    background: #334155;
    color: #cbd5e1;
  }

  :global(main.dark-mode) .close-modal-btn:hover {
    background: #475569;
    color: #ffffff;
  }

  .history-modal-body {
    padding: 1rem;
    max-height: 260px;
    overflow-y: auto;
  }

  .kanji-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
  }

  /* To hơn 1 chút: 42px x 42px thay vì 32px x 32px */
  .kanji-card {
    position: relative;
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    color: #0f172a;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    transition: all 0.15s ease;
    user-select: none;
  }

  .kanji-card:hover {
    border-color: #94a3b8;
    background: #f1f5f9;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.08);
  }

  :global(main.dark-mode) .kanji-card {
    background: #0f172a;
    border-color: #334155;
    color: #f8fafc;
  }

  :global(main.dark-mode) .kanji-card:hover {
    border-color: #475569;
    background: #1e293b;
  }

  .kanji-char {
    font-size: 1.25rem;
    font-weight: 700;
    font-family: "Noto Sans JP", sans-serif;
    line-height: 1;
  }

  /* Nút xóa hiện khi hover */
  .card-delete-btn {
    position: absolute;
    top: -5px;
    right: -5px;
    width: 17px;
    height: 17px;
    border-radius: 50%;
    background-color: #ef4444;
    color: #ffffff;
    border: 1.5px solid #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
    opacity: 0;
    transform: scale(0.7);
    pointer-events: none;
    transition: opacity 0.15s ease, transform 0.15s ease, background-color 0.15s ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    z-index: 2;
  }

  :global(main.dark-mode) .card-delete-btn {
    border-color: #1e293b;
  }

  .kanji-card:hover .card-delete-btn {
    opacity: 1;
    transform: scale(1);
    pointer-events: auto;
  }

  .card-delete-btn:hover {
    background-color: #dc2626;
    transform: scale(1.18);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1.5rem 1rem;
    text-align: center;
  }

  .empty-icon {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }

  .empty-text {
    font-size: 0.9rem;
    font-weight: 600;
    color: #475569;
    margin-bottom: 0.25rem;
  }

  :global(main.dark-mode) .empty-text {
    color: #cbd5e1;
  }

  .empty-sub {
    font-size: 0.78rem;
    color: #94a3b8;
    max-width: 320px;
    line-height: 1.4;
  }

  :global(main.dark-mode) .empty-sub {
    color: #64748b;
  }

  .history-modal-footer {
    padding: 0.65rem 1rem;
    background: #f8fafc;
    border-top: 1px solid #f1f5f9;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  :global(main.dark-mode) .history-modal-footer {
    background: #111827;
    border-color: #334155;
  }

  .footer-limit-row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .limit-label-group {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.82rem;
    color: #334155;
    cursor: pointer;
  }

  :global(main.dark-mode) .limit-label-group {
    color: #cbd5e1;
  }

  .limit-title {
    font-weight: 600;
  }

  .limit-input-wrapper {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .limit-input {
    width: 48px;
    padding: 0.2rem 0.35rem;
    border: 1.5px solid #cbd5e1;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 700;
    text-align: center;
    outline: none;
    background: #ffffff;
    color: #0f172a;
    transition: border-color 0.15s;
  }

  .limit-input:focus {
    border-color: #f87171;
  }

  :global(main.dark-mode) .limit-input {
    background: #1e293b;
    border-color: #475569;
    color: #f8fafc;
  }

  :global(main.dark-mode) .limit-input:focus {
    border-color: #f87171;
  }

  .limit-unit {
    font-size: 0.8rem;
    color: #64748b;
  }

  :global(main.dark-mode) .limit-unit {
    color: #94a3b8;
  }

  .limit-hint {
    font-size: 0.74rem;
    color: #94a3b8;
  }

  :global(main.dark-mode) .limit-hint {
    color: #64748b;
  }

  .footer-tip {
    font-size: 0.74rem;
    color: #64748b;
    display: block;
    line-height: 1.4;
  }

  :global(main.dark-mode) .footer-tip {
    color: #94a3b8;
  }
</style>
