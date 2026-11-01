import { Injectable } from '@angular/core';
import { CRYPTO_KEYS_STORE, IndexedDbStorageService } from './indexed-db-storage.service';

export interface EncryptedCsvContent {
  encryptionVersion: 1;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer;
}

const CSV_KEY_ID = 'csv-encryption-key';

@Injectable({
  providedIn: 'root',
})
export class CsvEncryptionService {
  private keyPromise?: Promise<CryptoKey>;

  constructor(private storage: IndexedDbStorageService) {}

  clearCachedKey(): void {
    this.keyPromise = undefined;
  }

  async encrypt(content: string): Promise<EncryptedCsvContent> {
    this.ensureCryptoAvailable();
    const key = await this.getOrCreateKey();
    const iv = new Uint8Array(new ArrayBuffer(12));
    crypto.getRandomValues(iv);
    const plaintext = new TextEncoder().encode(content);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

    return { encryptionVersion: 1, iv, ciphertext };
  }

  async decrypt(encrypted: EncryptedCsvContent): Promise<string> {
    this.ensureCryptoAvailable();
    const key = await this.getExistingKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: encrypted.iv },
      key,
      encrypted.ciphertext
    );
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  }

  private ensureCryptoAvailable(): void {
    if (!globalThis.crypto?.subtle) {
      throw new Error('Web Crypto is unavailable. Open the app in a secure browser context.');
    }
  }

  private async getExistingKey(): Promise<CryptoKey> {
    return this.getKey(false);
  }

  private async getOrCreateKey(): Promise<CryptoKey> {
    return this.getKey(true);
  }

  private async getKey(createIfMissing: boolean): Promise<CryptoKey> {
    if (this.keyPromise) return this.keyPromise;

    const pending = this.loadOrCreateKey(createIfMissing);
    this.keyPromise = pending;
    try {
      return await pending;
    } finally {
      if (this.keyPromise === pending) this.keyPromise = undefined;
    }
  }

  private async loadOrCreateKey(createIfMissing: boolean): Promise<CryptoKey> {
    const stored = await this.storage.get<CryptoKey>(CRYPTO_KEYS_STORE, CSV_KEY_ID);
    if (stored) {
      if (
        stored.algorithm.name !== 'AES-GCM' ||
        stored.extractable ||
        !stored.usages.includes('encrypt') ||
        !stored.usages.includes('decrypt')
      ) {
        throw new Error('The stored CSV encryption key is invalid or exportable.');
      }
      return stored;
    }

    if (!createIfMissing) {
      throw new Error('The CSV encryption key is missing. Stored files cannot be decrypted.');
    }
    const generated = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    const key = generated as CryptoKey;
    await this.storage.put(CRYPTO_KEYS_STORE, CSV_KEY_ID, key);
    return key;
  }
}
