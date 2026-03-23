<script lang="ts">
  import MainSetting from "./components/MainSetting.svelte";
  import DisplaySetting from "./components/DisplaySetting.svelte";

  type Tab = "settings" | "appearance";
  let activeTab = $state<Tab>("settings");
</script>

<main>
  <div class="header-section">
    <h1>Cài đặt Kanji Go</h1>
  </div>

  <div class="tab-row">
    <button
      type="button"
      class="tab-button {activeTab === 'settings' ? 'active' : ''}"
      onclick={() => (activeTab = "settings")}
    >
      Cài đặt
    </button>
    <button
      type="button"
      class="tab-button {activeTab === 'appearance' ? 'active' : ''}"
      onclick={() => (activeTab = "appearance")}
    >
      Giao diện
    </button>
  </div>

  {#if activeTab === "settings"}
    <MainSetting />
  {:else}
    <DisplaySetting />
  {/if}
</main>
