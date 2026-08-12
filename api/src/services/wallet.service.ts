import { and, desc, eq, sql } from 'drizzle-orm'
import { Database, getDb } from '../db'
import { walletLedgerEntries } from '../db/schema'

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
  private db: Database

  constructor(binding: D1Database) { this.db = getDb(binding) }

  async getBalance(userId: number): Promise<WalletBalance> {
    const result = await this.db.select({ balanceVnd: sql<number>`COALESCE(SUM(${walletLedgerEntries.amountVnd}), 0)` }).from(walletLedgerEntries).where(eq(walletLedgerEntries.userId, userId))
    return { balanceVnd: Number(result[0]?.balanceVnd ?? 0) }
  }

  async listEntries(userId: number, limit = 50): Promise<WalletLedgerEntry[]> {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 100) : 50
    const result = await this.db.select().from(walletLedgerEntries).where(eq(walletLedgerEntries.userId, userId)).orderBy(desc(walletLedgerEntries.id)).limit(safeLimit)
    return result.map((entry) => ({
      id: entry.id, createdAt: entry.createdAt, userId: entry.userId,
      entryType: entry.entryType, amountVnd: entry.amountVnd, balanceAfterVnd: entry.balanceAfterVnd,
    }))
  }

  async createEntry(input: WalletEntryInput): Promise<WalletLedgerEntry> {
    const current = await this.getBalance(input.userId)
    const balanceAfterVnd = current.balanceVnd + input.amountVnd
    if (input.amountVnd < 0 && balanceAfterVnd < 0) {
      throw new InsufficientBalanceError(current.balanceVnd, Math.abs(input.amountVnd))
    }
    const result = await this.db.insert(walletLedgerEntries).values({ userId: input.userId, entryType: input.entryType, amountVnd: input.amountVnd, balanceAfterVnd, paymentOrderId: input.paymentOrderId ?? null, openrouterRequestId: input.openrouterRequestId ?? null, sepayTransactionId: input.sepayTransactionId ?? null, providerCostUsd: input.providerCostUsd ?? null, usdToVnd: input.usdToVnd ?? null, markupMultiplier: input.markupMultiplier ?? null, note: input.note ?? null }).returning({ id: walletLedgerEntries.id })
    const id = result[0]?.id
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
