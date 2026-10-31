import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexYAxis,
  ApexXAxis,
  ApexTooltip,
  ApexStroke,
  ApexLegend,
  NgApexchartsModule,
  ApexTitleSubtitle,
  ApexMarkers,
} from 'ng-apexcharts';
import { Transaction } from '../models/transaction';
import { CommonModule } from '@angular/common';
import { chartColors, chartFontFamily, formatCompactCurrency, formatCurrency } from '../chart-theme';

@Component({
  selector: 'app-daily-income-expense-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgApexchartsModule, CommonModule],
  templateUrl: './daily-income-expense-chart.component.html',
  styleUrl: './daily-income-expense-chart.component.scss',
})
export class DailyIncomeExpenseChartComponent implements OnChanges {
  @Input() transactions: Transaction[] = [];
  @Output() triggerRefresh: EventEmitter<void> = new EventEmitter<void>();

  public chartOptions!: ChartOptions;

  public categories: ApexXAxis = {
    categories: [],
  };
  
  public series: ApexAxisChartSeries = [
    {
      name: 'Einnahmen',
      data: [],
    },
    {
      name: 'Ausgaben', 
      data: [],
    },
  ];

  private refresh() {
    // Get all unique dates from transactions and sort them
    const uniqueDates = [...new Set(this.transactions.map(t => t.bookingDate.toDateString()))]
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    // Create categories for x-axis (formatted dates)
    this.categories.categories = uniqueDates.map(dateStr => 
      new Date(dateStr).toLocaleDateString('de-DE', { 
        day: '2-digit', 
        month: '2-digit' 
      })
    );

    // Calculate daily income
    const dailyIncome = uniqueDates.map(dateStr => {
      return this.transactions
        .filter(t => t.bookingDate.toDateString() === dateStr && t.amount >= 0)
        .reduce((sum, t) => sum + t.amount, 0);
    });

    // Calculate daily expenses (positive values for display)
    const dailyExpenses = uniqueDates.map(dateStr => {
      return this.transactions
        .filter(t => t.bookingDate.toDateString() === dateStr && t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    });

    this.series = [
      {
        name: 'Einnahmen',
        data: dailyIncome,
        color: chartColors.income,
      },
      {
        name: 'Ausgaben',
        data: dailyExpenses,
        color: chartColors.expense,
      }
    ];

    this.chartOptions.xaxis = this.categories;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['transactions']) {
      this.refresh();
    }
  }

  constructor() {
    const self = this;
    this.chartOptions = {
      legend: {
        position: 'top',
        horizontalAlign: 'left',
        fontFamily: chartFontFamily,
        labels: { colors: chartColors.text },
      },
      title: {
        text: undefined,
      },
      chart: {
        type: 'line',
        height: 320,
        fontFamily: chartFontFamily,
        foreColor: chartColors.text,
        zoom: {
          enabled: true,
          type: 'x',
        },
        toolbar: {
          show: true,
        },
        events: {
          dataPointSelection: function (event, chartContext, config) {
            // Optional: Add click functionality if needed
            self.triggerRefresh.emit();
          },
        },
      },
      dataLabels: {
        enabled: false,
      },
      stroke: {
        width: 2.5,
        curve: 'smooth',
      },
      markers: {
        size: 0,
        strokeWidth: 2,
        hover: {
          size: 6,
        },
      },
      xaxis: {
        categories: [],
      },
      yaxis: {
        labels: {
          formatter: (val) => formatCompactCurrency(val),
        },
      },
      tooltip: {
        y: {
          formatter: (val) => formatCurrency(val),
        },
        x: {
          show: true,
        },
      },
      grid: {
        borderColor: chartColors.grid,
        strokeDashArray: 4,
      },
    };
  }
}

export type ChartOptions = {
  chart: ApexChart;
  dataLabels: ApexDataLabels;
  stroke: ApexStroke;
  markers: ApexMarkers;
  yaxis: ApexYAxis;
  xaxis: ApexXAxis;
  tooltip: ApexTooltip;
  legend: ApexLegend;
  title: ApexTitleSubtitle;
  grid: any;
};
