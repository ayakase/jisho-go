<script lang="ts">
  import { createWebLoginUrl, getApiBase, type ExtensionAuthSession } from "../../../lib/auth";

  type WalletProduct = { code: string; amountVnd: number };
  type WalletEntry = { entryType: string; amountVnd: number; balanceAfterVnd: number; createdAt: string };
  type WalletData = { balanceVnd: number; products: WalletProduct[]; entries: WalletEntry[]; transferContent: string; topupQrCode: string };

  const manualQrUrl = "https://vietqr.app/img?bank=BIDV&acc=96247OW8RC&template=compact&holder=DANG%20THAI%20AN";
  let authSession = $state<ExtensionAuthSession | null>(null);
  let authLoading = $state(true);
  let authActionLoading = $state(false);
  let authError = $state("");
  let wallet = $state<WalletData | null>(null);
  let walletLoading = $state(false);
  let walletError = $state("");
  let paymentLink = $state("");
  let paymentQr = $state("");

  function formatVnd(value: number): string {
    return `${new Intl.NumberFormat("vi-VN").format(Number(value || 0))} VND`;
  }

  async function loadAuthState() {
    authLoading = true;
    authError = "";
    try {
      const res = (await browser.runtime.sendMessage({ type: "AUTH_ME" })) as
        | { ok: true; session: ExtensionAuthSession | null }
        | { ok: false; error: string }
        | undefined;
      if (!res) throw new Error("Không nhận được phản hồi đăng nhập.");
      if (!res.ok) throw new Error(res.error);
      authSession = res.session;
      if (authSession) await loadWallet(authSession.accessToken);
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
      const res = (await browser.runtime.sendMessage({ type: "AUTH_LOGIN" })) as
        | { ok: true; session: ExtensionAuthSession }
        | { ok: false; error: string }
        | undefined;
      if (!res) throw new Error("Không nhận được phản hồi đăng nhập.");
      if (!res.ok) throw new Error(res.error);
      authSession = res.session;
      await loadWallet(res.session.accessToken);
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
      const res = (await browser.runtime.sendMessage({ type: "AUTH_LOGOUT" })) as { ok: boolean; error?: string } | undefined;
      if (!res?.ok) throw new Error(res?.error || "Đăng xuất thất bại.");
      authSession = null;
      wallet = null;
      paymentLink = "";
      paymentQr = "";
    } catch (error) {
      authError = error instanceof Error ? error.message : String(error);
    } finally {
      authActionLoading = false;
    }
  }

  async function openWebAccount() {
    authActionLoading = true;
    authError = "";
    try {
      if (!authSession?.accessToken) throw new Error("Chưa có phiên đăng nhập extension.");
      await browser.tabs.create({ url: await createWebLoginUrl(authSession.accessToken) });
    } catch (error) {
      authError = error instanceof Error ? error.message : String(error);
    } finally {
      authActionLoading = false;
    }
  }

  async function loadWallet(token = authSession?.accessToken) {
    if (!token) return;
    walletLoading = true;
    walletError = "";
    try {
      const res = await fetch(`${getApiBase()}/billing/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as WalletData & { error?: string };
      if (!res.ok) throw new Error(data.error || `Không tải được ví (${res.status}).`);
      wallet = data;
    } catch (error) {
      walletError = error instanceof Error ? error.message : String(error);
    } finally {
      walletLoading = false;
    }
  }

  async function startCheckout(productCode: string) {
    if (!authSession?.accessToken) return;
    walletError = "";
    authActionLoading = true;
    try {
      const res = await fetch(`${getApiBase()}/billing/checkout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authSession.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ productCode }),
      });
      const data = (await res.json()) as { paymentLink?: string; qrCode?: string | null; error?: string };
      if (!res.ok || !data.paymentLink) throw new Error(data.error || "Không tạo được đơn nạp tiền.");
      paymentLink = data.paymentLink;
      paymentQr = data.qrCode || "";
    } catch (error) {
      walletError = error instanceof Error ? error.message : String(error);
    } finally {
      authActionLoading = false;
    }
  }

  loadAuthState();
</script>

<div class="settings-container account-container">
  <div class="setting-item">
    <h3>Tài khoản</h3>
    <div class="auth-card">
      {#if authLoading}
        <p class="auth-status">Đang kiểm tra phiên đăng nhập...</p>
      {:else if authSession}
        <div class="auth-user-row">
          {#if authSession.user.avatar_url}
            <img class="auth-avatar" src={authSession.user.avatar_url} alt="Ảnh đại diện" referrerpolicy="no-referrer" />
          {:else}
            <div class="auth-avatar auth-avatar-fallback">{(authSession.user.display_name || authSession.user.email).slice(0, 1).toUpperCase()}</div>
          {/if}
          <div class="auth-user-info">
            <strong>{authSession.user.display_name || "Chưa có tên"}</strong>
            <span>{authSession.user.email}</span>
          </div>
        </div>
        <div class="auth-actions">
          <button class="auth-button auth-button-secondary" onclick={openWebAccount} disabled={authActionLoading}>Mở trang tài khoản</button>
          <button class="auth-button auth-button-secondary" onclick={logout} disabled={authActionLoading}>Đăng xuất</button>
        </div>
      {:else}
        <p class="auth-status">Đăng nhập để xem số dư và nạp tiền.</p>
        <button class="auth-button" onclick={loginWithGoogle} disabled={authActionLoading}>{authActionLoading ? "Đang mở Google..." : "Đăng nhập với Google"}</button>
      {/if}
      {#if authError}<div class="auth-error">{authError}</div>{/if}
    </div>
  </div>

  {#if authSession}
    <div class="setting-item">
      <div class="wallet-heading"><h3>Số dư ví AI</h3><button class="wallet-refresh" onclick={() => loadWallet()} disabled={walletLoading} title="Tải lại số dư">↻</button></div>
      <div class="wallet-balance">{walletLoading && !wallet ? "Đang tải..." : formatVnd(wallet?.balanceVnd || 0)}</div>
      {#if walletError}<div class="auth-error">{walletError}</div>{/if}
    </div>

    <div class="setting-item">
      <h3>Nạp tiền</h3>
      <div class="wallet-qr-card">
        <img src={paymentQr || wallet?.topupQrCode || manualQrUrl} alt="QR nạp tiền BIDV" class="wallet-qr" />
        <p>{paymentQr ? "QR SePay đã được tạo. Quét QR và giữ nguyên nội dung để số dư được cộng tự động." : `Quét QR và giữ nguyên nội dung ${wallet?.transferContent || "JISHO..."} để số dư được cộng tự động.`}</p>
      </div>
      <div class="wallet-products">
        {#each wallet?.products || [] as product}
          <button class="auth-button" onclick={() => startCheckout(product.code)} disabled={authActionLoading}>{formatVnd(product.amountVnd)}</button>
        {/each}
      </div>
      {#if paymentLink}<a class="auth-button wallet-pay-link" href={paymentLink} target="_blank" rel="noreferrer">Mở QR nạp tiền</a>{/if}
    </div>

    <div class="setting-item">
      <h3>Giao dịch gần đây</h3>
      {#if !wallet?.entries?.length}<p class="auth-status">Chưa có giao dịch.</p>{:else}<div class="wallet-entries">{#each wallet.entries.slice(0, 5) as entry}<div><span>{entry.entryType === "topup" ? "Nạp tiền" : "Phí AI"}</span><strong class:wallet-negative={entry.amountVnd < 0}>{entry.amountVnd > 0 ? "+" : ""}{formatVnd(entry.amountVnd)}</strong></div>{/each}</div>{/if}
    </div>
  {/if}
</div>
