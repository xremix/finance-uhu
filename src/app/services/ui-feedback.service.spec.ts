import { fakeAsync, tick } from '@angular/core/testing';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { UiFeedbackService } from './ui-feedback.service';

describe('UiFeedbackService', () => {
  let modal: jasmine.SpyObj<NgbModal>;
  let feedback: UiFeedbackService;

  beforeEach(() => {
    modal = jasmine.createSpyObj<NgbModal>('NgbModal', ['open']);
    feedback = new UiFeedbackService(modal);
  });

  function resultFromDialog(result: () => Promise<unknown>): void {
    modal.open.and.callFake(() => ({ componentInstance: {}, result: result() } as NgbModalRef));
  }

  it('treats Escape or closing a confirmation as cancellation', async () => {
    resultFromDialog(() => Promise.reject('escape'));

    expect(await feedback.requestConfirmation({ title: 'Dateien entfernen?', acceptLabel: 'Entfernen' })).toBeFalse();
  });

  it('requires explicit acceptance before a destructive action', async () => {
    resultFromDialog(() => Promise.resolve(true));

    expect(await feedback.requestConfirmation({ title: 'Dateien entfernen?', acceptLabel: 'Entfernen', destructive: true })).toBeTrue();
  });

  it('keeps an intentionally empty icon separate from a cancelled icon change', async () => {
    resultFromDialog(() => Promise.resolve(''));
    expect(await feedback.requestIcon('fa-solid fa-house')).toBe('');

    resultFromDialog(() => Promise.reject('close'));
    expect(await feedback.requestIcon('fa-solid fa-house')).toBeNull();
  });

  it('returns null when a text entry is cancelled', async () => {
    resultFromDialog(() => Promise.reject('cancel'));

    expect(await feedback.requestText({ title: 'Kategorie umbenennen', inputLabel: 'Name', initialValue: 'Miete' })).toBeNull();
  });

  it('dismisses routine feedback automatically while keeping errors visible', fakeAsync(() => {
    feedback.notify('Gespeichert', 'success');
    feedback.notify('Speichern fehlgeschlagen', 'error');
    tick(6000);

    expect(feedback.notices.map((notice) => notice.message)).toEqual(['Speichern fehlgeschlagen']);
    feedback.dismissNotice(feedback.notices[0].id);
    expect(feedback.notices).toEqual([]);
  }));
});
