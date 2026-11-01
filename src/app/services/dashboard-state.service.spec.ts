import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { filter, firstValueFrom } from 'rxjs';
import { Category, mapBaseCategoryToCategory } from '../models/category';
import { Transaction } from '../models/transaction';
import { DashboardStateService } from './dashboard-state.service';
import { DataState } from './data-state';

@Component({ standalone: true, template: '' })
class TestPage {}

describe('Dashboard URL state', () => {
  let router: Router;
  let view: DashboardStateService;
  let data: DataState;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '', component: TestPage }, { path: 'settings', component: TestPage }]),
        provideLocationMocks(),
      ],
    });
  });

  const settleNavigation = () => new Promise<void>((resolve) => setTimeout(resolve));
  async function travel(direction: 'back' | 'forward'): Promise<void> {
    const finished = firstValueFrom(router.events.pipe(filter(event => event instanceof NavigationEnd)));
    TestBed.inject(Location)[direction]();
    await finished;
  }
  const category = (name: string, children: Category[] = []): Category => mapBaseCategoryToCategory({
    name, type: 'expense', keywords: [], excludeKeywords: [], subCategories: children,
  });
  const booking = (day: number, amount: number, cat: Category, raw = 'coffee'): Transaction => ({
    month: new Date(2024, 2, 1), bookingDate: new Date(2024, 2, day, 18), valueDate: new Date(2024, 2, day),
    payerReceiver: 'Coffee Shop', bookingText: '', purpose: raw, balance: 0, balanceCurrency: 'EUR',
    amount, amountCurrency: 'EUR', category: cat, raw,
  });

  async function open(url = '/'): Promise<void> {
    await RouterTestingHarness.create(url);
    router = TestBed.inject(Router);
    router.initialNavigation();
    view = TestBed.inject(DashboardStateService);
    data = TestBed.inject(DataState);
  }

  function loadBookings(): void {
    data.categories = [category('Food', [category('Cafe')]), category('Other', [category('Cafe')])];
    data.setTransactions([
      booking(31, -12, data.categories[0].subCategories[0]),
      booking(15, -20, data.categories[1].subCategories[0]),
      booking(15, 100, data.categories[0].subCategories[0]),
    ]);
  }

  it('restores every option and resolves a category path after files finish loading', async () => {
    await open('/?tab=transactions&from=2024-03-01&to=2024-03-31&category=Food&category=Cafe&type=expense&q=coffee&average=1&flow=income');
    expect(data.currentFilter.category).toBeUndefined();
    loadBookings();

    expect(view.activeTab).toBe('Alle Buchungen');
    expect(view.state.flow).toBe('income');
    expect(data.showAverage).toBeTrue();
    expect(data.currentFilter.category).toBe(data.categories[0].subCategories[0]);
    expect(data.currentFilter.from).toEqual(new Date(2024, 2, 1));
    expect(data.currentFilter.to).toEqual(new Date(2024, 2, 31, 23, 59, 59, 999));
    expect(data.selectedTransactions.map((transaction) => transaction.amount)).toEqual([-12]);
  });

  it('rebinds selections to new category objects when files are reimported', async () => {
    await open('/?category=Food&category=Cafe&type=expense');
    loadBookings();
    const previous = data.currentFilter.category;
    data.resetState();
    loadBookings();

    expect(data.currentFilter.category).not.toBe(previous);
    expect(data.currentFilter.category).toBe(data.categories[0].subCategories[0]);
    expect(data.selectedTransactions.length).toBe(1);
  });

  it('batches updates while retaining unrelated parameters and the fragment', async () => {
    await open('/?future=keep#details');
    loadBookings();
    const navigate = spyOn(router, 'navigateByUrl').and.callThrough();
    data.filterByRange(new Date(2024, 2, 1), new Date(2024, 2, 31));
    data.filterByCategory(data.categories[0].subCategories[0]);
    data.filterByType('expense');
    data.filterBySearchTerm('coffee & "tea shop"');
    data.showAverage = true;
    view.update({ flow: 'income' });
    view.selectTab('Ausgaben-Fluss');
    await settleNavigation();

    const url = router.parseUrl(router.url);
    expect(url.queryParams).toEqual({
      future: 'keep', tab: 'flow', from: '2024-03-01', to: '2024-03-31',
      category: ['Food', 'Cafe'], type: 'expense', q: 'coffee & "tea shop"', average: '1', flow: 'income',
    });
    expect(url.fragment).toBe('details');
    expect(navigate.calls.count()).toBe(1);
    expect(navigate.calls.mostRecent().args[1]).toEqual({ replaceUrl: false });
  });

  it('restores tabs and filters on browser Back and Forward', async () => {
    await open();
    loadBookings();
    view.selectTab('Alle Buchungen');
    await settleNavigation();
    view.selectTab('Ausgaben-Trends');
    await settleNavigation();
    data.filterBySearchTerm('coffee');
    await settleNavigation();
    await travel('back');
    expect(view.activeTab).toBe('Alle Buchungen');
    expect(data.currentFilter.searchTerm).toBe('');

    await travel('forward');
    expect(view.activeTab).toBe('Ausgaben-Trends');
    expect(data.currentFilter.searchTerm).toBe('coffee');
  });

  it('uses the full date range when none is specified, including new imports', async () => {
    await open();
    loadBookings();
    expect(data.selectedTransactions.length).toBe(3);
    data.addTransactions([booking(1, -5, data.categories[0].subCategories[0])]);
    expect(data.currentFilter.from).toEqual(new Date(2024, 2, 1));
    expect(data.selectedTransactions.length).toBe(4);
    expect(router.url).toBe('/');
  });

  it('ignores invalid dates and unknown options without hiding bookings', async () => {
    await open('/?tab=unknown&from=2024-02-30&to=bad&type=unknown&average=bad&flow=bad&category=Food&category=Missing');
    loadBookings();
    expect(view.activeTab).toBe('Kategorien');
    expect(data.currentFilter.category).toBeUndefined();
    expect(data.showAverage).toBeFalse();
    expect(data.selectedTransactions.length).toBe(3);
  });

  it('rejects a reversed date range', async () => {
    await open('/?from=2024-03-31&to=2024-03-01');
    loadBookings();
    expect(data.selectedTransactions.length).toBe(3);
  });

  it('clears a month filter when the same calendar month is selected again', async () => {
    await open();
    loadBookings();
    const month = { from: new Date(2024, 2, 1), to: new Date(2024, 2, 31), name: 'März 2024' };
    data.filterByDateFilter(month);
    await settleNavigation();
    expect(view.state.to).toBe('2024-03-31');
    expect(data.selectedTransactions.length).toBe(3);

    data.filterByDateFilter(month);
    await settleNavigation();
    expect(view.state.from).toBeUndefined();
    expect(view.state.to).toBeUndefined();
    expect(router.url).toBe('/');
  });

  it('removes reset options from the URL while keeping unrelated state', async () => {
    await open('/?tab=transactions&from=2024-03-01&to=2024-03-31&category=Food&type=expense&q=coffee&average=1&flow=income&future=keep');
    loadBookings();
    view.reset();
    await settleNavigation();
    expect(router.url).toBe('/?future=keep');
    expect(data.selectedTransactions.length).toBe(3);
    expect(data.currentFilter.searchTerm).toBe('');
    expect(data.showAverage).toBeFalse();
  });

  it('keeps filter edits out of history and does not rewrite other routes', async () => {
    await open('/?tab=transactions');
    loadBookings();
    const navigate = spyOn(router, 'navigateByUrl').and.callThrough();
    data.filterBySearchTerm('coffee');
    await settleNavigation();
    expect(navigate.calls.mostRecent().args[1]).toEqual({ replaceUrl: true });

    await router.navigateByUrl('/settings');
    data.showAverage = true;
    await settleNavigation();
    expect(router.url).toBe('/settings');
    await travel('back');
    expect(view.activeTab).toBe('Alle Buchungen');
    expect(data.currentFilter.searchTerm).toBe('coffee');
    expect(data.showAverage).toBeFalse();
  });
});
