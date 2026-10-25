import { ChangeDetectorRef, EventEmitter, Injectable } from '@angular/core';
import { Transaction } from '../models/transaction';
import { DateService } from './date-service';
import { Category  } from '../models/category';
import { BalanceAnchor } from '../models/balance';

import { RecurringService, RecurringSeries } from './recurring-service';
import { DuplicateService } from './duplicate-service';

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
export class DataState {
  private readonly searchTermStorageKey = 'searchTerm';
  private readonly showAverageStorageKey = 'showAverage';
  private _transactions: Transaction[] = [];
  public recurringSeries: RecurringSeries[] = [];
  private recurringByTransaction = new Map<Transaction, RecurringSeries>();
  /** Recurring series with at least one booking matching the current filter */
  public selectedRecurringSeries: RecurringSeries[] = [];

  private _showAverage: boolean = localStorage.getItem(this.showAverageStorageKey) === 'true';
  get showAverage(): boolean { return this._showAverage; }
  set showAverage(value: boolean) {
    this._showAverage = value;
    localStorage.setItem(this.showAverageStorageKey, String(value));
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
    private recurringService: RecurringService
  ) {
    this.currentFilter.searchTerm = this.loadSearchTerm();
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
    this.refresh();
  }

  private detectRecurring() {
    this.recurringSeries = this.recurringService.detect(this._transactions, this.categories);
    this.recurringByTransaction = new Map();
    this.recurringSeries.forEach((series) => series.transactions.forEach((t) => this.recurringByTransaction.set(t, series)));
  }

  getRecurringSeries(transaction: Transaction): RecurringSeries | undefined {
    return this.recurringByTransaction.get(transaction);
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

  private loadSearchTerm(): string {
    try {
      return localStorage.getItem(this.searchTermStorageKey) ?? '';
    } catch {
      return '';
    }
  }

  private saveSearchTerm(searchTerm: string): void {
    try {
      localStorage.setItem(this.searchTermStorageKey, searchTerm);
    } catch {
      // Ignore storage errors (e.g. private mode or disabled storage)
    }
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
    this.currentFilter.from = from;
    this.currentFilter.to = to;
    this.refresh();
  }

  filterByDateFilter(dateFilter: DateFilter) {
    // Check if the selected month is already the current filter
    if (
      this.currentFilter.from.getTime() === dateFilter.from.getTime() &&
      this.currentFilter.to.getTime() === dateFilter.to.getTime()
    ) {
      // Reset the filter if the same month is selected again
      this.resetMonth();
    } else {
      // Set the filter to the selected month
      this.currentFilter.from = dateFilter.from;
      this.currentFilter.to = dateFilter.to;
    }
    this.refresh();
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
    if (this.currentFilter.category === category) {
      this.currentFilter.category = undefined;
    } else {
      this.currentFilter.category = category;
    }
    this.refresh();
  }

  resetMonth() {
    const transactionsWithDate = this._transactions.filter(
      (transaction) => transaction.bookingDate instanceof Date && !Number.isNaN(transaction.bookingDate.getTime())
    );
    if (transactionsWithDate.length > 0) {
      let earliest = transactionsWithDate[0].bookingDate;
      let latest = earliest;
      for (const transaction of transactionsWithDate.slice(1)) {
        if (transaction.bookingDate < earliest) earliest = transaction.bookingDate;
        if (transaction.bookingDate > latest) latest = transaction.bookingDate;
      }
      this.currentFilter.from = new Date(earliest);
      this.currentFilter.to = new Date(latest);
      this.refresh();
    }
  }
  resetFilter(resetSearchTerm: boolean = true) {
    this.resetMonth();
    this.resetCategory();
    if (resetSearchTerm) {
      this.currentFilter.searchTerm = '';
      this.saveSearchTerm('');
    }
    this.refresh();
  }
  resetCategory() {
    this.currentFilter.category = undefined;
    this.refresh();
  }
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
    this.currentFilter.type = type;
    this.refresh();
  }

  filterBySearchTerm(searchTerm: string) {
    this.currentFilter.searchTerm = searchTerm;
    this.saveSearchTerm(searchTerm);
    this.refresh();
  }


}
