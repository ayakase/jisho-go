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
  import { findKanjiDictEntry } from "../../../lib/dict-loaders";
  import { kanaToRomajiConvert } from "../../../lib/romaji";
  import type { DictEntry } from "../../../lib/dict-types";

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

  // Trạng thái hiển thị chi tiết chữ Kanji
  let selectedKanji = $state<string | null>(null);
  let selectedKanjiData = $state<DictEntry | null>(null);
  let loadingDetail = $state(false);
  let showRomaji = $state(false);
  let expandedOn = $state(false);
  let expandedKun = $state(false);

  $effect(() => {
    if (!isOpen) {
      showClearConfirm = false;
      selectedKanji = null;
      selectedKanjiData = null;
    }
  });

  onMount(() => {
    void (async () => {
      recentKanjiStr = await getRecentKanji();
      recentLimit = await getRecentKanjiLimit();
      const storedRomaji = await storage.getItem<boolean>("local:showRomaji");
      if (storedRomaji !== null && storedRomaji !== undefined) {
        showRomaji = storedRomaji;
      }
    })();

    const unwatchKanji = storage.watch<string>("local:recentKanji", (val) => {
      recentKanjiStr = val || "";
    });

    const unwatchLimit = storage.watch<number>("local:recentKanjiLimit", (val) => {
      if (val) recentLimit = val;
    });

    const unwatchRomaji = storage.watch<boolean>("local:showRomaji", (val) => {
      showRomaji = val ?? false;
    });

    return () => {
      unwatchKanji();
      unwatchLimit();
      unwatchRomaji();
    };
  });

  function convertIfRomaji(text: string | undefined): string {
    if (!text) return "";
    if (showRomaji) {
      const romaji = kanaToRomajiConvert(text);
      return `${text} (${romaji})`;
    }
    return text;
  }

  function getExampleCount(
    record?: Record<string, Array<{ w: string; m: string; p: string }>>,
  ): number {
    if (!record) return 0;
    return Object.values(record).reduce(
      (acc, arr) => acc + (arr?.length || 0),
      0,
    );
  }

  async function handleSelectKanji(char: string) {
    selectedKanji = char;
    loadingDetail = true;
    selectedKanjiData = null;
    expandedOn = false;
    expandedKun = false;
    try {
      const res = await findKanjiDictEntry(char);
      if (res?.entry) {
        selectedKanjiData = res.entry;
      }
    } catch (err) {
      console.error("Lỗi khi tải chi tiết chữ Kanji:", err);
    } finally {
      loadingDetail = false;
    }
  }

  async function handleDeleteOne(char: string) {
    const next = await removeRecentKanji(char);
    recentKanjiStr = next;
    if (selectedKanji === char) {
      selectedKanji = null;
      selectedKanjiData = null;
    }
  }

  async function handleClearAll() {
    isClearing = true;
    try {
      await clearRecentKanji();
      recentKanjiStr = "";
      selectedKanji = null;
      selectedKanjiData = null;
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
      if (selectedKanji) {
        selectedKanji = null;
        selectedKanjiData = null;
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
          if (showClearConfirm) {
            showClearConfirm = false;
          } else if (selectedKanji) {
            selectedKanji = null;
            selectedKanjiData = null;
          } else {
            onClose();
          }
        }
        e.stopPropagation();
      }}
    >
      <!-- Header -->
      <div class="history-modal-header">
        {#if selectedKanji}
          <div class="header-title-group">
            <button
              type="button"
              class="back-list-btn"
              onclick={() => {
                selectedKanji = null;
                selectedKanjiData = null;
              }}
              title="Quay lại danh sách (Esc)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              <span>Danh sách</span>
            </button>
            <span class="header-title">Chi tiết {selectedKanji}</span>
            {#if selectedKanjiData?.h}
              <span class="hanviet-badge">{selectedKanjiData.h.toUpperCase()}</span>
            {/if}
          </div>

          <div class="header-actions">
            <button
              type="button"
              class="clear-all-btn delete-one-btn"
              onclick={() => {
                if (selectedKanji) {
                  void handleDeleteOne(selectedKanji);
                }
              }}
              title="Xóa chữ này khỏi lịch sử"
            >
              Xóa chữ này
            </button>
            <button
              type="button"
              class="close-modal-btn"
              onclick={onClose}
              aria-label="Đóng"
              title="Đóng"
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
        {:else}
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
        {/if}
      </div>

      <!-- Body -->
      <div class="history-modal-body">
        {#if selectedKanji}
          {#if loadingDetail}
            <div class="detail-loading-box">
              <div class="detail-spinner"></div>
              <span>Đang tải thông tin chữ {selectedKanji}...</span>
            </div>
          {:else if selectedKanjiData}
            <div class="kanji-detail-view">
              <!-- Khung tóm tắt chữ Kanji -->
              <div class="kanji-summary-card">
                <div class="kanji-big-char-box">
                  <span class="kanji-big-char">{selectedKanjiData.w}</span>
                </div>
                <div class="kanji-summary-details">
                  <div class="kanji-hv-line">
                    <span class="kanji-hv-text">{selectedKanjiData.h}</span>
                    <div class="kanji-badge-group">
                      {#if selectedKanjiData.level && selectedKanjiData.level.length > 0}
                        <span class="kanji-badge badge-level">JLPT {selectedKanjiData.level.join(", ")}</span>
                      {/if}
                      {#if selectedKanjiData.stroke_count}
                        <span class="kanji-badge badge-strokes">{selectedKanjiData.stroke_count} nét</span>
                      {/if}
                    </div>
                  </div>

                  <div class="kanji-readings-box">
                    {#if selectedKanjiData.on}
                      <div class="reading-row">
                        <span class="reading-tag tag-on">On:</span>
                        <span class="reading-text">{convertIfRomaji(selectedKanjiData.on)}</span>
                      </div>
                    {/if}
                    {#if selectedKanjiData.kun}
                      <div class="reading-row">
                        <span class="reading-tag tag-kun">Kun:</span>
                        <span class="reading-text">{convertIfRomaji(selectedKanjiData.kun)}</span>
                      </div>
                    {/if}
                  </div>
                </div>
              </div>

              <!-- Chi tiết giải nghĩa -->
              {#if selectedKanjiData.detail}
                <div class="detail-block">
                  <div class="block-title">Ý nghĩa & Giải thích</div>
                  <div class="detail-paragraphs">
                    {#each selectedKanjiData.detail.split("##") as p}
                      {#if p.trim()}
                        <p class="detail-p">{p.trim()}</p>
                      {/if}
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Từ vựng hay gặp -->
              {#if selectedKanjiData.examples && selectedKanjiData.examples.length > 0}
                <div class="detail-block">
                  <div class="block-title">Từ vựng hay gặp ({selectedKanjiData.examples.length})</div>
                  <div class="examples-list-box">
                    {#each selectedKanjiData.examples as ex}
                      <div class="example-row">
                        <div class="ex-word-group">
                          <span class="ex-word">{ex.w}</span>
                          {#if ex.p}
                            <span class="ex-reading">({convertIfRomaji(ex.p)})</span>
                          {/if}
                        </div>
                        <span class="ex-meaning">- {ex.m}</span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Ví dụ âm On -->
              {#if selectedKanjiData.example_on && getExampleCount(selectedKanjiData.example_on) > 0}
                <div class="detail-block collapse-block">
                  <button
                    type="button"
                    class="collapse-trigger"
                    onclick={() => (expandedOn = !expandedOn)}
                  >
                    <span class="block-title-collapse">
                      Từ vựng theo âm On ({getExampleCount(selectedKanjiData.example_on)})
                    </span>
                    <span class="collapse-sign">{expandedOn ? "−" : "+"}</span>
                  </button>
                  {#if expandedOn}
                    <div class="examples-list-box">
                      {#each Object.entries(selectedKanjiData.example_on) as [reading, examples]}
                        {#each examples as ex}
                          <div class="example-row">
                            <div class="ex-word-group">
                              <span class="ex-word">{ex.w}</span>
                              {#if ex.p}
                                <span class="ex-reading">({convertIfRomaji(ex.p)})</span>
                              {/if}
                            </div>
                            <span class="ex-meaning">- {ex.m}</span>
                          </div>
                        {/each}
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Ví dụ âm Kun -->
              {#if selectedKanjiData.example_kun && getExampleCount(selectedKanjiData.example_kun) > 0}
                <div class="detail-block collapse-block">
                  <button
                    type="button"
                    class="collapse-trigger"
                    onclick={() => (expandedKun = !expandedKun)}
                  >
                    <span class="block-title-collapse">
                      Từ vựng theo âm Kun ({getExampleCount(selectedKanjiData.example_kun)})
                    </span>
                    <span class="collapse-sign">{expandedKun ? "−" : "+"}</span>
                  </button>
                  {#if expandedKun}
                    <div class="examples-list-box">
                      {#each Object.entries(selectedKanjiData.example_kun) as [reading, examples]}
                        {#each examples as ex}
                          <div class="example-row">
                            <div class="ex-word-group">
                              <span class="ex-word">{ex.w}</span>
                              {#if ex.p}
                                <span class="ex-reading">({convertIfRomaji(ex.p)})</span>
                              {/if}
                            </div>
                            <span class="ex-meaning">- {ex.m}</span>
                          </div>
                        {/each}
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {:else}
            <div class="detail-error-box">
              <span>Không tìm thấy thông tin chi tiết cho chữ này trong từ điển.</span>
            </div>
          {/if}
        {:else if recentList.length > 0}
          <div class="kanji-grid">
            {#each recentList as kanji (kanji)}
              <div
                class="kanji-card"
                title="Bấm để xem chi tiết chữ {kanji}"
                role="button"
                tabindex="0"
                onclick={() => handleSelectKanji(kanji)}
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelectKanji(kanji);
                  }
                }}
              >
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
        {#if selectedKanji}
          <div class="detail-footer-bar">
            <button
              type="button"
              class="footer-return-btn"
              onclick={() => {
                selectedKanji = null;
                selectedKanjiData = null;
              }}
            >
              ← Quay lại danh sách
            </button>
            <span class="footer-tip">
              💡 Bấm phím Esc để quay lại danh sách
            </span>
          </div>
        {:else}
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
            💡 Bấm vào chữ để xem chi tiết Hán tự. Rê chuột để xóa khỏi lịch sử.
          </span>
        {/if}
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
    max-width: 500px;
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

  .back-list-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.55rem;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    color: #475569;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .back-list-btn:hover {
    background: #e2e8f0;
    color: #0f172a;
    border-color: #94a3b8;
  }

  :global(main.dark-mode) .back-list-btn {
    background: #334155;
    border-color: #475569;
    color: #cbd5e1;
  }

  :global(main.dark-mode) .back-list-btn:hover {
    background: #475569;
    color: #ffffff;
  }

  .hanviet-badge {
    padding: 0.15rem 0.45rem;
    font-size: 0.72rem;
    font-weight: 700;
    border-radius: 4px;
    background: #fee2e2;
    color: #ef4444;
  }

  :global(main.dark-mode) .hanviet-badge {
    background: #450a0a;
    color: #fca5a5;
  }

  .delete-one-btn {
    font-size: 0.74rem;
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
    padding: 0.85rem 1rem;
    max-height: 380px;
    min-height: 180px;
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

  /* Detail loading */
  .detail-loading-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2.5rem 1rem;
    color: #64748b;
    font-size: 0.85rem;
  }

  .detail-spinner {
    width: 24px;
    height: 24px;
    border: 2.5px solid #e2e8f0;
    border-top-color: #ef4444;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  :global(main.dark-mode) .detail-spinner {
    border-color: #334155;
    border-top-color: #ef4444;
  }

  :global(main.dark-mode) .detail-loading-box {
    color: #94a3b8;
  }

  /* Detail Container */
  .kanji-detail-view {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  /* Summary Card */
  .kanji-summary-card {
    display: flex;
    align-items: stretch;
    gap: 0.85rem;
    padding: 0.75rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
  }

  :global(main.dark-mode) .kanji-summary-card {
    background: #0f172a;
    border-color: #334155;
  }

  .kanji-big-char-box {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    background: #ffffff;
    border: 1.5px solid #cbd5e1;
    border-radius: 8px;
    flex-shrink: 0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  }

  :global(main.dark-mode) .kanji-big-char-box {
    background: #1e293b;
    border-color: #475569;
  }

  .kanji-big-char {
    font-size: 2.4rem;
    font-weight: 700;
    font-family: "Noto Sans JP", sans-serif;
    color: #0f172a;
    line-height: 1;
  }

  :global(main.dark-mode) .kanji-big-char {
    color: #f8fafc;
  }

  .kanji-summary-details {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.4rem;
    flex: 1;
    min-width: 0;
  }

  .kanji-hv-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .kanji-hv-text {
    font-size: 1.15rem;
    font-weight: 800;
    color: #ef4444;
    line-height: 1.2;
  }

  :global(main.dark-mode) .kanji-hv-text {
    color: #f87171;
  }

  .kanji-badge-group {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .kanji-badge {
    padding: 0.15rem 0.4rem;
    font-size: 0.72rem;
    font-weight: 600;
    border-radius: 4px;
    white-space: nowrap;
  }

  .badge-level {
    background: #eff6ff;
    color: #2563eb;
    border: 1px solid #bfdbfe;
  }

  :global(main.dark-mode) .badge-level {
    background: #1e3a5f;
    color: #93c5fd;
    border-color: #2563eb;
  }

  .badge-strokes {
    background: #f0fdf4;
    color: #16a34a;
    border: 1px solid #bbf7d0;
  }

  :global(main.dark-mode) .badge-strokes {
    background: #14532d;
    color: #86efac;
    border-color: #16a34a;
  }

  .kanji-readings-box {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.82rem;
  }

  .reading-row {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    line-height: 1.35;
  }

  .reading-tag {
    font-weight: 700;
    font-size: 0.74rem;
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .tag-on {
    background: #fef3c7;
    color: #d97706;
  }

  :global(main.dark-mode) .tag-on {
    background: #78350f;
    color: #fde68a;
  }

  .tag-kun {
    background: #e0e7ff;
    color: #4338ca;
  }

  :global(main.dark-mode) .tag-kun {
    background: #312e81;
    color: #c7d2fe;
  }

  .reading-text {
    font-weight: 600;
    color: #334155;
    word-break: break-word;
  }

  :global(main.dark-mode) .reading-text {
    color: #cbd5e1;
  }

  /* Detail Section Blocks */
  .detail-block {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.65rem 0.75rem;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
  }

  :global(main.dark-mode) .detail-block {
    background: #1f2937;
    border-color: #374151;
  }

  .block-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: #0f172a;
  }

  :global(main.dark-mode) .block-title {
    color: #f8fafc;
  }

  .detail-paragraphs {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .detail-p {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.45;
    color: #475569;
  }

  :global(main.dark-mode) .detail-p {
    color: #94a3b8;
  }

  /* Examples */
  .examples-list-box {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .example-row {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
    font-size: 0.8rem;
    line-height: 1.4;
    padding: 0.25rem 0.4rem;
    background: #f8fafc;
    border-radius: 5px;
  }

  :global(main.dark-mode) .example-row {
    background: #111827;
  }

  .ex-word-group {
    display: inline-flex;
    align-items: baseline;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .ex-word {
    font-weight: 700;
    color: #0f172a;
    font-family: "Noto Sans JP", sans-serif;
  }

  :global(main.dark-mode) .ex-word {
    color: #f8fafc;
  }

  .ex-reading {
    font-size: 0.74rem;
    color: #64748b;
  }

  :global(main.dark-mode) .ex-reading {
    color: #94a3b8;
  }

  .ex-meaning {
    color: #334155;
  }

  :global(main.dark-mode) .ex-meaning {
    color: #cbd5e1;
  }

  /* Collapsible Sections */
  .collapse-block {
    padding: 0;
    overflow: hidden;
  }

  .collapse-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 0.75rem;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background-color 0.15s;
  }

  .collapse-trigger:hover {
    background-color: #f8fafc;
  }

  :global(main.dark-mode) .collapse-trigger:hover {
    background-color: #111827;
  }

  .block-title-collapse {
    font-size: 0.82rem;
    font-weight: 700;
    color: #0f172a;
  }

  :global(main.dark-mode) .block-title-collapse {
    color: #f8fafc;
  }

  .collapse-sign {
    font-size: 1.1rem;
    font-weight: 700;
    color: #64748b;
    line-height: 1;
  }

  .collapse-block .examples-list-box {
    padding: 0 0.75rem 0.65rem 0.75rem;
  }

  /* Detail Error Box */
  .detail-error-box {
    padding: 2rem 1rem;
    text-align: center;
    color: #ef4444;
    font-size: 0.85rem;
  }

  .detail-footer-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .footer-return-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.6rem;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    color: #475569;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .footer-return-btn:hover {
    background: #e2e8f0;
    color: #0f172a;
    border-color: #94a3b8;
  }

  :global(main.dark-mode) .footer-return-btn {
    background: #334155;
    border-color: #475569;
    color: #cbd5e1;
  }

  :global(main.dark-mode) .footer-return-btn:hover {
    background: #475569;
    color: #ffffff;
  }
</style>
