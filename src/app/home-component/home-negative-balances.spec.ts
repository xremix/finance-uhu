import { ChangeDetectorRef } from '@angular/core';
import { HomeComponentComponent } from './home-component.component';
import { Transaction } from '../models/transaction';
import { BalanceService } from '../services/balance-service';
import { CategoryService } from '../services/category-service';
import { DataState } from '../services/data-state';
import { DateService } from '../services/date-service';

describe('HomeComponentComponent negative daily balances', () => {
  let state: DataState;
  let balanceService: BalanceService;
  let component: HomeComponentComponent;

  const date = (day: number): Date => new Date(2023, 6, day);
  const booking = (day: number, amount: number): Transaction => ({
    bookingDate: date(day),
    amount,
  } as Transaction);

  beforeEach(() => {
    spyOn(Storage.prototype, 'getItem').and.returnValue(null);
    spyOn(Storage.prototype, 'setItem');
    spyOn(Storage.prototype, 'removeItem');
    state = {
      allTransactions: [booking(5, 100), booking(7, -150), booking(10, 50), booking(12, 50)],
      fileBalanceAnchor: { date: date(12), amount: 50, source: 'file' },
      currentFilter: { from: date(1), to: date(31), type: 'all', searchTerm: '' },
      showAverage: false,
    } as unknown as DataState;
    balanceService = new BalanceService(state);
    component = new HomeComponentComponent(
      state,
      {} as CategoryService,
      {} as DateService,
      {} as ChangeDetectorRef,
      balanceService,
    );
  });

  it('hides the tab when neither a file nor a manual balance is available', () => {
    state.fileBalanceAnchor = undefined;

    expect(component.tabs).not.toContain(component.negativeBalanceTab);
    expect(component.negativeBalanceDays).toEqual([]);
  });

  it('lists every negative day, including the weekend without bookings, newest first', () => {
    expect(component.tabs[component.tabs.length - 1]).toBe(component.negativeBalanceTab);
    expect(component.negativeBalanceDays.map(day => [day.date.getDate(), day.balance]))
      .toEqual([[9, -50], [8, -50], [7, -50]]);
    expect(balanceService.getDailyBalances().map(day => day.date.getDate()))
      .toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('includes both boundary dates of the selected period', () => {
    state.currentFilter.from = new Date(2023, 6, 8, 12);
    state.currentFilter.to = date(9);

    expect(component.negativeBalanceDays.map(day => day.date.getDate())).toEqual([9, 8]);
  });

  it('uses actual account balances regardless of category, type, search or average settings', () => {
    state.currentFilter.category = { name: 'Miete' } as DataState['categories'][number];
    state.currentFilter.type = 'income';
    state.currentFilter.searchTerm = 'does not match any booking';
    state.showAverage = true;

    expect(component.negativeBalanceDays.map(day => day.balance)).toEqual([-50, -50, -50]);
  });

  it('shows the tab for an available zero balance and excludes days with a zero saldo', () => {
    state.fileBalanceAnchor = { date: date(12), amount: 0, source: 'file' };

    expect(component.tabs).toContain(component.negativeBalanceTab);
    expect(component.negativeBalanceDays.every(day => day.balance < 0)).toBeTrue();
    expect(component.negativeBalanceDays.some(day => day.date.getDate() === 12)).toBeFalse();
  });

  it('keeps the tab available when there are no negative days', () => {
    state.fileBalanceAnchor = { date: date(12), amount: 1000, source: 'file' };

    expect(component.tabs).toContain(component.negativeBalanceTab);
    expect(component.negativeBalanceDays).toEqual([]);
  });

  it('updates tab availability after adding or removing a manual balance', () => {
    state.fileBalanceAnchor = undefined;
    balanceService.setManualBalance(date(12), 50);

    expect(component.tabs).toContain(component.negativeBalanceTab);
    expect(component.negativeBalanceDays.length).toBe(3);

    component.activeTab = component.negativeBalanceTab;
    balanceService.clearManualBalance();
    component.ngDoCheck();

    expect(component.tabs).not.toContain(component.negativeBalanceTab);
    expect(component.activeTab).toBe('Kategorien');
  });

  it('returns to a visible tab when the file balance is removed', () => {
    component.activeTab = component.negativeBalanceTab;
    state.fileBalanceAnchor = undefined;
    component.ngDoCheck();

    expect(component.tabs).not.toContain(component.negativeBalanceTab);
    expect(component.activeTab).toBe('Kategorien');
  });
});
