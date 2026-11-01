import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { legalContact } from '../legal-contact';

@Component({
    selector: 'app-impressum',
    templateUrl: './impressum.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ImpressumComponent {
  protected readonly contact = legalContact;

  constructor(title: Title) {
    title.setTitle('Impressum – Finanz Uhu');
  }
}
