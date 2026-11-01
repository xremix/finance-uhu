import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Transaction } from '../models/transaction';

@Component({
    selector: 'app-monthy-billance',
    templateUrl: './monthy-billance.component.html',
    styleUrl: './monthy-billance.component.scss',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class MonthyBillanceComponent implements OnInit {
  @Input() dates: Date[] = [];
  @Input() transactions: Transaction[] = [];
  public monthlyData: { name: string; income: number; expenses: number }[] = [];
  public includeSavings = true;
  public get monthsWithPositiveBillance() {
    return this.monthlyData.filter((d) => d.income > d.expenses).length;
  }
  ngOnInit(): void {
   this.refreshMonthlyData();
  }

  public toggleSavings() {
    this.includeSavings = !this.includeSavings;
    this.refreshMonthlyData();
  }

  public refreshMonthlyData(){
    this.monthlyData = this.dates.map((d) => {
      return {
        name: d.toLocaleDateString(),
        income: this.transactions
          .filter(t => this.includeSavings || t.category?.name !== 'Sparen')
          .filter((t) => t.bookingDate.getMonth() === d.getMonth() && t.bookingDate.getFullYear() === d.getFullYear())
          .filter((t) => t.amount >= 0)
          .reduce((acc, t) => acc + (t.amount | 0), 0),
        expenses: this.transactions
        .filter(t => this.includeSavings || t.category?.name !== 'Sparen')
          .filter((t) => t.bookingDate.getMonth() === d.getMonth() && t.bookingDate.getFullYear() === d.getFullYear())
          .filter((t) => t.amount < 0)
          .reduce((acc, t) => acc + ((t.amount * -1) | 0), 0),
      };
    });
  }
}
