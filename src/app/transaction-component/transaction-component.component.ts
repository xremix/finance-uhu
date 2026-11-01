import { Component, Input, OnInit } from '@angular/core';
import { Transaction } from '../models/transaction';
import { RecurringSeries } from '../services/recurring-service';
import { DataState } from '../services/data-state';
import { CategoryService } from '../services/category-service';
import { UiFeedbackService } from '../services/ui-feedback.service';

@Component({
  selector: 'app-transaction-component',
  templateUrl: './transaction-component.component.html',
  styleUrl: './transaction-component.component.scss'
})
export class TransactionComponentComponent implements OnInit {
  @Input() transaction: Transaction = {} as Transaction;
  public expand = false; 
  public recurring?: RecurringSeries;
  constructor(
    private dataState: DataState,
    private categoryService: CategoryService,
    private feedback: UiFeedbackService
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

  get amountClass(): string {
    if (this.transaction.balancedByDescription || this.transaction.balancedOfDescription) {
      return 'is-balanced';
    }
    return this.transaction.amount > 0 ? 'is-income' : 'is-expense';
  }

  async showMatchingKeywords(transaction: Transaction): Promise<void> {
    const keywords = [...new Set(this.categoryService.flatCategories.flatMap((category) =>
      this.categoryService.matchingKeywords(category, transaction)
    ))];
    await this.feedback.showDetails(
      'Passende Keywords',
      keywords.length
        ? 'Diese Keywords passen zu der Buchung. Welche Kategorie verwendet wird, hängt auch von Ausschlüssen und der Priorität der Regeln ab.'
        : 'Für diese Buchung wurde kein Keyword gefunden. Sie wurde einer Standardkategorie zugeordnet.',
      keywords
    );
  }
}
