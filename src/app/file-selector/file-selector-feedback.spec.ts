import { FileSelectorComponent } from './file-selector.component';
import { DataState } from '../services/data-state';
import { ImportService } from '../services/import-services/import-service';
import { UiFeedbackService } from '../services/ui-feedback.service';

describe('File selector feedback', () => {
  let importer: jasmine.SpyObj<ImportService>;
  let feedback: jasmine.SpyObj<UiFeedbackService>;
  let component: FileSelectorComponent;

  beforeEach(() => {
    importer = jasmine.createSpyObj<ImportService>('ImportService', ['clearFiles', 'addOrReplaceFiles']);
    feedback = jasmine.createSpyObj<UiFeedbackService>('UiFeedbackService', ['requestConfirmation', 'notify']);
    component = new FileSelectorComponent(importer, {} as DataState, feedback);
  });

  it('retains imported files when removing all files is cancelled', async () => {
    feedback.requestConfirmation.and.resolveTo(false);

    await component.clearFiles();

    expect(importer.clearFiles).not.toHaveBeenCalled();
  });

  it('clears files only after accepting the app confirmation', async () => {
    feedback.requestConfirmation.and.resolveTo(true);

    await component.clearFiles();

    expect(importer.clearFiles).toHaveBeenCalledTimes(1);
  });

  it('shows a visible error and lets the same file be retried after a failed import', async () => {
    spyOn(console, 'error');
    importer.addOrReplaceFiles.and.rejectWith(new Error('Invalid file'));
    const input = { files: [new File(['invalid'], 'invalid.csv')], value: 'invalid.csv' };

    await component.fileChanged({ target: input } as unknown as Event);

    expect(feedback.notify).toHaveBeenCalledWith(jasmine.any(String), 'error');
    expect(input.value).toBe('');
  });
});
