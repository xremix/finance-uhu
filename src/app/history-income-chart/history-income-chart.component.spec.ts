import { beforeEach, describe, expect, it } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HistoryIncomeChartComponent } from './history-income-chart.component';

describe('HistoryIncomeChartComponent', () => {
    let component: HistoryIncomeChartComponent;
    let fixture: ComponentFixture<HistoryIncomeChartComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [HistoryIncomeChartComponent]
        })
            .compileComponents();

        fixture = TestBed.createComponent(HistoryIncomeChartComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
