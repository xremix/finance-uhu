import { beforeEach, describe, expect, it, type MockedObject, vi } from "vitest";
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { GlobalSearchComponent } from './global-search.component';
import { DataState } from '../services/data-state';
import { DashboardStateService, DashboardViewState } from '../services/dashboard-state.service';

describe('GlobalSearchComponent', () => {
    let component: GlobalSearchComponent;
    let fixture: ComponentFixture<GlobalSearchComponent>;
    let mockDataState: MockedObject<DataState>;
    let urlState: BehaviorSubject<DashboardViewState>;

    beforeEach(async () => {
        mockDataState = {
            filterBySearchTerm: vi.fn().mockName("DataState.filterBySearchTerm"),
            selectedTransactions: []
        } as unknown as MockedObject<DataState>;
        urlState = new BehaviorSubject({ q: '' } as DashboardViewState);

        await TestBed.configureTestingModule({
            imports: [GlobalSearchComponent],
            providers: [
                { provide: DataState, useValue: mockDataState },
                { provide: DashboardStateService, useValue: { state$: urlState.asObservable() } },
            ]
        })
            .compileComponents();

        fixture = TestBed.createComponent(GlobalSearchComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('debounces typing before applying a filter', fakeAsync(() => {
        component.searchTerm = 'miete';
        component.onSearchChange();
        tick(299);
        expect(mockDataState.filterBySearchTerm).not.toHaveBeenCalled();
        tick(1);
        expect(mockDataState.filterBySearchTerm).toHaveBeenCalledTimes(1);
        expect(mockDataState.filterBySearchTerm).toHaveBeenCalledWith('miete');
    }));

    it('clears immediately and cancels pending input', fakeAsync(() => {
        component.searchTerm = 'miete';
        component.onSearchChange();
        component.clearSearch();
        tick(300);

        expect(component.searchTerm).toBe('');
        expect(mockDataState.filterBySearchTerm).toHaveBeenCalledTimes(1);
        expect(mockDataState.filterBySearchTerm).toHaveBeenCalledWith('');
    }));

    it('restores the field on URL navigation without a stale draft overwriting it', fakeAsync(() => {
        component.searchTerm = 'unfinished';
        component.onSearchChange();
        urlState.next({ q: 'miete -gebühr' } as DashboardViewState);
        fixture.detectChanges();
        tick(300);
        expect(fixture.nativeElement.querySelector('input').value).toBe('miete -gebühr');
        expect(mockDataState.filterBySearchTerm).not.toHaveBeenCalled();
    }));

    it('does not apply pending input after leaving the page', fakeAsync(() => {
        component.searchTerm = 'miete';
        component.onSearchChange();
        fixture.destroy();
        tick(300);
        expect(mockDataState.filterBySearchTerm).not.toHaveBeenCalled();
    }));
});
