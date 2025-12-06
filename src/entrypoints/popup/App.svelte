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
  <h1>Jisho Go Settings</h1>

  <div class="settings-container">
    <div class="setting-item">
      <div class="setting-label">
        <h3>Popup Mode</h3>
        <p class="setting-description">
          Choose how the dictionary popup appears when you select Japanese text
        </p>
      </div>
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
            <strong>Immediate</strong>
            <span class="radio-description"
              >Show popup automatically when text is selected</span
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
            <strong>Button Mode</strong>
            <span class="radio-description"
              >Show a button first, click to open popup</span
            >
          </span>
        </label>
      </div>
    </div>

    <div class="setting-item">
      <div class="setting-label">
        <h3>Hover Mode</h3>
        <p class="setting-description">
          Show kanji popup when hovering over individual kanji characters
        </p>
      </div>
      <div class="setting-controls">
        <label class="toggle-option">
          <input
            type="checkbox"
            checked={hoverMode}
            onchange={(e) =>
              (hoverMode = (e.target as HTMLInputElement).checked)}
          />
          <span class="toggle-label">
            <strong>Enable Hover Mode</strong>
            <span class="toggle-description"
              >Show popup automatically when hovering over kanji characters</span
            >
          </span>
        </label>
      </div>
    </div>

    <div class="setting-item">
      <div class="setting-label">
        <h3>Show Romaji</h3>
        <p class="setting-description">
          Convert hiragana/katakana in readings (on/kun) and pronunciations (p)
          to romaji
        </p>
      </div>
      <div class="setting-controls">
        <label class="toggle-option">
          <input
            type="checkbox"
            checked={showRomaji}
            onchange={(e) =>
              (showRomaji = (e.target as HTMLInputElement).checked)}
          />
          <span class="toggle-label">
            <strong>Enable Romaji Display</strong>
            <span class="toggle-description"
              >Show romaji instead of kana in readings and pronunciations</span
            >
          </span>
        </label>
      </div>
    </div>
  </div>
</main>

<style>
  main {
    padding: 1.5rem;
    width: 400px;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    background-color: #ffffff;
    color: #000000;
  }

  h1 {
    text-align: center;
    margin-bottom: 1.5rem;
    color: #333333;
    font-size: 1.5rem;
  }

  .settings-container {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .setting-item {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .setting-label h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.1rem;
    color: #333333;
  }

  .setting-description {
    margin: 0;
    font-size: 0.9rem;
    color: #666666;
    line-height: 1.4;
  }

  .setting-controls {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .radio-option {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .radio-option:hover {
    border-color: #d1d5db;
    background-color: #f9fafb;
  }

  .radio-option input[type="radio"] {
    margin-top: 0.25rem;
    cursor: pointer;
  }

  .radio-option input[type="radio"]:checked + .radio-label strong {
    color: #f87171;
  }

  .radio-label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
  }

  .radio-label strong {
    font-size: 1rem;
    color: #111827;
    transition: color 0.2s;
  }

  .radio-description {
    font-size: 0.85rem;
    color: #6b7280;
    line-height: 1.4;
  }

  .toggle-option {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .toggle-option:hover {
    border-color: #d1d5db;
    background-color: #f9fafb;
  }

  .toggle-option input[type="checkbox"] {
    margin-top: 0.25rem;
    cursor: pointer;
    width: 1.25rem;
    height: 1.25rem;
  }

  .toggle-option input[type="checkbox"]:checked + .toggle-label strong {
    color: #f87171;
  }

  .toggle-label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
  }

  .toggle-label strong {
    font-size: 1rem;
    color: #111827;
    transition: color 0.2s;
  }

  .toggle-description {
    font-size: 0.85rem;
    color: #6b7280;
    line-height: 1.4;
  }
</style>
