import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Transaction } from '../models/transaction';
import { RecurringSeries } from '../services/recurring-service';
import { DataState } from '../services/data-state';
import { CategoryService } from '../services/category-service';
import { UiFeedbackService } from '../services/ui-feedback.service';
import { ImportService } from '../services/import-services/import-service';
import { Category } from '../models/category';

@Component({
    selector: 'app-transaction-component',
    templateUrl: './transaction-component.component.html',
    styleUrl: './transaction-component.component.scss',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class TransactionComponentComponent implements OnInit {
  @Input() transaction: Transaction = {} as Transaction;
  public expand = false; 
  public recurring?: RecurringSeries;
  constructor(
    private dataState: DataState,
    private categoryService: CategoryService,
    private feedback: UiFeedbackService,
    private importService: ImportService,
  ) { }

  ngOnInit(): void {
    this.recurring = this.dataState.getRecurringSeries(this.transaction);
  }

  get dayLabel(): string {
    return new Date(this.transaction.bookingDate).toLocaleDateString('de-DE', { day: '2-digit' });
  }

  get monthLabel(): string {
    return this.formatMonth(this.transaction.bookingDate);
  }

  formatMonth(date: Date): string {
    return new Date(date).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
  }

  get isBalanced(): boolean {
    return !!(this.transaction.balancedByDescription || this.transaction.balancedOfDescription);
  }

  get displayAmount(): number {
    return this.isBalanced ? Math.abs(this.transaction.amount) : this.transaction.amount;
  }

  get amountClass(): string {
    if (this.isBalanced) return 'is-balanced';
    return this.transaction.amount > 0 ? 'is-income' : 'is-expense';
  }

  async editTransactionCategory(transaction: Transaction): Promise<void> {
    const reason = this.categoryService.explainCategory(transaction);
    const items = reason.isFallback
      ? ['Keine Kategorie-Regel passte; die Buchung wurde der Standardkategorie zugeordnet.']
      : [];
    const exclusions = this.categoryService.flatCategories.flatMap(category =>
      this.categoryService.matchingExcludeKeywords(category, transaction)
        .map(keyword => ({
          category: category.name,
          keyword,
          prefix: ' schließt das Keyword ',
          suffix: ' aus',
        }))
    );
    const selectedCategory = await this.feedback.requestCategoryChange({
      title: 'Warum diese Kategorie?',
      message: 'Die Zuordnung basiert auf diesen Regeln. Wähle unten eine andere Kategorie, um eine Korrekturregel für diesen Zahlungsempfänger zu speichern.',
      items,
      categoryReason: reason.isFallback ? undefined : {
        category: reason.ruleCategory?.name ?? transaction.category?.name ?? 'Unbekannt',
        keywords: reason.matchedKeywords,
      },
      emphasizedItems: exclusions,
      categories: this.categories,
      selectedCategory: transaction.category ?? this.categories[0],
    });
    if (selectedCategory && selectedCategory !== transaction.category) {
      await this.changeCategory(transaction, selectedCategory);
    }
  }

  async changeCategory(transaction: Transaction, category: Category): Promise<void> {
    const keyword = [transaction.payerReceiver, transaction.bookingText, transaction.purpose]
      .find(value => !!value?.trim() && transaction.raw.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()))
      ?.trim();
    if (!keyword) {
      transaction.category = category;
      this.dataState.categoryRulesChanged();
      this.feedback.notify('Für diese Buchung konnte kein passender Begriff für eine Korrekturregel gefunden werden.', 'warning');
      return;
    }

    this.categoryService.addCorrectionKeyword(category, keyword, this.dataState.allTransactions);
    this.dataState.categoryRulesChanged();
    try {
      const saved = await this.importService.saveCategoriesToIndexedDbAndLinkedFile(this.importService.categorisAsJson());
      this.feedback.notify(
        saved ? `Korrekturregel ${keyword} → ${category.name} gespeichert.` : `Regel im Browser gespeichert; die verknüpfte Einstellungsdatei konnte nicht aktualisiert werden.`,
        saved ? 'success' : 'warning',
      );
    } catch {
      this.feedback.notify('Die Korrekturregel wurde angewendet, konnte aber nicht dauerhaft gespeichert werden.', 'warning');
    }
  }

  get categories(): Category[] {
    return this.categoryService.flatCategories;
  }
}
