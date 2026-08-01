import { D1DatabaseCompat } from '../types'

export type WalletBalance = {
  balanceVnd: number
}

export type WalletLedgerEntry = {
  id: number
  createdAt: string
  userId: number
  entryType: 'topup' | 'ai_charge' | 'adjustment'
  amountVnd: number
  balanceAfterVnd: number
}

export class InsufficientBalanceError extends Error {
  constructor(readonly balanceVnd: number, readonly chargeVnd: number) {
    super('Wallet balance is insufficient')
    this.name = 'InsufficientBalanceError'
  }
}

type WalletEntryInput = {
  userId: number
  entryType: WalletLedgerEntry['entryType']
  amountVnd: number
  paymentOrderId?: number | null
  sepayTransactionId?: number | null
  openrouterRequestId?: number | null
  providerCostUsd?: string | null
  usdToVnd?: number | null
  markupMultiplier?: number | null
  note?: string | null
}

export class WalletService {
  constructor(private db: D1DatabaseCompat) {}

  async getBalance(userId: number): Promise<WalletBalance> {
    const result = await this.db
      .prepare('SELECT COALESCE(SUM(amount_vnd), 0) AS balance_vnd FROM wallet_ledger_entries WHERE user_id = ?')
      .bind(userId)
      .all<{ balance_vnd: number }>()
    return { balanceVnd: Number(result.results?.[0]?.balance_vnd ?? 0) }
  }

  async listEntries(userId: number, limit = 50): Promise<WalletLedgerEntry[]> {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 100) : 50
    const result = await this.db
      .prepare(
        `SELECT id, created_at, user_id, entry_type, amount_vnd, balance_after_vnd
         FROM wallet_ledger_entries
         WHERE user_id = ?
         ORDER BY id DESC
         LIMIT ?`,
      )
      .bind(userId, safeLimit)
      .all<{ id: number; created_at: string; user_id: number; entry_type: WalletLedgerEntry['entryType']; amount_vnd: number; balance_after_vnd: number }>()

    return (result.results ?? []).map((entry) => ({
      id: Number(entry.id),
      createdAt: String(entry.created_at),
      userId: Number(entry.user_id),
      entryType: entry.entry_type,
      amountVnd: Number(entry.amount_vnd),
      balanceAfterVnd: Number(entry.balance_after_vnd),
    }))
  }

  async createEntry(input: WalletEntryInput): Promise<WalletLedgerEntry> {
    const current = await this.getBalance(input.userId)
    const balanceAfterVnd = current.balanceVnd + input.amountVnd
    if (input.amountVnd < 0 && balanceAfterVnd < 0) {
      throw new InsufficientBalanceError(current.balanceVnd, Math.abs(input.amountVnd))
    }
    const result = await this.db
      .prepare(
        `INSERT INTO wallet_ledger_entries (
          user_id, entry_type, amount_vnd, balance_after_vnd, payment_order_id,
          openrouter_request_id, sepay_transaction_id, provider_cost_usd, usd_to_vnd, markup_multiplier, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id`,
      )
      .bind(
        input.userId,
        input.entryType,
        input.amountVnd,
        balanceAfterVnd,
        input.paymentOrderId ?? null,
        input.openrouterRequestId ?? null,
        input.sepayTransactionId ?? null,
        input.providerCostUsd ?? null,
        input.usdToVnd ?? null,
        input.markupMultiplier ?? null,
        input.note ?? null,
      )
      .all<{ id: number }>()

    const id = result.results?.[0]?.id
    if (!id) throw new Error('Failed to create wallet ledger entry')
    return {
      id: Number(id),
      createdAt: new Date().toISOString(),
      userId: input.userId,
      entryType: input.entryType,
      amountVnd: input.amountVnd,
      balanceAfterVnd,
    }
  }
}
