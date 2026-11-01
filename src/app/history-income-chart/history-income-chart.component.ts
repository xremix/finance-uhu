import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexPlotOptions,
  ApexYAxis,
  ApexXAxis,
  ApexFill,
  ApexTooltip,
  ApexStroke,
  ApexLegend,
  ChartComponent,
  NgApexchartsModule,
  ApexTitleSubtitle,
  ApexGrid,
  ApexStates,
} from 'ng-apexcharts';
import { Transaction } from '../models/transaction';

import { DataState } from '../services/data-state';
import { chartColors, chartFontFamily, formatCompactCurrency, formatCurrency } from '../chart-theme';

@Component({
    selector: 'app-history-chart',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgApexchartsModule],
    templateUrl: './history-income-chart.component.html',
    styleUrl: './history-income-chart.component.scss'
})
export class HistoryIncomeChartComponent implements OnInit, OnChanges {
  @Input() dates: Date[] = [];
  @Input() transactions: Transaction[] = [];
  @Output() triggerRefresh: EventEmitter<void> = new EventEmitter<void>();

  @ViewChild('chart') chart!: ChartComponent;
  public chartOptions!: ChartOptions;

  public categories: ApexXAxis = {
    categories: [],
  };
  public series: ApexAxisChartSeries = [
    {
      name: 'X',
      data: [],
    },
  ];


  private refresh() {
    this.categories = {
      ...this.categories,
      categories: this.dates.map((d) => d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' })),
    };
    if (this.dates.length === 0) return;

    this.series = [
      {
        name: 'Einnahmen',
        // takes the dates and filters the transactions for the month
        data: this.dates.map((d) => {
          return (
            this.transactions
              .filter(
                (t) => t.bookingDate.getMonth() === d.getMonth() && t.bookingDate.getFullYear() === d.getFullYear()
              )
              // only negative transactions
              .filter((t) => t.amount >= 0)
              .reduce((acc, t) => acc + (t.amount | 0), 0)
          );
        }),
        color: chartColors.income,
      },
      {
        name: 'Ausgaben',
        // takes the dates and filters the transactions for the month
        data: this.dates.map((d) => {
          return (
            this.transactions
              .filter(
                (t) => t.bookingDate.getMonth() === d.getMonth() && t.bookingDate.getFullYear() === d.getFullYear()
              )
              // only negative transactions
              .filter((t) => t.amount < 0)
              .reduce((acc, t) => acc + ((t.amount * -1) | 0), 0)
          );
        }),
        color: chartColors.expense,
      },
     
    ];
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['dates'] || changes['transactions']) {
      this.refresh();
    }
  }

  ngOnInit(): void {
    // this.refresh();
    // this.dataState.transactionsChanged.subscribe((transactions) => {
    //   this.transactions = transactions;
    //   this.refresh();
    // });
  }

  constructor(private dataState: DataState) {
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
        type: 'bar',
        height: 340,
        fontFamily: chartFontFamily,
        foreColor: chartColors.text,
        toolbar: { show: false },
        events: {
          dataPointSelection: function (event, chartContext, config) {
            if (!config || config.dataPointIndex < 0) return;
            var ix = config.dataPointIndex;
            self.dataState.filterByDay(self.dates[ix]);
            self.triggerRefresh.emit();
          },
        },
      },
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: '55%',
          borderRadius: 4,
          borderRadiusApplication: 'end',
        },
      },
      dataLabels: {
        enabled: false,
      },
      xaxis: {
        categories: [],
      },
      yaxis: {
        labels: {
          formatter: (val) => formatCompactCurrency(val),
        },
      },
      fill: {
        opacity: 1,
      },
      tooltip: {
        y: {
          formatter: (val) => val == null ? '' : formatCurrency(val),
        },
      },
      grid: {
        borderColor: chartColors.grid,
        strokeDashArray: 4,
      },
      states: {
        hover: { filter: { type: 'darken' } },
      },
    };
  }
}

export type ChartOptions = {
  chart: ApexChart;
  dataLabels: ApexDataLabels;
  plotOptions: ApexPlotOptions;
  yaxis: ApexYAxis;
  xaxis: ApexXAxis;
  fill: ApexFill;
  tooltip: ApexTooltip;
  legend: ApexLegend;
  title: ApexTitleSubtitle;
  grid: ApexGrid;
  states: ApexStates;
};
