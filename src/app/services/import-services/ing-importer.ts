import { Injectable } from '@angular/core';
import { Transaction } from '../../models/transaction';
import { Importer } from './importer';
import { BalanceAnchor } from '../../models/balance';


@Injectable({
  providedIn: 'root',
})
export class IngImporter implements Importer {
  private ignoreKeywords: string[] = ['UEBERTRAG ('];

    public canParseCSV(csvData: string): boolean {
        return csvData.replace(/^\uFEFF/, '').toLowerCase().startsWith(`Umsatzanzeige;Datei`.toLowerCase());
    }

  private parseDate(dateString: string): Date {
    if (!dateString || dateString.trim() === '') {
      return new Date(NaN);
    }

    const dateParts = dateString.trim().split('.');
    if (dateParts.length !== 3) {
      return new Date(NaN);
    }

    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10);
    let year = parseInt(dateParts[2], 10);

    if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) {
      return new Date(NaN);
    }

    // Support two-digit years in exports.
    if (year < 100) {
      year += year < 30 ? 2000 : 1900;
    }

    if (day < 1 || day > 31 || month < 1 || month > 12) {
      return new Date(NaN);
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

  private parseAmount(value: string | undefined): number {
    if (!value) {
      return NaN;
    }
    return parseFloat(value.trim().replace(/\./g, '').replace(',', '.'));
  }

  /**
   * Maps column names to indices. ING changed its export over time
   * (e.g. "Valuta" -> "Wertstellungsdatum", added "Referenz"), so columns are resolved by header name.
   * Header umlauts may be mangled by encoding, so matching uses prefixes.
   */
  private mapHeader(columns: string[]): IngColumnMap | undefined {
    const headers = columns.map((c) => c.trim().toLowerCase());
    const find = (...prefixes: string[]) => headers.findIndex((h) => prefixes.some((p) => h.startsWith(p)));

    const bookingDate = headers.indexOf('buchung');
    const amount = find('betrag');
    if (bookingDate === -1 || amount === -1) {
      return undefined;
    }

    const balance = find('saldo');
    return {
      bookingDate,
      valueDate: find('valuta', 'wertstellung'),
      payerReceiver: find('auftraggeber'),
      bookingText: find('buchungstext'),
      purpose: find('verwendungszweck'),
      balance,
      balanceCurrency: balance === -1 ? -1 : balance + 1,
      amount,
      amountCurrency: amount + 1,
    };
  }

  private parseLine(columns: string[], map: IngColumnMap, rowNumber: number): Transaction | undefined {
    const col = (index: number) => (index >= 0 ? columns[index] ?? '' : '');
    const bookingDate = this.parseDate(col(map.bookingDate));
    const valueDate = this.parseDate(col(map.valueDate));
    const hasValidBookingDate = this.isValidDate(bookingDate);
    const hasValidValueDate = this.isValidDate(valueDate);

    if (!hasValidBookingDate && !hasValidValueDate) {
      console.warn(`ING row ${rowNumber}: invalid dates`);
      return undefined;
    }

    const safeBookingDate = hasValidBookingDate ? bookingDate : valueDate;
    const safeValueDate = hasValidValueDate ? valueDate : safeBookingDate;

    let monthAndYear = new Date(safeBookingDate);
    monthAndYear.setDate(1);

    const transaction: Transaction = {
      month: monthAndYear, // Monat
      bookingDate: safeBookingDate, // Buchung
      valueDate: safeValueDate, // Valuta
      payerReceiver: col(map.payerReceiver), // auftraggeberEmpfaenger
      bookingText: col(map.bookingText), // buchungstext
      purpose: col(map.purpose), // verwendungszweck
      balance: this.parseAmount(col(map.balance)), // saldo
      balanceCurrency: col(map.balanceCurrency), // saldoWaehrung
      amount: this.parseAmount(col(map.amount)), // betrag
      amountCurrency: col(map.amountCurrency), // betragWaehrung
      raw: columns.join(';'),
    };

    if (Number.isNaN(transaction.amount)) {
      console.warn(`ING row ${rowNumber}: invalid amount`);
      return undefined;
    }

    return transaction;
  }

  /**
   * Reads the "Saldo;1.234,56;EUR" metadata line. The balance includes all booked
   * transactions, so it is anchored to the end of the export period ("Zeitraum"),
   * falling back to the file creation date.
   */
  public parseBalance(csvData: string): BalanceAnchor | undefined {
    const lines = csvData.replace(/^\uFEFF/, '').split(/\r?\n/);
    let amount = NaN;
    let periodEnd = new Date(NaN);
    let createdAt = new Date(NaN);

    for (const line of lines) {
      const columns = line.split(';').map((column) => column.replace(/"/g, '').trim());
      const key = columns[0]?.toLowerCase();
      if (key === 'buchung') break; // column header reached, metadata ends

      if (key === 'saldo') {
        amount = this.parseAmount(columns[1]);
      } else if (key === 'zeitraum') {
        const parts = (columns[1] ?? '').split('-');
        periodEnd = this.parseDate(parts[parts.length - 1]);
      } else if (key?.startsWith('umsatzanzeige')) {
        const match = line.match(/(\d{1,2}\.\d{1,2}\.\d{2,4})/);
        if (match) createdAt = this.parseDate(match[1]);
      }
    }

    const date = this.isValidDate(periodEnd) ? periodEnd : createdAt;
    if (Number.isNaN(amount) || !this.isValidDate(date)) {
      return undefined;
    }
    return { date, amount, source: 'file' };
  }

  public parseCsvToTransactions(csvData: string): Transaction[] {
    const lines = csvData.replace(/^\uFEFF/, '').split(/\r?\n/);
    const transactions: Transaction[] = [];
    let columnMap: IngColumnMap | undefined;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      if (line.trim() === '') continue;

      const columns = line.split(';').map((column) => column.replace(/"/g, ''));

      if (!columnMap) {
        columnMap = this.mapHeader(columns);
        continue; // Metadaten-Zeilen vor der Kopfzeile überspringen
      }

      if (this.ignoreKeywords.some((keyword) => line.toLowerCase().includes(keyword.toLowerCase()))) {
        continue;
      }

      if (columns.length <= columnMap.amount) continue;

      const transaction = this.parseLine(columns, columnMap, lineIndex + 1);
      if (transaction) {
        transactions.push(transaction);
      }
    }
    return transactions;
  }
}

interface IngColumnMap {
  bookingDate: number;
  valueDate: number;
  payerReceiver: number;
  bookingText: number;
  purpose: number;
  balance: number;
  balanceCurrency: number;
  amount: number;
  amountCurrency: number;
}
