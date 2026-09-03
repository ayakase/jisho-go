<script lang="ts">
  import { storage } from "#imports";
  import HighlightSetting from "./components/HighlightSetting.svelte";
  import HoverSetting from "./components/HoverSetting.svelte";
  import CommonSetting from "./components/CommonSetting.svelte";
  import Account from "./components/Account.svelte";

  type Tab = "highlight" | "hover" | "common" | "account";
  let activeTab = $state<Tab>("highlight");
  let darkMode = $state(false);

  (async () => {
    darkMode = (await storage.getItem<boolean>("local:darkMode")) ?? false;
  })();

  $effect(() => {
    document.documentElement.classList.toggle("dark-mode", darkMode);
    document.body.classList.toggle("dark-mode", darkMode);

    const unwatch = storage.watch<boolean>("local:darkMode", (value) => {
      darkMode = value ?? false;
    });
    return () => {
      unwatch();
      document.documentElement.classList.remove("dark-mode");
      document.body.classList.remove("dark-mode");
    };
  });

  async function toggleDarkMode() {
    darkMode = !darkMode;
    await storage.setItem("local:darkMode", darkMode);
  }
</script>

<main class:dark-mode={darkMode}>
  <div class="header-section">
    <h1>Cài đặt Jisho Go</h1>
    <button
      type="button"
      class="theme-toggle"
      aria-label={darkMode ? "Bật chế độ sáng" : "Bật chế độ tối"}
      title={darkMode ? "Chế độ sáng" : "Chế độ tối"}
      onclick={toggleDarkMode}
    >
      {#if darkMode}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
          />
        </svg>
      {:else}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
          />
        </svg>
      {/if}
    </button>
  </div>

  <div class="tab-row">
    <button
      type="button"
      class="tab-button {activeTab === 'highlight' ? 'active' : ''}"
      onclick={() => (activeTab = "highlight")}
    >
      Bôi đen
    </button>
    <button
      type="button"
      class="tab-button {activeTab === 'hover' ? 'active' : ''}"
      onclick={() => (activeTab = "hover")}
    >
      Di chuột
    </button>
    <button
      type="button"
      class="tab-button {activeTab === 'common' ? 'active' : ''}"
      onclick={() => (activeTab = "common")}
    >
      Cài đặt chung
    </button>
    <button
      type="button"
      class="tab-button {activeTab === 'account' ? 'active' : ''}"
      onclick={() => (activeTab = "account")}
    >
      Tài khoản
    </button>
  </div>

  {#if activeTab === "highlight"}
    <HighlightSetting />
  {:else if activeTab === "hover"}
    <HoverSetting />
  {:else if activeTab === "common"}
    <CommonSetting />
  {:else}
    <Account />
  {/if}
</main>
