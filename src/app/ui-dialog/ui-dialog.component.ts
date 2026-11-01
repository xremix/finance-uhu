
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

export interface UiDialogOptions {
  kind: 'text' | 'confirmation' | 'details' | 'icon';
  title: string;
  message?: string;
  acceptLabel: string;
  destructive?: boolean;
  inputLabel?: string;
  placeholder?: string;
  helpText?: string;
  items?: string[];
}

@Component({
    selector: 'app-ui-dialog',
    imports: [FormsModule],
    templateUrl: './ui-dialog.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrl: './ui-dialog.component.scss'
})
export class UiDialogComponent {
  options: UiDialogOptions = { kind: 'details', title: '', acceptLabel: 'Verstanden' };
  titleId = '';
  messageId = '';
  value = '';
  submitted = false;

  readonly icons = [
    { value: 'fa-solid fa-house', label: 'Wohnen' },
    { value: 'fa-solid fa-cart-shopping', label: 'Einkaufen' },
    { value: 'fa-solid fa-utensils', label: 'Essen und Trinken' },
    { value: 'fa-solid fa-car', label: 'Auto' },
    { value: 'fa-solid fa-train', label: 'Bahn' },
    { value: 'fa-solid fa-bicycle', label: 'Fahrrad' },
    { value: 'fa-solid fa-bolt', label: 'Energie' },
    { value: 'fa-solid fa-heart-pulse', label: 'Gesundheit' },
    { value: 'fa-solid fa-plane', label: 'Reisen' },
    { value: 'fa-solid fa-gift', label: 'Geschenke' },
    { value: 'fa-solid fa-gamepad', label: 'Freizeit' },
    { value: 'fa-solid fa-graduation-cap', label: 'Bildung' },
    { value: 'fa-solid fa-briefcase', label: 'Beruf' },
    { value: 'fa-solid fa-wallet', label: 'Einkommen' },
    { value: 'fa-solid fa-piggy-bank', label: 'Sparen' },
    { value: 'fa-solid fa-tags', label: 'Sonstiges' },
  ];

  constructor(protected modal: NgbActiveModal) {}

  submit(): void {
    this.submitted = true;
    if (this.options.kind === 'text' && !this.value.trim()) return;
    const isInput = this.options.kind === 'text' || this.options.kind === 'icon';
    this.modal.close(isInput ? this.value.trim() : true);
  }
}
