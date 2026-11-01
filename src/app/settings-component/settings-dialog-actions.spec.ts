import { beforeEach, describe, expect, it, type MockedObject, vi } from "vitest";
import { SettingsComponentComponent } from './settings-component.component';
import { mapBaseCategoryToCategory } from '../models/category';
import { DataState } from '../services/data-state';
import { ImportService } from '../services/import-services/import-service';
import { UiFeedbackService } from '../services/ui-feedback.service';
import { Router } from '@angular/router';

describe('Settings dialog actions', () => {
    let state: DataState;
    let importer: MockedObject<ImportService>;
    let feedback: MockedObject<UiFeedbackService>;
    let router: MockedObject<Router>;
    let component: SettingsComponentComponent;

    const category = () => mapBaseCategoryToCategory({
        name: 'Miete', type: 'expense', icon: 'fa-solid fa-house', keywords: ['Miete'], excludeKeywords: [], subCategories: [],
    });

    beforeEach(() => {
        state = { categories: [category()] } as DataState;
        importer = {
            categorisAsJson: vi.fn().mockName("ImportService.categorisAsJson"),
            saveCategoriesToIndexedDbAndLinkedFile: vi.fn().mockName("ImportService.saveCategoriesToIndexedDbAndLinkedFile"),
            clearAllLocalData: vi.fn().mockName("ImportService.clearAllLocalData")
        } as MockedObject<ImportService>;
        importer.categorisAsJson.mockImplementation(() => JSON.stringify(state.categories));
        feedback = {
            requestText: vi.fn().mockName("UiFeedbackService.requestText"),
            requestIcon: vi.fn().mockName("UiFeedbackService.requestIcon"),
            requestConfirmation: vi.fn().mockName("UiFeedbackService.requestConfirmation"),
            notify: vi.fn().mockName("UiFeedbackService.notify")
        } as MockedObject<UiFeedbackService>;
        feedback.requestText.mockResolvedValue(null);
        feedback.requestIcon.mockResolvedValue(null);
        feedback.requestConfirmation.mockResolvedValue(false);
        router = {
            navigateByUrl: vi.fn().mockName("Router.navigateByUrl")
        } as MockedObject<Router>;
        component = new SettingsComponentComponent(state, importer, feedback, router);
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
        expect(component.hasUnsavedChanges).toBe(false);
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
        feedback.requestConfirmation.mockResolvedValue(true);

        await component.deleteCategory(selected);

        expect(state.categories).toEqual([retained]);
        expect(component.hasUnsavedChanges).toBe(true);
    });

    it('creates a complete category from a submitted name', async () => {
        feedback.requestText.mockResolvedValue('Haustiere');

        await component.addCategory();

        expect(state.categories[1].name).toBe('Haustiere');
        expect(state.categories[1].transactions).toEqual([]);
        expect(state.categories[1].total).toBe(0);
        expect(component.hasUnsavedChanges).toBe(true);
    });

    it('keeps unsaved edits and shows an error if saving fails', async () => {
        vi.spyOn(console, 'error').mockReturnValue(undefined);
        component.hasUnsavedChanges = true;
        importer.saveCategoriesToIndexedDbAndLinkedFile.mockRejectedValue(new Error('Storage full'));

        await component.saveState();

        expect(component.hasUnsavedChanges).toBe(true);
        expect(component.isSaving).toBe(false);
        expect(feedback.notify).toHaveBeenCalledWith(expect.any(String), 'error');
        expect(feedback.notify).not.toHaveBeenCalledWith(expect.any(String), 'success');
    });

    it('distinguishes local success from a failed linked file update', async () => {
        importer.saveCategoriesToIndexedDbAndLinkedFile.mockResolvedValue(false);

        await component.saveState();

        expect(component.hasUnsavedChanges).toBe(false);
        expect(feedback.notify).toHaveBeenCalledWith(expect.stringMatching('Im Browser gespeichert'), 'warning');
    });

    it('keeps changes made while an earlier snapshot is being saved marked as unsaved', async () => {
        let finishSaving!: (value: boolean) => void;
        importer.saveCategoriesToIndexedDbAndLinkedFile.mockReturnValue(new Promise<boolean>((resolve) => finishSaving = resolve));
        const saving = component.saveState();
        state.categories[0].name = 'Neue Änderung';
        finishSaving(true);
        await saving;

        expect(component.hasUnsavedChanges).toBe(true);
    });
});
