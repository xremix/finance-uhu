import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { Category } from '../models/category';
import { Transaction } from '../models/transaction';

interface MonthlyCategorySpend {
  month: Date;
  label: string;
  amount: number;
  transactionCount: number;
  barHeight: number;
  hasImportedTransactions: boolean;
}

export interface CategorySpendingTrend {
  category: Category;
  parentLabel: string;
  months: MonthlyCategorySpend[];
  baseline: number;
  recent: number;
  change: number;
  changePercent?: number;
  baselineTransactionCount: number;
  recentTransactionCount: number;
  explanation: string;
  direction: 'higher' | 'lower' | 'steady' | 'unavailable';
}

interface TrendTransactionRequest {
  category: Category;
  from: Date;
  to: Date;
}

@Component({
  selector: 'app-spending-trends',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './spending-trends.component.html',
  styleUrl: './spending-trends.component.scss',
})
export class SpendingTrendsComponent implements OnChanges {
  @Input() transactions: readonly Transaction[] = [];
  @Input() categories: Category[] = [];
  @Output() openTransactions = new EventEmitter<TrendTransactionRequest>();

  months: Date[] = [];
  coveredMonths: boolean[] = [];
  trends: CategorySpendingTrend[] = [];
  recentMonthCount = 0;
  baselineStart?: Date;
  baselineEnd?: Date;
  recentStart?: Date;
  recentEnd?: Date;

  get hasEnoughMonths(): boolean {
    return this.months.length >= 6 && this.coveredMonths.every(Boolean);
  }

  get hasMissingMonths(): boolean {
    return this.coveredMonths.some(covered => !covered);
  }

  get periodDescription(): string {
    if (this.months.length === 0) return '';
    if (this.hasEnoughMonths && this.baselineStart && this.baselineEnd && this.recentStart && this.recentEnd) {
      return `${this.formatMonth(this.baselineStart)}–${this.formatMonth(this.baselineEnd)} → ${this.formatMonth(this.recentStart)}–${this.formatMonth(this.recentEnd)}`;
    }
    return `${this.formatMonth(this.months[0])} bis ${this.formatMonth(this.months[this.months.length - 1])}`;
  }

  ngOnChanges(): void {
    this.calculateTrends();
  }

  requestTransactions(trend: CategorySpendingTrend): void {
    if (this.months.length === 0) return;

    this.openTransactions.emit({
      category: trend.category,
      from: this.months[0],
      to: this.endOfMonth(this.months[this.months.length - 1]),
    });
  }

  chartAriaLabel(trend: CategorySpendingTrend): string {
    const months = trend.months.map(month =>
      `${month.label}: ${month.hasImportedTransactions ? this.formatAmount(month.amount) : 'keine Buchungen importiert'}`
    );
    return `Monatliche Ausgaben für ${trend.category.name}. ${months.join('. ')}`;
  }

  trackByMonth(_index: number, month: MonthlyCategorySpend): number {
    return month.month.getTime();
  }

  trackByCategory(_index: number, trend: CategorySpendingTrend): Category {
    return trend.category;
  }

  private calculateTrends(): void {
    this.months = this.getAnalysisMonths();
    this.recentMonthCount = this.months.length > 0
      ? Math.min(3, Math.max(1, Math.floor(this.months.length / 2)))
      : 0;
    const comparisonStartIndex = Math.max(0, this.months.length - (this.recentMonthCount * 2));
    this.baselineStart = this.months[comparisonStartIndex];
    this.baselineEnd = this.months[Math.max(0, this.months.length - this.recentMonthCount - 1)];
    this.recentStart = this.months[this.months.length - this.recentMonthCount];
    this.recentEnd = this.months[this.months.length - 1];

    if (this.months.length === 0) {
      this.coveredMonths = [];
      this.trends = [];
      return;
    }

    const monthIndexByKey = new Map(this.months.map((month, index) => [this.monthKey(month), index]));
    const categoryTotals = new Map<Category, Array<{ amount: number; count: number; ticketTotal: number }>>();
    const coveredMonthKeys = new Set<number>();
    for (const transaction of this.transactions) {
      if (transaction.bookingDate instanceof Date && !Number.isNaN(transaction.bookingDate.getTime())) {
        coveredMonthKeys.add(this.monthKey(transaction.bookingDate));
      }
    }
    this.coveredMonths = this.months.map(month => coveredMonthKeys.has(this.monthKey(month)));

    for (const transaction of this.transactions) {
      const category = transaction.category;
      if (!category || transaction.amount >= 0 || category.type === 'income' || this.isSavingsCategory(category)) continue;
      if (!(transaction.bookingDate instanceof Date) || Number.isNaN(transaction.bookingDate.getTime())) continue;

      const monthIndex = monthIndexByKey.get(this.monthKey(transaction.bookingDate));
      if (monthIndex === undefined) continue;

      const monthly = categoryTotals.get(category) ?? this.months.map(() => ({ amount: 0, count: 0, ticketTotal: 0 }));
      monthly[monthIndex].amount += Math.abs(transaction.amount);
      monthly[monthIndex].count++;
      monthly[monthIndex].ticketTotal += Math.abs(transaction.amount);
      categoryTotals.set(category, monthly);
    }

    this.trends = Array.from(categoryTotals, ([category, totals]) => {
      const monthlySpending = totals.map((item, index) => ({
        month: this.months[index],
        label: this.formatMonth(this.months[index]),
        amount: item.amount,
        transactionCount: item.count,
        barHeight: 0,
        hasImportedTransactions: this.coveredMonths[index],
      }));

      const baselineItems = totals.slice(comparisonStartIndex, this.months.length - this.recentMonthCount);
      const recentItems = totals.slice(this.months.length - this.recentMonthCount);
      const baseline = this.median(baselineItems.map(item => item.amount));
      const recent = this.median(recentItems.map(item => item.amount));
      const change = recent - baseline;
      const threshold = Math.max(25, baseline * 0.15);
      const direction: CategorySpendingTrend['direction'] = !this.hasEnoughMonths
        ? 'unavailable'
        : change >= threshold
          ? 'higher'
          : change <= -threshold
            ? 'lower'
            : 'steady';
      const baselineTransactionCount = this.median(baselineItems.map(item => item.count));
      const recentTransactionCount = this.median(recentItems.map(item => item.count));
      const baselineTicket = this.median(baselineItems.filter(item => item.count > 0).map(item => item.ticketTotal / item.count));
      const recentTicket = this.median(recentItems.filter(item => item.count > 0).map(item => item.ticketTotal / item.count));
      const maxMonthlyAmount = Math.max(...monthlySpending.map(item => item.amount));
      monthlySpending.forEach(item => {
        item.barHeight = maxMonthlyAmount === 0 ? 0 : Math.max(8, (item.amount / maxMonthlyAmount) * 100);
      });

      return {
        category,
        parentLabel: this.findCategoryPath(category, this.categories)?.slice(0, -1).join(' › ') ?? '',
        months: monthlySpending,
        baseline,
        recent,
        change,
        changePercent: baseline > 0 ? (change / baseline) * 100 : undefined,
        baselineTransactionCount,
        recentTransactionCount,
        explanation: this.explainChange(direction, baselineTransactionCount, recentTransactionCount, baselineTicket, recentTicket),
        direction,
      };
    })
      .filter(trend => Math.max(trend.baseline, trend.recent) >= 25)
      .sort((a, b) => {
        const directionOrder = (trend: CategorySpendingTrend) => trend.direction === 'higher' ? 0 : trend.direction === 'lower' ? 1 : 2;
        return directionOrder(a) - directionOrder(b) || Math.abs(b.change) - Math.abs(a.change);
      })
      .slice(0, 10);
  }

  private getAnalysisMonths(): Date[] {
    let firstDate: Date | undefined;
    let latestDate: Date | undefined;
    for (const transaction of this.transactions) {
      const date = transaction.bookingDate;
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) continue;
      if (!firstDate || date < firstDate) firstDate = date;
      if (!latestDate || date > latestDate) latestDate = date;
    }
    if (!firstDate || !latestDate) return [];
    let end = new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);
    const now = new Date();
    if (end.getFullYear() === now.getFullYear() && end.getMonth() === now.getMonth()) {
      end = new Date(end.getFullYear(), end.getMonth(), 0);
      end.setDate(1);
    }

    const first = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
    if (first > end) return [];

    const monthCount = (end.getFullYear() - first.getFullYear()) * 12 + end.getMonth() - first.getMonth() + 1;
    const count = Math.min(6, monthCount);
    return Array.from({ length: count }, (_, index) => new Date(end.getFullYear(), end.getMonth() - count + index + 1, 1));
  }

  private isSavingsCategory(category: Category): boolean {
    if (category.type === 'savings') return true;
    return this.categories.some(parent => parent.type === 'savings' && this.containsCategory(parent, category));
  }

  private containsCategory(parent: Category, target: Category): boolean {
    return (parent.subCategories ?? []).some(category =>
      category === target || this.containsCategory(category, target)
    );
  }

  private findCategoryPath(target: Category, categories: Category[], path: string[] = []): string[] | undefined {
    for (const category of categories) {
      const next = [...path, category.name];
      if (category === target) return next;
      const childPath = this.findCategoryPath(target, category.subCategories ?? [], next);
      if (childPath) return childPath;
    }
    return undefined;
  }

  private explainChange(
    direction: CategorySpendingTrend['direction'],
    baselineCount: number,
    recentCount: number,
    baselineTicket: number,
    recentTicket: number,
  ): string {
    if (direction === 'unavailable') return 'Mehr Monate zeigen den Verlauf';
    if (baselineCount === 0 && recentCount > 0) return 'In letzter Zeit regelmäßig aufgetreten';
    if (recentCount === 0 && baselineCount > 0) return 'In letzter Zeit kaum aufgetreten';

    const countImpact = Math.abs(recentCount - baselineCount) / Math.max(1, baselineCount);
    const ticketImpact = Math.abs(recentTicket - baselineTicket) / Math.max(1, baselineTicket);
    if (countImpact > ticketImpact * 1.5) {
      return direction === 'lower' ? 'Vor allem seltener gebucht' : 'Vor allem häufiger gebucht';
    }
    if (ticketImpact > countImpact * 1.5) {
      return direction === 'lower' ? 'Vor allem kleinere Beträge' : 'Vor allem höhere Einzelbeträge';
    }
    if (direction === 'steady') return 'Im üblichen Bereich';
    return direction === 'lower' ? 'Weniger Buchungen und kleinere Beträge' : 'Mehr Buchungen und höhere Beträge';
  }

  private median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  }

  private monthKey(date: Date): number {
    return date.getFullYear() * 12 + date.getMonth();
  }

  private formatMonth(date: Date): string {
    return date.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
  }

  private formatAmount(amount: number): string {
    return amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  }

  private endOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  }
}
