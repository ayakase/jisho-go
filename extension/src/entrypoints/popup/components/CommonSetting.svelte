<script lang="ts">
  import { storage } from "#imports";
  import { validateUrl } from "../../../lib/validateUrl";

  let showRomaji = $state<boolean>(false);
  let isInitialized = $state(false);
  let blacklist = $state<string[]>([]);
  let newWebsite = $state<string>("");
  let editingIndex = $state<number | null>(null);
  let editingValue = $state<string>("");
  let errorMessage = $state<string>("");

  async function loadSettings() {
    try {
      const storedRomaji = await storage.getItem<boolean>("local:showRomaji");
      if (storedRomaji !== null && storedRomaji !== undefined) {
        showRomaji = storedRomaji;
      }

      const storedBlacklist = await storage.getItem<unknown>("local:blacklist");
      if (Array.isArray(storedBlacklist)) {
        blacklist = storedBlacklist as string[];
      } else if (
        storedBlacklist &&
        typeof storedBlacklist === "object" &&
        !Array.isArray(storedBlacklist)
      ) {
        const values = Object.values(storedBlacklist as Record<string, unknown>)
          .map((v) => (typeof v === "string" ? v.trim() : ""))
          .filter((v) => v.length > 0);
        blacklist = values;
      } else if (
        typeof storedBlacklist === "string" &&
        storedBlacklist.trim()
      ) {
        blacklist = [storedBlacklist.trim()];
      }

      isInitialized = true;
    } catch (error) {
      console.error("Failed to load common settings:", error);
      isInitialized = true;
    }
  }

  async function saveRomajiMode() {
    try {
      await storage.setItem("local:showRomaji", showRomaji);
    } catch (error) {
      console.error("Failed to save romaji mode:", error);
    }
  }

  async function saveBlacklist() {
    try {
      await storage.setItem("local:blacklist", blacklist);
    } catch (error) {
      console.error("Failed to save blacklist:", error);
    }
  }

  function addWebsite() {
    if (
      validateUrl(newWebsite.trim()) &&
      !blacklist.includes(newWebsite.trim())
    ) {
      blacklist = [...blacklist, newWebsite.trim()];
      newWebsite = "";
      errorMessage = "";
    } else {
      errorMessage = "URL không hợp lệ hoặc đã tồn tại trong danh sách đen";
    }
  }

  function deleteWebsite(index: number) {
    blacklist = blacklist.filter((_, i) => i !== index);
  }

  function startEdit(index: number) {
    editingIndex = index;
    editingValue = blacklist[index];
  }

  function saveEdit() {
    if (
      editingIndex !== null &&
      editingValue.trim() &&
      !blacklist.some(
        (site, i) => i !== editingIndex && site === editingValue.trim(),
      )
    ) {
      blacklist = blacklist.map((site, i) =>
        i === editingIndex ? editingValue.trim() : site,
      );
      editingIndex = null;
      editingValue = "";
    }
  }

  function cancelEdit() {
    editingIndex = null;
    editingValue = "";
  }

  loadSettings();

  let isResetting = $state(false);
  let showResetConfirm = $state(false);

  async function handleResetExtension() {
    isResetting = true;
    isInitialized = false;

    try {
      try {
        await browser.runtime.sendMessage({ type: "RESET_EXTENSION_STATE" });
      } catch {}

      await storage.clear("local");
      try {
        await storage.clear("sync");
      } catch {}
      try {
        await browser.storage?.local?.clear();
      } catch {}
      try {
        await browser.storage?.sync?.clear();
      } catch {}
      try {
        await browser.alarms?.clearAll();
      } catch {}

      window.location.reload();
    } catch (e) {
      console.error("Lỗi khi reset extension:", e);
      isResetting = false;
      showResetConfirm = false;
    }
  }

  $effect(() => {
    if (isInitialized) saveRomajiMode();
  });

  $effect(() => {
    if (isInitialized) saveBlacklist();
  });
</script>

<div class="settings-container">
  <div class="setting-item">
    <h3>Hiển thị Romaji</h3>
    <div class="setting-controls">
      <label class="toggle-option">
        <input
          type="checkbox"
          checked={showRomaji}
          onchange={(e) => (showRomaji = (e.target as HTMLInputElement).checked)}
        />
        <span class="toggle-label">
          <strong>Bật hiển thị Romaji</strong>
          <span class="toggle-description"
            >Hiển thị romaji kèm kana trong cách đọc và phát âm</span
          >
        </span>
      </label>
    </div>
  </div>

  <div class="setting-item">
    <h3>Không hiển thị trên các trang web:</h3>
    <div class="setting-controls">
      <div class="blacklist-add">
        <input
          type="text"
          class="blacklist-input"
          placeholder="Nhập tên miền (ví dụ: example.com)"
          value={newWebsite}
          oninput={(e) => (newWebsite = (e.target as HTMLInputElement).value)}
          onkeydown={(e) => {
            if (e.key === "Enter") {
              addWebsite();
            }
          }}
        />
        <button class="add-button" onclick={addWebsite}>Thêm</button>
        {#if errorMessage}
          <div class="error-message">{errorMessage}</div>
        {/if}
      </div>

      <div class="blacklist-list">
        {#if blacklist.length === 0}
          <div class="blacklist-empty">Chưa có trang web nào trong danh sách đen</div>
        {:else}
          {#each blacklist as website, index}
            <div class="blacklist-item">
              {#if editingIndex === index}
                <input
                  type="text"
                  class="blacklist-edit-input"
                  value={editingValue}
                  oninput={(e) => (editingValue = (e.target as HTMLInputElement).value)}
                  onkeydown={(e) => {
                    if (e.key === "Enter") {
                      saveEdit();
                    } else if (e.key === "Escape") {
                      cancelEdit();
                    }
                  }}
                />
                <div class="blacklist-actions">
                  <button class="save-button" onclick={saveEdit}>Lưu</button>
                  <button class="cancel-button" onclick={cancelEdit}>Hủy</button>
                </div>
              {:else}
                <button
                  type="button"
                  class="blacklist-website"
                  onclick={() => startEdit(index)}>{website}</button
                >
                <div class="blacklist-actions">
                  <button class="edit-button" onclick={() => startEdit(index)}>Sửa</button>
                  <button class="delete-button" onclick={() => deleteWebsite(index)}
                    >Xóa</button
                  >
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>

  <div class="setting-item">
    <h3>Đặt lại tiện ích</h3>
    <div class="setting-controls">
      <div class="reset-card">
        <div class="reset-desc">
          <span>
            Xóa toàn bộ dữ liệu lưu trữ (lịch sử Kanji, danh sách chặn, cấu hình cá nhân...) và đưa tiện ích về trạng thái ban đầu. Dùng khi gặp lỗi hoặc muốn làm mới tiện ích.
          </span>
        </div>
        <div class="reset-action-area">
          {#if showResetConfirm}
            <div class="reset-confirm-box">
              <span class="reset-confirm-text">Xác nhận xóa hết dữ liệu?</span>
              <div class="reset-confirm-btns">
                <button
                  type="button"
                  class="reset-btn-confirm"
                  onclick={handleResetExtension}
                  disabled={isResetting}
                >
                  {isResetting ? "Đang xóa..." : "Đồng ý"}
                </button>
                <button
                  type="button"
                  class="reset-btn-cancel"
                  onclick={() => (showResetConfirm = false)}
                  disabled={isResetting}
                >
                  Hủy
                </button>
              </div>
            </div>
          {:else}
            <button
              type="button"
              class="reset-btn"
              onclick={() => (showResetConfirm = true)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <span>Khôi phục cài đặt gốc</span>
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .reset-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 0.85rem;
    border: 1px solid #fee2e2;
    background-color: #fef2f2;
    border-radius: 8px;
  }

  :global(main.dark-mode) .reset-card {
    background-color: #271719;
    border-color: #5c1d24;
  }

  .reset-desc {
    font-size: 0.82rem;
    line-height: 1.45;
    color: #475569;
    flex: 1;
  }

  :global(main.dark-mode) .reset-desc {
    color: #cbd5e1;
  }

  .reset-action-area {
    flex-shrink: 0;
  }

  .reset-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.85rem;
    font-size: 0.82rem;
    font-weight: 600;
    color: #dc2626;
    background-color: #ffffff;
    border: 1px solid #f87171;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .reset-btn:hover {
    background-color: #dc2626;
    border-color: #dc2626;
    color: #ffffff;
  }

  :global(main.dark-mode) .reset-btn {
    background-color: #1f2937;
    border-color: #ef4444;
    color: #f87171;
  }

  :global(main.dark-mode) .reset-btn:hover {
    background-color: #dc2626;
    border-color: #dc2626;
    color: #ffffff;
  }

  .reset-confirm-box {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.35rem;
  }

  .reset-confirm-text {
    font-size: 0.78rem;
    font-weight: 600;
    color: #b91c1c;
    white-space: nowrap;
  }

  :global(main.dark-mode) .reset-confirm-text {
    color: #fca5a5;
  }

  .reset-confirm-btns {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .reset-btn-confirm {
    padding: 0.3rem 0.65rem;
    font-size: 0.78rem;
    font-weight: 600;
    color: #ffffff;
    background-color: #dc2626;
    border: 1px solid #dc2626;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .reset-btn-confirm:hover {
    background-color: #b91c1c;
  }

  .reset-btn-cancel {
    padding: 0.3rem 0.65rem;
    font-size: 0.78rem;
    font-weight: 500;
    color: #4b5563;
    background-color: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .reset-btn-cancel:hover {
    background-color: #e5e7eb;
  }

  :global(main.dark-mode) .reset-btn-cancel {
    background-color: #374151;
    border-color: #4b5563;
    color: #e5e7eb;
  }

  :global(main.dark-mode) .reset-btn-cancel:hover {
    background-color: #4b5563;
  }
</style>
