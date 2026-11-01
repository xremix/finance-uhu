import { Location } from '@angular/common';
import { Injectable, OnDestroy } from '@angular/core';
import { NavigationEnd, Params, PRIMARY_OUTLET, Router, UrlTree } from '@angular/router';
import { BehaviorSubject, Subscription } from 'rxjs';

// Stable URL identifiers stay independent of the labels and ordering in the UI.
export const DASHBOARD_TABS = [
  { id: 'categories', label: 'Kategorien' },
  { id: 'transactions', label: 'Alle Buchungen' },
  { id: 'recurring', label: 'Wiederkehrende Buchungen' },
  { id: 'trends', label: 'Ausgaben-Trends' },
  { id: 'balanced', label: 'Ausgeglichene Buchungen' },
  { id: 'monthly', label: 'Monatliche Bilanz' },
  { id: 'daily', label: 'Tägliche Ein- und Ausgaben' },
  { id: 'flow', label: 'Ausgaben-Fluss' },
  { id: 'comparison', label: 'Deutschlandvergleich' },
  { id: 'negative-balance', label: 'Tage im Minus' },
] as const;

export interface DashboardViewState {
  tab: typeof DASHBOARD_TABS[number]['id'];
  from?: string;
  to?: string;
  /** Repeated category parameters describe the path, including the parent. */
  category: readonly string[];
  type: 'all' | 'income' | 'expense';
  q: string;
  average: boolean;
  flow: 'expense' | 'income';
}

const QUERY_KEYS = ['tab', 'from', 'to', 'category', 'type', 'q', 'average', 'flow'] as const;
const defaults = (): DashboardViewState => ({
  tab: 'categories', from: undefined, to: undefined,
  category: [], type: 'all', q: '', average: false, flow: 'expense',
});

/** Owns dashboard URL state; add future view options and their codecs here. */
@Injectable({ providedIn: 'root' })
export class DashboardStateService implements OnDestroy {
  private readonly subject: BehaviorSubject<DashboardViewState>;
  private readonly navigationSubscription: Subscription;
  private readonly ownNavigations = new Set<string>();
  private writeScheduled = false;
  private replaceUrl = true;
  private destroyed = false;

  constructor(private router: Router, location: Location) {
    const initialUrl = router.parseUrl(location.path(true) || '/');
    this.subject = new BehaviorSubject(this.isDashboard(initialUrl) ? this.decode(initialUrl.queryParams) : defaults());
    this.navigationSubscription = router.events.subscribe((event) => {
      if (!(event instanceof NavigationEnd)) return;
      if (this.ownNavigations.delete(event.urlAfterRedirects)) return;
      const url = router.parseUrl(event.urlAfterRedirects);
      if (this.isDashboard(url)) this.setState(this.decode(url.queryParams));
    });
  }

  get state(): Readonly<DashboardViewState> { return this.subject.value; }
  get state$() { return this.subject.asObservable(); }

  get activeTab(): string {
    return DASHBOARD_TABS.find((tab) => tab.id === this.state.tab)!.label;
  }

  selectTab(label: string): void {
    const tab = DASHBOARD_TABS.find((candidate) => candidate.label === label);
    if (tab) this.update({ tab: tab.id }, false);
  }

  update(patch: Partial<DashboardViewState>, replaceUrl = true): void {
    if (!this.setState({ ...this.state, ...patch })) return;
    // Batch compound actions and replace filter edits rather than recording every keystroke.
    this.replaceUrl = this.replaceUrl && replaceUrl;
    if (this.writeScheduled) return;
    this.writeScheduled = true;
    queueMicrotask(() => {
      if (this.destroyed) return;
      this.writeScheduled = false;
      const replace = this.replaceUrl;
      this.replaceUrl = true;
      this.writeUrl(replace);
    });
  }

  reset(): void { this.update(defaults()); }

  private setState(state: DashboardViewState): boolean {
    if (JSON.stringify(state) === JSON.stringify(this.state)) return false;
    this.subject.next(state);
    return true;
  }

  private writeUrl(replaceUrl: boolean): void {
    const url = this.router.parseUrl(this.router.url);
    if (!this.isDashboard(url)) return;
    const params = { ...url.queryParams };
    QUERY_KEYS.forEach((key) => delete params[key]);
    url.queryParams = { ...params, ...this.encode(this.state) };
    const target = this.router.serializeUrl(url);
    if (target === this.router.url) return;
    this.ownNavigations.add(target);
    void this.router.navigateByUrl(url, { replaceUrl }).finally(() => this.ownNavigations.delete(target));
  }

  private isDashboard(url: UrlTree): boolean {
    return !url.root.children[PRIMARY_OUTLET]?.segments.length;
  }

  private decode(params: Params): DashboardViewState {
    const state = defaults();
    if (DASHBOARD_TABS.some((tab) => tab.id === params['tab'])) state.tab = params['tab'];
    state.from = this.validDate(params['from']);
    state.to = this.validDate(params['to']);
    if (state.from && state.to && state.from > state.to) {
      state.from = undefined;
      state.to = undefined;
    }
    state.category = (Array.isArray(params['category']) ? params['category'] : [params['category']])
      .filter((name: unknown): name is string => typeof name === 'string' && name.length > 0);
    if (params['type'] === 'income' || params['type'] === 'expense') state.type = params['type'];
    if (typeof params['q'] === 'string') state.q = params['q'];
    state.average = params['average'] === '1';
    if (params['flow'] === 'income') state.flow = 'income';
    return state;
  }

  private encode(state: Readonly<DashboardViewState>): Params {
    const params: Params = {};
    if (state.tab !== 'categories') params['tab'] = state.tab;
    if (state.from) params['from'] = state.from;
    if (state.to) params['to'] = state.to;
    if (state.category.length) params['category'] = [...state.category];
    if (state.type !== 'all') params['type'] = state.type;
    if (state.q) params['q'] = state.q;
    if (state.average) params['average'] = '1';
    if (state.flow !== 'expense') params['flow'] = state.flow;
    return params;
  }

  private validDate(value: unknown): string | undefined {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    const date = new Date(`${value}T00:00:00`);
    return !Number.isNaN(date.getTime()) && formatDateParameter(date) === value ? value : undefined;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.navigationSubscription.unsubscribe();
    this.subject.complete();
  }
}

/** Calendar dates, rather than UTC timestamps, avoid shifts around time zones and DST. */
export function formatDateParameter(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
