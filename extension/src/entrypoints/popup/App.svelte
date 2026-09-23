<script lang="ts">
  import { storage } from "#imports";
  import HighlightSetting from "./components/HighlightSetting.svelte";
  import HoverSetting from "./components/HoverSetting.svelte";
  import OcrSetting from "./components/OcrSetting.svelte";
  import CommonSetting from "./components/CommonSetting.svelte";
  // import Account from "./components/Account.svelte";

  const VALID_TABS = ["highlight", "hover", "ocr", "common"] as const;
  type Tab = (typeof VALID_TABS)[number];
  const DEFAULT_TAB: Tab = "highlight";

  let activeTab = $state<Tab>(DEFAULT_TAB);
  let darkMode = $state(false);

  function isValidTab(val: unknown): val is Tab {
    return typeof val === "string" && (VALID_TABS as readonly string[]).includes(val);
  }

  // Load active tab from storage with fallback
  (async () => {
    try {
      const storedTab = await storage.getItem<string>("local:activeSettingTab");
      if (isValidTab(storedTab)) {
        activeTab = storedTab;
      } else {
        activeTab = DEFAULT_TAB;
      }
    } catch (error) {
      console.error("Failed to load active setting tab:", error);
      activeTab = DEFAULT_TAB;
    }
  })();

  async function selectTab(tab: Tab) {
    if (!isValidTab(tab)) {
      activeTab = DEFAULT_TAB;
      return;
    }
    activeTab = tab;
    try {
      await storage.setItem("local:activeSettingTab", tab);
    } catch (error) {
      console.error("Failed to save active setting tab:", error);
    }
  }

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

  <div class="tab-row" role="tablist">
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === "highlight"}
      class="tab-button {activeTab === 'highlight' ? 'active' : ''}"
      onclick={() => selectTab("highlight")}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="tab-icon"
        aria-hidden="true"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M10 12h4" />
        <path d="M9 4a3 3 0 0 1 3 3v10a3 3 0 0 1 -3 3" />
        <path d="M15 4a3 3 0 0 0 -3 3v10a3 3 0 0 0 3 3" />
      </svg>
      <span>Bôi đen</span>
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === "hover"}
      class="tab-button {activeTab === 'hover' ? 'active' : ''}"
      onclick={() => selectTab("hover")}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="tab-icon"
        aria-hidden="true"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M7.904 17.563a1.2 1.2 0 0 0 2.228 .308l2.09 -3.093l4.907 4.907a1.067 1.067 0 0 0 1.509 0l1.047 -1.047a1.067 1.067 0 0 0 0 -1.509l-4.907 -4.907l3.113 -2.09a1.2 1.2 0 0 0 -.309 -2.228l-13.582 -3.904l3.904 13.563" />
      </svg>
      <span>Di chuột</span>
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === "ocr"}
      class="tab-button {activeTab === 'ocr' ? 'active' : ''}"
      onclick={() => selectTab("ocr")}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="tab-icon"
        aria-hidden="true"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" />
        <path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      </svg>
      <span>Scan ảnh</span>
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === "common"}
      class="tab-button {activeTab === 'common' ? 'active' : ''}"
      onclick={() => selectTab("common")}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="tab-icon"
        aria-hidden="true"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065" />
        <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
      </svg>
      <span>Cài đặt chung</span>
    </button>
    <!--
    <button
      type="button"
      class="tab-button {activeTab === 'account' ? 'active' : ''}"
      onclick={() => selectTab("account")}
    >
      Tài khoản
    </button>
    -->
  </div>

  {#if activeTab === "highlight"}
    <HighlightSetting />
  {:else if activeTab === "hover"}
    <HoverSetting />
  {:else if activeTab === "ocr"}
    <OcrSetting />
  {:else if activeTab === "common"}
    <CommonSetting />
  {:else}
    <!-- <Account /> -->
  {/if}
</main>
