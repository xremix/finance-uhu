import { RecurringOverviewComponent } from './recurring-overview/recurring-overview.component';
import { BrowserModule } from '@angular/platform-browser';
import { OwlLoaderComponent } from './owl-loader/owl-loader.component';
import { NgModule } from '@angular/core';
import { AppComponent } from './app.component';
import { FileSelectorComponent } from './file-selector/file-selector.component';
import { TransactionComponentComponent } from './transaction-component/transaction-component.component';
import { CategoryOverviewComponentComponent } from './category-overview-component/category-overview-component.component';
import { CategoryComponentComponent } from './category-component/category-component.component';
import { HistoryIncomeChartComponent } from './history-income-chart/history-income-chart.component';
import { OrderByPipe } from './pipes/orderby.pipe';
import { FormsModule } from '@angular/forms';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { CategoryChartComponent } from './category-chart/category-chart.component';
import { CategorySelectComponent } from './category-select/category-select.component';
import { TransactionOverviewComponent } from './transaction-overview/transaction-overview.component';
import { HomeComponentComponent } from './home-component/home-component.component';
import { SettingsComponentComponent } from './settings-component/settings-component.component';
import { provideRouter, RouterLink, RouterOutlet } from '@angular/router';
import { OrderPipe } from './pipes/order.pipe';
import { AmountSortPipe } from './pipes/amount-sort.pipe';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { DateRangePickerComponent } from './date-range-picker/date-range-picker.component';
import { MonthyBillanceComponent } from "./monthy-billance/monthy-billance.component";
import { MoneyBadgeComponent } from "./money-badge/money-badge.component";
import { StatisticsCardComponent } from './statistics-card/statistics-card.component';
import { GlobalSearchComponent } from './global-search/global-search.component';
import { DailyIncomeExpenseChartComponent } from './daily-income-expense-chart/daily-income-expense-chart.component';
import { SankeyChartComponent } from './sankey-chart/sankey-chart.component';
import { ImpressumComponent } from './impressum/impressum.component';
import { DatenschutzComponent } from './datenschutz/datenschutz.component';
import { SpendingInsightComponent } from './spending-insight/spending-insight.component';
import { BalanceCardComponent } from './balance-card/balance-card.component';
import { DestatisComparisonComponent } from './destatis-comparison/destatis-comparison.component';
import { SpendingTrendsComponent } from './spending-trends/spending-trends.component';

@NgModule({
  declarations: [
    AppComponent,
    FileSelectorComponent,
    TransactionComponentComponent,
    CategoryOverviewComponentComponent,
    CategoryComponentComponent,
    TransactionOverviewComponent,
    HomeComponentComponent,
    SettingsComponentComponent,
    OrderByPipe,
    OrderPipe,
    AmountSortPipe,
    MonthyBillanceComponent,
    DateRangePickerComponent,
    StatisticsCardComponent,
    ImpressumComponent,
    DatenschutzComponent,
    SpendingInsightComponent,
    RecurringOverviewComponent,
  ],
  imports: [
    BrowserModule,
    HistoryIncomeChartComponent,
    CategoryChartComponent,
    FormsModule,
    BrowserAnimationsModule,
    CategorySelectComponent,
    RouterOutlet,
    RouterLink,
    NgbModule,
    MoneyBadgeComponent,
    GlobalSearchComponent,
    DailyIncomeExpenseChartComponent,
    SankeyChartComponent,
    BalanceCardComponent,
    DestatisComparisonComponent,
    SpendingTrendsComponent,
    OwlLoaderComponent
],
  providers: [
    provideAnimationsAsync(),
    provideRouter([
      { path: '', component: HomeComponentComponent },
      { path: 'settings', component: SettingsComponentComponent },
      { path: 'impressum', component: ImpressumComponent },
      { path: 'datenschutz', component: DatenschutzComponent },
    ]),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
