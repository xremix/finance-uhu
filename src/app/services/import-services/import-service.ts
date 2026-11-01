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
import { CsvEncryptionService, EncryptedCsvContent } from '../csv-encryption.service';
import {
  APP_DATA_STORE,
  FILE_HANDLES_STORE,
  IndexedDbStorageService,
  PERSISTED_FILES_STORE,
} from '../indexed-db-storage.service';

export interface UmsatzFile {
  fileName: string;
  content: string;
  uploadedAt: string;
  persisted: boolean;
}

interface PlaintextCsvRecord {
  fileName: string;
  uploadedAt: string;
  content: string;
}

interface EncryptedCsvRecord extends EncryptedCsvContent {
  fileName: string;
  uploadedAt: string;
}

type PersistedCsvRecord = PlaintextCsvRecord | EncryptedCsvRecord;

@Injectable({
  providedIn: 'root',
})
export class ImportService {
  private importServices: Importer[] = [new SpkImporter(), new IngImporter(), new N26Importer(), new DkbImporter()];
  private readonly minLoadingDurationMs = 2800;
  private readonly categoriesFileHandleKey = 'categoriesFileHandle';
  private activeFiles: UmsatzFile[] = [];
  private categoriesLastSaved: string | null = null;
  private readonly legacyLocalStorageKeys = [
    'categories',
    'categoriesLastSaved',
    'files',
    'fileContent',
    'additionalFiles',
    'manualBalance',
    'searchTerm',
    'showAverage',
  ];

  constructor(
    private categoryService: CategoryService,
    private dataState: DataState,
    private balanceService: BalanceService,
    private storage: IndexedDbStorageService,
    private csvEncryption: CsvEncryptionService
  ) {}

  private typeStoredFile(fileName: string, content: string): Omit<UmsatzFile, 'persisted'> {
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

  public loadActiveFiles() {
    this.dataState.resetState();

    const storedFiles = this.getActiveFiles();
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

  public async addOrReplaceFile(file: File, persistLocally = false): Promise<void> {
    await this.addOrReplaceFiles([file], persistLocally);
  }

  public async addOrReplaceFiles(files: File[], persistLocally = false): Promise<void> {
    if (files.length === 0) {
      return;
    }

    const message = files.length === 1 ? `${files[0].name} wird geladen…` : `${files.length} Dateien werden geladen…`;
    await this.runWithLoading(message, async () => {
      const nextFiles = [...this.getActiveFiles()];
      let shouldWritePersistedFiles = persistLocally;
      for (const file of files) {
        const fileContent = await this.getFileContent(file);
        const existingIndex = nextFiles.findIndex((storedFile) => storedFile.fileName === file.name);
        const existingFile = existingIndex >= 0 ? nextFiles[existingIndex] : undefined;
        shouldWritePersistedFiles ||= existingFile?.persisted === true;
        const fileData = {
          ...this.typeStoredFile(file.name, fileContent),
          persisted: persistLocally || existingFile?.persisted === true,
        };

        if (existingIndex >= 0) {
          nextFiles[existingIndex] = fileData;
        } else {
          nextFiles.push(fileData);
        }
      }
      if (shouldWritePersistedFiles) {
        await this.writePersistedFiles(nextFiles);
      }
      this.activeFiles = nextFiles;
      await this.balanceService.clearManualBalance();
      this.loadActiveFiles();
    });
  }

  public async setFilePersisted(fileName: string, persisted: boolean): Promise<void> {
    const currentFiles = this.getActiveFiles();
    const file = currentFiles.find((item) => item.fileName === fileName);
    if (!file || file.persisted === persisted) return;

    const nextFiles = currentFiles.map((item) =>
      item.fileName === fileName ? { ...item, persisted } : item
    );
    await this.writePersistedFiles(nextFiles);
    this.activeFiles = nextFiles;
  }

  public async removeFile(fileName: string): Promise<void> {
    await this.runWithLoading('Daten werden aktualisiert…', async () => {
      const files = this.getActiveFiles().filter((file) => file.fileName !== fileName);
      await this.writePersistedFiles(files);
      this.activeFiles = files;
      await this.balanceService.clearManualBalance();
      this.loadActiveFiles();
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

  public async clearFiles(): Promise<void> {
    await this.writePersistedFiles([]);
    this.activeFiles = [];
    await this.balanceService.clearManualBalance();
    this.dataState.resetState();
  }

  public async clearAllLocalData(): Promise<void> {
    await this.balanceService.clearManualBalance();
    await this.storage.deleteDatabase();
    this.csvEncryption.clearCachedKey();
    this.clearLegacyLocalStorage();

    this.activeFiles = [];
    this.categoriesLastSaved = null;
    this.dataState.resetState();
    this.dataState.categories = defaultCategories.map(mapBaseCategoryToCategory);
    this.dataState.resetViewState();
  }

  public getActiveFiles(): UmsatzFile[] {
    return this.activeFiles;
  }

  private async writePersistedFiles(files: UmsatzFile[]): Promise<void> {
    const persistedFiles = files.filter((file) => file.persisted);
    const encryptedEntries = await Promise.all(persistedFiles.map(async (file) => ({
      key: file.fileName,
      value: {
        fileName: file.fileName,
        uploadedAt: file.uploadedAt,
        ...await this.csvEncryption.encrypt(file.content),
      } satisfies EncryptedCsvRecord,
    })));
    await this.storage.replaceAll(
      PERSISTED_FILES_STORE,
      encryptedEntries
    );
  }

  public async loadFromIndexedDb(): Promise<void> {
    this.activeFiles = await this.loadPersistedFiles();
    this.categoriesLastSaved = await this.storage.get<string>(APP_DATA_STORE, 'categoriesLastSaved') ?? null;
    await this.balanceService.loadManualBalanceFromIndexedDb();

    const load = async () => {
      const loadedFromFile = await this.loadCategoriesFromLinkedFile();
      if (!loadedFromFile) {
        await this.loadCategoriesFromIndexedDb();
      }
      this.loadActiveFiles();
    };

    if (this.activeFiles.length > 0) {
      await this.runWithLoading('Gespeicherte Daten werden geladen…', load);
    } else {
      await load();
    }
    this.clearLegacyLocalStorage();
  }

  private async loadPersistedFiles(): Promise<UmsatzFile[]> {
    const records = await this.storage.getAll<PersistedCsvRecord>(PERSISTED_FILES_STORE);
    const files: UmsatzFile[] = [];
    let hasPlaintextRecords = false;

    for (const record of records) {
      let content: string;
      if ('content' in record) {
        content = record.content;
        hasPlaintextRecords = true;
      } else if (record.encryptionVersion === 1) {
        content = await this.csvEncryption.decrypt(record);
      } else {
        throw new Error(`Unsupported encrypted CSV format for ${record.fileName}.`);
      }
      files.push({
        fileName: record.fileName,
        uploadedAt: record.uploadedAt,
        content,
        persisted: true,
      });
    }

    if (hasPlaintextRecords) {
      await this.writePersistedFiles(files);
    }

    return files;
  }

  private clearLegacyLocalStorage(): void {
    try {
      for (const key of this.legacyLocalStorageKeys) {
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn('Could not clear legacy browser storage:', error);
    }
  }

  private async loadCategoriesFromIndexedDb(): Promise<void> {
    const stored = await this.storage.get<string>(APP_DATA_STORE, 'categories');
    const baseCategories: BaseCategory[] = stored ? JSON.parse(stored) : defaultCategories;
    this.dataState.categories = baseCategories.map((category) => mapBaseCategoryToCategory(category));
  }

  public async saveCategoriesToIndexedDb(json: string): Promise<void> {
    const lastSaved = new Date().toISOString();
    await this.storage.putMany(APP_DATA_STORE, [
      { key: 'categories', value: json },
      { key: 'categoriesLastSaved', value: lastSaved },
    ]);
    this.categoriesLastSaved = lastSaved;
  }

  public getCategoriesLastSaved(): string | null {
    return this.categoriesLastSaved;
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

    await this.saveCategoriesToIndexedDb(json);
    return true;
  }

  public async saveCategoriesToIndexedDbAndLinkedFile(json: string): Promise<boolean> {
    await this.saveCategoriesToIndexedDb(json);
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
    await this.saveCategoriesToIndexedDb(categoriesJson);
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

  private async storeCategoriesFileHandle(handle: any): Promise<void> {
    await this.storage.put(FILE_HANDLES_STORE, this.categoriesFileHandleKey, handle);
  }

  private async getStoredCategoriesFileHandle(): Promise<any | null> {
    try {
      return await this.storage.get(FILE_HANDLES_STORE, this.categoriesFileHandleKey) ?? null;
    } catch (error) {
      console.error('Error while reading stored categories file handle:', error);
      return null;
    }
  }

  public categorisAsJson(): string {
    let baseCategories: BaseCategory[] = this.dataState.categories.map((c) => mapCategoryToBaseCategory(c));
    return JSON.stringify(baseCategories, null, 2);
  }
}
