import { Component, DoCheck, ElementRef, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataState } from '../services/data-state';
import { Category } from '../models/category';

export interface CategoryNode {
  category: Category;
  parent?: Category;
  icon: string;
  total: number;
  count: number;
  /** Width of the share bar relative to the largest sibling (0–1). */
  barRatio: number;
  /** Share of the absolute sum of all siblings in percent. */
  percent: number;
  children: CategoryNode[];
}

const DEFAULT_ICON = 'fa-solid fa-tag';
const MAX_SEARCH_RESULTS = 8;

@Component({
    selector: 'app-category-select',
    imports: [FormsModule, CommonModule],
    templateUrl: './category-select.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './category-select.component.scss'
})
export class CategorySelectComponent implements DoCheck {
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('tileGrid') tileGrid?: ElementRef<HTMLElement>;

  roots: CategoryNode[] = [];
  overallTotal = 0;
  overallCount = 0;

  query = '';
  searchResults: CategoryNode[] = [];
  activeResultIndex = 0;

  private nodeByCategory = new Map<Category, CategoryNode>();
  private signature: unknown[] = [];

  constructor(protected dataState: DataState) {}

  ngDoCheck(): void {
    const filter = this.dataState.currentFilter;
    const next = [
      this.dataState.categories,
      this.dataState.allTransactions,
      filter.from?.getTime(),
      filter.to?.getTime(),
      filter.type,
      filter.searchTerm,
      this.dataState.categories.length,
    ];
    if (next.length !== this.signature.length || next.some((value, i) => value !== this.signature[i])) {
      this.signature = next;
      this.rebuild();
    }
  }

  // ---------- State ----------

  get selected(): Category | undefined {
    return this.dataState.currentFilter.category;
  }

  get selectedNode(): CategoryNode | undefined {
    return this.selected ? this.nodeByCategory.get(this.selected) : undefined;
  }

  /** Parent of the selected category (works even if it has no transactions in scope). */
  get selectedParent(): Category | undefined {
    const selected = this.selected;
    if (!selected) {
      return undefined;
    }
    return this.dataState.categories.find(root => root.subCategories?.includes(selected));
  }

  /** Root node whose sub categories are shown (selected root or parent of selected sub). */
  get activeRoot(): CategoryNode | undefined {
    const selected = this.selected;
    if (!selected) {
      return undefined;
    }
    return this.nodeByCategory.get(this.selectedParent ?? selected);
  }

  isActive(node: CategoryNode): boolean {
    return this.selected === node.category;
  }

  isInPath(node: CategoryNode): boolean {
    return this.isActive(node) || this.activeRoot === node;
  }

  displayAmount(total: number): number {
    return this.dataState.showAverage ? total / this.dataState.selectedMonthAmountInDataRangeFilter : total;
  }

  // ---------- Actions ----------

  select(node: CategoryNode): void {
    this.dataState.filterByCategory(node.category);
  }

  selectAll(): void {
    if (this.selected) {
      this.dataState.resetCategory();
    }
  }

  goUp(): void {
    const parent = this.selectedParent;
    if (parent) {
      this.dataState.filterByCategory(parent);
    } else if (this.selected) {
      this.dataState.resetCategory();
    }
  }

  selectCategory(category: Category): void {
    if (this.selected !== category) {
      this.dataState.filterByCategory(category);
    }
  }

  // ---------- Search ----------

  onQueryChange(value: string): void {
    this.query = value;
    this.activeResultIndex = 0;
    this.searchResults = this.search(value);
  }

  clearQuery(): void {
    this.onQueryChange('');
  }

  pickResult(node: CategoryNode): void {
    this.selectCategory(node.category);
    this.clearQuery();
  }

  onSearchKeydown(event: KeyboardEvent): void {
    const results = this.searchResults;
    switch (event.key) {
      case 'ArrowDown':
        if (results.length) {
          this.activeResultIndex = (this.activeResultIndex + 1) % results.length;
        } else {
          this.focusTile(0);
        }
        event.preventDefault();
        break;
      case 'ArrowUp':
        if (results.length) {
          this.activeResultIndex = (this.activeResultIndex - 1 + results.length) % results.length;
          event.preventDefault();
        }
        break;
      case 'Enter':
        if (results[this.activeResultIndex]) {
          this.pickResult(results[this.activeResultIndex]);
          event.preventDefault();
        }
        break;
      case 'Escape':
        if (this.query) {
          this.clearQuery();
        } else {
          this.searchInput?.nativeElement.blur();
        }
        event.preventDefault();
        break;
    }
  }

  private search(rawQuery: string): CategoryNode[] {
    const query = normalize(rawQuery.trim());
    if (!query) {
      return [];
    }
    const scored: { node: CategoryNode; score: number }[] = [];
    for (const node of this.nodeByCategory.values()) {
      const name = normalize(node.category.name);
      const parentName = node.parent ? normalize(node.parent.name) : '';
      let score = -1;
      if (name.startsWith(query)) {
        score = 3;
      } else if (name.split(/[\s&/-]+/).some(word => word.startsWith(query))) {
        score = 2;
      } else if (name.includes(query)) {
        score = 1;
      } else if (parentName.includes(query)) {
        score = 0;
      }
      if (score >= 0) {
        scored.push({ node, score });
      }
    }
    return scored
      .sort((a, b) => b.score - a.score || Math.abs(b.node.total) - Math.abs(a.node.total))
      .slice(0, MAX_SEARCH_RESULTS)
      .map(entry => entry.node);
  }

  // ---------- Keyboard navigation in the tile grid ----------

  onGridKeydown(event: KeyboardEvent): void {
    const tiles = this.getTiles();
    const index = tiles.indexOf(document.activeElement as HTMLElement);
    if (index < 0) {
      return;
    }
    const columns = this.getColumnCount();
    let target = -1;
    switch (event.key) {
      case 'ArrowRight': target = index + 1; break;
      case 'ArrowLeft': target = index - 1; break;
      case 'ArrowDown': target = index + columns; break;
      case 'ArrowUp': target = index - columns; break;
      case 'Home': target = 0; break;
      case 'End': target = tiles.length - 1; break;
      case 'Escape':
      case 'Backspace':
        this.goUp();
        event.preventDefault();
        return;
      default:
        // Type-to-search: printable characters jump into the search field
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ') {
          this.searchInput?.nativeElement.focus();
          this.onQueryChange(this.query + event.key);
          event.preventDefault();
        }
        return;
    }
    if (target >= 0 && target < tiles.length) {
      tiles[target].focus();
    } else if (event.key === 'ArrowUp' && index < columns) {
      this.searchInput?.nativeElement.focus();
    }
    event.preventDefault();
  }

  private focusTile(index: number): void {
    this.getTiles()[index]?.focus();
  }

  private getTiles(): HTMLElement[] {
    const grid = this.tileGrid?.nativeElement;
    return grid ? Array.from(grid.querySelectorAll<HTMLElement>('[data-nav-tile]')) : [];
  }

  private getColumnCount(): number {
    const grid = this.tileGrid?.nativeElement;
    if (!grid) {
      return 1;
    }
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
    return Math.max(1, columns);
  }

  // ---------- View model ----------

  trackByNode = (_: number, node: CategoryNode) => node.category;

  private rebuild(): void {
    const categories = this.dataState.categories;
    const parentOf = new Map<Category, Category>();
    for (const root of categories) {
      for (const sub of root.subCategories ?? []) {
        parentOf.set(sub, root);
      }
    }

    const stats = new Map<Category, { total: number; count: number }>();
    const add = (category: Category, amount: number) => {
      const entry = stats.get(category);
      if (entry) {
        entry.total += amount;
        entry.count++;
      } else {
        stats.set(category, { total: amount, count: 1 });
      }
    };

    let overallTotal = 0;
    let overallCount = 0;
    for (const transaction of this.dataState.allTransactions) {
      if (!this.dataState.matchesFilterIgnoringCategory(transaction)) {
        continue;
      }
      overallTotal += transaction.amount;
      overallCount++;
      const category = transaction.category;
      if (!category) {
        continue;
      }
      add(category, transaction.amount);
      const parent = parentOf.get(category);
      if (parent) {
        add(parent, transaction.amount);
      }
    }

    const nodeByCategory = new Map<Category, CategoryNode>();
    const toNodes = (list: Category[], parent?: Category, parentIcon?: string): CategoryNode[] => {
      const nodes: CategoryNode[] = [];
      for (const category of list) {
        const stat = stats.get(category);
        if (!stat || stat.count === 0) {
          continue;
        }
        const icon = category.icon || parentIcon || DEFAULT_ICON;
        const node: CategoryNode = {
          category,
          parent,
          icon,
          total: stat.total,
          count: stat.count,
          barRatio: 0,
          percent: 0,
          children: [],
        };
        node.children = parent ? [] : toNodes(category.subCategories ?? [], category, icon);
        nodeByCategory.set(category, node);
        nodes.push(node);
      }
      nodes.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
      const max = nodes.reduce((m, n) => Math.max(m, Math.abs(n.total)), 0);
      const sum = nodes.reduce((s, n) => s + Math.abs(n.total), 0);
      for (const node of nodes) {
        node.barRatio = max ? Math.abs(node.total) / max : 0;
        node.percent = sum ? (Math.abs(node.total) / sum) * 100 : 0;
      }
      return nodes;
    };

    this.roots = toNodes(categories);
    this.nodeByCategory = nodeByCategory;
    this.overallTotal = overallTotal;
    this.overallCount = overallCount;
    this.searchResults = this.search(this.query);
    this.activeResultIndex = Math.min(this.activeResultIndex, Math.max(0, this.searchResults.length - 1));
  }
}

function normalize(value: string): string {
  return value.toLocaleLowerCase('de').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
