import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'app-money-badge',
    imports: [],
    templateUrl: './money-badge.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './money-badge.component.scss'
})
export class MoneyBadgeComponent {
@Input() text: string = '';
@Input() fill: number = 50;
@Input() background: string = 'bg-light';
@Input() fillColor: string = 'bg-success';
}
