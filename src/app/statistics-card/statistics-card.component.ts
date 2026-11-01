import { Component, Input, OnChanges, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { Transaction } from '../models/transaction';
import { Category } from '../models/category';

interface Statistics {
  averageIncome: number;
  medianIncome: number;
  averageExpense: number;
  medianExpense: number;
  totalMonths: number;
  averageIncomeWithData: number;
  averageExpenseWithData: number;
  monthsWithData: number;
}

@Component({
    selector: 'app-statistics-card',
    templateUrl: './statistics-card.component.html',
    styleUrls: ['./statistics-card.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class StatisticsCardComponent implements OnChanges {
  @Input() transactions: Transaction[] = [];
  @Input() selectedCategory: Category | undefined;
  @Input() monthsCount: number = 1;

  statistics: Statistics = {
    averageIncome: 0,
    medianIncome: 0,
    averageExpense: 0,
    medianExpense: 0,
    totalMonths: 1,
    averageIncomeWithData: 0,
    averageExpenseWithData: 0,
    monthsWithData: 0
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['transactions'] || changes['selectedCategory'] || changes['monthsCount']) {
      this.calculateStatistics();
    }
  }

  private calculateStatistics(): void {
    const incomeTransactions = this.transactions.filter(t => t.amount > 0);
    const expenseTransactions = this.transactions.filter(t => t.amount < 0);

    // Gruppiere Transaktionen nach Monaten
    const monthlyIncomes = this.getMonthlyTotals(incomeTransactions);
    const monthlyExpenses = this.getMonthlyTotals(expenseTransactions);

    // Berechne die Anzahl der Monate mit tatsächlichen Daten
    const monthsWithIncomeData = monthlyIncomes.filter(income => income > 0).length;
    const monthsWithExpenseData = monthlyExpenses.filter(expense => expense < 0).length;
    const monthsWithAnyData = Math.max(monthlyIncomes.length, monthlyExpenses.length);

    this.statistics = {
      averageIncome: this.calculateAverage(monthlyIncomes),
      medianIncome: this.calculateMedian(monthlyIncomes),
      averageExpense: Math.abs(this.calculateAverage(monthlyExpenses)),
      medianExpense: Math.abs(this.calculateMedian(monthlyExpenses)),
      totalMonths: Math.max(this.monthsCount, 1),
      averageIncomeWithData: this.calculateAverageWithData(monthlyIncomes),
      averageExpenseWithData: Math.abs(this.calculateAverageWithData(monthlyExpenses)),
      monthsWithData: monthsWithAnyData
    };
  }

  private getMonthlyTotals(transactions: Transaction[]): number[] {
    const monthlyMap = new Map<string, number>();
    
    transactions.forEach(transaction => {
      const monthKey = this.getMonthKey(transaction.bookingDate);
      const current = monthlyMap.get(monthKey) || 0;
      monthlyMap.set(monthKey, current + transaction.amount);
    });

    return Array.from(monthlyMap.values());
  }

  private getMonthKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}`;
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / Math.max(values.length, this.monthsCount);
  }

  private calculateAverageWithData(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  }

  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      return sorted[mid];
    }
  }

  get categoryName(): string {
    return this.selectedCategory ? this.selectedCategory.name : 'Alle Kategorien';
  }
}
