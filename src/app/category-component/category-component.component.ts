import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Category } from '../models/category';
import { DataState } from '../services/data-state';

@Component({
  selector: 'app-category-component',
  templateUrl: './category-component.component.html',
  styleUrls: ['./category-component.component.scss']
})
export class CategoryComponentComponent {
  @Input() public categorySummary: Category = {} as any;
  @Input() public collapsed: boolean = true;
  @Input() amountMonths: number = 1;
  @Input() showAverage: boolean = false;
  constructor(protected dataState: DataState

  ) { }

  protected get calculatedTotal() {
    const transactionValues = this.activeTransactions.map(t => t.amount);
    const total = transactionValues.reduce((a, b) => a + b, 0);
    // Transactions are denominated in cents. Normalize floating point noise
    // so repeated template checks cannot produce slightly different values.
    return Math.round((total + Number.EPSILON) * 100) / 100;
  }
  
  protected get activeTransactions() {
    //return this.categorySummary.transactions.flatMap(t => [t, ...(t.?.flatMap(subCat => subCat.transactions) || [])]);
    return this.categorySummary.subCategories.flatMap(sc => sc.transactions).concat(this.categorySummary.transactions).filter(t => this.dataState.showTransaction(t));
  }
}
