import { Injectable } from '@angular/core';

export const FINANCE_ANALYSER_DB_NAME = 'FinanceAnalyser';
export const FILE_HANDLES_STORE = 'fileHandles';
export const APP_DATA_STORE = 'appData';
export const PERSISTED_FILES_STORE = 'files';

@Injectable({
  providedIn: 'root',
})
export class IndexedDbStorageService {
  private databasePromise?: Promise<IDBDatabase>;

  private openDatabase(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;

    this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(FINANCE_ANALYSER_DB_NAME, 2);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(FILE_HANDLES_STORE)) {
          database.createObjectStore(FILE_HANDLES_STORE);
        }
        if (!database.objectStoreNames.contains(APP_DATA_STORE)) {
          database.createObjectStore(APP_DATA_STORE);
        }
        if (!database.objectStoreNames.contains(PERSISTED_FILES_STORE)) {
          database.createObjectStore(PERSISTED_FILES_STORE);
        }
      };

      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          this.databasePromise = undefined;
        };
        resolve(database);
      };

      request.onerror = () => {
        this.databasePromise = undefined;
        reject(request.error ?? new Error('Could not open browser storage.'));
      };

      request.onblocked = () => {
        this.databasePromise = undefined;
        reject(new Error('Browser storage is blocked by another open tab.'));
      };
    });

    return this.databasePromise;
  }

  async get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    const database = await this.openDatabase();
    return new Promise<T | undefined>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error ?? transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Could not read browser storage.'));
    });
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    const database = await this.openDatabase();
    return new Promise<T[]>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(request.error ?? transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Could not read browser storage.'));
    });
  }

  async put<T>(storeName: string, key: IDBValidKey, value: T): Promise<void> {
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not write browser storage.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Could not write browser storage.'));
    });
  }

  async putMany<T>(storeName: string, entries: Array<{ key: IDBValidKey; value: T }>): Promise<void> {
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      for (const entry of entries) {
        store.put(entry.value, entry.key);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not write browser storage.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Could not write browser storage.'));
    });
  }

  async delete(storeName: string, key: IDBValidKey): Promise<void> {
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      transaction.objectStore(storeName).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not update browser storage.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Could not update browser storage.'));
    });
  }

  async replaceAll<T>(storeName: string, entries: Array<{ key: IDBValidKey; value: T }>): Promise<void> {
    const database = await this.openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      store.clear();
      for (const entry of entries) {
        store.put(entry.value, entry.key);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not update browser storage.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Could not update browser storage.'));
    });
  }

  async deleteDatabase(): Promise<void> {
    const database = await this.openDatabase().catch(() => undefined);
    database?.close();
    this.databasePromise = undefined;

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(FINANCE_ANALYSER_DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Could not delete browser storage.'));
      request.onblocked = () => reject(new Error('Browser storage is still open in another tab.'));
    });
  }
}
