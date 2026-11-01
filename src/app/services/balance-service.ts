import { Injectable, Optional } from '@angular/core';
import { BalanceAnchor, DailyBalance } from '../models/balance';
import { Transaction } from '../models/transaction';
import { DataState } from './data-state';
import { APP_DATA_STORE, IndexedDbStorageService } from './indexed-db-storage.service';

/**
 * Simulates the end-of-day account balance for every day of the loaded data,
 * starting from a known balance (anchor) from a file or entered manually.
 */
@Injectable({
  providedIn: 'root',
})
export class BalanceService {
  private manualAnchor: BalanceAnchor | undefined;

  private cacheTransactions: readonly Transaction[] | undefined;
  private cacheAnchor: BalanceAnchor | undefined;
  private cacheResult: DailyBalance[] = [];

  constructor(private dataState: DataState, @Optional() private storage?: IndexedDbStorageService) {}

  get anchor(): BalanceAnchor | undefined {
    return this.dataState.fileBalanceAnchor ?? this.manualAnchor;
  }

  get hasFileBalance(): boolean {
    return !!this.dataState.fileBalanceAnchor;
  }

  /** Daily balances in ascending date order, memoized per transactions/anchor. */
  getDailyBalances(): DailyBalance[] {
    const transactions = this.dataState.allTransactions;
    const anchor = this.anchor;
    if (transactions !== this.cacheTransactions || anchor !== this.cacheAnchor) {
      this.cacheTransactions = transactions;
      this.cacheAnchor = anchor;
      this.cacheResult = anchor ? this.computeDailyBalances(transactions, anchor) : [];
    }
    return this.cacheResult;
  }

  computeDailyBalances(transactions: readonly Transaction[], anchor: BalanceAnchor): DailyBalance[] {
    const changes = new Map<string, number>();
    let start = this.startOfDay(anchor.date);
    let end = this.startOfDay(anchor.date);

    for (const transaction of transactions) {
      const date = transaction.bookingDate;
      if (!date || Number.isNaN(date.getTime()) || Number.isNaN(transaction.amount)) continue;
      const day = this.startOfDay(date);
      const key = this.toKey(day);
      changes.set(key, (changes.get(key) ?? 0) + transaction.amount);
      if (day < start) start = day;
      if (day > end) end = day;
    }

    const days: Date[] = [];
    for (let day = new Date(start); day <= end; day = this.addDays(day, 1)) {
      days.push(day);
    }

    const result: DailyBalance[] = days.map((date) => ({ date, balance: 0, change: this.round(changes.get(this.toKey(date)) ?? 0) }));
    const anchorIndex = result.findIndex((entry) => this.toKey(entry.date) === this.toKey(anchor.date));
    result[anchorIndex].balance = anchor.amount;

    for (let i = anchorIndex + 1; i < result.length; i++) {
      result[i].balance = this.round(result[i - 1].balance + result[i].change);
    }
    for (let i = anchorIndex - 1; i >= 0; i--) {
      result[i].balance = this.round(result[i + 1].balance - result[i + 1].change);
    }

    return result;
  }

  async setManualBalance(date: Date, amount: number): Promise<void> {
    this.manualAnchor = { date: this.startOfDay(date), amount, source: 'manual' };
    try {
      await this.storage?.put(APP_DATA_STORE, 'manualBalance', { date: this.toKey(date), amount });
    } catch (error) {
      console.error('Could not save manual balance in browser storage:', error);
    }
  }

  async clearManualBalance(): Promise<void> {
    this.manualAnchor = undefined;
    try {
      await this.storage?.delete(APP_DATA_STORE, 'manualBalance');
    } catch (error) {
      console.error('Could not clear manual balance from browser storage:', error);
    }
  }

  toKey(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  fromKey(key: string): Date | undefined {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? '');
    if (!match) return undefined;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  async loadManualBalanceFromIndexedDb(): Promise<void> {
    if (!this.storage) return;

    try {
      const stored = await this.storage.get<{ date: string; amount: number }>(APP_DATA_STORE, 'manualBalance');
      const date = this.fromKey(stored?.date ?? '');
      if (!date || typeof stored?.amount !== 'number' || Number.isNaN(stored.amount)) {
        this.manualAnchor = undefined;
        return;
      }
      this.manualAnchor = { date, amount: stored.amount, source: 'manual' };
    } catch {
      this.manualAnchor = undefined;
    }
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
