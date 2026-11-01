import { Injectable } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { UiDialogComponent, UiDialogOptions } from '../ui-dialog/ui-dialog.component';

export type NoticeKind = 'success' | 'info' | 'warning' | 'error';

export interface UiNotice {
  id: number;
  message: string;
  kind: NoticeKind;
}

@Injectable({ providedIn: 'root' })
export class UiFeedbackService {
  notices: UiNotice[] = [];
  private nextId = 0;
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(private modalService: NgbModal) {}

  notify(message: string, kind: NoticeKind = 'info'): void {
    const id = ++this.nextId;
    this.notices = [...this.notices, { id, message, kind }];
    if (kind === 'success' || kind === 'info') {
      this.timers.set(id, setTimeout(() => this.dismissNotice(id), 6000));
    }
  }

  dismissNotice(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.notices = this.notices.filter((notice) => notice.id !== id);
  }

  async requestText(options: Omit<UiDialogOptions, 'kind' | 'acceptLabel'> & { initialValue?: string; acceptLabel?: string }): Promise<string | null> {
    const result = await this.open({ ...options, kind: 'text', acceptLabel: options.acceptLabel ?? 'Speichern' }, options.initialValue);
    return typeof result === 'string' ? result : null;
  }

  async requestIcon(initialValue: string): Promise<string | null> {
    const result = await this.open({ kind: 'icon', title: 'Kategorie-Icon ändern', acceptLabel: 'Übernehmen' }, initialValue);
    return typeof result === 'string' ? result : null;
  }

  async requestConfirmation(options: Omit<UiDialogOptions, 'kind'>): Promise<boolean> {
    return await this.open({ ...options, kind: 'confirmation' }) === true;
  }

  async showDetails(title: string, message: string, items: string[] = []): Promise<void> {
    await this.open({ kind: 'details', title, message, items, acceptLabel: 'Verstanden' });
  }

  private async open(options: UiDialogOptions, initialValue = ''): Promise<string | boolean | null> {
    const id = `app-dialog-${++this.nextId}`;
    const ref = this.modalService.open(UiDialogComponent, {
      centered: true,
      scrollable: true,
      backdrop: 'static',
      ariaLabelledBy: id,
      ariaDescribedBy: options.message ? `${id}-message` : undefined,
    });
    const component = ref.componentInstance as UiDialogComponent;
    component.options = options;
    component.titleId = id;
    component.messageId = `${id}-message`;
    component.value = initialValue;
    try {
      return await ref.result;
    } catch {
      return null;
    }
  }
}
