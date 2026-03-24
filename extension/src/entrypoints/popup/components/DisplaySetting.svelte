<script lang="ts">
  import { storage } from "#imports";

  const OPACITY_MIN = 0.1;
  const OPACITY_MAX = 1;

  let popupOpacity = $state<number>(1);
  let isOpacityInitialized = $state<boolean>(false);

  function clampOpacity(val: number): number {
    if (Number.isNaN(val)) return OPACITY_MAX;
    return Math.max(OPACITY_MIN, Math.min(OPACITY_MAX, val));
  }

  function opacityToGradientPercent(opacity: number): number {
    const t = (opacity - OPACITY_MIN) / (OPACITY_MAX - OPACITY_MIN);
    return Math.max(0, Math.min(100, t * 100));
  }

  async function loadPopupOpacity() {
    try {
      const stored = await storage.getItem<number>("local:popupOpacity");
      popupOpacity =
        stored !== null && stored !== undefined ? clampOpacity(stored) : 1;
      isOpacityInitialized = true;
    } catch (error) {
      console.error("Failed to load popup opacity:", error);
      isOpacityInitialized = true;
    }
  }

  async function savePopupOpacity() {
    try {
      await storage.setItem("local:popupOpacity", popupOpacity);
    } catch (error) {
      console.error("Failed to save popup opacity:", error);
    }
  }

  let positionMode = $state<"highlight" | "remember" | "static">("highlight");
  let isPositionInitialized = $state<boolean>(false);

  let staticConfig = $state<{
    corner: string;
    offsetX: number;
    offsetY: number;
  }>({
    corner: "top-right",
    offsetX: 20,
    offsetY: 20,
  });
  let isStaticConfigInitialized = $state<boolean>(false);

  async function loadPositionSettings() {
    try {
      const storedMode = await storage.getItem<
        "highlight" | "remember" | "static"
      >("local:popupPositionMode");
      if (storedMode) positionMode = storedMode;
      isPositionInitialized = true;

      const storedStatic = await storage.getItem<any>(
        "local:popupStaticConfig",
      );
      if (storedStatic) staticConfig = storedStatic;
      isStaticConfigInitialized = true;
    } catch (error) {
      console.error("Failed to load position settings:", error);
      isPositionInitialized = true;
      isStaticConfigInitialized = true;
    }
  }

  async function savePositionMode() {
    try {
      if (isPositionInitialized) {
        await storage.setItem("local:popupPositionMode", positionMode);
      }
    } catch (error) {
      console.error("Failed to save position mode");
    }
  }

  async function saveStaticConfig() {
    try {
      if (isStaticConfigInitialized) {
        // We use $state.snapshot to get plain object instead of proxy
        const snap = {
          corner: staticConfig.corner,
          offsetX: staticConfig.offsetX,
          offsetY: staticConfig.offsetY,
        };
        await storage.setItem("local:popupStaticConfig", snap);
      }
    } catch (error) {
      console.error("Failed to save static config");
    }
  }

  loadPopupOpacity();
  loadPositionSettings();

  $effect(() => {
    if (isOpacityInitialized) savePopupOpacity();
  });
  $effect(() => {
    savePositionMode();
  });
  $effect(() => {
    if (
      staticConfig.corner ||
      staticConfig.offsetX >= 0 ||
      staticConfig.offsetY >= 0
    ) {
    }
    saveStaticConfig();
  });
</script>

<div class="settings-container">
  <div class="setting-item">
    <h3>Vị trí Popup</h3>
    <div class="setting-controls position-radio-group">
      <label
        class="position-radio-card"
        class:active={positionMode === "highlight"}
      >
        <input
          type="radio"
          name="positionMode"
          value="highlight"
          bind:group={positionMode}
          class="custom-radio"
        />
        <span class="position-radio-text"
          >Ngay tại văn bản đang chọn (Mặc định)</span
        >
      </label>

      <label
        class="position-radio-card"
        class:active={positionMode === "remember"}
      >
        <input
          type="radio"
          name="positionMode"
          value="remember"
          bind:group={positionMode}
          class="custom-radio"
        />
        <span class="position-radio-text"
          >Tại vị trí kéo thả được ghi nhớ gần nhất</span
        >
      </label>

      <label
        class="position-radio-card"
        class:active={positionMode === "static"}
      >
        <input
          type="radio"
          name="positionMode"
          value="static"
          bind:group={positionMode}
          class="custom-radio"
        />
        <span class="position-radio-text">Tại góc màn hình cố định</span>
      </label>
    </div>

    {#if positionMode === "static"}
      <div class="static-config-panel">
        <div class="config-row">
          <span>Góc: </span>
          <select bind:value={staticConfig.corner} class="ui-select">
            <option value="top-left">Trái - Trên</option>
            <option value="top-right">Phải - Trên</option>
            <option value="bottom-left">Trái - Dưới</option>
            <option value="bottom-right">Phải - Dưới</option>
          </select>
        </div>
        <div class="config-row">
          <span>Cách mép X (px): </span>
          <input
            type="number"
            bind:value={staticConfig.offsetX}
            min="0"
            max="2000"
            class="ui-input"
          />
        </div>
        <div class="config-row">
          <span>Cách mép Y (px): </span>
          <input
            type="number"
            bind:value={staticConfig.offsetY}
            min="0"
            max="2000"
            class="ui-input"
          />
        </div>
      </div>
    {/if}
  </div>

  <div class="setting-item">
    <h3>Độ mờ popup</h3>
    <div class="setting-controls opacity-control">
      <div class="opacity-header">
        <div class="opacity-value" aria-live="polite">
          {Math.round(popupOpacity * 100)}%
        </div>
      </div>

      <input
        type="range"
        min={OPACITY_MIN}
        max={OPACITY_MAX}
        step={0.05}
        class="opacity-range"
        bind:value={popupOpacity}
        style={`--progress:${opacityToGradientPercent(popupOpacity)}%;`}
        aria-label="Độ mờ popup"
      />
    </div>
  </div>
</div>

<style>
  .opacity-control {
    gap: 0.75rem;
    padding: 0.75rem;
    border: 2px solid #e5e7eb;
    border-radius: 10px;
  }

  .opacity-header {
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .opacity-value {
    font-weight: 800;
    color: #111827;
    font-size: 0.85rem;
  }

  .opacity-range {
    width: 100%;
    height: 10px;
    border-radius: 999px;
    -webkit-appearance: none;
    appearance: none;
    background: linear-gradient(
      90deg,
      #f87171 0%,
      #f87171 var(--progress),
      #e5e7eb var(--progress),
      #e5e7eb 100%
    );
    outline: none;
    margin: 0;
  }

  .opacity-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: #ffffff;
    border: 2px solid #f87171;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    cursor: pointer;
    margin-top: -4px;
    transition: transform 0.08s ease;
  }

  .opacity-range:active::-webkit-slider-thumb {
    transform: scale(1.03);
  }

  .opacity-range::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: #ffffff;
    border: 2px solid #f87171;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    cursor: pointer;
  }

  .opacity-range::-moz-range-track {
    height: 10px;
    border: none;
    background: linear-gradient(
      90deg,
      #f87171 0%,
      #f87171 var(--progress),
      #e5e7eb var(--progress),
      #e5e7eb 100%
    );
    border-radius: 999px;
  }

  .opacity-range:focus-visible {
    box-shadow: 0 0 0 4px rgba(248, 113, 113, 0.2);
  }

  .position-radio-group {
    display: flex;
    flex-direction: row;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .position-radio-card {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    padding: 0.5rem 0.65rem;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    background: #ffffff;
    transition: all 0.2s ease;
    flex: 1;
  }

  .position-radio-card:hover {
    background: #f9fafb;
    border-color: #d1d5db;
  }

  .position-radio-card.active {
    border-color: #fca5a5;
    background: #fef2f2;
  }

  .custom-radio {
    accent-color: #ef4444;
    width: 1rem;
    height: 1rem;
    margin: 0;
    cursor: pointer;
    flex-shrink: 0;
  }

  .position-radio-text {
    font-size: 0.85rem;
    font-weight: 500;
    color: #1f2937;
    transition: color 0.2s;
    text-align: left;
    line-height: 1.3;
  }

  .position-radio-card.active .position-radio-text {
    color: #991b1b;
  }

  .static-config-panel {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.85rem;
    padding: 1.15rem;
    margin-top: 0.5rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.02);
  }

  .config-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    font-size: 0.9rem;
    font-weight: 500;
    color: #475569;
  }

  .ui-select,
  .ui-input {
    padding: 0.45rem 0.65rem;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    font-size: 0.9rem;
    color: #1e293b;
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
    outline: none;
    font-weight: 500;
  }

  .ui-select:focus,
  .ui-input:focus {
    border-color: #f87171;
    box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.2);
  }

  .ui-input {
    width: 85px;
    text-align: right;
  }
</style>
