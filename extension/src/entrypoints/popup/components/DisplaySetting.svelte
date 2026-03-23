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

  loadPopupOpacity();

  $effect(() => {
    if (isOpacityInitialized) savePopupOpacity();
  });
</script>

<div class="settings-container">
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
</style>

