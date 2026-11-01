import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { ApexChart, ApexLegend, NgApexchartsModule } from 'ng-apexcharts';

import { DataState } from '../services/data-state';
import { Category } from '../models/category';
import { chartColors, chartFontFamily, formatCompactCurrency, formatCurrency } from '../chart-theme';

@Component({
    selector: 'app-category-chart',
    imports: [NgApexchartsModule],
    templateUrl: './category-chart.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './category-chart.component.scss'
})
export class CategoryChartComponent implements OnChanges, OnInit {
  @Input() data: Category[] = [];
  @Output() triggerRefresh: EventEmitter<void> = new EventEmitter<void>();
  public chartOptions!: any;
  

  public labels: string[] = [];
  public series: number[] = [];

  get ariaSummary(): string {
    const parts = this.labels.slice(0, 5).map((label, i) => `${label} ${formatCurrency(this.series[i])}`);
    return `Ringdiagramm: Ausgaben nach Kategorie. Größte Posten: ${parts.join(', ')}.`;
  }

  private arraysAreEqual(array1: any[], array2: any[]): boolean {
    return array1.length === array2.length && array1.every((value, index) => value === array2[index]);
  }

  private getCalculatedCategory(category: Category): { value: number; name: string } {
    const flatTransactions = [category.transactions, ...category.subCategories.map((c) => c.transactions)].flat();
    const activeTransactions = flatTransactions.filter((t) => this.dataState.showTransaction(t));
    const total = activeTransactions.reduce((acc, t) => acc + t.amount, 0);
    return {
      value: Math.abs(total | 0),
      name: category.name,
    };
  }

  private getFilteredCategoryData(): { value: number; name: string }[] {
    let x = this.data
      .filter((d) => d.total < 0)
      .map((d) => this.getCalculatedCategory(d))
      .sort((a, b) => b.value - a.value);
    return x;
  }

  private refresh() {
    // Filtern und Umwandeln der Daten in einem Schritt
    const filteredData = this.getFilteredCategoryData();

    const _series = filteredData.map((d) => d.value);
    if (this.arraysAreEqual(_series, this.series)) return;

    this.series = [..._series]; // Verwenden Sie Spread-Operator, um eine neue Referenz zu erstellen

    const _labels = filteredData.map((d) => d.name);
    if (this.arraysAreEqual(_labels, this.labels)) return;

    this.labels = [..._labels]; // Verwenden Sie Spread-Operator, um eine neue Referenz zu erstellen
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) {
      this.refresh();
    }
  }

  constructor(private dataState: DataState) {
    const self = this;
    this.chartOptions = {
      colors: chartColors.categories,
      legend: {
        position: 'bottom',
        fontFamily: chartFontFamily,
        labels: { colors: chartColors.text },
        markers: { size: 6 },
        itemMargin: { horizontal: 6, vertical: 2 },
      } as ApexLegend,
      chart: {
        type: 'donut',
        height: 320,
        fontFamily: chartFontFamily,
        foreColor: chartColors.text,
        events: {
          dataPointSelection: function (event, chartContext, config) {
            if (!config || config.dataPointIndex < 0) return;
            var ix = config.dataPointIndex;
            const label = config.w.config.labels?.[ix];
            if (!label) return;
            const category = self.dataState.categories.find((c) => c.name === label);
            if (category) {
              self.dataState.filterByCategory(category);
            }
            
            self.triggerRefresh.emit();
          },
        },
      } as ApexChart,
      dataLabels: { enabled: false },
      stroke: { width: 2, colors: ['#fff'] },
      tooltip: {
        y: { formatter: (val: number) => formatCurrency(val) },
      },
      plotOptions: {
        pie: {
          donut: {
            size: '68%',
            labels: {
              show: true,
              value: {
                fontSize: '1.1rem',
                fontWeight: 700,
                color: '#172824',
                formatter: (val: string) => formatCompactCurrency(Number(val)),
              },
              total: {
                show: true,
                label: 'Gesamt',
                color: chartColors.text,
                formatter: (w: any) => formatCompactCurrency(w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0)),
              },
            },
          },
        },
      },
    };
  }
  ngOnInit(): void {
    this.dataState.selectedTransactionsChanged.subscribe(() => {
      this.refresh();
    });
  }
}
