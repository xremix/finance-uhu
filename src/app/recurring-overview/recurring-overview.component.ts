import { Component, ChangeDetectionStrategy } from '@angular/core';
import { DataState } from '../services/data-state';
import { RecurringKind, RecurringSeries } from '../services/recurring-service';
import { Transaction } from '../models/transaction';

type StatusFilter = 'active' | 'ended' | 'all';

interface HistoryBar {
  amount: number;
  date: Date;
  label: string;
  height: number;
  empty: boolean;
}

interface SeriesGroup {
  kind: RecurringKind;
  title: string;
  icon: string;
  series: RecurringSeries[];
  monthlyTotal: number;
}

@Component({
    selector: 'app-recurring-overview',
    templateUrl: './recurring-overview.component.html',
    styleUrl: './recurring-overview.component.scss',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class RecurringOverviewComponent {
  public statusFilter: StatusFilter = 'active';
  public expandedKey?: string;

  private readonly groupDefinitions: { kind: RecurringKind; title: string; icon: string }[] = [
    { kind: 'expense', title: 'Fixkosten & Abos', icon: 'fa-solid fa-file-invoice' },
    { kind: 'savings', title: 'Sparraten', icon: 'fa-solid fa-piggy-bank' },
    { kind: 'income', title: 'Regelmäßige Einnahmen', icon: 'fa-solid fa-arrow-trend-up' },
  ];

  constructor(protected dataState: DataState) {}

  get allSeries(): RecurringSeries[] {
    return this.dataState.selectedRecurringSeries;
  }

  get activeSeries(): RecurringSeries[] {
    return this.allSeries.filter((s) => s.isActive);
  }

  get endedCount(): number {
    return this.allSeries.length - this.activeSeries.length;
  }

  get monthlyExpenses(): number {
    return this.sumMonthly('expense');
  }

  get monthlySavings(): number {
    return this.sumMonthly('savings');
  }

  get monthlyIncome(): number {
    return this.sumMonthly('income');
  }

  get fixedShareOfIncome(): number | undefined {
    const income = this.monthlyIncome;
    return income > 0 ? Math.abs(this.monthlyExpenses) / income : undefined;
  }

  get priceIncreases(): RecurringSeries[] {
    return this.activeSeries.filter((s) => s.priceChange && Math.abs(s.priceChange.to) > Math.abs(s.priceChange.from));
  }

  get groups(): SeriesGroup[] {
    const visible = this.allSeries.filter((s) =>
      this.statusFilter === 'all' ? true : this.statusFilter === 'active' ? s.isActive : !s.isActive,
    );
    return this.groupDefinitions
      .map((definition) => {
        const series = visible.filter((s) => s.kind === definition.kind);
        return {
          ...definition,
          series,
          monthlyTotal: series.filter((s) => s.isActive).reduce((sum, s) => sum + s.monthlyAmount, 0),
        };
      })
      .filter((group) => group.series.length > 0);
  }

  toggle(series: RecurringSeries) {
    this.expandedKey = this.expandedKey === series.key ? undefined : series.key;
  }

  trackSeries(_: number, series: RecurringSeries) {
    return series.key;
  }

  /** Newest first for the detail list */
  bookings(series: RecurringSeries): Transaction[] {
    return [...series.transactions].reverse();
  }

  /**
   * Bars for the mini history chart (height 0–100). Monthly or slower rhythms get one bar per
   * calendar month for the last 12 months, so months without a payment show up as empty bars.
   */
  history(series: RecurringSeries): HistoryBar[] {
    if (series.intervalDays < 20) {
      return this.toBars(series.transactions.slice(-12).map((t) => ({ amount: t.amount, date: t.bookingDate, label: this.shortDate(t.bookingDate) })));
    }

    const end = series.lastDate;
    const months: { amount: number; date: Date; label: string }[] = [];
    for (let offset = 11; offset >= 0; offset--) {
      const date = new Date(end.getFullYear(), end.getMonth() - offset, 1);
      const amount = series.transactions
        .filter((t) => t.bookingDate.getFullYear() === date.getFullYear() && t.bookingDate.getMonth() === date.getMonth())
        .reduce((sum, t) => sum + t.amount, 0);
      months.push({ amount, date, label: this.monthYear(date) });
    }
    return this.toBars(months);
  }

  private toBars(items: { amount: number; date: Date; label: string }[]): HistoryBar[] {
    const max = Math.max(...items.map((i) => Math.abs(i.amount)));
    return items.map((item) => ({
      ...item,
      empty: item.amount === 0,
      height: item.amount === 0 || max === 0 ? 12 : Math.max(8, (Math.abs(item.amount) / max) * 100),
    }));
  }

  showMonthlyHint(series: RecurringSeries): boolean {
    return series.frequency !== 'monthly';
  }

  monthYear(date: Date): string {
    return date.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
  }

  shortDate(date: Date): string {
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  barLabel(bar: HistoryBar): string {
    if (bar.empty) {
      return `${bar.label}: keine Zahlung`;
    }
    return `${bar.label}: ${bar.amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}`;
  }

  rangeLabel(series: RecurringSeries): string {
    const fmt = (v: number) => Math.abs(v).toLocaleString('de-DE', { maximumFractionDigits: 0 });
    const low = Math.min(Math.abs(series.minAmount), Math.abs(series.maxAmount));
    const high = Math.max(Math.abs(series.minAmount), Math.abs(series.maxAmount));
    return `${fmt(low)}–${fmt(high)} €`;
  }

  detectionReason(series: RecurringSeries): string {
    const dates = [...new Set(series.transactions.map(t => new Date(t.bookingDate.getFullYear(), t.bookingDate.getMonth(), t.bookingDate.getDate()).getTime()))]
      .sort((a, b) => a - b);
    const gaps = dates.slice(1).map((date, index) => Math.round((date - dates[index]) / (24 * 60 * 60 * 1000)));
    const medianGap = gaps.length ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : series.intervalDays;
    return `${dates.length} Zahlungstermine, typischer Abstand etwa ${medianGap} Tage; ${(series.regularity * 100).toLocaleString('de-DE', { maximumFractionDigits: 0 })} % der Abstände passen zum erkannten Rhythmus. Dafür verlangt die Erkennung mindestens drei Termine (bei halbjährlichen und jährlichen Zahlungen zwei) und 75 % passende Abstände.`;
  }

  total(series: RecurringSeries): number {
    return series.transactions.reduce((sum, t) => sum + t.amount, 0);
  }

  domId(series: RecurringSeries): string {
    return 'series-' + series.key.replace(/[^a-z0-9]+/gi, '-');
  }

  private sumMonthly(kind: RecurringKind): number {
    return this.activeSeries.filter((s) => s.kind === kind).reduce((sum, s) => sum + s.monthlyAmount, 0);
  }
}
