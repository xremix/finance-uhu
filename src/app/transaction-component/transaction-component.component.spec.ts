import { beforeEach, describe, expect, it } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TransactionComponentComponent } from './transaction-component.component';

describe('TransactionComponentComponent', () => {
    let component: TransactionComponentComponent;
    let fixture: ComponentFixture<TransactionComponentComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [TransactionComponentComponent]
        })
            .compileComponents();

        fixture = TestBed.createComponent(TransactionComponentComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
