import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { legalContact } from '../legal-contact';

@Component({
    selector: 'app-datenschutz',
    templateUrl: './datenschutz.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class DatenschutzComponent {
  protected readonly contact = legalContact;

  constructor(title: Title) {
    title.setTitle('Datenschutzerklärung – Finanz Uhu');
  }
}
