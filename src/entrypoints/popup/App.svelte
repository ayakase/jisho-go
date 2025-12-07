<script lang="ts">
  import { storage } from "#imports";

  type PopupMode = "immediate" | "button";

  let popupMode = $state<PopupMode>("immediate");
  let hoverMode = $state<boolean>(false);
  let showRomaji = $state<boolean>(false);
  let isInitialized = $state(false);

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
  <h1>Cài đặt Kanji Go</h1>

  <div class="settings-container">
    <div class="setting-item">
      <h3>Chế độ popup</h3>
      <div class="setting-controls">
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
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    background-color: #ffffff;
    outline: none;
  }

  :global(html) {
    background-color: #ffffff;
  }

  main {
    padding: 1rem;
    width: 400px;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    background-color: #ffffff;
    color: #000000;
    outline: none;
    border: none;
    margin: 0;
  }

  h1 {
    text-align: center;
    margin-bottom: 1rem;
    color: #333333;
    font-size: 1.25rem;
  }

  .settings-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .setting-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .setting-item h3 {
    margin: 0;
    font-size: 0.95rem;
    color: #333333;
    font-weight: 600;
  }

  .setting-controls {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .radio-option {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.5rem;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    outline: none;
  }

  .radio-option:focus,
  .radio-option:focus-visible {
    outline: none;
  }

  .radio-option:hover {
    border-color: #d1d5db;
    background-color: #f9fafb;
  }

  .radio-option input[type="radio"] {
    margin-top: 0.15rem;
    cursor: pointer;
    outline: none;
  }

  .radio-option input[type="radio"]:focus,
  .radio-option input[type="radio"]:focus-visible {
    outline: none;
  }

  .radio-option input[type="radio"]:checked + .radio-label strong {
    color: #f87171;
  }

  .radio-label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    flex: 1;
  }

  .radio-label strong {
    font-size: 0.9rem;
    color: #111827;
    transition: color 0.2s;
  }

  .radio-description {
    font-size: 0.8rem;
    color: #6b7280;
    line-height: 1.3;
  }

  .toggle-option {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.5rem;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    outline: none;
  }

  .toggle-option:focus,
  .toggle-option:focus-visible {
    outline: none;
  }

  .toggle-option:hover {
    border-color: #d1d5db;
    background-color: #f9fafb;
  }

  .toggle-option input[type="checkbox"] {
    margin-top: 0.15rem;
    cursor: pointer;
    width: 1.1rem;
    height: 1.1rem;
    outline: none;
  }

  .toggle-option input[type="checkbox"]:focus,
  .toggle-option input[type="checkbox"]:focus-visible {
    outline: none;
  }

  .toggle-option input[type="checkbox"]:checked + .toggle-label strong {
    color: #f87171;
  }

  .toggle-label {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    flex: 1;
  }

  .toggle-label strong {
    font-size: 0.9rem;
    color: #111827;
    transition: color 0.2s;
  }

  .toggle-description {
    font-size: 0.8rem;
    color: #6b7280;
    line-height: 1.3;
  }
</style>
