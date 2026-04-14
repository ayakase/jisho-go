<script lang="ts">
  import { storage } from "#imports";

  type HoverGrabMode = "single-kanji" | "paragraph";

  let hoverMode = $state<boolean>(false);
  let hoverGrabMode = $state<HoverGrabMode>("single-kanji");
  let isInitialized = $state(false);

  async function loadSettings() {
    try {
      const storedHover = await storage.getItem<boolean>("local:hoverMode");
      if (storedHover !== null && storedHover !== undefined) {
        hoverMode = storedHover;
      }

      const storedHoverGrabMode = await storage.getItem<HoverGrabMode>(
        "local:hoverGrabMode",
      );
      if (
        storedHoverGrabMode === "single-kanji" ||
        storedHoverGrabMode === "paragraph"
      ) {
        hoverGrabMode = storedHoverGrabMode;
      }

      isInitialized = true;
    } catch (error) {
      console.error("Failed to load hover settings:", error);
      isInitialized = true;
    }
  }

  async function saveHoverMode() {
    try {
      await storage.setItem("local:hoverMode", hoverMode);
    } catch (error) {
      console.error("Failed to save hover mode:", error);
    }
  }

  async function saveHoverGrabMode() {
    try {
      await storage.setItem("local:hoverGrabMode", hoverGrabMode);
    } catch (error) {
      console.error("Failed to save hover grab mode:", error);
    }
  }

  loadSettings();

  $effect(() => {
    if (isInitialized) saveHoverMode();
  });

  $effect(() => {
    if (isInitialized) saveHoverGrabMode();
  });
</script>

<div class="settings-container">
  <div class="setting-item">
    <div class="setting-controls">
      <label class="toggle-option">
        <input
          type="checkbox"
          checked={hoverMode}
          onchange={(e) => (hoverMode = (e.target as HTMLInputElement).checked)}
        />
        <span class="toggle-label">
          <strong>Bật chế độ di chuột</strong>
          <span class="toggle-description"
            >Bật chức năng tra cứu khi di chuột</span
          >
        </span>
      </label>

      {#if hoverMode}
        <div class="hover-mode-options">
          <label class="radio-option">
            <input
              type="radio"
              name="hoverGrabMode"
              value="single-kanji"
              checked={hoverGrabMode === "single-kanji"}
              onchange={() => (hoverGrabMode = "single-kanji")}
            />
            <span class="radio-label">
              <strong>Từng kanji</strong>
              <span class="radio-description"
                >Di chuột vào 1 kanji để hiện popup</span
              >
            </span>
          </label>
          <label class="radio-option">
            <input
              type="radio"
              name="hoverGrabMode"
              value="paragraph"
              checked={hoverGrabMode === "paragraph"}
              onchange={() => (hoverGrabMode = "paragraph")}
            />
            <span class="radio-label">
              <strong>Cả đoạn</strong>
              <span class="radio-description"
                >Lấy toàn bộ đoạn văn đang trỏ và hiện popup</span
              >
            </span>
          </label>
        </div>
      {/if}
    </div>
  </div>

</div>

<style>
  .hover-mode-options {
    display: flex;
    flex-direction: row;
    gap: 0.65rem;
    margin-top: 0;
  }
</style>
