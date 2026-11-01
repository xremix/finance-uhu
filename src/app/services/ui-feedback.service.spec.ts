import { beforeEach, describe, expect, it, type MockedObject, vi } from "vitest";
import { fakeAsync, tick } from '@angular/core/testing';
import { NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { UiFeedbackService } from './ui-feedback.service';

describe('UiFeedbackService', () => {
    let modal: MockedObject<NgbModal>;
    let feedback: UiFeedbackService;

    beforeEach(() => {
        modal = {
            open: vi.fn().mockName("NgbModal.open")
        } as MockedObject<NgbModal>;
        feedback = new UiFeedbackService(modal);
    });

    function resultFromDialog(result: () => Promise<unknown>): void {
        modal.open.mockImplementation(() => ({ componentInstance: {}, result: result() } as NgbModalRef));
    }

    it('treats Escape or closing a confirmation as cancellation', async () => {
        resultFromDialog(() => Promise.reject('escape'));

        expect(await feedback.requestConfirmation({ title: 'Dateien entfernen?', acceptLabel: 'Entfernen' })).toBe(false);
    });

    it('requires explicit acceptance before a destructive action', async () => {
        resultFromDialog(() => Promise.resolve(true));

        expect(await feedback.requestConfirmation({ title: 'Dateien entfernen?', acceptLabel: 'Entfernen', destructive: true })).toBe(true);
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
