import { beforeEach, describe, expect, it } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TransactionOverviewComponent } from './transaction-overview.component';

describe('TransactionOverviewComponent', () => {
    let component: TransactionOverviewComponent;
    let fixture: ComponentFixture<TransactionOverviewComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [TransactionOverviewComponent]
        })
            .compileComponents();

        fixture = TestBed.createComponent(TransactionOverviewComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
