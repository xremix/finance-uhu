import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { UiFeedbackService, UiNotice } from '../services/ui-feedback.service';

@Component({
  selector: 'app-ui-notifications',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ui-notifications.component.html',
  styleUrl: './ui-notifications.component.scss',
})
export class UiNotificationsComponent {
  readonly icons = {
    success: 'fa-solid fa-circle-check',
    info: 'fa-solid fa-circle-info',
    warning: 'fa-solid fa-triangle-exclamation',
    error: 'fa-solid fa-circle-exclamation',
  };

  constructor(protected feedback: UiFeedbackService) {}

  trackNotice(_index: number, notice: UiNotice): number {
    return notice.id;
  }
}
