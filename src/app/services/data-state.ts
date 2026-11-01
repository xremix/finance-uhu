import { EventEmitter, Injectable, OnDestroy } from '@angular/core';
import { Transaction } from '../models/transaction';
import { DateService } from './date-service';
import { Category  } from '../models/category';
import { BalanceAnchor } from '../models/balance';

import { RecurringService, RecurringSeries } from './recurring-service';
import { DuplicateService } from './duplicate-service';
import { DashboardStateService, DashboardViewState, formatDateParameter } from './dashboard-state.service';
import { Subscription } from 'rxjs';

export interface DateFilter {
  from: Date;
  to: Date;
  name: string;
}

export interface DataFilter {
  from: Date;
  to: Date;
  category: Category | undefined;
  type: 'all' | 'income' | 'expense';
  searchTerm: string;
}

@Injectable({
  providedIn: 'root',
})
export class DataState implements OnDestroy {
  private readonly viewSubscription: Subscription;
  private appliedFilters = '';
  private _transactions: Transaction[] = [];
  public recurringSeries: RecurringSeries[] = [];
  private recurringByTransaction = new Map<Transaction, RecurringSeries>();
  /** Recurring series with at least one booking matching the current filter */
  public selectedRecurringSeries: RecurringSeries[] = [];

  get showAverage(): boolean { return this.viewState.state.average; }
  set showAverage(value: boolean) {
    this.viewState.update({ average: value });
  }
  public loadedSources: string[] = []; // Track loaded file sources
  /** Account balance found in the loaded files (e.g. ING header), if any */
  public fileBalanceAnchor: BalanceAnchor | undefined;
  public isLoading = false;
  public loadingMessage = '';

  public months: DateFilter[] = [];
  public monthStarts: Date[] = [];
  public categories: Category[] = [];

  constructor(
    private dateService: DateService, 
    private duplicateService: DuplicateService,
    private recurringService: RecurringService,
    private viewState: DashboardStateService
  ) {
    this.viewSubscription = this.viewState.state$.subscribe((state) => {
      const signature = JSON.stringify([state.from, state.to, state.category, state.type, state.q, state.average]);
      if (signature === this.appliedFilters) return;
      this.appliedFilters = signature;
      this.applyViewState(state);
    });
  }

  get hasLoadedData(): boolean {
    return this._transactions.length > 0;
  }

  get allTransactions(): readonly Transaction[] {
    return this._transactions;
  }

  private get transactions(): Transaction[] {
    return this._transactions;
  }

  public setTransactions(value: Transaction[]): void {
    this._transactions = value;
    const sources = Array.from(
      new Set(
        value
          .map((transaction) => transaction.source)
          .filter((source): source is string => !!source && source.trim().length > 0)
      )
    );
    this.loadedSources = sources;
    this.months = this.dateService.getMonths(this._transactions);
    this.monthStarts = this.months.map((m) => m.from);
    this.detectRecurring();
    this.duplicateService.setWasBalancedAfterwardsForAllTransaction(this._transactions);
    this.applyViewState(this.viewState.state);
  }

  public addTransactions(newTransactions: Transaction[]): void {
    // Merge new transactions with existing ones
    this._transactions = [...this._transactions, ...newTransactions];
    
    // Track the source if it has one
    const source = newTransactions.find(t => t.source)?.source;
    if (source && !this.loadedSources.includes(source)) {
      this.loadedSources.push(source);
    }
    
    // Update derived data
    this.months = this.dateService.getMonths(this._transactions);
    this.monthStarts = this.months.map((m) => m.from);
    this.detectRecurring();
    this.duplicateService.setWasBalancedAfterwardsForAllTransaction(this._transactions);
    
    // Update selected transactions based on current filter
    this.applyViewState(this.viewState.state);
  }

  private detectRecurring() {
    this.recurringSeries = this.recurringService.detect(this._transactions, this.categories);
    this.recurringByTransaction = new Map();
    this.recurringSeries.forEach((series) => series.transactions.forEach((t) => this.recurringByTransaction.set(t, series)));
  }

  getRecurringSeries(transaction: Transaction): RecurringSeries | undefined {
    return this.recurringByTransaction.get(transaction);
  }

  categoryRulesChanged(): void {
    this.detectRecurring();
    this.refresh();
  }


  // event emitter when selected transactions change
  public selectedTransactionsChanged: EventEmitter<Transaction[]> = new EventEmitter();
  public selectedTransactions: Transaction[] = [];
  public currentFilter: DataFilter = {
    from: new Date(0),
    to: new Date(),
    category: undefined as Category | undefined,
    type: 'all',
    searchTerm: '',
  };

  get selectedMonthAmountInDataRangeFilter(): number {
    var startDate = new Date(this.currentFilter.from);
    var endDate = new Date(this.currentFilter.to);
    
    // Calculate the number of complete months between start and end date
    var yearDiff = endDate.getFullYear() - startDate.getFullYear();
    var monthDiff = endDate.getMonth() - startDate.getMonth();
    var totalMonths = yearDiff * 12 + monthDiff;
    
    // If the end day is greater than or equal to the start day, 
    // we have a complete additional month
    if (endDate.getDate() >= startDate.getDate()) {
      totalMonths += 1;
    }
    
    return Math.max(1, totalMonths); // Ensure at least 1 month is returned
  }

  public showTransaction(transaction: Transaction): boolean {
    const isCategoryInFilter =
      this.currentFilter.category === undefined ||
      transaction.category === this.currentFilter.category ||
      this.currentFilter.category.subCategories?.some((subCat) => transaction.category === subCat);

    return isCategoryInFilter && this.matchesFilterIgnoringCategory(transaction);
  }

  /** Applies date, type and search filters, but not the category filter. */
  public matchesFilterIgnoringCategory(transaction: Transaction): boolean {
    const isBookingDateInFilter =
      transaction.bookingDate >= this.currentFilter.from && transaction.bookingDate <= this.currentFilter.to;
    const isTypeInFilter =
      this.currentFilter.type === 'all' ||
      (this.currentFilter.type === 'expense' && transaction.amount < 0) ||
      (this.currentFilter.type === 'income' && transaction.amount > 0);
    
    // Search filter logic
    const isSearchTermInFilter = this.matchesSearchTerm(transaction, this.currentFilter.searchTerm);
    
    return isBookingDateInFilter && isTypeInFilter && isSearchTermInFilter;
  }

  private matchesSearchTerm(transaction: Transaction, searchTerm: string): boolean {
    if (!searchTerm.trim()) {
      return true; // No search term means all transactions match
    }

    const terms = this.parseSearchTerms(searchTerm);
    const searchableText = this.buildSearchableText(transaction);

    // Separate include and exclude terms
    const includeTerms = terms.filter(term => !term.startsWith('-'));
    const excludeTerms = terms.filter(term => term.startsWith('-')).map(term => term.substring(1));

    // Check exclude terms first - if ANY exclude term is found, exclude the transaction
    const hasExcludedTerm = excludeTerms.some(excludeTerm => searchableText.includes(excludeTerm));
    if (hasExcludedTerm) {
      return false;
    }

    // If there are no include terms, and no excluded terms were found, include the transaction
    if (includeTerms.length === 0) {
      return true;
    }

    // Check include terms - if ANY include term is found, include the transaction
    const hasIncludedTerm = includeTerms.some(includeTerm => searchableText.includes(includeTerm));
    return hasIncludedTerm;
  }

  private buildSearchableText(transaction: Transaction): string {
    const rawText = (transaction.raw ?? '').toLowerCase();
    const categoryName = (transaction.category?.name ?? '').toLowerCase();
    const parentCategoryName = this.getParentCategoryName(transaction);

    return [rawText, categoryName, parentCategoryName]
      .filter(Boolean)
      .join(' ');
  }

  private getParentCategoryName(transaction: Transaction): string {
    if (!transaction.category) {
      return '';
    }

    const parentCategory = this.categories.find((category) =>
      category.subCategories?.some((subCategory) => subCategory === transaction.category)
    );

    return (parentCategory?.name ?? '').toLowerCase();
  }

  private parseSearchTerms(searchTerm: string): string[] {
    const terms: string[] = [];
    let currentTerm = '';
    let inQuotes = false;
    let quoteChar = '';
    
    for (let i = 0; i < searchTerm.length; i++) {
      const char = searchTerm[i];
      
      if (!inQuotes && (char === '"' || char === "'")) {
        // Start of quoted string
        inQuotes = true;
        quoteChar = char;
      } else if (inQuotes && char === quoteChar) {
        // End of quoted string
        inQuotes = false;
        if (currentTerm.trim()) {
          terms.push(currentTerm.toLowerCase().trim());
          currentTerm = '';
        }
        quoteChar = '';
      } else if (!inQuotes && char === ' ') {
        // Space outside quotes - end current term
        if (currentTerm.trim()) {
          terms.push(currentTerm.toLowerCase().trim());
          currentTerm = '';
        }
      } else {
        // Regular character - add to current term
        currentTerm += char;
      }
    }
    
    // Add final term if exists
    if (currentTerm.trim()) {
      terms.push(currentTerm.toLowerCase().trim());
    }
    
    return terms.filter(term => term.length > 0);
  }

  private applyViewState(state: Readonly<DashboardViewState>): void {
    const datedTransactions = this._transactions.filter((transaction) =>
      transaction.bookingDate instanceof Date && !Number.isNaN(transaction.bookingDate.getTime()));
    const from = state.from
      ? new Date(`${state.from}T00:00:00`)
      : new Date(this.dateService.firstDate(datedTransactions) ?? 0);
    const to = state.to
      ? new Date(`${state.to}T00:00:00`)
      : new Date(this.dateService.lastDate(datedTransactions) ?? new Date());
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    let category: Category | undefined;
    let categories = this.categories;
    for (const name of state.category) {
      category = categories.find((candidate) => candidate.name === name);
      if (!category) break;
      categories = category.subCategories;
    }
    this.currentFilter = { from, to, category, type: state.type, searchTerm: state.q };
    this.refresh();
  }

  private categoryPath(category: Category, categories = this.categories, parents: string[] = []): string[] | undefined {
    for (const candidate of categories) {
      const path = [...parents, candidate.name];
      if (candidate === category) return path;
      const nested = this.categoryPath(category, candidate.subCategories, path);
      if (nested) return nested;
    }
    return undefined;
  }

  private refresh() {
    this.selectedTransactions = this.transactions.filter((t) => this.showTransaction(t));
    const selected = new Set(this.selectedTransactions);
    this.selectedRecurringSeries = this.recurringSeries.filter((series) => series.transactions.some((t) => selected.has(t)));
    this.recalculateCategories(this.selectedTransactions);
    this.selectedTransactionsChanged.emit(this.selectedTransactions);
  }

  /**
   * Berechnet die Kategorien basierend auf den übergebenen Transaktionen neu
   * Wird verwendet, um gefilterte Ansichten zu erstellen
   */
  private recalculateCategories(transactions: Transaction[]): void {
    // Reset all category totals and transactions
    this.categories.forEach((c) => {
      c.total = 0;
      c.transactions = [];
      c.subCategories?.forEach((subCat) => {
        subCat.total = 0;
        subCat.transactions = [];
      });
    });

    // Recalculate based on filtered transactions
    for (let transaction of transactions) {
      // Category already assigned, just update totals
      if (transaction.category) {
        transaction.category.transactions.push(transaction);
        transaction.category.total += transaction.amount;

        // Check if this is a subcategory and update parent
        const parentCategory = this.categories.find(c => 
          c.subCategories?.some(sub => sub === transaction.category)
        );
        if (parentCategory) {
          parentCategory.total += transaction.amount;
        }
      }
    }
  }

  filterByRange(from: Date, to: Date) {
    this.viewState.update({ from: formatDateParameter(from), to: formatDateParameter(to) });
  }

  filterByDateFilter(dateFilter: DateFilter) {
    // Check if the selected month is already the current filter
    if (
      formatDateParameter(this.currentFilter.from) === formatDateParameter(dateFilter.from) &&
      formatDateParameter(this.currentFilter.to) === formatDateParameter(dateFilter.to)
    ) {
      // Reset the filter if the same month is selected again
      this.resetMonth();
    } else {
      // Set the filter to the selected month
      this.filterByRange(dateFilter.from, dateFilter.to);
    }
  }

  filterByDay(date: Date) {
    let firstOfMonth = new Date(date);
    firstOfMonth.setDate(1);
    let lastOfMonth = new Date(firstOfMonth);
    lastOfMonth.setMonth(lastOfMonth.getMonth() + 1);
    lastOfMonth.setDate(-1);
    this.filterByDateFilter({ from: firstOfMonth, to: lastOfMonth, name: date.toLocaleDateString() });
  }

  filterByCategory(category: Category) {
    this.viewState.update({ category: this.currentFilter.category === category ? [] : this.categoryPath(category) ?? [] });
  }

  resetMonth() {
    this.viewState.update({ from: undefined, to: undefined });
  }
  resetFilter(resetSearchTerm: boolean = true) {
    this.viewState.update({
      from: undefined, to: undefined, category: [],
      ...(resetSearchTerm ? { q: '' } : {}),
    });
  }
  resetCategory() {
    this.viewState.update({ category: [] });
  }
  resetViewState(): void { this.viewState.reset(); }
  resetState() {
    this._transactions = [];
    this.selectedTransactions = [];
    this.months = [];
    this.recurringSeries = [];
    this.recurringByTransaction = new Map();
    this.selectedRecurringSeries = [];
    this.loadedSources = [];
    this.fileBalanceAnchor = undefined;
    this.resetCategories();
  }

  private resetCategories() {
    // TODO Reset the amount and transactions
    // for each category clean the total and transactions
    this.categories.forEach((c) => {
      c.total = 0;
      c.transactions = [];
      c.subCategories?.forEach((subCat) => {
        subCat.total = 0;
        subCat.transactions = [];
      });
    });
  }

  filterByType(type: 'all' | 'income' | 'expense') {
    this.viewState.update({ type });
  }

  filterBySearchTerm(searchTerm: string) {
    this.viewState.update({ q: searchTerm });
  }

  ngOnDestroy(): void { this.viewSubscription.unsubscribe(); }
}
