<script lang="ts">
  import { storage } from "#imports";
  import {
    DEFAULT_OCR_SHORTCUT,
    OCR_SHORTCUT_STORAGE_KEY,
    formatShortcut,
    isModifierCode,
    isReservedShortcut,
    isValidShortcut,
    normalizeOcrShortcut,
    shortcutFromEvent,
    type OcrShortcut,
  } from "../../../lib/ocr-shortcut";

  let shortcut = $state<OcrShortcut>({ ...DEFAULT_OCR_SHORTCUT });
  let isInitialized = $state(false);
  let isRecording = $state(false);
  let draft = $state<OcrShortcut | null>(null);
  let message = $state("");

  async function loadSettings() {
    try {
      const stored = await storage.getItem<unknown>(OCR_SHORTCUT_STORAGE_KEY);
      shortcut = normalizeOcrShortcut(stored);
      isInitialized = true;
    } catch (error) {
      console.error("Failed to load OCR shortcut:", error);
      isInitialized = true;
    }
  }

  async function saveShortcut() {
    try {
      await storage.setItem(
        OCR_SHORTCUT_STORAGE_KEY,
        normalizeOcrShortcut(shortcut),
      );
    } catch (error) {
      console.error("Failed to save OCR shortcut:", error);
    }
  }

  function toggleEnabled() {
    shortcut = { ...shortcut, enabled: !shortcut.enabled };
    cancelRecording();
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

    const next: OcrShortcut = {
      ...shortcutFromEvent(event),
      enabled: shortcut.enabled,
    };

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

  function resetShortcut() {
    shortcut = { ...DEFAULT_OCR_SHORTCUT };
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
    <h3>OCR khoanh vùng</h3>
    <div class="setting-controls">
      <label class="toggle-option">
        <input
          type="checkbox"
          checked={shortcut.enabled}
          onchange={toggleEnabled}
        />
        <span class="toggle-label">
          <strong>Bật phím tắt OCR khoanh vùng</strong>
          <span class="toggle-description"
            >Bấm phím tắt để mở vùng chọn OCR trên trang đang xem, không cần
            chuột phải. Bấm phím tắt lần nữa để hủy.</span
          >
        </span>
      </label>
    </div>
  </div>

  <div class="setting-item">
    <h3>Phím tắt</h3>
    <div class="setting-controls">
      <button
        type="button"
        class="shortcut-display {isRecording ? 'recording' : ''}"
        class:disabled={!shortcut.enabled}
        disabled={!shortcut.enabled}
        onclick={isRecording ? cancelRecording : startRecording}
      >
        {#if isRecording}
          {draft ? formatShortcut(draft) : "Nhấn tổ hợp phím…"}
        {:else}
          {formatShortcut(shortcut)}
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
      {:else}
        <div class="shortcut-hint">
          Bấm vào ô trên để đổi phím tắt. Tổ hợp cần có ít nhất Ctrl, Alt hoặc
          Cmd (hoặc một phím F1–F12).
        </div>
      {/if}

      <div class="shortcut-hint">
        Phím tắt vẫn hoạt động trên cả những trang nằm trong danh sách đen —
        bấm phím tắt được coi là chủ ý, khác với bôi đen hay di chuột.
      </div>

      {#if message}
        <div class="shortcut-warning">{message}</div>
      {/if}

      <div class="shortcut-actions">
        <button class="edit-button" onclick={resetShortcut}
          >Đặt lại mặc định</button
        >
      </div>
    </div>
  </div>

  <div class="setting-item">
    <h3>OCR ảnh</h3>
    <div class="setting-controls">
      <div class="shortcut-hint">
        Chuột phải vào ảnh rồi chọn “OCR ảnh này”. Phím tắt chỉ dùng cho vùng
        khoanh, không áp dụng cho ảnh.
      </div>
    </div>
  </div>
</div>
