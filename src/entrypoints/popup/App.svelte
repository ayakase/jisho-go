<script lang="ts">
  import { storage } from "#imports";

  type PopupMode = "off" | "immediate" | "button";
  let popupMode = $state<PopupMode>("immediate");
  let hoverMode = $state<boolean>(false);
  let showRomaji = $state<boolean>(false);
  let isInitialized = $state(false);
  let blacklist = $state<string[]>([]);
  let newWebsite = $state<string>("");
  let editingIndex = $state<number | null>(null);
  let editingValue = $state<string>("");
  // Load settings on mount
  async function loadSettings() {
    try {
      const storedMode = await storage.getItem<PopupMode>("local:popupMode");
      if (storedMode) {
        popupMode = storedMode;
      }
      const storedHover = await storage.getItem<boolean>("local:hoverMode");
      if (storedHover !== null && storedHover !== undefined) {
        hoverMode = storedHover;
      }
      const storedRomaji = await storage.getItem<boolean>("local:showRomaji");
      if (storedRomaji !== null && storedRomaji !== undefined) {
        showRomaji = storedRomaji;
      }
      isInitialized = true;
    } catch (error) {
      console.error("Failed to load settings:", error);
      isInitialized = true;
    }
  }

  // Save settings
  async function saveSettings() {
    try {
      await storage.setItem("local:popupMode", popupMode);
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  }

  // Save hover mode
  async function saveHoverMode() {
    try {
      await storage.setItem("local:hoverMode", hoverMode);
    } catch (error) {
      console.error("Failed to save hover mode:", error);
    }
  }

  // Save romaji mode
  async function saveRomajiMode() {
    try {
      await storage.setItem("local:showRomaji", showRomaji);
    } catch (error) {
      console.error("Failed to save romaji mode:", error);
    }
  }
  // Add website to blacklist
  function addWebsite() {
    if (newWebsite.trim() && !blacklist.includes(newWebsite.trim())) {
      blacklist = [...blacklist, newWebsite.trim()];
      newWebsite = "";
    }
  }

  // Delete website from blacklist
  function deleteWebsite(index: number) {
    blacklist = blacklist.filter((_, i) => i !== index);
  }

  // Start editing a website
  function startEdit(index: number) {
    editingIndex = index;
    editingValue = blacklist[index];
  }

  // Save edited website
  function saveEdit() {
    if (
      editingIndex !== null &&
      editingValue.trim() &&
      !blacklist.some(
        (site, i) => i !== editingIndex && site === editingValue.trim()
      )
    ) {
      blacklist = blacklist.map((site, i) =>
        i === editingIndex ? editingValue.trim() : site
      );
      editingIndex = null;
      editingValue = "";
    }
  }

  // Cancel editing
  function cancelEdit() {
    editingIndex = null;
    editingValue = "";
  }

  // Load settings when component mounts
  loadSettings();

  // Save settings when mode changes (but not on initial load)
  $effect(() => {
    if (isInitialized && popupMode) {
      saveSettings();
    }
  });

  // Save hover mode when it changes
  $effect(() => {
    if (isInitialized) {
      saveHoverMode();
    }
  });

  // Save romaji mode when it changes
  $effect(() => {
    if (isInitialized) {
      saveRomajiMode();
    }
  });
</script>

<main>
  <div class="header-section">
    <h1>Cài đặt Kanji Go</h1>
  </div>

  <div class="settings-container">
    <div class="setting-item">
      <h3>Chế độ popup</h3>
      <div class="setting-controls">
        <label class="radio-option">
          <input
            type="radio"
            name="popupMode"
            value="off"
            checked={popupMode === "off"}
            onchange={() => (popupMode = "off")}
          />
          <span class="radio-label">
            <strong>Tắt</strong>
            <span class="radio-description"
              >Không hiển thị popup khi chọn văn bản</span
            >
          </span>
        </label>
        <label class="radio-option">
          <input
            type="radio"
            name="popupMode"
            value="immediate"
            checked={popupMode === "immediate"}
            onchange={() => (popupMode = "immediate")}
          />
          <span class="radio-label">
            <strong>Tức thì</strong>
            <span class="radio-description"
              >Hiển thị popup tự động khi chọn văn bản</span
            >
          </span>
        </label>
        <label class="radio-option">
          <input
            type="radio"
            name="popupMode"
            value="button"
            checked={popupMode === "button"}
            onchange={() => (popupMode = "button")}
          />
          <span class="radio-label">
            <strong>Chế độ nút</strong>
            <span class="radio-description"
              >Hiển thị nút trước, nhấp để mở popup</span
            >
          </span>
        </label>
      </div>
    </div>

    <div class="setting-item">
      <h3>Chế độ di chuột</h3>
      <div class="setting-controls">
        <label class="toggle-option">
          <input
            type="checkbox"
            checked={hoverMode}
            onchange={(e) =>
              (hoverMode = (e.target as HTMLInputElement).checked)}
          />
          <span class="toggle-label">
            <strong>Bật chế độ di chuột</strong>
            <span class="toggle-description"
              >Hiển thị popup khi di chuột qua ký tự kanji</span
            >
          </span>
        </label>
      </div>
    </div>

    <div class="setting-item">
      <h3>Hiển thị Romaji</h3>
      <div class="setting-controls">
        <label class="toggle-option">
          <input
            type="checkbox"
            checked={showRomaji}
            onchange={(e) =>
              (showRomaji = (e.target as HTMLInputElement).checked)}
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
      <h3>Danh sách đen trang web</h3>
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
        </div>
        <div class="blacklist-list">
          {#if blacklist.length === 0}
            <div class="blacklist-empty">
              Chưa có trang web nào trong danh sách đen
            </div>
          {:else}
            {#each blacklist as website, index}
              <div class="blacklist-item">
                {#if editingIndex === index}
                  <input
                    type="text"
                    class="blacklist-edit-input"
                    value={editingValue}
                    oninput={(e) =>
                      (editingValue = (e.target as HTMLInputElement).value)}
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
                    <button class="cancel-button" onclick={cancelEdit}
                      >Hủy</button
                    >
                  </div>
                {:else}
                  <button
                    type="button"
                    class="blacklist-website"
                    onclick={() => startEdit(index)}>{website}</button
                  >
                  <div class="blacklist-actions">
                    <button class="edit-button" onclick={() => startEdit(index)}
                      >Sửa</button
                    >
                    <button
                      class="delete-button"
                      onclick={() => deleteWebsite(index)}>Xóa</button
                    >
                  </div>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  </div>
</main>
