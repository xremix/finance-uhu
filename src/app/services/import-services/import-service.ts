import { Injectable } from '@angular/core';
import { Transaction } from '../../models/transaction';
import { DataState } from '../data-state';
import { CategoryService } from '../category-service';
import { IngImporter } from './ing-importer';
import { SpkImporter } from './spk-importer';
import { N26Importer } from './n26-importer';
import { DkbImporter } from './dkb-importer';
import { Importer } from './importer';
import { defaultCategories } from 'src/app/default-categories';
import { BaseCategory, mapBaseCategoryToCategory, mapCategoryToBaseCategory } from 'src/app/models/category';
import { BalanceAnchor } from 'src/app/models/balance';
import { BalanceService } from '../balance-service';
@Injectable({
  providedIn: 'root',
})
export class ImportService {
  private importServices: Importer[] = [new SpkImporter(), new IngImporter(), new N26Importer(), new DkbImporter()];
  private readonly minLoadingDurationMs = 2800;
  private readonly categoriesFileDbName = 'FinanceAnalyser';
  private readonly categoriesFileStoreName = 'fileHandles';
  private readonly categoriesFileHandleKey = 'categoriesFileHandle';
  private readonly filesStorageKey = 'files';
  private readonly localStorageKeys = [
    'categories',
    'categoriesLastSaved',
    'files',
    'fileContent',
    'additionalFiles',
    'manualBalance',
    'searchTerm',
    'showAverage',
  ];

  private typeStoredFile(fileName: string, content: string) {
    return {
      fileName,
      content,
      uploadedAt: new Date().toISOString(),
    };
  }

  public async getFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const fileReader = new FileReader();
      fileReader.onload = () => {
        resolve(fileReader.result as string);
      };
      fileReader.onerror = (error) => {
        reject(error);
      };
      fileReader.readAsText(file);
    });
  }

  public parseCsvToTransactions(csvData: string): Transaction[] {
    const transactions: Transaction[] = [];
    for (const importService of this.importServices) {
      if (importService.canParseCSV(csvData)) {
        return importService.parseCsvToTransactions(csvData);
      }
    }

    return transactions;
  }

  public parseBalance(csvData: string): BalanceAnchor | undefined {
    for (const importService of this.importServices) {
      if (importService.canParseCSV(csvData)) {
        return importService.parseBalance?.(csvData);
      }
    }
    return undefined;
  }

  public loadFilesFromLocalStorage() {
    this.dataState.resetState();

    const storedFiles = this.getFilesFromLocalStorage();
    if (storedFiles.length === 0) {
      return;
    }

    const transactions: Transaction[] = [];
    let balanceAnchor: BalanceAnchor | undefined;
    for (const storedFile of storedFiles) {
      try {
        let parsedTransactions = this.parseCsvToTransactions(storedFile.content);
        this.categoryService.fillCategoriesToTransactions(parsedTransactions);
        parsedTransactions.forEach((transaction) => {
          transaction.source = storedFile.fileName;
        });
        transactions.push(...parsedTransactions);

        // With multiple files the most recent balance wins
        const fileAnchor = this.parseBalance(storedFile.content);
        if (fileAnchor && (!balanceAnchor || fileAnchor.date > balanceAnchor.date)) {
          balanceAnchor = { ...fileAnchor, sourceName: storedFile.fileName };
        }
      } catch (error) {
        console.error(`Error loading stored file ${storedFile.fileName}:`, error);
      }
    }

    const uniqueTransactions = this.removeExactDuplicateTransactions(transactions);

    this.dataState.fileBalanceAnchor = balanceAnchor;
    this.dataState.setTransactions(uniqueTransactions);

    if (uniqueTransactions.length > 0) {
      this.dataState.resetFilter(false);
    }
  }

  private removeExactDuplicateTransactions(transactions: Transaction[]): Transaction[] {
    const seen = new Set<string>();
    const uniqueTransactions: Transaction[] = [];

    for (const transaction of transactions) {
      const signatures = this.buildTransactionSignatures(transaction);
      const isKnownDuplicate = signatures.some((signature) => seen.has(signature));

      if (isKnownDuplicate) {
        console.log('Duplicate transaction found and removed');
        continue;
      }

      signatures.forEach((signature) => seen.add(signature));
      uniqueTransactions.push(transaction);
    }

    return uniqueTransactions;
  }

  private buildTransactionSignatures(transaction: Transaction): string[] {
    const date = this.resolveComparableDate(transaction);
    const amount = this.normalizeNumber(transaction.amount);
    const currency = this.normalizeField(transaction.amountCurrency);
    const payerReceiver = this.normalizeField(transaction.payerReceiver);
    const bookingText = this.normalizeField(transaction.bookingText);
    const purpose = this.normalizeField(transaction.purpose);

    const strictSignature = [
      date,
      payerReceiver,
      bookingText,
      purpose,
      amount,
      currency,
    ].join('|');

    const relaxedSignature = [
      date,
      purpose,
      amount,
      currency,
    ].join('|');

    return [
      strictSignature,
      relaxedSignature,
    ];
  }

  private resolveComparableDate(transaction: Transaction): string {
    const bookingDate = this.formatDate(transaction.bookingDate);
    if (bookingDate) {
      return bookingDate;
    }

    return this.formatDate(transaction.valueDate);
  }

  private formatDate(date: Date): string {
    if (!date || Number.isNaN(date.getTime())) {
      return '';
    }

    return date.toISOString().slice(0, 10);
  }

  private normalizeField(value: string): string {
    return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private normalizeNumber(value: number): string {
    return value.toFixed(2);
  }

  public async addOrReplaceFile(file: File): Promise<void> {
    await this.addOrReplaceFiles([file]);
  }

  public async addOrReplaceFiles(files: File[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    const message = files.length === 1 ? `${files[0].name} wird geladen…` : `${files.length} Dateien werden geladen…`;
    await this.runWithLoading(message, async () => {
      for (const file of files) {
        const fileContent = await this.getFileContent(file);
        this.upsertStoredFile(file.name, fileContent);
      }
      this.balanceService.clearManualBalance();
      this.loadFilesFromLocalStorage();
    });
  }

  public async removeFile(fileName: string): Promise<void> {
    await this.runWithLoading('Daten werden aktualisiert…', async () => {
      const files = this.getFilesFromLocalStorage().filter((file) => file.fileName !== fileName);
      localStorage.setItem(this.filesStorageKey, JSON.stringify(files));
      this.balanceService.clearManualBalance();
      this.loadFilesFromLocalStorage();
    });
  }

  // Parsing is synchronous, so yield one frame to let the loading indicator paint first.
  // The loader stays visible long enough for the owl intro animation to finish.
  private async runWithLoading(message: string, work: () => Promise<void>): Promise<void> {
    this.dataState.loadingMessage = message;
    this.dataState.isLoading = true;
    const startedAt = performance.now();
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
      await work();
      const remaining = this.minLoadingDurationMs - (performance.now() - startedAt);
      if (remaining > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, remaining));
      }
    } finally {
      this.dataState.isLoading = false;
      this.dataState.loadingMessage = '';
    }
  }

  public clearFiles(): void {
    localStorage.removeItem(this.filesStorageKey);
    this.balanceService.clearManualBalance();
    this.dataState.resetState();
  }

  public async clearAllLocalData(): Promise<void> {
    await this.deleteCategoriesFileDatabase();

    for (const key of this.localStorageKeys) {
      localStorage.removeItem(key);
    }

    this.balanceService.clearManualBalance();
    this.dataState.resetState();
    this.dataState.categories = defaultCategories.map(mapBaseCategoryToCategory);
    this.dataState.currentFilter.from = new Date(0);
    this.dataState.currentFilter.to = new Date();
    this.dataState.currentFilter.category = undefined;
    this.dataState.currentFilter.type = 'all';
    this.dataState.currentFilter.searchTerm = '';
    this.dataState.showAverage = false;

    // The showAverage setter persists a value; remove it again with the rest
    // so the next visit starts with a clean local state.
    for (const key of this.localStorageKeys) {
      localStorage.removeItem(key);
    }
  }

  private upsertStoredFile(fileName: string, fileContent: string): void {
    const files = this.getFilesFromLocalStorage();
    const fileData = this.typeStoredFile(fileName, fileContent);

    const existingIndex = files.findIndex((f) => f.fileName === fileName);
    if (existingIndex >= 0) {
      files[existingIndex] = fileData;
    } else {
      files.push(fileData);
    }

    localStorage.setItem(this.filesStorageKey, JSON.stringify(files));
  }

  public getFilesFromLocalStorage(): Array<{ fileName: string; content: string; uploadedAt: string }> {
    const stored = localStorage.getItem(this.filesStorageKey);
    return stored ? JSON.parse(stored) : [];
  }

  constructor(private categoryService: CategoryService, private dataState: DataState, private balanceService: BalanceService) {}


  public async loadFromLocalStorage(){
    const load = async () => {
      const loadedFromFile = await this.loadCategoriesFromLinkedFile();
      if (!loadedFromFile) {
        this.loadCategoriesFromLocalStorage();
      }
      this.migrateLegacyFilesToUnifiedFiles();
      this.loadFilesFromLocalStorage();
    };

    const hasStoredFiles = this.getFilesFromLocalStorage().length > 0 || !!localStorage.getItem('fileContent');
    if (hasStoredFiles) {
      await this.runWithLoading('Gespeicherte Daten werden geladen…', load);
    } else {
      await load();
    }
  }

  private migrateLegacyFilesToUnifiedFiles(): void {
    const existingFiles = this.getFilesFromLocalStorage();
    if (existingFiles.length > 0) {
      return;
    }

    const migratedFiles: Array<{ fileName: string; content: string; uploadedAt: string }> = [];

    const legacyMainFileContent = localStorage.getItem('fileContent');
    if (legacyMainFileContent) {
      migratedFiles.push(this.typeStoredFile('Hauptdatei', legacyMainFileContent));
    }

    const legacyAdditionalFiles = localStorage.getItem('additionalFiles');
    if (legacyAdditionalFiles) {
      try {
        const parsedLegacyFiles: Array<{ fileName: string; content: string; uploadedAt?: string }> = JSON.parse(legacyAdditionalFiles);
        parsedLegacyFiles.forEach((legacyFile) => {
          migratedFiles.push({
            fileName: legacyFile.fileName,
            content: legacyFile.content,
            uploadedAt: legacyFile.uploadedAt ?? new Date().toISOString(),
          });
        });
      } catch (error) {
        console.error('Could not migrate legacy additional files:', error);
      }
    }

    if (migratedFiles.length > 0) {
      localStorage.setItem(this.filesStorageKey, JSON.stringify(migratedFiles));
    }

    localStorage.removeItem('fileContent');
    localStorage.removeItem('additionalFiles');
  }

  private loadCategoriesFromLocalStorage() {
    let baseCategories: BaseCategory[] = localStorage.getItem('categories') ? JSON.parse(localStorage.getItem('categories')!) : defaultCategories;
    this.dataState.categories = baseCategories.map((c) => mapBaseCategoryToCategory(c));
  }

  public saveCategoriesToLocalStorage(json: string) {
    
    localStorage.setItem('categories', json);
    localStorage.setItem('categoriesLastSaved', new Date().toISOString());
  }

  public supportsCategoriesFileSync(): boolean {
    const fileWindow = window as any;
    return !!fileWindow.showOpenFilePicker && !!fileWindow.showSaveFilePicker;
  }

  public async hasLinkedCategoriesFile(): Promise<boolean> {
    const handle = await this.getStoredCategoriesFileHandle();
    return !!handle;
  }

  public async getLinkedCategoriesFileName(): Promise<string | null> {
    const handle = await this.getStoredCategoriesFileHandle();
    return handle?.name ?? null;
  }

  public async loadCategoriesFromUserSelectedFile(): Promise<boolean> {
    if (!this.supportsCategoriesFileSync()) {
      return false;
    }

    const fileWindow = window as any;
    const handles = await fileWindow.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: 'JSON settings file',
          accept: {
            'application/json': ['.json'],
          },
        },
      ],
    });

    const handle = handles?.[0];
    if (!handle) {
      return false;
    }

    const loaded = await this.loadCategoriesFromFileHandle(handle, true);
    if (loaded) {
      await this.storeCategoriesFileHandle(handle);
    }

    return loaded;
  }

  public async saveCategoriesToFile(json: string): Promise<boolean> {
    if (!this.supportsCategoriesFileSync()) {
      return false;
    }

    let handle = await this.getStoredCategoriesFileHandle();
    if (!handle) {
      handle = await this.selectCategoriesFileForSaving();
      if (!handle) {
        return false;
      }
      await this.storeCategoriesFileHandle(handle);
    }

    const writeSuccessful = await this.writeCategoriesToFileHandle(handle, json, true);
    if (!writeSuccessful) {
      return false;
    }

    this.saveCategoriesToLocalStorage(json);
    return true;
  }

  public async saveCategoriesToLocalStorageAndLinkedFile(json: string): Promise<boolean> {
    this.saveCategoriesToLocalStorage(json);
    const handle = await this.getStoredCategoriesFileHandle();
    if (!handle) {
      return true;
    }

    return this.writeCategoriesToFileHandle(handle, json, true);
  }

  public async loadCategoriesFromLinkedFile(): Promise<boolean> {
    const handle = await this.getStoredCategoriesFileHandle();
    if (!handle) {
      return false;
    }

    const loaded = await this.loadCategoriesFromFileHandle(handle, false);
    if (!loaded) {
      return false;
    }

    const categoriesJson = this.categorisAsJson();
    this.saveCategoriesToLocalStorage(categoriesJson);
    return true;
  }

  private async loadCategoriesFromFileHandle(handle: any, requestPermission: boolean): Promise<boolean> {
    const canRead = await this.ensurePermission(handle, 'read', requestPermission);
    if (!canRead) {
      return false;
    }

    try {
      const file = await handle.getFile();
      const content = await file.text();
      const baseCategories: BaseCategory[] = JSON.parse(content);

      if (!Array.isArray(baseCategories)) {
        throw new Error('The selected file does not contain a valid settings array.');
      }

      this.dataState.categories = baseCategories.map((c) => mapBaseCategoryToCategory(c));
      return true;
    } catch (error) {
      console.error('Error while loading categories from file:', error);
      return false;
    }
  }

  private async writeCategoriesToFileHandle(handle: any, json: string, requestPermission: boolean): Promise<boolean> {
    const canWrite = await this.ensurePermission(handle, 'readwrite', requestPermission);
    if (!canWrite) {
      return false;
    }

    try {
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return true;
    } catch (error) {
      console.error('Error while writing categories to file:', error);
      return false;
    }
  }

  private async selectCategoriesFileForSaving(): Promise<any | null> {
    const fileWindow = window as any;
    if (!fileWindow.showSaveFilePicker) {
      return null;
    }

    return fileWindow.showSaveFilePicker({
      suggestedName: 'finance-uhu-settings.json',
      types: [
        {
          description: 'JSON settings file',
          accept: {
            'application/json': ['.json'],
          },
        },
      ],
    });
  }

  private async ensurePermission(handle: any, mode: 'read' | 'readwrite', requestPermission: boolean): Promise<boolean> {
    const options = { mode } as any;

    if (handle.queryPermission) {
      const permission = await handle.queryPermission(options);
      if (permission === 'granted') {
        return true;
      }
    }

    if (!requestPermission || !handle.requestPermission) {
      return false;
    }

    const requestedPermission = await handle.requestPermission(options);
    return requestedPermission === 'granted';
  }

  private async openCategoriesFileDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.categoriesFileDbName, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.categoriesFileStoreName)) {
          db.createObjectStore(this.categoriesFileStoreName);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async storeCategoriesFileHandle(handle: any): Promise<void> {
    const db = await this.openCategoriesFileDb();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.categoriesFileStoreName, 'readwrite');
      tx.objectStore(this.categoriesFileStoreName).put(handle, this.categoriesFileHandleKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  }

  private async getStoredCategoriesFileHandle(): Promise<any | null> {
    try {
      const db = await this.openCategoriesFileDb();

      const handle = await new Promise<any | null>((resolve, reject) => {
        const tx = db.transaction(this.categoriesFileStoreName, 'readonly');
        const request = tx.objectStore(this.categoriesFileStoreName).get(this.categoriesFileHandleKey);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      });

      db.close();
      return handle;
    } catch (error) {
      console.error('Error while reading stored categories file handle:', error);
      return null;
    }
  }

  private async deleteCategoriesFileDatabase(): Promise<void> {
    if (typeof indexedDB === 'undefined') return;

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.categoriesFileDbName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Could not delete the linked file handle.'));
      request.onblocked = () => reject(new Error('The linked file handle database is still open in another tab.'));
    });
  }

  public categorisAsJson(): string {
    let baseCategories: BaseCategory[] = this.dataState.categories.map((c) => mapCategoryToBaseCategory(c));
    return JSON.stringify(baseCategories, null, 2);
  }
}
