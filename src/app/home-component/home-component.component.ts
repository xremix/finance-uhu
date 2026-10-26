import { ChangeDetectorRef, Component } from '@angular/core';
import { CategoryService } from '../services/category-service';
import { DataState, DateFilter } from '../services/data-state';
import { DateService } from '../services/date-service';
import { Transaction } from '../models/transaction';

@Component({
  selector: 'app-home-component',
  templateUrl: './home-component.component.html',
  styleUrl: './home-component.component.scss',
})
export class HomeComponentComponent {
  public tabs: string[] = ['Kategorien', 'Alle Buchungen', 'Wiederkehrende Buchungen', 'Ausgeglichene Buchungen', 'Monatliche Bilanz', 'Ausgaben-Fluss', 'Deutschlandvergleich'];
  public activeTab: string = this.tabs[0];
  public expandedKpi: 'balance' | 'spending' | 'account' | null = null;

  toggleKpiDetails(kpi: 'balance' | 'spending' | 'account'): void {
    this.expandedKpi = this.expandedKpi === kpi ? null : kpi;
  }

  onTabKeydown(event: KeyboardEvent) {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) {
      return;
    }
    event.preventDefault();
    const current = this.tabs.indexOf(this.activeTab);
    let next = current;
    if (event.key === 'ArrowRight') next = (current + 1) % this.tabs.length;
    if (event.key === 'ArrowLeft') next = (current - 1 + this.tabs.length) % this.tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = this.tabs.length - 1;
    this.activeTab = this.tabs[next];
    setTimeout(() => document.getElementById('tab-' + next)?.focus());
  }
  public sankeyType: 'expense' | 'income' = 'expense';

  showInsightTransactions(): void {
    this.expandedKpi = null;
    this.activeTab = 'Alle Buchungen';
    setTimeout(() => document.getElementById('detail-tabpanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  constructor(
    protected dataState: DataState,
    protected categoryService: CategoryService,
    protected dateService: DateService,
    private cds: ChangeDetectorRef
  ) {}

  get balancedTransactions(): Transaction[] {
    return this.dataState.selectedTransactions.filter(transaction => transaction.balancedByDescription !== undefined);
  }

  get incomeTotal(): number {
    return this.getDisplayAmount(this.sumTransactions(transaction => transaction.amount > 0));
  }

  get expenseTotal(): number {
    return this.getDisplayAmount(Math.abs(this.sumTransactions(transaction => transaction.amount < 0 && !this.isSavingsTransaction(transaction))));
  }

  get netTotal(): number {
    return this.incomeTotal - this.expenseTotal;
  }

  get amountLabel(): string {
    return this.dataState.showAverage ? 'Ø pro Monat' : 'Im Zeitraum';
  }

  get typeFilterLabel(): string {
    const labels = { all: 'Alle Buchungen', income: 'Nur Einnahmen', expense: 'Nur Ausgaben' };
    return labels[this.dataState.currentFilter.type];
  }

  get isMiscCategorySelected(): boolean {
    return this.dataState.currentFilter.category?.name.trim().toLocaleLowerCase('de-DE') === 'sonstiges';
  }

  hasSelectedMonth(): boolean {
    return (
      this.dataState.currentFilter.from !== undefined &&
      this.dataState.currentFilter.to !== undefined &&
      this.dataState.currentFilter.from.getMonth() === this.dataState.currentFilter.to.getMonth() && this.dataState.currentFilter.from.getFullYear() === this.dataState.currentFilter.to.getFullYear()
    );
  }
  
  isSelectedMonth(date: DateFilter): boolean {
    if (!this.dataState.currentFilter.from || !this.dataState.currentFilter.to) {
      return false;
    }

    return (
      this.dataState.currentFilter.from.getTime() === date.from.getTime() &&
      this.dataState.currentFilter.to.getTime() === date.to.getTime()
    );
  }

  refreshPage(){
    this.cds.detectChanges();
  }

  private sumTransactions(predicate: (transaction: Transaction) => boolean): number {
    return this.dataState.selectedTransactions
      .filter(predicate)
      .reduce((total, transaction) => total + transaction.amount, 0);
  }

  private getDisplayAmount(amount: number): number {
    return this.dataState.showAverage ? amount / this.dataState.selectedMonthAmountInDataRangeFilter : amount;
  }

  private isSavingsTransaction(transaction: Transaction): boolean {
    const category = transaction.category;
    if (!category) {
      return false;
    }

    if (category.type === 'savings') {
      return true;
    }

    return this.dataState.categories.some(parent => parent.type === 'savings' && parent.subCategories.includes(category));
  }
}
