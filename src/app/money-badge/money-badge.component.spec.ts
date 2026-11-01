import { beforeEach, describe, expect, it } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MoneyBadgeComponent } from './money-badge.component';

describe('MoneyBadgeComponent', () => {
    let component: MoneyBadgeComponent;
    let fixture: ComponentFixture<MoneyBadgeComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [MoneyBadgeComponent]
        })
            .compileComponents();

        fixture = TestBed.createComponent(MoneyBadgeComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
