import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgxEchartsDirective, provideEcharts } from 'ngx-echarts';
import { EChartsOption } from 'echarts';
import { Category } from '../models/category';
import { Transaction } from '../models/transaction';
import { SankeyDataService } from '../services/sankey-data.service';
import { chartColors, chartFontFamily } from '../chart-theme';

@Component({
  selector: 'app-sankey-chart',
  standalone: true,
  imports: [CommonModule, NgxEchartsDirective],
  providers: [provideEcharts()],
  templateUrl: './sankey-chart.component.html',
  styleUrls: ['./sankey-chart.component.scss']
})
export class SankeyChartComponent implements OnInit, OnChanges {
  @Input() transactions: Transaction[] = [];
  @Input() categories: Category[] = [];
  @Input() type: 'expense' | 'income' = 'expense';
  @Input() height = '600px';
  @Input() amountMonths: number = 1;
  @Input() showAverage: boolean = false;

  chartOptions: EChartsOption = {};

  constructor(private sankeyDataService: SankeyDataService) {}

  ngOnInit(): void {
    this.updateChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['transactions'] || changes['categories'] || changes['type'] || changes['amountMonths'] || changes['showAverage']) {
      this.updateChart();
    }
  }

  private updateChart(): void {
    const sankeyData = this.sankeyDataService.transformTransactionsToSankeyData(
      this.transactions,
      this.categories,
      this.type,
      this.showAverage ? this.amountMonths : 1
    );
    const valueSuffix = this.showAverage && this.amountMonths > 1 ? ' Ø/Monat' : '';
    const format = (value: number) => this.sankeyDataService.formatCurrency(value) + valueSuffix;
    const labels = new Map(sankeyData.nodes.map(node => [node.name, node.label ?? node.name]));
    const displayName = (name: string) => labels.get(name) ?? name;

    if (sankeyData.nodes.length === 0) {
      this.chartOptions = {};
      return;
    }

    const rootName = this.type === 'expense' ? 'Gesamtausgaben' : 'Gesamteinnahmen';
    const sourceByTarget = new Map(sankeyData.links.map(link => [link.target, link.source]));
    const nodeColors = new Map<string, string>();
    let categoryColorIndex = 0;

    const getNodeColor = (name: string): string => {
      if (name === rootName) {
        return chartColors.text;
      }

      const source = sourceByTarget.get(name);
      const color = source === rootName
        ? chartColors.categories[categoryColorIndex++ % chartColors.categories.length]
        : nodeColors.get(source ?? '') ?? chartColors.categories[0];

      nodeColors.set(name, color);
      return color;
    };

    this.chartOptions = {
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
        formatter: (params: any) => {
          if (params.dataType === 'edge') {
            return `${displayName(params.data.source)} → ${displayName(params.data.target)}<br/>
                    <strong>${format(params.data.value)}</strong>`;
          }
          return `<strong>${displayName(params.name)}</strong>`;
        }
      },
      series: [
        {
          type: 'sankey',
          emphasis: {
            focus: 'adjacency'
          },
          nodeAlign: 'left',
          orient: 'horizontal',
          draggable: true,
          data: sankeyData.nodes.map((node) => ({
            name: node.name,
            itemStyle: {
              color: getNodeColor(node.name)
            }
          })),
          links: sankeyData.links,
          lineStyle: {
            color: 'gradient',
            curveness: 0.5
          },
          label: {
            position: 'right',
            color: chartColors.text,
            fontFamily: chartFontFamily,
            formatter: (params: any) => {
              // Finde den Gesamtwert für diesen Node
              const nodeValue = sankeyData.links
                .filter(link => link.source === params.name || link.target === params.name)
                .reduce((sum, link) => {
                  if (link.target === params.name) return sum + link.value;
                  return sum;
                }, 0);
              
              if (nodeValue > 0) {
                return `${displayName(params.name)}\n${format(nodeValue)}`;
              }
              return displayName(params.name);
            },
            fontSize: 11,
            rich: {}
          },
          left: '5%',
          right: '20%',
          top: '5%',
          bottom: '5%'
        }
      ]
    };
  }
}
