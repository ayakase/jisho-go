<script lang="ts">
  import HighlightSetting from "./components/HighlightSetting.svelte";
  import HoverSetting from "./components/HoverSetting.svelte";
  import CommonSetting from "./components/CommonSetting.svelte";
  import Account from "./components/Account.svelte";

  type Tab = "highlight" | "hover" | "common" | "account";
  let activeTab = $state<Tab>("highlight");
</script>

<main>
  <div class="header-section">
    <h1>Cài đặt Jisho Go</h1>
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
