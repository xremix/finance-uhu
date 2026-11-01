import { beforeEach, describe, expect, it } from "vitest";
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CategoryOverviewComponentComponent } from './category-overview-component.component';

describe('CategoryOverviewComponentComponent', () => {
    let component: CategoryOverviewComponentComponent;
    let fixture: ComponentFixture<CategoryOverviewComponentComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            declarations: [CategoryOverviewComponentComponent]
        })
            .compileComponents();

        fixture = TestBed.createComponent(CategoryOverviewComponentComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
