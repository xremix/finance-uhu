import { SettingsComponentComponent } from './settings-component.component';
import { mapBaseCategoryToCategory } from '../models/category';
import { DataState } from '../services/data-state';
import { ImportService } from '../services/import-services/import-service';
import { UiFeedbackService } from '../services/ui-feedback.service';

describe('Settings dialog actions', () => {
  let state: DataState;
  let importer: jasmine.SpyObj<ImportService>;
  let feedback: jasmine.SpyObj<UiFeedbackService>;
  let component: SettingsComponentComponent;

  const category = () => mapBaseCategoryToCategory({
    name: 'Miete', type: 'expense', icon: 'fa-solid fa-house', keywords: ['Miete'], excludeKeywords: [], subCategories: [],
  });

  beforeEach(() => {
    state = { categories: [category()] } as DataState;
    importer = jasmine.createSpyObj<ImportService>('ImportService', ['categorisAsJson', 'saveCategoriesToIndexedDbAndLinkedFile', 'clearAllLocalData']);
    importer.categorisAsJson.and.callFake(() => JSON.stringify(state.categories));
    feedback = jasmine.createSpyObj<UiFeedbackService>('UiFeedbackService', ['requestText', 'requestIcon', 'requestConfirmation', 'notify']);
    feedback.requestText.and.resolveTo(null);
    feedback.requestIcon.and.resolveTo(null);
    feedback.requestConfirmation.and.resolveTo(false);
    component = new SettingsComponentComponent(state, importer, feedback);
  });

  it('does not change names, icons, keywords or categories when dialogs are cancelled', async () => {
    const original = JSON.stringify(state.categories);
    const selected = state.categories[0];

    await component.renameCategory(selected);
    await component.editIcon(selected);
    await component.addKeyWord(selected.keywords, selected.name);
    await component.addCategory();
    await component.deleteCategory(selected);

    expect(JSON.stringify(state.categories)).toBe(original);
    expect(component.hasUnsavedChanges).toBeFalse();
  });

  it('does not delete local data when its confirmation is cancelled', async () => {
    await component.deleteAllLocalData();

    expect(importer.clearAllLocalData).not.toHaveBeenCalled();
  });

  it('only removes the accepted category and marks the change as unsaved', async () => {
    const selected = state.categories[0];
    const retained = category();
    retained.name = 'Lebensmittel';
    state.categories.push(retained);
    feedback.requestConfirmation.and.resolveTo(true);

    await component.deleteCategory(selected);

    expect(state.categories).toEqual([retained]);
    expect(component.hasUnsavedChanges).toBeTrue();
  });

  it('creates a complete category from a submitted name', async () => {
    feedback.requestText.and.resolveTo('Haustiere');

    await component.addCategory();

    expect(state.categories[1].name).toBe('Haustiere');
    expect(state.categories[1].transactions).toEqual([]);
    expect(state.categories[1].total).toBe(0);
    expect(component.hasUnsavedChanges).toBeTrue();
  });

  it('keeps unsaved edits and shows an error if saving fails', async () => {
    spyOn(console, 'error');
    component.hasUnsavedChanges = true;
    importer.saveCategoriesToIndexedDbAndLinkedFile.and.rejectWith(new Error('Storage full'));

    await component.saveState();

    expect(component.hasUnsavedChanges).toBeTrue();
    expect(component.isSaving).toBeFalse();
    expect(feedback.notify).toHaveBeenCalledWith(jasmine.any(String), 'error');
    expect(feedback.notify).not.toHaveBeenCalledWith(jasmine.any(String), 'success');
  });

  it('distinguishes local success from a failed linked file update', async () => {
    importer.saveCategoriesToIndexedDbAndLinkedFile.and.resolveTo(false);

    await component.saveState();

    expect(component.hasUnsavedChanges).toBeFalse();
    expect(feedback.notify).toHaveBeenCalledWith(jasmine.stringMatching('Im Browser gespeichert'), 'warning');
  });

  it('keeps changes made while an earlier snapshot is being saved marked as unsaved', async () => {
    let finishSaving!: (value: boolean) => void;
    importer.saveCategoriesToIndexedDbAndLinkedFile.and.returnValue(new Promise<boolean>((resolve) => finishSaving = resolve));
    const saving = component.saveState();
    state.categories[0].name = 'Neue Änderung';
    finishSaving(true);
    await saving;

    expect(component.hasUnsavedChanges).toBeTrue();
  });
});
