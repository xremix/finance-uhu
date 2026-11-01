import { Injectable } from '@angular/core';
import { DailyBalance } from '../models/balance';
import { Transaction } from '../models/transaction';
import { RecurringSeries } from './recurring-service';

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_WINDOW_DAYS = 90;
const MIN_HISTORY_DAYS = 30;

export interface ForecastPoint {
  date: Date;
  value: number;
}

export interface ForecastPayment {
  date: Date;
  name: string;
  amount: number;
  categoryName?: string;
}

export interface ForecastCategoryAverage {
  name: string;
  weeklyAmount: number;
}

export interface ForecastProjection {
  asOf: Date;
  endDate: Date;
  hasBalance: boolean;
  startValue: number;
  endValue: number;
  change: number;
  historyDays: number;
  usesHistoryAverage: boolean;
  baselineTransactionCount: number;
  weeklyIncome: number;
  weeklyExpenses: number;
  categoryAverages: ForecastCategoryAverage[];
  upcomingPayments: ForecastPayment[];
  upcomingPaymentCount: number;
  activeRecurringCount: number;
  points: ForecastPoint[];
}

@Injectable({ providedIn: 'root' })
export class ForecastService {
  calculate(
    transactions: readonly Transaction[],
    recurringSeries: readonly RecurringSeries[],
    dailyBalances: readonly DailyBalance[],
    horizonDays = 84,
  ): ForecastProjection {
    const datedTransactions = transactions.filter((transaction) =>
      transaction.bookingDate instanceof Date &&
      !Number.isNaN(transaction.bookingDate.getTime()) &&
      Number.isFinite(transaction.amount),
    );
    const latestTransactionDate = datedTransactions.reduce<Date | undefined>(
      (latest, transaction) => !latest || transaction.bookingDate > latest ? transaction.bookingDate : latest,
      undefined,
    );
    const latestBalance = dailyBalances[dailyBalances.length - 1];
    const asOf = this.startOfDay(latestBalance?.date ?? latestTransactionDate ?? new Date());
    const endDate = this.addDays(asOf, horizonDays);
    const hasBalance = !!latestBalance;
    const startValue = hasBalance ? latestBalance.balance : 0;

    const recurringTransactions = new Set(recurringSeries.flatMap((series) => series.transactions));
    const earliestTransaction = datedTransactions
      .filter((transaction) => this.startOfDay(transaction.bookingDate) <= asOf)
      .reduce<Date | undefined>(
        (earliest, transaction) => !earliest || transaction.bookingDate < earliest ? transaction.bookingDate : earliest,
        undefined,
      );
    const historyStart = this.addDays(asOf, -(HISTORY_WINDOW_DAYS - 1));
    const effectiveHistoryStart = earliestTransaction && earliestTransaction > historyStart
      ? this.startOfDay(earliestTransaction)
      : historyStart;
    const historyDays = earliestTransaction
      ? Math.max(1, Math.min(HISTORY_WINDOW_DAYS, this.daysBetween(effectiveHistoryStart, asOf) + 1))
      : 0;
    const usesHistoryAverage = historyDays >= MIN_HISTORY_DAYS;

    const categoryTotals = new Map<string, number>();
    let historicalIncome = 0;
    let historicalExpenses = 0;
    let baselineTransactionCount = 0;

    if (usesHistoryAverage) {
      for (const transaction of datedTransactions) {
        const date = this.startOfDay(transaction.bookingDate);
        if (date < effectiveHistoryStart || date > asOf || recurringTransactions.has(transaction)) continue;

        const categoryName = transaction.category?.name || 'Ohne Kategorie';
        categoryTotals.set(categoryName, (categoryTotals.get(categoryName) ?? 0) + transaction.amount);
        if (transaction.amount > 0) historicalIncome += transaction.amount;
        if (transaction.amount < 0) historicalExpenses += transaction.amount;
        baselineTransactionCount++;
      }
    }

    const dailyBaseline = usesHistoryAverage
      ? [...categoryTotals.values()].reduce((sum, amount) => sum + amount, 0) / historyDays
      : 0;
    const weeklyIncome = usesHistoryAverage ? historicalIncome * 7 / historyDays : 0;
    const weeklyExpenses = usesHistoryAverage ? Math.abs(historicalExpenses) * 7 / historyDays : 0;
    const categoryAverages = [...categoryTotals.entries()]
      .map(([name, amount]) => ({ name, weeklyAmount: amount * 7 / Math.max(1, historyDays) }))
      .sort((a, b) => Math.abs(b.weeklyAmount) - Math.abs(a.weeklyAmount));

    const payments = this.projectRecurringPayments(recurringSeries, asOf, endDate);
    const paymentChanges = new Map<number, number>();
    for (const payment of payments) {
      const key = this.startOfDay(payment.date).getTime();
      paymentChanges.set(key, (paymentChanges.get(key) ?? 0) + payment.amount);
    }

    const points: ForecastPoint[] = [{ date: asOf, value: startValue }];
    let value = startValue;
    for (let day = 1; day <= horizonDays; day++) {
      const date = this.addDays(asOf, day);
      value = this.round(value + dailyBaseline + (paymentChanges.get(date.getTime()) ?? 0));
      points.push({ date, value });
    }

    const endValue = points[points.length - 1].value;
    return {
      asOf,
      endDate,
      hasBalance,
      startValue,
      endValue,
      change: this.round(endValue - startValue),
      historyDays,
      usesHistoryAverage,
      baselineTransactionCount,
      weeklyIncome: this.round(weeklyIncome),
      weeklyExpenses: this.round(weeklyExpenses),
      categoryAverages,
      upcomingPayments: payments.slice(0, 8),
      upcomingPaymentCount: payments.length,
      activeRecurringCount: recurringSeries.filter((series) => series.isActive).length,
      points,
    };
  }

  private projectRecurringPayments(
    recurringSeries: readonly RecurringSeries[],
    asOf: Date,
    endDate: Date,
  ): ForecastPayment[] {
    const payments: ForecastPayment[] = [];
    for (const series of recurringSeries) {
      if (!series.isActive || !Number.isFinite(series.intervalDays) || series.intervalDays <= 0) continue;

      const intervalDays = Math.max(1, Math.round(series.intervalDays));
      const amount = this.estimateAmount(series);
      if (!Number.isFinite(amount) || amount === 0) continue;

      let date = this.startOfDay(series.nextExpectedDate);
      if (date <= asOf) {
        const daysLate = this.daysBetween(date, asOf);
        const graceDays = Math.max(7, intervalDays * 0.35);
        if (daysLate <= graceDays) {
          date = this.addDays(asOf, 1);
        } else {
          const periodsToSkip = Math.floor((asOf.getTime() - date.getTime()) / (intervalDays * DAY_MS)) + 1;
          date = this.addDays(date, periodsToSkip * intervalDays);
        }
      }

      while (date <= endDate) {
        payments.push({ date, name: series.name, amount, categoryName: series.category?.name });
        date = this.addDays(date, intervalDays);
      }
    }

    return payments.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private estimateAmount(series: RecurringSeries): number {
    if (series.amountType === 'fixed') return series.currentAmount;
    // The recurring detector derives this from occurrence-level amounts in the last year.
    return series.monthlyAmount * series.intervalDays / 30.44;
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  }

  private daysBetween(from: Date, to: Date): number {
    return Math.round((this.startOfDay(to).getTime() - this.startOfDay(from).getTime()) / DAY_MS);
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
