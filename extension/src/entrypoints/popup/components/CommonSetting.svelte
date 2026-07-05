<script lang="ts">
  import { storage } from "#imports";
  import { validateUrl } from "../../../lib/validateUrl";
  import type { ExtensionAuthSession } from "../../../lib/auth";

  let showRomaji = $state<boolean>(false);
  let isInitialized = $state(false);
  let blacklist = $state<string[]>([]);
  let newWebsite = $state<string>("");
  let editingIndex = $state<number | null>(null);
  let editingValue = $state<string>("");
  let errorMessage = $state<string>("");
  let authSession = $state<ExtensionAuthSession | null>(null);
  let authLoading = $state(true);
  let authActionLoading = $state(false);
  let authError = $state<string>("");

  async function loadSettings() {
    try {
      const storedRomaji = await storage.getItem<boolean>("local:showRomaji");
      if (storedRomaji !== null && storedRomaji !== undefined) {
        showRomaji = storedRomaji;
      }

      const storedBlacklist = await storage.getItem<unknown>("local:blacklist");
      if (Array.isArray(storedBlacklist)) {
        blacklist = storedBlacklist as string[];
      } else if (
        storedBlacklist &&
        typeof storedBlacklist === "object" &&
        !Array.isArray(storedBlacklist)
      ) {
        const values = Object.values(storedBlacklist as Record<string, unknown>)
          .map((v) => (typeof v === "string" ? v.trim() : ""))
          .filter((v) => v.length > 0);
        blacklist = values;
      } else if (
        typeof storedBlacklist === "string" &&
        storedBlacklist.trim()
      ) {
        blacklist = [storedBlacklist.trim()];
      }

      isInitialized = true;
    } catch (error) {
      console.error("Failed to load common settings:", error);
      isInitialized = true;
    }
  }

  async function loadAuthState() {
    authLoading = true;
    authError = "";
    try {
      const res = (await browser.runtime.sendMessage({
        type: "AUTH_ME",
      })) as
        | { ok: true; session: ExtensionAuthSession | null }
        | { ok: false; error: string }
        | undefined;

      if (!res) {
        authError = "No response from background auth service.";
        authSession = null;
        return;
      }

      if (!res.ok) {
        authError = res.error;
        authSession = null;
        return;
      }

      authSession = res.session;
    } catch (error) {
      authError = error instanceof Error ? error.message : String(error);
      authSession = null;
    } finally {
      authLoading = false;
    }
  }

  async function loginWithGoogle() {
    authActionLoading = true;
    authError = "";
    try {
      const res = (await browser.runtime.sendMessage({
        type: "AUTH_LOGIN",
      })) as
        | { ok: true; session: ExtensionAuthSession }
        | { ok: false; error: string }
        | undefined;

      if (!res) {
        throw new Error("No response from background auth service.");
      }

      if (!res.ok) {
        throw new Error(res.error);
      }

      authSession = res.session;
    } catch (error) {
      authError = error instanceof Error ? error.message : String(error);
    } finally {
      authActionLoading = false;
    }
  }

  async function logout() {
    authActionLoading = true;
    authError = "";
    try {
      const res = (await browser.runtime.sendMessage({
        type: "AUTH_LOGOUT",
      })) as { ok: boolean; error?: string } | undefined;

      if (!res) {
        throw new Error("No response from background auth service.");
      }

      if (!res.ok) {
        throw new Error(res.error || "Logout failed.");
      }

      authSession = null;
    } catch (error) {
      authError = error instanceof Error ? error.message : String(error);
    } finally {
      authActionLoading = false;
    }
  }

  async function saveRomajiMode() {
    try {
      await storage.setItem("local:showRomaji", showRomaji);
    } catch (error) {
      console.error("Failed to save romaji mode:", error);
    }
  }

  async function saveBlacklist() {
    try {
      await storage.setItem("local:blacklist", blacklist);
    } catch (error) {
      console.error("Failed to save blacklist:", error);
    }
  }

  function addWebsite() {
    if (
      validateUrl(newWebsite.trim()) &&
      !blacklist.includes(newWebsite.trim())
    ) {
      blacklist = [...blacklist, newWebsite.trim()];
      newWebsite = "";
      errorMessage = "";
    } else {
      errorMessage = "URL không hợp lệ hoặc đã tồn tại trong danh sách đen";
    }
  }

  function deleteWebsite(index: number) {
    blacklist = blacklist.filter((_, i) => i !== index);
  }

  function startEdit(index: number) {
    editingIndex = index;
    editingValue = blacklist[index];
  }

  function saveEdit() {
    if (
      editingIndex !== null &&
      editingValue.trim() &&
      !blacklist.some(
        (site, i) => i !== editingIndex && site === editingValue.trim(),
      )
    ) {
      blacklist = blacklist.map((site, i) =>
        i === editingIndex ? editingValue.trim() : site,
      );
      editingIndex = null;
      editingValue = "";
    }
  }

  function cancelEdit() {
    editingIndex = null;
    editingValue = "";
  }

  loadSettings();
  loadAuthState();

  $effect(() => {
    if (isInitialized) saveRomajiMode();
  });

  $effect(() => {
    if (isInitialized) saveBlacklist();
  });
</script>

<div class="settings-container">
  <div class="setting-item">
    <h3>Tài khoản</h3>
    <div class="setting-controls">
      <div class="auth-card">
        {#if authLoading}
          <p class="auth-status">Đang kiểm tra phiên đăng nhập...</p>
        {:else if authSession}
          <div class="auth-user-row">
            {#if authSession.user.avatar_url}
              <img
                class="auth-avatar"
                src={authSession.user.avatar_url}
                alt="User avatar"
                referrerpolicy="no-referrer"
              />
            {:else}
              <div class="auth-avatar auth-avatar-fallback">
                {(authSession.user.display_name || authSession.user.email).slice(0, 1).toUpperCase()}
              </div>
            {/if}
            <div class="auth-user-info">
              <strong>{authSession.user.display_name || "No display name"}</strong>
              <span>{authSession.user.email}</span>
            </div>
          </div>
          <button class="auth-button auth-button-secondary" onclick={logout} disabled={authActionLoading}>
            {authActionLoading ? "Đang đăng xuất..." : "Đăng xuất"}
          </button>
        {:else}
          <p class="auth-status">Chưa đăng nhập. Dùng Google để đồng bộ tài khoản extension với website.</p>
          <button class="auth-button" onclick={loginWithGoogle} disabled={authActionLoading}>
            {authActionLoading ? "Đang mở Google..." : "Đăng nhập với Google"}
          </button>
        {/if}

        {#if authError}
          <div class="auth-error">{authError}</div>
        {/if}
      </div>
    </div>
  </div>

  <div class="setting-item">
    <h3>Hiển thị Romaji</h3>
    <div class="setting-controls">
      <label class="toggle-option">
        <input
          type="checkbox"
          checked={showRomaji}
          onchange={(e) => (showRomaji = (e.target as HTMLInputElement).checked)}
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
        {#if errorMessage}
          <div class="error-message">{errorMessage}</div>
        {/if}
      </div>

      <div class="blacklist-list">
        {#if blacklist.length === 0}
          <div class="blacklist-empty">Chưa có trang web nào trong danh sách đen</div>
        {:else}
          {#each blacklist as website, index}
            <div class="blacklist-item">
              {#if editingIndex === index}
                <input
                  type="text"
                  class="blacklist-edit-input"
                  value={editingValue}
                  oninput={(e) => (editingValue = (e.target as HTMLInputElement).value)}
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
                  <button class="cancel-button" onclick={cancelEdit}>Hủy</button>
                </div>
              {:else}
                <button
                  type="button"
                  class="blacklist-website"
                  onclick={() => startEdit(index)}>{website}</button
                >
                <div class="blacklist-actions">
                  <button class="edit-button" onclick={() => startEdit(index)}>Sửa</button>
                  <button class="delete-button" onclick={() => deleteWebsite(index)}
                    >Xóa</button
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
