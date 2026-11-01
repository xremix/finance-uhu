import { beforeEach, describe, expect, it, type MockedObject, vi } from "vitest";
import { FileSelectorComponent } from './file-selector.component';
import { DataState } from '../services/data-state';
import { ImportService } from '../services/import-services/import-service';
import { UiFeedbackService } from '../services/ui-feedback.service';

describe('File selector feedback', () => {
    let importer: MockedObject<ImportService>;
    let feedback: MockedObject<UiFeedbackService>;
    let component: FileSelectorComponent;

    beforeEach(() => {
        importer = {
            clearFiles: vi.fn().mockName("ImportService.clearFiles"),
            addOrReplaceFiles: vi.fn().mockName("ImportService.addOrReplaceFiles")
        } as MockedObject<ImportService>;
        feedback = {
            requestConfirmation: vi.fn().mockName("UiFeedbackService.requestConfirmation"),
            notify: vi.fn().mockName("UiFeedbackService.notify")
        } as MockedObject<UiFeedbackService>;
        component = new FileSelectorComponent(importer, {} as DataState, feedback);
    });

    it('retains imported files when removing all files is cancelled', async () => {
        feedback.requestConfirmation.mockResolvedValue(false);

        await component.clearFiles();

        expect(importer.clearFiles).not.toHaveBeenCalled();
    });

    it('clears files only after accepting the app confirmation', async () => {
        feedback.requestConfirmation.mockResolvedValue(true);

        await component.clearFiles();

        expect(importer.clearFiles).toHaveBeenCalledTimes(1);
    });

    it('shows a visible error and lets the same file be retried after a failed import', async () => {
        vi.spyOn(console, 'error').mockReturnValue(undefined);
        importer.addOrReplaceFiles.mockRejectedValue(new Error('Invalid file'));
        const input = { files: [new File(['invalid'], 'invalid.csv')], value: 'invalid.csv' };

        await component.fileChanged({ target: input } as unknown as Event);

        expect(feedback.notify).toHaveBeenCalledWith(expect.any(String), 'error');
        expect(input.value).toBe('');
    });
});
