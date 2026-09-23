<script lang="ts">
  import { storage } from "#imports";
  import {
    OCR_SHORTCUT_STORAGE_KEY,
    SUGGESTED_OCR_SHORTCUT,
    formatShortcut,
    isModifierCode,
    isReservedShortcut,
    isValidShortcut,
    normalizeOcrShortcut,
    shortcutFromEvent,
    type OcrShortcut,
  } from "../../../lib/ocr-shortcut";

  // null = chưa gán phím tắt, tức là OCR bằng phím tắt đang tắt.
  let shortcut = $state<OcrShortcut | null>(null);
  let isInitialized = $state(false);
  let isRecording = $state(false);
  let draft = $state<OcrShortcut | null>(null);
  let message = $state("");

  async function loadSettings() {
    try {
      const stored = await storage.getItem<unknown>(OCR_SHORTCUT_STORAGE_KEY);
      shortcut = normalizeOcrShortcut(stored);
    } catch (error) {
      console.error("Failed to load OCR shortcut:", error);
    } finally {
      isInitialized = true;
    }
  }

  async function saveShortcut() {
    try {
      await storage.setItem(
        OCR_SHORTCUT_STORAGE_KEY,
        shortcut ? normalizeOcrShortcut(shortcut) : null,
      );
    } catch (error) {
      console.error("Failed to save OCR shortcut:", error);
    }
  }

  function startRecording() {
    draft = null;
    message = "";
    isRecording = true;
  }

  function cancelRecording() {
    isRecording = false;
    draft = null;
    message = "";
  }

  function handleRecordKeydown(event: KeyboardEvent) {
    if (!isRecording) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      cancelRecording();
      return;
    }

    if (isModifierCode(event.code)) {
      return;
    }

    const next = shortcutFromEvent(event);

    if (!isValidShortcut(next)) {
      draft = null;
      message = "Cần ít nhất một phím Ctrl, Alt hoặc Cmd (hoặc phím F1–F12).";
      return;
    }

    draft = next;
    message = isReservedShortcut(next)
      ? "Tổ hợp này đang được trình duyệt dùng nên có thể không hoạt động."
      : "";
  }

  function confirmRecording() {
    if (!draft) return;
    shortcut = draft;
    cancelRecording();
  }

  function clearShortcut() {
    shortcut = null;
    cancelRecording();
  }

  loadSettings();

  $effect(() => {
    if (isInitialized) saveShortcut();
  });

  $effect(() => {
    if (!isRecording) return;
    const onKeydown = (event: KeyboardEvent) => handleRecordKeydown(event);
    window.addEventListener("keydown", onKeydown, true);
    return () => window.removeEventListener("keydown", onKeydown, true);
  });
</script>

<div class="settings-container">
  <div class="setting-item">
    <h3>Scan bằng phím tắt</h3>
    <div class="setting-controls">
      <button
        type="button"
        class="shortcut-display {isRecording ? 'recording' : ''}"
        onclick={isRecording ? cancelRecording : startRecording}
      >
        {#if isRecording}
          {draft ? formatShortcut(draft) : "Nhấn tổ hợp phím…"}
        {:else if shortcut}
          {formatShortcut(shortcut)}
        {:else}
          Chưa đặt phím tắt
        {/if}
      </button>

      {#if isRecording}
        <div class="shortcut-hint">
          Nhấn tổ hợp phím mong muốn rồi bấm Lưu. Bấm Esc để hủy.
        </div>
        <div class="shortcut-actions">
          <button class="save-button" onclick={confirmRecording} disabled={!draft}
            >Lưu</button
          >
          <button class="cancel-button" onclick={cancelRecording}>Hủy</button>
        </div>
      {:else if shortcut}
        <div class="shortcut-hint">
          Bấm phím tắt để mở vùng chọn scan ảnh trên trang đang xem. Kéo chuột để
          khoanh vùng, hoặc di chuột lên ảnh rồi click để scan ảnh đó. Bấm phím
          tắt lần nữa hoặc ESC để hủy.
        </div>
      {:else}
        <div class="shortcut-hint">
          Chưa gán phím tắt. Bấm vào ô trên để
          gán, ví dụ {formatShortcut(SUGGESTED_OCR_SHORTCUT)}.
        </div>
      {/if}

      <div class="shortcut-hint">
        Phím tắt vẫn hoạt động trên cả những trang nằm trong danh sách đen
      </div>

      {#if message}
        <div class="shortcut-warning">{message}</div>
      {/if}

      {#if shortcut}
        <div class="shortcut-actions">
          <button class="edit-button" onclick={clearShortcut}
            >Xóa phím tắt</button
          >
        </div>
      {/if}
    </div>
  </div>

  <div class="setting-item">
    <h3>Scan ảnh (Thử nghiệm, có thể lỗi)</h3>
    <div class="setting-controls">
      <div class="shortcut-hint">
        Chuột phải vào ảnh rồi chọn “Scan ảnh này”, hoặc
        {#if shortcut}
          bấm phím tắt scan ảnh <kbd class="shortcut-kbd">{formatShortcut(shortcut)}</kbd>
        {:else}
          bấm phím tắt scan ảnh (chưa gán phím tắt)
        {/if}
        rồi di chuột lên ảnh và click để scan ảnh đó.
      </div>
    </div>
  </div>
</div>
