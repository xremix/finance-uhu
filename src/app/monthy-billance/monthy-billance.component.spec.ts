import { beforeEach, describe, expect, it } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MonthyBillanceComponent } from './monthy-billance.component';

describe('MonthyBillanceComponent', () => {
    let component: MonthyBillanceComponent;
    let fixture: ComponentFixture<MonthyBillanceComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [MonthyBillanceComponent]
        })
            .compileComponents();

        fixture = TestBed.createComponent(MonthyBillanceComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
