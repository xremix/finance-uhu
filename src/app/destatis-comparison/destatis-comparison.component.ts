import { CommonModule, registerLocaleData } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';
import localeDe from '@angular/common/locales/de';
import { Category } from '../models/category';
import { Transaction } from '../models/transaction';
import {
  DESTATIS_BENCHMARKS_2023,
  DESTATIS_HOUSEHOLD_SPENDING_SOURCE_2023,
  HouseholdSize,
} from './destatis-benchmarks';

registerLocaleData(localeDe, 'de-DE');

interface ComparisonRow {
  id: string;
  label: string;
  usedCategories: string[];
  monthlySpending: number;
  benchmark: number;
  difference: number;
  differencePercent: number;
}

@Component({
  selector: 'app-destatis-comparison',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './destatis-comparison.component.html',
  styleUrl: './destatis-comparison.component.scss',
})
export class DestatisComparisonComponent implements OnChanges {
  @Input() transactions: readonly Transaction[] = [];
  @Input() categories: Category[] = [];
  @Input() from: Date = new Date(0);
  @Input() to: Date = new Date();
  @Input() months = 1;

  readonly sourceUrl = DESTATIS_HOUSEHOLD_SPENDING_SOURCE_2023;
  readonly householdSizeOptions: { value: HouseholdSize; label: string }[] = [
    { value: 'all', label: 'Alle Haushalte' },
    { value: '1', label: '1 Person' },
    { value: '2', label: '2 Personen' },
    { value: '3', label: '3 Personen' },
    { value: '4', label: '4 Personen' },
    { value: '5+', label: '5 oder mehr Personen' },
  ];
  selectedHouseholdSize: HouseholdSize = 'all';
  rows: ComparisonRow[] = [];

  ngOnChanges(): void {
    this.rows = this.calculateRows();
  }

  trackById(_index: number, row: ComparisonRow): string {
    return row.id;
  }

  setHouseholdSize(value: string): void {
    const option = this.householdSizeOptions.find((item) => item.value === value);
    if (!option) return;
    this.selectedHouseholdSize = option.value;
    this.rows = this.calculateRows();
  }

  private calculateRows(): ComparisonRow[] {
    const totals = new Map(DESTATIS_BENCHMARKS_2023.map((benchmark) => [benchmark.id, 0]));
    const usedCategories = new Map(DESTATIS_BENCHMARKS_2023.map((benchmark) => [benchmark.id, new Set<string>()]));

    for (const transaction of this.transactions) {
      if (
        transaction.amount >= 0 ||
        !(transaction.bookingDate instanceof Date) ||
        transaction.bookingDate < this.from ||
        transaction.bookingDate > this.to ||
        !transaction.category
      ) {
        continue;
      }

      const path = this.findCategoryPath(transaction.category, this.categories);
      if (!path) continue;

      const benchmark = DESTATIS_BENCHMARKS_2023.find((candidate) => candidate.matches(path));
      if (benchmark) {
        totals.set(benchmark.id, (totals.get(benchmark.id) ?? 0) + Math.abs(transaction.amount));
        usedCategories.get(benchmark.id)?.add(path.join(' › '));
      }
    }

    return DESTATIS_BENCHMARKS_2023.flatMap((benchmark) => {
      const periodTotal = totals.get(benchmark.id) ?? 0;
      if (periodTotal === 0) return [];

      const monthlySpending = periodTotal / Math.max(1, this.months);
      const benchmarkAmount = benchmark.amountByHouseholdSize[this.selectedHouseholdSize];
      const difference = monthlySpending - benchmarkAmount;
      return [{
        id: benchmark.id,
        label: benchmark.label,
        usedCategories: [...(usedCategories.get(benchmark.id) ?? [])].sort((a, b) => a.localeCompare(b, 'de')),
        monthlySpending,
        benchmark: benchmarkAmount,
        difference,
        differencePercent: difference / benchmarkAmount * 100,
      }];
    });
  }

  private findCategoryPath(target: Category, categories: Category[], path: string[] = []): string[] | undefined {
    for (const category of categories) {
      const nextPath = [...path, category.name];
      if (category === target) return nextPath;

      const childPath = this.findCategoryPath(target, category.subCategories ?? [], nextPath);
      if (childPath) return childPath;
    }
    return undefined;
  }
}
