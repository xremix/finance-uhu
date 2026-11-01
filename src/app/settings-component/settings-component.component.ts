import { Component, OnInit, OnDestroy, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { DataState } from '../services/data-state';
import { ImportService } from '../services/import-services/import-service';
import { defaultCategories } from '../default-categories';
import { BaseCategory, Category, mapBaseCategoryToCategory } from '../models/category';
import { UiFeedbackService } from '../services/ui-feedback.service';
import { Router } from '@angular/router';

@Component({
    selector: 'app-settings-component',
    templateUrl: './settings-component.component.html',
    styleUrl: './settings-component.component.scss',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class SettingsComponentComponent implements OnInit, OnDestroy {
    /**
     * Schaltet das lowPrio-Flag für eine Kategorie um
     */
    public toggleLowPrio(category: Category | BaseCategory): void {
      category.lowPrio = !category.lowPrio;
      this.markAsChanged();
    }
  public json: string = '';
  public hasUnsavedChanges: boolean = false;
  public supportsFileSync: boolean = false;
  public linkedSettingsFileName: string | null = null;
  public isSaving = false;
  private initialCategoriesSnapshot: string = '';
  
  constructor(protected dataState: DataState, private importService: ImportService, private feedback: UiFeedbackService, private router: Router) {}

  ngOnInit(): void {
    this.supportsFileSync = this.importService.supportsCategoriesFileSync();
    this.json = this.importService.categorisAsJson();
    this.initialCategoriesSnapshot = this.json;
    this.refreshLinkedFileInfo();
    this.setupChangeDetection();
  }

  ngOnDestroy(): void {
    // Cleanup wenn die Komponente zerstört wird
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnloadHandler(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges) {
      // Standard-Warnung des Browsers anzeigen
      event.preventDefault();
      // Moderne Browser benötigen returnValue gesetzt
      event.returnValue = 'Sie haben ungespeicherte Änderungen. Möchten Sie die Seite wirklich verlassen?';
    }
  }

  private setupChangeDetection(): void {
    // Keine regelmäßige Überprüfung nötig, da wir bei jeder Änderung markieren
    // Die Änderungserkennung erfolgt direkt in den entsprechenden Methoden
  }

  private checkForChanges(): void {
    const currentSnapshot = this.importService.categorisAsJson();
    this.hasUnsavedChanges = currentSnapshot !== this.initialCategoriesSnapshot;
  }

  private markAsChanged(): void {
    this.hasUnsavedChanges = true;
  }

  public getUnsavedChangesStatus(): boolean {
    return this.hasUnsavedChanges;
  }
  public async save(): Promise<void> {
    await this.saveState();
  }

  public async saveState(): Promise<void> {
    if (this.isSaving) return;
    this.isSaving = true;
    try {
      await this.performSettingsAction(async () => {
        const json = this.importService.categorisAsJson();
        const linkedFileSynced = await this.importService.saveCategoriesToIndexedDbAndLinkedFile(json);
        this.markSaved(json);
        this.feedback.notify(
          linkedFileSynced
            ? 'Einstellungen im Browser gespeichert.'
            : 'Im Browser gespeichert. Die verknüpfte Datei konnte nicht aktualisiert werden. Bitte prüfe ihre Zugriffsberechtigung.',
          linkedFileSynced ? 'success' : 'warning'
        );
      }, 'Die Einstellungen konnten nicht gespeichert werden. Bitte versuche es erneut.');
    } finally {
      this.isSaving = false;
    }
  }

  public async saveDatabaseInFile(): Promise<void> {
    if (!this.supportsFileSync) {
      this.feedback.notify('Dein Browser unterstützt das direkte Speichern in eine Datei nicht. Du kannst deine Einstellungen im Browser speichern.', 'warning');
      return;
    }

    await this.performSettingsAction(async () => {
      const json = this.importService.categorisAsJson();
      const saved = await this.importService.saveCategoriesToFile(json);
      if (!saved) {
        this.feedback.notify('Die Einstellungen wurden nicht in einer Datei gespeichert. Bitte prüfe die Dateiauswahl und die Zugriffsberechtigung.', 'warning');
        return;
      }
      this.markSaved(json);
      await this.refreshLinkedFileInfo();
      this.feedback.notify('Einstellungen in der Datei und im Browser gespeichert.', 'success');
    }, 'Die Einstellungen konnten nicht in der Datei gespeichert werden.');
  }

  public async loadSettingsFromFile(): Promise<void> {
    if (!this.supportsFileSync) {
      this.feedback.notify('Dein Browser unterstützt das Laden verknüpfter Einstellungsdateien nicht.', 'warning');
      return;
    }

    await this.performSettingsAction(async () => {
      const loaded = await this.importService.loadCategoriesFromUserSelectedFile();
      if (!loaded) {
        this.feedback.notify('Die Einstellungsdatei konnte nicht geladen werden. Bitte wähle eine gültige Einstellungsdatei und erlaube den Lesezugriff.', 'error');
        return;
      }
      const loadedJson = this.importService.categorisAsJson();
      await this.importService.saveCategoriesToIndexedDb(loadedJson);
      this.json = loadedJson;
      this.markSaved(loadedJson);
      await this.refreshLinkedFileInfo();
      this.feedback.notify('Einstellungen aus der Datei geladen und im Browser gespeichert.', 'success');
    }, 'Die Einstellungsdatei konnte nicht geladen werden.');
  }

  public async reloadSettingsFromLinkedFile(): Promise<void> {
    if (!this.supportsFileSync) {
      this.feedback.notify('Dein Browser unterstützt das Laden verknüpfter Einstellungsdateien nicht.', 'warning');
      return;
    }

    await this.performSettingsAction(async () => {
      const loaded = await this.importService.loadCategoriesFromLinkedFile();
      if (!loaded) {
        this.feedback.notify('Die verknüpfte Einstellungsdatei konnte nicht geladen werden. Bitte wähle sie erneut aus.', 'error');
        return;
      }
      const loadedJson = this.importService.categorisAsJson();
      this.json = loadedJson;
      this.markSaved(loadedJson);
      await this.refreshLinkedFileInfo();
      this.feedback.notify('Einstellungen aus der verknüpften Datei neu geladen.', 'success');
    }, 'Die verknüpfte Einstellungsdatei konnte nicht geladen werden.');
  }

  private markSaved(json: string): void {
    this.initialCategoriesSnapshot = json;
    this.checkForChanges();
  }

  private async performSettingsAction(action: () => Promise<void>, errorMessage: string): Promise<void> {
    try {
      await action();
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') return;
      console.error(errorMessage, error);
      this.feedback.notify(errorMessage, 'error');
    }
  }

  private async refreshLinkedFileInfo(): Promise<void> {
    this.linkedSettingsFileName = await this.importService.getLinkedCategoriesFileName();
  }

  public async addKeyWord(data: string[], categoryName: string, isExclude = false): Promise<void> {
    const value = await this.feedback.requestText({
      title: isExclude ? 'Ausschluss-Keyword hinzufügen' : 'Keyword hinzufügen',
      message: `Kategorie: ${categoryName}`,
      inputLabel: 'Suchbegriff',
      placeholder: 'z. B. ein Händler oder ein Begriff im Verwendungszweck',
      helpText: isExclude ? 'Buchungen mit diesem Begriff werden dieser Kategorie nicht zugeordnet.' : 'Buchungen mit diesem Begriff können dieser Kategorie automatisch zugeordnet werden.',
      acceptLabel: 'Hinzufügen',
    });
    const keyword = value?.trim();
    if (!keyword) return;
    if (data.some((item) => item.toLowerCase() === keyword.toLowerCase())) {
      this.feedback.notify('Dieses Keyword ist bereits vorhanden.');
      return;
    }
    data.push(keyword);
    this.markAsChanged();
  }
  public removeKeyWord(data: string[], keyword: string) {
    const index = data.indexOf(keyword);
    if (index > -1) {
      data.splice(index, 1);
      this.markAsChanged();
    }
  }

  public async addCategory(categories = this.dataState.categories, parentName?: string): Promise<void> {
    const name = await this.feedback.requestText({
      title: parentName ? 'Unterkategorie hinzufügen' : 'Neue Kategorie',
      message: parentName ? `Unterkategorie von „${parentName}“` : undefined,
      inputLabel: 'Name der Kategorie',
      placeholder: 'z. B. Haustiere',
      acceptLabel: 'Kategorie erstellen',
    });
    if (!name) return;
    categories.push(mapBaseCategoryToCategory({
      name,
      type: 'expense',
      keywords: [],
      excludeKeywords: [],
      subCategories: [],
      isDefault: false,
      icon: '',
    }));
    this.markAsChanged();
  }

  public async deleteCategory(category: Category): Promise<void> {
    const confirmDelete = await this.feedback.requestConfirmation({
      title: `„${category.name}“ löschen?`,
      message: 'Die Kategorie und ihre Unterkategorien werden entfernt. Deine Umsatzdateien bleiben erhalten. Speichere anschließend die Einstellungen, um die Änderung zu übernehmen.',
      acceptLabel: 'Kategorie löschen',
      destructive: true,
    });
    if (confirmDelete) {
      // Find the parent array containing this category
      let parentArray = this.dataState.categories;
      let index = parentArray.indexOf(category);

      // If not found in the main categories, search in subcategories
      if (index === -1) {
        for (let mainCategory of this.dataState.categories) {
          index = mainCategory.subCategories.indexOf(category);
          if (index !== -1) {
            parentArray = mainCategory.subCategories;
            break;
          }
        }
      }

      // Remove the category if found
      if (index !== -1) {
        parentArray.splice(index, 1);
        this.markAsChanged();
        console.log(`Deleted category: ${category.name}`);
      } else {
        console.error(`Category not found: ${category.name}`);
      }
    }
  }

  public fillCategoriesWithDefaults() {
    const hasChanges = this.mergeCategoriesWithDefaults(this.dataState.categories, defaultCategories);
    if (hasChanges) {
      this.markAsChanged();
    }
  }

  public async deleteAllLocalData(): Promise<void> {
    const confirmed = await this.feedback.requestConfirmation({
      title: 'Alle lokalen Daten löschen?',
      message: 'Gespeicherte Umsatzdateien und der dazugehörige Verschlüsselungsschlüssel, eigene Kategorien, der manuelle Kontostand und die gespeicherte Dateiverknüpfung werden gelöscht. Die verknüpfte Einstellungsdatei selbst bleibt unverändert. Dieser Schritt kann nicht rückgängig gemacht werden.',
      acceptLabel: 'Alle lokalen Daten löschen',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await this.importService.clearAllLocalData();
      this.hasUnsavedChanges = false;
      await this.router.navigateByUrl('/', { replaceUrl: true });
    } catch (error) {
      console.error('Could not clear all local app data:', error);
      this.feedback.notify('Die lokalen Daten konnten nicht vollständig gelöscht werden. Bitte versuche es erneut.', 'error');
    }
  }

  private mergeCategoriesWithDefaults(currentCategories: Category[], defaultCategoriesToMerge: BaseCategory[]): boolean {
    let hasChanges = false;

    for (const defaultCategory of defaultCategoriesToMerge) {
      const existingCategory = currentCategories.find(
        (cat) => this.normalizeCategoryName(cat.name) === this.normalizeCategoryName(defaultCategory.name)
      );

      if (!existingCategory) {
        currentCategories.push(mapBaseCategoryToCategory(defaultCategory));
        hasChanges = true;
        continue;
      }

      if (this.fillupCategory(existingCategory, defaultCategory)) {
        hasChanges = true;
      }

      if (!existingCategory.icon && defaultCategory.icon) {
        existingCategory.icon = defaultCategory.icon;
        hasChanges = true;
      }

      if (existingCategory.isDefault === undefined && defaultCategory.isDefault !== undefined) {
        existingCategory.isDefault = defaultCategory.isDefault;
        hasChanges = true;
      }

      if (existingCategory.lowPrio === undefined && defaultCategory.lowPrio !== undefined) {
        existingCategory.lowPrio = defaultCategory.lowPrio;
        hasChanges = true;
      }

      if (this.mergeCategoriesWithDefaults(existingCategory.subCategories, defaultCategory.subCategories || [])) {
        hasChanges = true;
      }
    }

    return hasChanges;
  }

  private getFlatDefaultCategories(): BaseCategory[] {
    const flattenDefaultCategories = (categories: BaseCategory[]): BaseCategory[] => {
      return categories.reduce((acc: BaseCategory[], category) => {
        acc.push(category);
        if (category.subCategories && category.subCategories.length > 0) {
          acc.push(...flattenDefaultCategories(category.subCategories));
        }
        return acc;
      }, []);
    };

    return flattenDefaultCategories(defaultCategories);
  }

  private normalizeCategoryName(name: string): string {
    return name
      .toLocaleLowerCase()
      .replace(/[&/]+/g, ' und ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private findDefaultCategoryByName(name: string, defaultCats: BaseCategory[] = this.getFlatDefaultCategories()): BaseCategory | undefined {
    const normalizedName = this.normalizeCategoryName(name);
    return defaultCats.find((def) => this.normalizeCategoryName(def.name) === normalizedName);
  }

  private fillupCategory(category: Category, defaultCategory: BaseCategory): boolean {
    let hasChanges = false;
    for (const keyw of defaultCategory.keywords) {
      if (!category.keywords.map(x => x.toLowerCase()).includes(keyw.toLowerCase())) {
        category.keywords.push(keyw);
        console.log('added keyword', keyw, 'to', category.name);
        hasChanges = true;
      }
    }
    for (const keyw of defaultCategory.excludeKeywords) {
      if (!category.excludeKeywords.map(x => x.toLowerCase()).includes(keyw.toLocaleLowerCase())) {
        category.excludeKeywords.push(keyw);
        console.log('added exclude keyword', keyw, 'to', category.name);
        hasChanges = true;
      }
    }
    return hasChanges;
  }

  public async editIcon(category: Category): Promise<void> {
    const currentIcon = category.icon ?? '';
    const icon = await this.feedback.requestIcon(currentIcon);
    if (icon === null || icon === currentIcon) return;
    category.icon = icon;
    this.markAsChanged();
  }

  public async renameCategory(category: Category): Promise<void> {
    const newName = await this.feedback.requestText({
      title: 'Kategorie umbenennen',
      inputLabel: 'Name der Kategorie',
      initialValue: category.name,
      acceptLabel: 'Umbenennen',
    });
    if (!newName || newName === category.name) return;
    category.name = newName;
    this.markAsChanged();
  }

  public toggleType(category: Category){
    // toggle between 'savings' | 'income' | 'expense';
    if(category.type === 'savings'){
      category.type = 'income';
    } else if(category.type === 'income'){
      category.type = 'expense';
    } else {
      category.type = 'savings';
    }
    this.markAsChanged();
  }

  public getLastSavedDate(): string | null {
    const lastSaved = this.importService.getCategoriesLastSaved();
    if (lastSaved) {
      return new Date(lastSaved).toLocaleString('de-DE');
    }
    return null;
  }

  public getAddedCategoriesCount(): number {
    const flattenCategories = (categories: Category[]): Category[] => {
      return categories.reduce((acc: Category[], category) => {
        acc.push(category);
        if (category.subCategories && category.subCategories.length > 0) {
          acc.push(...flattenCategories(category.subCategories));
        }
        return acc;
      }, []);
    };

    const currentCategories = flattenCategories(this.dataState.categories);
    const defaultCats = this.getFlatDefaultCategories();
    
    // Count categories that are not in defaults (either by name or marked as not default)
    return currentCategories.filter(cat => 
      !this.findDefaultCategoryByName(cat.name, defaultCats) || cat.isDefault === false
    ).length;
  }

  public getAddedKeywordsCount(): { include: number, exclude: number } {
    const flattenCategories = (categories: Category[]): Category[] => {
      return categories.reduce((acc: Category[], category) => {
        acc.push(category);
        if (category.subCategories && category.subCategories.length > 0) {
          acc.push(...flattenCategories(category.subCategories));
        }
        return acc;
      }, []);
    };

    const currentCategories = flattenCategories(this.dataState.categories);
    const defaultCats = this.getFlatDefaultCategories();
    
    let addedIncludeKeywords = 0;
    let addedExcludeKeywords = 0;

    for (const currentCat of currentCategories) {
      const defaultCat = this.findDefaultCategoryByName(currentCat.name, defaultCats);
      if (defaultCat) {
        // Count keywords that are in current but not in default
        addedIncludeKeywords += currentCat.keywords.filter(keyword => 
          !defaultCat.keywords.some(defKeyword => defKeyword.toLowerCase() === keyword.toLowerCase())
        ).length;

        addedExcludeKeywords += currentCat.excludeKeywords.filter(keyword => 
          !defaultCat.excludeKeywords.some(defKeyword => defKeyword.toLowerCase() === keyword.toLowerCase())
        ).length;
      } else {
        // If category doesn't exist in defaults, count all its keywords as added
        addedIncludeKeywords += currentCat.keywords.length;
        addedExcludeKeywords += currentCat.excludeKeywords.length;
      }
    }

    return { include: addedIncludeKeywords, exclude: addedExcludeKeywords };
  }

  public isDefaultKeyword(category: Category, keyword: string, isExclude: boolean = false): boolean {
    const defaultCat = this.findDefaultCategoryByName(category.name);
    
    if (!defaultCat) {
      return false;
    }

    const keywordsToCheck = isExclude ? defaultCat.excludeKeywords : defaultCat.keywords;
    return keywordsToCheck.some(defKeyword => defKeyword.toLowerCase() === keyword.toLowerCase());
  }

  public getKeywordClass(category: Category, keyword: string, isExclude: boolean = false): string {
    const isDefault = this.isDefaultKeyword(category, keyword, isExclude);
    if (isDefault) {
      return 'keyword-chip';
    }
    return isExclude ? 'keyword-chip is-custom-exclude' : 'keyword-chip is-custom';
  }

  public getTypeLabel(type: Category['type']): string {
    switch (type) {
      case 'income':
        return 'Einnahmen';
      case 'savings':
        return 'Sparen';
      default:
        return 'Ausgaben';
    }
  }
}
