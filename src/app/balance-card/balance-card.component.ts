import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApexAxisChartSeries, ApexChart, ApexDataLabels, ApexFill, ApexGrid, ApexMarkers, ApexStroke, ApexTooltip, ApexXAxis, ApexYAxis, NgApexchartsModule } from 'ng-apexcharts';
import { BalanceService } from '../services/balance-service';
import { BalanceAnchor, DailyBalance } from '../models/balance';
import { DataState } from '../services/data-state';
import { chartColors, chartFontFamily, formatCompactCurrency, formatCurrency } from '../chart-theme';

interface BalanceChart {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  stroke: ApexStroke;
  fill: ApexFill;
  dataLabels: ApexDataLabels;
  markers: ApexMarkers;
  tooltip: ApexTooltip;
  grid: ApexGrid;
  colors: string[];
}

@Component({
  selector: 'app-balance-card',
  standalone: true,
  imports: [CommonModule, FormsModule, NgApexchartsModule],
  templateUrl: './balance-card.component.html',
  styleUrl: './balance-card.component.scss',
})
export class BalanceCardComponent {
  readonly sparklineDays = 30;

  @Input() expanded = false;
  @Input() detailsOnly = false;
  @Output() toggleDetails = new EventEmitter<void>();
  @Output() closeDetails = new EventEmitter<void>();
  showForm = false;
  formDate = '';
  formAmount: number | null = null;

  sparkline?: BalanceChart;
  detailChart?: BalanceChart;
  daysDescending: DailyBalance[] = [];
  trend = 0;

  private renderedBalances?: DailyBalance[];

  constructor(private balanceService: BalanceService, private dataState: DataState) {}

  get anchor(): BalanceAnchor | undefined {
    return this.balanceService.anchor;
  }

  get balances(): DailyBalance[] {
    const balances = this.balanceService.getDailyBalances();
    if (balances !== this.renderedBalances) {
      this.renderedBalances = balances;
      this.buildView(balances);
    }
    return balances;
  }

  get latest(): DailyBalance | undefined {
    const balances = this.balances;
    return balances[balances.length - 1];
  }

  openForm(): void {
    const anchor = this.anchor;
    const transactions = this.dataState.allTransactions;
    const lastBooking = transactions.reduce<Date | undefined>(
      (latest, t) => (!latest || t.bookingDate > latest ? t.bookingDate : latest),
      undefined
    );
    this.formDate = this.balanceService.toKey(anchor?.date ?? lastBooking ?? new Date());
    this.formAmount = anchor?.amount ?? null;
    this.showForm = true;
  }

  saveManualBalance(): void {
    const date = this.balanceService.fromKey(this.formDate);
    if (!date || this.formAmount === null || Number.isNaN(Number(this.formAmount))) return;
    this.balanceService.setManualBalance(date, Number(this.formAmount));
    this.showForm = false;
  }

  removeManualBalance(): void {
    this.balanceService.clearManualBalance();
    this.closeDetails.emit();
  }

  private buildView(balances: DailyBalance[]): void {
    this.daysDescending = [...balances].reverse();
    const recent = balances.slice(-this.sparklineDays);
    this.trend = recent.length > 1 ? recent[recent.length - 1].balance - recent[0].balance : 0;

    this.sparkline = this.createChart(recent, true);
    this.detailChart = this.createChart(balances, false);
  }

  private createChart(balances: DailyBalance[], sparkline: boolean): BalanceChart {
    const values = balances.map((balance) => balance.balance);
    const minBalance = values.length ? Math.min(...values) : undefined;
    const maxBalance = values.length ? Math.max(...values) : undefined;
    const balancePadding = values.length ? Math.max((maxBalance! - minBalance!) * 0.14, 100) : 0;

    return {
      series: [{ name: 'Kontostand', data: balances.map((b) => [b.date.getTime(), b.balance]) }],
      chart: {
        type: 'area',
        height: sparkline ? 154 : 280,
        sparkline: { enabled: sparkline },
        fontFamily: chartFontFamily,
        background: 'transparent',
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: false },
      },
      colors: [sparkline ? chartColors.income : chartColors.categories[0]],
      stroke: { curve: sparkline ? 'smooth' : 'stepline', width: sparkline ? 2.75 : 2, lineCap: 'round' },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 0.35,
          opacityFrom: sparkline ? 0.5 : 0.35,
          opacityTo: 0.03,
          stops: [0, 78, 100],
        },
      },
      dataLabels: { enabled: false },
      markers: {
        size: 0,
        strokeWidth: 2,
        discrete: sparkline && balances.length ? [{
          seriesIndex: 0,
          dataPointIndex: balances.length - 1,
          fillColor: chartColors.income,
          strokeColor: '#ffffff',
          size: 4,
          shape: 'circle',
        }] : [],
      },
      xaxis: {
        type: 'datetime',
        labels: { style: { colors: chartColors.text }, datetimeUTC: false },
      },
      yaxis: {
        min: sparkline && minBalance !== undefined ? minBalance - balancePadding : undefined,
        max: sparkline && maxBalance !== undefined ? maxBalance + balancePadding : undefined,
        labels: { style: { colors: chartColors.text }, formatter: (value) => formatCompactCurrency(value) },
      },
      grid: { borderColor: chartColors.grid },
      tooltip: {
        x: { format: 'dd.MM.yyyy' },
        y: { formatter: (value) => formatCurrency(value) },
      },
    };
  }
}
