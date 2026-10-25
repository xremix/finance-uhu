import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Category } from '../models/category';
import { Transaction } from '../models/transaction';
import { DataState } from '../services/data-state';

interface CategoryChange {
  category?: Category;
  label: string;
  current: number;
  baseline: number;
  change: number;
}

interface SpendingInsight {
  status: 'higher' | 'lower' | 'steady' | 'insufficient';
  current: number;
  baseline: number;
  change: number;
  periodStart: Date;
  periodEnd: Date;
  comparisonMonthCount: number;
  contributors: CategoryChange[];
}

@Component({
  selector: 'app-spending-insight',
  templateUrl: './spending-insight.component.html',
  styleUrl: './spending-insight.component.scss',
})
export class SpendingInsightComponent implements OnInit {
  @Output() openTransactions = new EventEmitter<void>();
  @Output() toggleDetails = new EventEmitter<void>();
  @Input() expanded = false;
  @Input() detailsOnly = false;
  insight?: SpendingInsight;

  constructor(
    protected dataState: DataState,
    private changeDetector: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    this.updateInsight();
    this.dataState.selectedTransactionsChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.updateInsight();
        this.changeDetector.markForCheck();
      });
  }

  get summaryLabel(): string {
    const action = this.expanded ? 'Details ausblenden' : 'Details anzeigen';
    if (!this.insight || this.insight.status === 'insufficient') {
      return `Ausgaben-Check: zu wenig Verlauf für einen Vergleich. ${action}`;
    }
    const change = Math.round(Math.abs(this.insight.change));
    const direction = { higher: 'mehr', lower: 'weniger', steady: 'Abweichung' }[this.insight.status];
    return `Ausgaben-Check: ${change} € ${direction} als üblich. ${action}`;
  }

  showTransactions(category?: Category): void {
    if (!this.insight || this.insight.status === 'insufficient') {
      return;
    }

    this.dataState.resetFilter();
    this.dataState.filterByType('all');
    this.dataState.filterByRange(this.insight.periodStart, this.insight.periodEnd);
    if (category) {
      this.dataState.filterByCategory(category);
    }
    this.openTransactions.emit();
  }

  private updateInsight(): void {
    const transactions = this.dataState.allTransactions;
    const latestDate = transactions.reduce<Date | undefined>((latest, transaction) => {
      if (!this.isValidDate(transaction.bookingDate)) {
        return latest;
      }
      return !latest || transaction.bookingDate > latest ? transaction.bookingDate : latest;
    }, undefined);

    if (!latestDate) {
      this.insight = undefined;
      return;
    }

    const latestMonthStart = new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);
    const periodEnd = this.endOfDay(latestDate);
    const periodDay = latestDate.getDate();
    const comparisonMonths = Array.from(new Map(
      transactions
        .filter(transaction => this.isValidDate(transaction.bookingDate) && transaction.bookingDate < latestMonthStart)
        .map(transaction => {
          const date = transaction.bookingDate;
          const month = new Date(date.getFullYear(), date.getMonth(), 1);
          return [`${month.getFullYear()}-${month.getMonth()}`, month] as const;
        })
    ).values()).sort((a, b) => a.getTime() - b.getTime());

    if (comparisonMonths.length === 0) {
      this.insight = {
        status: 'insufficient',
        current: 0,
        baseline: 0,
        change: 0,
        periodStart: latestMonthStart,
        periodEnd,
        comparisonMonthCount: 0,
        contributors: [],
      };
      return;
    }

    const currentTransactions = transactions.filter(transaction =>
      this.isInMonthWindow(transaction, latestMonthStart, periodDay)
    );
    const baselineTransactions = comparisonMonths.flatMap(month =>
      transactions.filter(transaction => this.isInMonthWindow(transaction, month, periodDay))
    );
    const expenseTransactions = (items: readonly Transaction[]) =>
      items.filter(transaction => transaction.amount < 0 && !this.isSavingsTransaction(transaction));

    const currentExpenses = expenseTransactions(currentTransactions);
    const baselineExpenses = expenseTransactions(baselineTransactions);
    const current = currentExpenses.reduce((total, transaction) => total + Math.abs(transaction.amount), 0);
    const baseline = baselineExpenses.reduce((total, transaction) => total + Math.abs(transaction.amount), 0) / comparisonMonths.length;
    const change = current - baseline;
    const threshold = Math.max(25, baseline * 0.1);
    const status = change > threshold ? 'higher' : change < -threshold ? 'lower' : 'steady';
    const currentByCategory = this.sumByCategory(currentExpenses);
    const baselineByCategory = this.sumByCategory(baselineExpenses);
    const categories = new Set([...currentByCategory.keys(), ...baselineByCategory.keys()]);
    const contributors = Array.from(categories, category => {
      const categoryCurrent = currentByCategory.get(category) ?? 0;
      const categoryBaseline = (baselineByCategory.get(category) ?? 0) / comparisonMonths.length;
      return {
        category,
        label: category?.name ?? 'Ohne Kategorie',
        current: categoryCurrent,
        baseline: categoryBaseline,
        change: categoryCurrent - categoryBaseline,
      };
    })
      .filter(item => status === 'higher' ? item.change > 0 : status === 'lower' ? item.change < 0 : false)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 3);

    this.insight = {
      status,
      current,
      baseline,
      change,
      periodStart: latestMonthStart,
      periodEnd,
      comparisonMonthCount: comparisonMonths.length,
      contributors,
    };
  }

  private isInMonthWindow(transaction: Transaction, month: Date, lastDay: number): boolean {
    if (!this.isValidDate(transaction.bookingDate)) {
      return false;
    }

    const date = transaction.bookingDate;
    const lastIncludedDay = Math.min(lastDay, new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate());
    return date.getFullYear() === month.getFullYear() &&
      date.getMonth() === month.getMonth() &&
      date.getDate() <= lastIncludedDay;
  }

  private sumByCategory(transactions: Transaction[]): Map<Category | undefined, number> {
    const totals = new Map<Category | undefined, number>();
    for (const transaction of transactions) {
      const category = transaction.category;
      totals.set(category, (totals.get(category) ?? 0) + Math.abs(transaction.amount));
    }
    return totals;
  }

  private isSavingsTransaction(transaction: Transaction): boolean {
    const category = transaction.category;
    return !!category && (
      category.type === 'savings' ||
      this.dataState.categories.some(parent =>
        parent.type === 'savings' && parent.subCategories.includes(category)
      )
    );
  }

  private isValidDate(date: Date): boolean {
    return date instanceof Date && !Number.isNaN(date.getTime());
  }

  private endOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  }
}
