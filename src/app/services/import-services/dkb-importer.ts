import { Injectable } from '@angular/core';
import { Transaction } from '../../models/transaction';
import { BalanceAnchor } from '../../models/balance';
import { Importer } from './importer';

/**
 * DKB CSV export of the current web banking (Girokonto / Tagesgeld, since 2023).
 *
 * Semicolon separated, all fields quoted, German dates (dd.MM.yy) and amounts ("-1.234,56 €").
 * The header is preceded by metadata lines:
 *   "Girokonto";"DE12345678901234567890"
 *   ""
 *   "Kontostand vom 30.12.2024:";"3.600,00 €"
 *   ""
 *   "Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";
 *   "Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)";"Gläubiger-ID";"Mandatsreferenz";"Kundenreferenz"
 *
 * Quoted fields may contain line breaks, so records are split quote-aware.
 */
@Injectable({
  providedIn: 'root',
})
export class DkbImporter implements Importer {
  private readonly maxHeaderSearchLines = 20;

  public canParseCSV(csvData: string): boolean {
    return !!this.findHeader(this.getRecords(csvData));
  }

  public parseCsvToTransactions(csvData: string): Transaction[] {
    const records = this.getRecords(csvData);
    const header = this.findHeader(records);
    if (!header) {
      console.error('DKB header not found in the first lines');
      return [];
    }

    const transactions: Transaction[] = [];
    for (const record of records.slice(header.recordIndex + 1)) {
      if (record.columns.every((column) => column === '')) {
        continue;
      }

      const transaction = this.parseRecord(record, header.columnMap);
      if (transaction) {
        transactions.push(transaction);
      }
    }
    return transactions;
  }

  /** Reads the "Kontostand vom 30.12.2024:";"3.600,00 €" metadata line */
  public parseBalance(csvData: string): BalanceAnchor | undefined {
    const records = this.getRecords(csvData);
    const header = this.findHeader(records);
    const metadata = records.slice(0, header ? header.recordIndex : this.maxHeaderSearchLines);

    for (const { columns } of metadata) {
      const match = (columns[0] ?? '').match(/^kontostand vom\s+(\d{1,2}\.\d{1,2}\.\d{2,4})/i);
      if (!match) {
        continue;
      }

      const date = this.parseDate(match[1]);
      const amount = this.parseAmount(columns[1] ?? '');
      if (this.isValidDate(date) && !Number.isNaN(amount)) {
        return { date, amount, source: 'file' };
      }
    }
    return undefined;
  }

  private getRecords(csvData: string): DkbRecord[] {
    return this.splitRecords(csvData.replace(/^\uFEFF/, ''));
  }

  private findHeader(records: DkbRecord[]): { recordIndex: number; columnMap: DkbColumnMap } | undefined {
    const searchLimit = Math.min(records.length, this.maxHeaderSearchLines);
    for (let recordIndex = 0; recordIndex < searchLimit; recordIndex++) {
      const columnMap = this.mapHeader(records[recordIndex].columns);
      if (columnMap) {
        return { recordIndex, columnMap };
      }
    }
    return undefined;
  }

  /**
   * Header umlauts may be mangled by encoding, so columns are matched by prefix.
   */
  private mapHeader(columns: string[]): DkbColumnMap | undefined {
    const headers = columns.map((column) => column.trim().toLowerCase());
    const find = (prefix: string) => headers.findIndex((header) => header.startsWith(prefix));

    const map: DkbColumnMap = {
      bookingDate: find('buchungsdatum'),
      valueDate: find('wertstellung'),
      status: find('status'),
      payer: find('zahlungspflichtige'),
      payee: find('zahlungsempf'),
      purpose: find('verwendungszweck'),
      transactionType: find('umsatztyp'),
      amount: find('betrag'),
    };

    if (map.bookingDate === -1 || map.amount === -1 || (map.payer === -1 && map.payee === -1)) {
      return undefined;
    }
    return map;
  }

  /** Splits semicolon separated records, respecting quotes, escaped quotes ("") and line breaks in quotes */
  private splitRecords(text: string): DkbRecord[] {
    const records: DkbRecord[] = [];
    let columns: string[] = [];
    let current = '';
    let inQuotes = false;
    let recordStart = 0;
    let lineNumber = 1;
    let recordStartLine = 1;

    const endRecord = (end: number) => {
      columns.push(current.trim());
      records.push({ columns, raw: text.slice(recordStart, end), lineNumber: recordStartLine });
      columns = [];
      current = '';
    };

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"' && text[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
          if (char === '\n' || (char === '\r' && text[i + 1] !== '\n')) {
            lineNumber++;
          }
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ';') {
        columns.push(current.trim());
        current = '';
      } else if (char === '\n' || char === '\r') {
        endRecord(i);
        if (char === '\r' && text[i + 1] === '\n') {
          i++;
        }
        lineNumber++;
        recordStart = i + 1;
        recordStartLine = lineNumber;
      } else {
        current += char;
      }
    }

    if (recordStart < text.length) {
      endRecord(text.length);
    }
    return records;
  }

  private parseRecord(record: DkbRecord, map: DkbColumnMap): Transaction | undefined {
    const { columns } = record;
    const col = (index: number) => (index >= 0 ? columns[index] ?? '' : '');

    // Pending bookings may still change and show up again once booked.
    if (col(map.status).toLowerCase().startsWith('vorgemerkt')) {
      return undefined;
    }

    const bookingDate = this.parseDate(col(map.bookingDate));
    const valueDate = this.parseDate(col(map.valueDate));
    const hasValidBookingDate = this.isValidDate(bookingDate);
    const hasValidValueDate = this.isValidDate(valueDate);

    if (!hasValidBookingDate && !hasValidValueDate) {
      console.warn(`DKB row ${record.lineNumber}: invalid dates`);
      return undefined;
    }

    const safeBookingDate = hasValidBookingDate ? bookingDate : valueDate;
    const safeValueDate = hasValidValueDate ? valueDate : safeBookingDate;

    const amount = this.parseAmount(col(map.amount));
    if (Number.isNaN(amount)) {
      console.warn(`DKB row ${record.lineNumber}: invalid amount`);
      return undefined;
    }

    const monthAndYear = new Date(safeBookingDate);
    monthAndYear.setDate(1);

    const transactionType = col(map.transactionType);

    return {
      month: monthAndYear,
      bookingDate: safeBookingDate,
      valueDate: safeValueDate,
      payerReceiver: this.getCounterparty(transactionType, amount, col(map.payer), col(map.payee)),
      bookingText: transactionType,
      purpose: col(map.purpose).replace(/\s+/g, ' '),
      balance: 0, // Not provided per transaction in DKB exports
      balanceCurrency: 'EUR',
      amount,
      amountCurrency: 'EUR',
      raw: record.raw,
    };
  }

  /** For incoming money the counterparty is the payer, for outgoing money the payee */
  private getCounterparty(transactionType: string, amount: number, payer: string, payee: string): string {
    const type = transactionType.toLowerCase();
    const isIncoming = type === 'eingang' || (type !== 'ausgang' && amount > 0);
    return (isIncoming ? payer : payee) || payer || payee;
  }

  /** Parses German dates (dd.MM.yy or dd.MM.yyyy) as local dates */
  private parseDate(dateString: string): Date {
    const match = dateString.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
    if (!match) {
      return new Date(NaN);
    }

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    let year = parseInt(match[3], 10);
    if (year < 100) {
      year += 2000;
    }

    const parsedDate = new Date(year, month - 1, day);
    if (
      parsedDate.getFullYear() !== year ||
      parsedDate.getMonth() !== month - 1 ||
      parsedDate.getDate() !== day
    ) {
      return new Date(NaN);
    }
    return parsedDate;
  }

  private isValidDate(date: Date): boolean {
    return date instanceof Date && !Number.isNaN(date.getTime());
  }

  /** German amounts like "-1.234,56 €", "1.000" or "-10,22"; dots are thousands separators */
  private parseAmount(value: string): number {
    const cleaned = value
      .replace(/[\s€]|EUR/gi, '')
      .replace(/\./g, '')
      .replace(',', '.');
    return /^[-+]?\d*\.?\d+$/.test(cleaned) ? parseFloat(cleaned) : NaN;
  }
}

interface DkbRecord {
  columns: string[];
  raw: string;
  lineNumber: number;
}

interface DkbColumnMap {
  bookingDate: number;
  valueDate: number;
  status: number;
  payer: number;
  payee: number;
  purpose: number;
  transactionType: number;
  amount: number;
}
