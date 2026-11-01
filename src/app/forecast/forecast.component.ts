import { Component, DoCheck } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexFill,
  ApexGrid,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
  NgApexchartsModule,
} from 'ng-apexcharts';
import { BalanceService } from '../services/balance-service';
import { DataState } from '../services/data-state';
import { ForecastProjection, ForecastService } from '../services/forecast-service';
import { chartColors, chartFontFamily, formatCompactCurrency, formatCurrency } from '../chart-theme';

interface ForecastChart {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  colors: string[];
  stroke: ApexStroke;
  fill: ApexFill;
  dataLabels: ApexDataLabels;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  grid: ApexGrid;
  tooltip: ApexTooltip;
}

@Component({
  selector: 'app-forecast',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule],
  templateUrl: './forecast.component.html',
  styleUrl: './forecast.component.scss',
})
export class ForecastComponent implements DoCheck {
  readonly horizonWeeks = 12;
  projection?: ForecastProjection;
  chart?: ForecastChart;

  private lastTransactions?: DataState['allTransactions'];
  private lastRecurringSeries?: DataState['recurringSeries'];
  private lastBalances?: ReturnType<BalanceService['getDailyBalances']>;

  constructor(
    private dataState: DataState,
    private balanceService: BalanceService,
    private forecastService: ForecastService,
  ) {}

  ngDoCheck(): void {
    const transactions = this.dataState.allTransactions;
    const recurringSeries = this.dataState.recurringSeries;
    const balances = this.balanceService.getDailyBalances();
    if (transactions === this.lastTransactions && recurringSeries === this.lastRecurringSeries && balances === this.lastBalances) {
      return;
    }

    this.lastTransactions = transactions;
    this.lastRecurringSeries = recurringSeries;
    this.lastBalances = balances;
    this.projection = this.forecastService.calculate(
      transactions,
      recurringSeries,
      balances,
      this.horizonWeeks * 7,
    );
    this.chart = this.createChart(this.projection);
  }

  paymentKey(index: number, payment: ForecastProjection['upcomingPayments'][number]): string {
    return `${payment.date.getTime()}-${payment.name}-${index}`;
  }

  private createChart(projection: ForecastProjection): ForecastChart {
    const seriesName = projection.hasBalance ? 'Prognostizierter Kontostand' : 'Kumulierte Nettoveränderung';
    return {
      series: [{
        name: seriesName,
        data: projection.points.map((point) => [point.date.getTime(), point.value]),
      }],
      chart: {
        type: 'area',
        height: 340,
        fontFamily: chartFontFamily,
        background: 'transparent',
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: false },
      },
      colors: [chartColors.categories[0]],
      stroke: { curve: 'stepline', width: 2.5, lineCap: 'round' },
      fill: {
        type: 'gradient',
        gradient: { shadeIntensity: 0.2, opacityFrom: 0.28, opacityTo: 0.03, stops: [0, 78, 100] },
      },
      dataLabels: { enabled: false },
      xaxis: {
        type: 'datetime',
        labels: { style: { colors: chartColors.text }, datetimeUTC: false, format: 'dd.MM' },
      },
      yaxis: {
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
