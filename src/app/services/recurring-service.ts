import { Injectable } from '@angular/core';
import { Transaction } from '../models/transaction';
import { Category } from '../models/category';

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'halfyearly' | 'yearly';
export type RecurringKind = 'expense' | 'income' | 'savings';

export interface RecurringSeries {
  key: string;
  name: string;
  via?: string;
  kind: RecurringKind;
  category?: Category;
  frequency: RecurringFrequency;
  frequencyLabel: string;
  intervalDays: number;
  amountType: 'fixed' | 'variable';
  /** Ascending by booking date */
  transactions: Transaction[];
  currentAmount: number;
  averageAmount: number;
  minAmount: number;
  maxAmount: number;
  /** Typical amount normalized to one month (signed like the bookings) */
  monthlyAmount: number;
  yearlyAmount: number;
  firstDate: Date;
  lastDate: Date;
  nextExpectedDate: Date;
  isActive: boolean;
  priceChange?: { from: number; to: number; date: Date; percent: number };
  /** 0..1, share of booking gaps that match the detected rhythm */
  regularity: number;
}

interface FrequencyDefinition {
  id: RecurringFrequency;
  label: string;
  days: number;
  min: number;
  max: number;
  minOccurrences: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const AVERAGE_MONTH_DAYS = 30.44;

const FREQUENCIES: FrequencyDefinition[] = [
  { id: 'weekly', label: 'Wöchentlich', days: 7, min: 5, max: 9, minOccurrences: 4 },
  { id: 'biweekly', label: 'Alle 2 Wochen', days: 14, min: 12, max: 17, minOccurrences: 4 },
  { id: 'monthly', label: 'Monatlich', days: AVERAGE_MONTH_DAYS, min: 24, max: 37, minOccurrences: 3 },
  { id: 'bimonthly', label: 'Alle 2 Monate', days: 61, min: 54, max: 68, minOccurrences: 3 },
  { id: 'quarterly', label: 'Vierteljährlich', days: 91, min: 80, max: 103, minOccurrences: 3 },
  { id: 'halfyearly', label: 'Halbjährlich', days: 182, min: 165, max: 200, minOccurrences: 2 },
  { id: 'yearly', label: 'Jährlich', days: 365, min: 340, max: 392, minOccurrences: 2 },
];

/** Payment providers that hide the actual merchant in the purpose text. */
const INTERMEDIARIES = ['paypal', 'klarna', 'sofort', 'stripe', 'adyen', 'mollie', 'unzer', 'payone', 'computop'];

const NOISE_WORDS = new Set([
  'gmbh', 'mbh', 'ag', 'se', 'kg', 'co', 'ug', 'ohg', 'gbr', 'ev', 'eg', 'ltd', 'limited', 'inc', 'llc', 'bv', 'sarl', 'sa', 'sas', 'plc',
  'europe', 'deutschland', 'germany', 'de', 'eu', 'com', 'www', 'und', 'the', 'sagt', 'danke', 'ihr', 'ihre', 'einkauf', 'bei',
  'zahlung', 'lastschrift', 'folgelastschrift', 'erstlastschrift', 'sepa', 'kartenzahlung', 'gutschrift', 'dauerauftrag', 'ueberweisung',
  'überweisung', 'abbuchung', 'rechnung', 'beitrag', 'kunde', 'kundennr', 'vertrag', 'vertragsnr', 'mandat', 'ref', 'nr', 'pp', 'gmbh&co',
]);

const MONTH_NAMES = /\b(januar|februar|maerz|märz|april|mai|juni|juli|august|september|oktober|november|dezember|jan|feb|mar|apr|jun|jul|aug|sep|sept|okt|oct|nov|dez|dec)\b/g;

@Injectable({
  providedIn: 'root',
})
export class RecurringService {
  detect(transactions: Transaction[], categories: Category[] = []): RecurringSeries[] {
    const dated = transactions.filter((t) => t.bookingDate instanceof Date && !isNaN(t.bookingDate.getTime()) && t.amount !== 0);
    if (dated.length === 0) {
      return [];
    }
    const dataEnd = new Date(Math.max(...dated.map((t) => t.bookingDate.getTime())));

    const groups = new Map<string, { name: string; via?: string; items: Transaction[] }>();
    for (const transaction of dated) {
      const identity = this.getIdentity(transaction);
      if (!identity) {
        continue;
      }
      const key = `${transaction.amount < 0 ? '-' : '+'}|${identity.key}`;
      const group = groups.get(key) ?? { name: identity.name, via: identity.via, items: [] };
      group.items.push(transaction);
      groups.set(key, group);
    }

    const series: RecurringSeries[] = [];
    groups.forEach((group, key) => {
      if (group.items.length < 2) {
        return;
      }
      const sorted = [...group.items].sort((a, b) => a.bookingDate.getTime() - b.bookingDate.getTime());
      const whole = this.buildSeries(key, group.name, group.via, sorted, dataEnd, categories);
      if (whole) {
        series.push(whole);
        return;
      }
      // Several contracts with the same counterparty (e.g. two insurance policies): split by amount level.
      this.clusterByAmount(sorted).forEach((cluster, index) => {
        const part = this.buildSeries(`${key}#${index}`, group.name, group.via, cluster, dataEnd, categories);
        if (part) {
          series.push(part);
        }
      });
    });

    return series.sort((a, b) => Math.abs(b.monthlyAmount) - Math.abs(a.monthlyAmount));
  }

  /** Returns the series a transaction belongs to, if any. */
  findSeries(transaction: Transaction, series: RecurringSeries[]): RecurringSeries | undefined {
    return series.find((s) => s.transactions.includes(transaction));
  }

  normalize(text: string): string {
    return (text || '')
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[a-z]{2}\d{2}[a-z0-9]{10,30}/g, ' ') // IBAN-like references
      .replace(/\S*\d\S*/g, ' ') // anything containing digits (dates, order and customer numbers)
      .replace(MONTH_NAMES, ' ')
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 1 && !NOISE_WORDS.has(word))
      .join(' ')
      .trim();
  }

  private getIdentity(transaction: Transaction): { key: string; name: string; via?: string } | undefined {
    const payee = this.normalize(transaction.payerReceiver);
    const intermediary = INTERMEDIARIES.find((name) => payee.includes(name));
    if (payee && !intermediary) {
      return { key: payee.split(' ').slice(0, 3).join(' '), name: this.cleanDisplayName(transaction.payerReceiver) };
    }

    const purpose = this.normalize(transaction.purpose)
      .split(' ')
      .filter((word) => !INTERMEDIARIES.includes(word))
      .slice(0, 2)
      .join(' ');
    if (!purpose) {
      return payee ? { key: payee, name: this.cleanDisplayName(transaction.payerReceiver) } : undefined;
    }
    const name = purpose.replace(/\b\w/g, (c) => c.toUpperCase());
    const via = intermediary ? this.cleanDisplayName(transaction.payerReceiver) : undefined;
    return { key: `${payee}>${purpose}`, name, via };
  }

  private cleanDisplayName(name: string): string {
    const cleaned = (name || '').replace(/\s+/g, ' ').trim();
    return cleaned || 'Unbekannt';
  }

  private buildSeries(
    key: string,
    name: string,
    via: string | undefined,
    items: Transaction[],
    dataEnd: Date,
    categories: Category[],
  ): RecurringSeries | undefined {
    const merged = this.mergeSameDay(items);
    if (merged.length < 2) {
      return undefined;
    }

    const gaps: number[] = [];
    for (let i = 1; i < merged.length; i++) {
      gaps.push((merged[i].date.getTime() - merged[i - 1].date.getTime()) / DAY_MS);
    }
    const typicalGap = this.median(gaps);
    const frequency = FREQUENCIES.find((f) => typicalGap >= f.min && typicalGap <= f.max);
    if (!frequency || merged.length < frequency.minOccurrences) {
      return undefined;
    }

    // A gap matches if it is (a multiple of) the rhythm; multiples tolerate a single missing booking.
    const tolerance = (frequency.max - frequency.min) / 2 / frequency.days;
    let matchingGaps = 0;
    let missedPeriods = 0;
    for (const gap of gaps) {
      const periods = Math.round(gap / frequency.days);
      if (periods >= 1 && periods <= 2 && Math.abs(gap / frequency.days - periods) <= tolerance) {
        matchingGaps++;
        missedPeriods += periods - 1;
      }
    }
    const regularity = matchingGaps / gaps.length;
    if (regularity < 0.75 || missedPeriods > Math.max(1, gaps.length / 4)) {
      return undefined;
    }

    const amounts = merged.map((m) => Math.abs(m.amount));
    const averageAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
    const variation = this.coefficientOfVariation(amounts);
    const priceSteps = this.findPriceSteps(amounts);
    const isFixed = priceSteps !== undefined;

    // Frequent payments are not recurring when their amounts vary strongly,
    // but a stable weekly or biweekly pattern may still have variable amounts.
    if (!isFixed && variation > 0.7 && frequency.days < 20) {
      return undefined;
    }
    // Two bookings are only convincing if the amount matches exactly.
    if (merged.length === 2 && priceSteps?.length !== 0) {
      return undefined;
    }

    const sign = items[0].amount < 0 ? -1 : 1;
    const lastDate = merged[merged.length - 1].date;
    const recentAmounts = amounts.slice(-Math.max(1, Math.round(365 / frequency.days)));
    const typicalAmount = isFixed ? amounts[amounts.length - 1] : recentAmounts.reduce((s, a) => s + a, 0) / recentAmounts.length;
    const monthlyAmount = (sign * typicalAmount * AVERAGE_MONTH_DAYS) / frequency.days;
    const grace = Math.max(7, frequency.days * 0.35);
    const nextExpectedDate = new Date(lastDate.getTime() + frequency.days * DAY_MS);

    let priceChange: RecurringSeries['priceChange'];
    if (priceSteps && priceSteps.length > 0) {
      const stepIndex = priceSteps[priceSteps.length - 1];
      const from = amounts[stepIndex - 1];
      const to = amounts[stepIndex];
      priceChange = { from: sign * from, to: sign * to, date: merged[stepIndex].date, percent: ((to - from) / from) * 100 };
    }

    return {
      key,
      name,
      via,
      kind: this.getKind(items, sign, categories),
      category: this.mostCommonCategory(items),
      frequency: frequency.id,
      frequencyLabel: frequency.label,
      intervalDays: frequency.days,
      amountType: isFixed ? 'fixed' : 'variable',
      transactions: items,
      currentAmount: sign * amounts[amounts.length - 1],
      averageAmount: sign * averageAmount,
      minAmount: sign * Math.min(...amounts),
      maxAmount: sign * Math.max(...amounts),
      monthlyAmount,
      yearlyAmount: monthlyAmount * 12,
      firstDate: merged[0].date,
      lastDate,
      nextExpectedDate,
      isActive: (dataEnd.getTime() - lastDate.getTime()) / DAY_MS <= frequency.days + grace,
      priceChange,
      regularity,
    };
  }

  /** Combines bookings on the same day (e.g. split charges) into one occurrence. */
  private mergeSameDay(items: Transaction[]): { date: Date; amount: number }[] {
    const result: { date: Date; amount: number }[] = [];
    for (const item of items) {
      const last = result[result.length - 1];
      if (last && last.date.toDateString() === item.bookingDate.toDateString()) {
        last.amount += item.amount;
      } else {
        result.push({ date: item.bookingDate, amount: item.amount });
      }
    }
    return result;
  }

  /**
   * Returns the indices where a fixed price changed, or undefined if the amounts are variable.
   * Fixed means: constant amounts in at most three consecutive blocks (two price changes).
   */
  private findPriceSteps(amounts: number[]): number[] | undefined {
    const steps: number[] = [];
    for (let i = 1; i < amounts.length; i++) {
      if (Math.abs(amounts[i] - amounts[i - 1]) > Math.max(0.01, amounts[i - 1] * 0.005)) {
        steps.push(i);
      }
    }
    if (steps.length === 0) {
      return steps;
    }
    if (steps.length > 2) {
      return undefined;
    }
    const blocks = [0, ...steps, amounts.length];
    for (let i = 1; i < blocks.length - 1; i++) {
      // Every block except the newest one must repeat, otherwise it's just fluctuation.
      if (blocks[i] - blocks[i - 1] < 2) {
        return undefined;
      }
    }
    return steps;
  }

  private clusterByAmount(items: Transaction[]): Transaction[][] {
    const byAmount = [...items].sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
    const clusters: Transaction[][] = [];
    for (const item of byAmount) {
      const current = clusters[clusters.length - 1];
      const reference = current ? Math.abs(current[current.length - 1].amount) : 0;
      if (current && Math.abs(item.amount) <= reference * 1.15 + 0.5) {
        current.push(item);
      } else {
        clusters.push([item]);
      }
    }
    return clusters
      .filter((cluster) => cluster.length >= 2)
      .map((cluster) => cluster.sort((a, b) => a.bookingDate.getTime() - b.bookingDate.getTime()));
  }

  private getKind(items: Transaction[], sign: number, categories: Category[]): RecurringKind {
    const category = this.mostCommonCategory(items);
    const isSavings =
      category?.type === 'savings' ||
      (!!category && categories.some((parent) => parent.type === 'savings' && parent.subCategories.includes(category)));
    if (isSavings) {
      return 'savings';
    }
    return sign < 0 ? 'expense' : 'income';
  }

  private mostCommonCategory(items: Transaction[]): Category | undefined {
    const counts = new Map<Category, number>();
    items.forEach((t) => t.category && counts.set(t.category, (counts.get(t.category) ?? 0) + 1));
    let best: Category | undefined;
    let bestCount = 0;
    counts.forEach((count, category) => {
      if (count > bestCount) {
        best = category;
        bestCount = count;
      }
    });
    return best;
  }

  private median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private coefficientOfVariation(values: number[]): number {
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    if (mean === 0) {
      return 0;
    }
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance) / mean;
  }
}
