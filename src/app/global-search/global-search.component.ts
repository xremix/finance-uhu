import { Component, OnDestroy, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { DataState } from '../services/data-state';
import { EMPTY, Subject, Subscription, timer } from 'rxjs';
import { distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { DashboardStateService } from '../services/dashboard-state.service';

@Component({
    selector: 'app-global-search',
    imports: [FormsModule],
    templateUrl: './global-search.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './global-search.component.scss'
})
export class GlobalSearchComponent implements OnDestroy {
  searchTerm: string = '';
  private searchSubject = new Subject<string | null>();
  private subscriptions = new Subscription();

  constructor(public dataState: DataState, viewState: DashboardStateService) {
    this.subscriptions.add(this.searchSubject.pipe(
      switchMap(term => term === null ? EMPTY : timer(300).pipe(map(() => term)))
    ).subscribe(searchTerm => {
      this.dataState.filterBySearchTerm(searchTerm);
    }));
    this.subscriptions.add(viewState.state$.pipe(
      distinctUntilChanged((previous, current) => previous.q === current.q)
    ).subscribe(state => {
      this.searchSubject.next(null);
      this.searchTerm = state.q;
    }));
  }

  onSearchChange() {
    this.searchSubject.next(this.searchTerm);
  }

  clearSearch() {
    this.searchTerm = '';
    this.searchSubject.next(null);
    this.dataState.filterBySearchTerm('');
  }

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    this.searchSubject.complete();
  }
}
