import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { DataState } from '../services/data-state';
import { ImportService } from '../services/import-services/import-service';
import { defaultCategories } from '../default-categories';
import { BaseCategory, Category, mapBaseCategoryToCategory } from '../models/category';

@Component({
  selector: 'app-settings-component',
  templateUrl: './settings-component.component.html',
  styleUrl: './settings-component.component.scss',
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
  private initialCategoriesSnapshot: string = '';
  
  constructor(protected dataState: DataState, private importService: ImportService) {}

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
  public async save() {
    const linkedFileSynced = await this.importService.saveCategoriesToLocalStorageAndLinkedFile(this.importService.categorisAsJson());
    // Aktualisiere den Snapshot nach dem Speichern
    this.initialCategoriesSnapshot = this.importService.categorisAsJson();
    this.hasUnsavedChanges = false;

    if (!linkedFileSynced) {
      alert('Browser-Speicher wurde gespeichert, die verknüpfte Datei konnte aber nicht aktualisiert werden.');
    }
  }
  public async saveState() {
    const linkedFileSynced = await this.importService.saveCategoriesToLocalStorageAndLinkedFile(this.importService.categorisAsJson());
    // Aktualisiere den Snapshot nach dem Speichern
    this.initialCategoriesSnapshot = this.importService.categorisAsJson();
    this.hasUnsavedChanges = false;

    if (linkedFileSynced) {
      alert('Saved');
    } else {
      alert('Im Browser gespeichert, aber die verknüpfte Datei konnte nicht aktualisiert werden.');
    }
  }

  public async saveDatabaseInFile(): Promise<void> {
    if (!this.supportsFileSync) {
      alert('Die Browser-API für direkten Dateizugriff wird hier nicht unterstützt.');
      return;
    }

    const saved = await this.importService.saveCategoriesToFile(this.importService.categorisAsJson());
    if (!saved) {
      alert('Speichern in Datei wurde abgebrochen oder ist fehlgeschlagen.');
      return;
    }

    this.initialCategoriesSnapshot = this.importService.categorisAsJson();
    this.hasUnsavedChanges = false;
    await this.refreshLinkedFileInfo();
    alert('Einstellungen wurden in Datei und Browser-Speicher gespeichert.');
  }

  public async loadSettingsFromFile(): Promise<void> {
    if (!this.supportsFileSync) {
      alert('Die Browser-API für direkten Dateizugriff wird hier nicht unterstützt.');
      return;
    }

    const loaded = await this.importService.loadCategoriesFromUserSelectedFile();
    if (!loaded) {
      alert('Laden aus Datei wurde abgebrochen oder ist fehlgeschlagen.');
      return;
    }

    const loadedJson = this.importService.categorisAsJson();
    this.importService.saveCategoriesToLocalStorage(loadedJson);
    this.json = loadedJson;
    this.initialCategoriesSnapshot = loadedJson;
    this.hasUnsavedChanges = false;
    await this.refreshLinkedFileInfo();
    alert('Einstellungen wurden aus Datei geladen und Browser-Speicher überschrieben.');
  }

  public async reloadSettingsFromLinkedFile(): Promise<void> {
    if (!this.supportsFileSync) {
      alert('Die Browser-API für direkten Dateizugriff wird hier nicht unterstützt.');
      return;
    }

    const loaded = await this.importService.loadCategoriesFromLinkedFile();
    if (!loaded) {
      alert('Die verknüpfte Einstellungsdatei konnte nicht geladen werden. Bitte Datei erneut auswählen.');
      return;
    }

    const loadedJson = this.importService.categorisAsJson();
    this.json = loadedJson;
    this.initialCategoriesSnapshot = loadedJson;
    this.hasUnsavedChanges = false;
    await this.refreshLinkedFileInfo();
    alert('Einstellungen wurden aus der verknüpften Datei neu geladen.');
  }

  private async refreshLinkedFileInfo(): Promise<void> {
    this.linkedSettingsFileName = await this.importService.getLinkedCategoriesFileName();
  }

  public addKeyWord(data: string[]) {
    const keyword = prompt('Add new category', 'Category');
    if (keyword) {
      data.push(keyword);
      this.markAsChanged();
    }
  }
  public removeKeyWord(data: string[], keyword: string) {
    const index = data.indexOf(keyword);
    if (index > -1) {
      data.splice(index, 1);
      this.markAsChanged();
    }
  }

  public addCategory(category?: any[]) {
    const name = prompt('Add new category', '');
    var elementToAdd = category ? category : this.dataState.categories;
      if (name) {
        elementToAdd.push({
          name: name,
          type: 'expense',
          keywords: [],
          excludeKeywords: [],
          subCategories: [],
          isDefault: false,
          icon: '',
        });
        this.markAsChanged();
      }
  }

  public deleteCategory(category: Category) {
    const confirmDelete = confirm(`Are you sure you want to delete the category "${category.name}"?`);
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
    const confirmed = confirm(
      'Möchtest du wirklich alle lokal gespeicherten Daten löschen? Dazu gehören importierte Umsatzdateien, eigene Kategorien, lokale Einstellungen und die gespeicherte Dateiverknüpfung. Die verknüpfte Einstellungsdatei selbst wird nicht gelöscht.'
    );
    if (!confirmed) return;

    try {
      await this.importService.clearAllLocalData();
      this.hasUnsavedChanges = false;
      window.location.reload();
    } catch (error) {
      console.error('Could not clear all local app data:', error);
      alert('Die lokalen Daten konnten nicht vollständig gelöscht werden. Bitte versuche es erneut.');
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

  public editIcon(category: Category){
    const icon = prompt('Edit icon', category.icon);
    category.icon = icon ?? '';
    this.markAsChanged();
  }

  public renameCategory(category: Category) {
    const newName = prompt('Kategorie umbenennen', category.name);
    if (newName && newName.trim() !== '') {
      category.name = newName.trim();
      this.markAsChanged();
    }
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
    const lastSaved = localStorage.getItem('categoriesLastSaved');
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
