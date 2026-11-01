import { Injectable } from '@angular/core';
import { Transaction } from '../../models/transaction';
import { Importer } from './importer';

/**
 * N26 CSV export (comma separated, ISO dates, decimal point).
 *
 * Current layout:
 *   Booking Date,Value Date,Partner Name,Partner Iban,Type,Payment Reference,[Category,]Account Name,
 *   Amount (EUR),Original Amount,Original Currency,Exchange Rate
 *
 * Older layouts (no value date) exist in English, German and French, e.g.
 *   Datum,Empfänger,Kontonummer,Transaktionstyp,Verwendungszweck,[Kategorie,]Betrag (EUR),...
 *
 * Exports may contain metadata lines before the header and empty rows (",,,,,,") after it;
 * both are skipped.
 */
@Injectable({
  providedIn: 'root',
})
export class N26Importer implements Importer {
  private readonly layouts: N26Layout[] = [
    {
      bookingDate: 'booking date',
      valueDate: 'value date',
      payerReceiver: 'partner name',
      bookingText: 'type',
      purpose: 'payment reference',
      amount: 'amount (eur)',
      originalAmount: 'original amount',
      originalCurrency: 'original currency',
    },
    {
      bookingDate: 'date',
      payerReceiver: 'payee',
      bookingText: 'transaction type',
      purpose: 'payment reference',
      amount: 'amount (eur)',
      originalAmount: 'amount (foreign currency)',
      originalCurrency: 'type foreign currency',
    },
    {
      bookingDate: 'datum',
      payerReceiver: 'empfänger',
      bookingText: 'transaktionstyp',
      purpose: 'verwendungszweck',
      amount: 'betrag (eur)',
      originalAmount: 'betrag (fremdwährung)',
      originalCurrency: 'fremdwährung',
    },
    {
      bookingDate: 'date',
      payerReceiver: 'bénéficiaire',
      bookingText: 'type de transaction',
      purpose: 'référence de paiement',
      amount: 'montant (eur)',
      originalAmount: 'montant (devise étrangère)',
      originalCurrency: 'sélectionnez la devise étrangère',
    },
  ];

  /** Some exports put metadata lines before the header, so only the first lines are searched */
  private readonly maxHeaderSearchLines = 20;

  public canParseCSV(csvData: string): boolean {
    return !!this.findHeader(this.getLines(csvData));
  }

  public parseCsvToTransactions(csvData: string): Transaction[] {
    const lines = this.getLines(csvData);
    const header = this.findHeader(lines);
    if (!header) {
      console.error('N26 header not found in the first lines');
      return [];
    }

    const transactions: Transaction[] = [];
    for (let lineIndex = header.lineIndex + 1; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const columns = this.splitCsvLine(line);
      if (columns.every((column) => column.trim() === '')) {
        continue;
      }

      const transaction = this.parseLine(line, columns, header.columnMap, lineIndex + 1);
      if (transaction) {
        transactions.push(transaction);
      }
    }

    return transactions;
  }

  private getLines(csvData: string): string[] {
    return csvData.replace(/^\uFEFF/, '').split(/\r?\n/);
  }

  private findHeader(lines: string[]): { lineIndex: number; columnMap: N26ColumnMap } | undefined {
    const searchLimit = Math.min(lines.length, this.maxHeaderSearchLines);
    for (let lineIndex = 0; lineIndex < searchLimit; lineIndex++) {
      if (lines[lineIndex].trim() === '') {
        continue;
      }
      const columnMap = this.mapHeader(this.splitCsvLine(lines[lineIndex]));
      if (columnMap) {
        return { lineIndex, columnMap };
      }
    }
    return undefined;
  }

  /** Splits a comma separated line, respecting quoted fields and escaped quotes ("") */
  private splitCsvLine(line: string): string[] {
    const columns: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        columns.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    columns.push(current);

    return columns.map((column) => column.trim());
  }

  private mapHeader(columns: string[]): N26ColumnMap | undefined {
    const headers = columns.map((column) => column.trim().toLowerCase());

    for (const layout of this.layouts) {
      const map: N26ColumnMap = {
        bookingDate: headers.indexOf(layout.bookingDate),
        valueDate: layout.valueDate ? headers.indexOf(layout.valueDate) : -1,
        payerReceiver: headers.indexOf(layout.payerReceiver),
        bookingText: headers.indexOf(layout.bookingText),
        purpose: headers.indexOf(layout.purpose),
        amount: headers.indexOf(layout.amount),
        originalAmount: headers.indexOf(layout.originalAmount),
        originalCurrency: headers.indexOf(layout.originalCurrency),
      };

      if (map.bookingDate !== -1 && map.payerReceiver !== -1 && map.amount !== -1) {
        return map;
      }
    }

    return undefined;
  }

  private parseLine(line: string, columns: string[], map: N26ColumnMap, rowNumber: number): Transaction | undefined {
    const col = (index: number) => (index >= 0 ? columns[index] ?? '' : '');

    const bookingDate = this.parseDate(col(map.bookingDate));
    const valueDate = this.parseDate(col(map.valueDate));
    const hasValidBookingDate = this.isValidDate(bookingDate);
    const hasValidValueDate = this.isValidDate(valueDate);

    if (!hasValidBookingDate && !hasValidValueDate) {
      console.warn(`N26 row ${rowNumber}: invalid dates`);
      return undefined;
    }

    const safeBookingDate = hasValidBookingDate ? bookingDate : valueDate;
    const safeValueDate = hasValidValueDate ? valueDate : safeBookingDate;

    const amount = this.parseAmount(col(map.amount));
    if (Number.isNaN(amount)) {
      console.warn(`N26 row ${rowNumber}: invalid amount`);
      return undefined;
    }

    const monthAndYear = new Date(safeBookingDate);
    monthAndYear.setDate(1);

    return {
      month: monthAndYear,
      bookingDate: safeBookingDate,
      valueDate: safeValueDate,
      payerReceiver: col(map.payerReceiver),
      bookingText: col(map.bookingText),
      purpose: this.buildPurpose(col(map.purpose), col(map.originalAmount), col(map.originalCurrency)),
      balance: 0, // Not provided in N26 exports
      balanceCurrency: 'EUR',
      amount,
      amountCurrency: 'EUR',
      raw: line,
    };
  }

  /** Adds the original amount for foreign currency payments, e.g. "(20 DKK)" */
  private buildPurpose(purpose: string, originalAmount: string, originalCurrency: string): string {
    const currency = originalCurrency.trim().toUpperCase();
    if (!originalAmount.trim() || !currency || currency === 'EUR') {
      return purpose;
    }

    const foreign = `(${originalAmount.trim()} ${currency})`;
    return purpose ? `${purpose} ${foreign}` : foreign;
  }

  /** Parses ISO dates (YYYY-MM-DD) as local dates */
  private parseDate(dateString: string): Date {
    const match = dateString.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) {
      return new Date(NaN);
    }

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
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

  /** N26 uses a decimal point ("-2.68"); a decimal comma ("-2,68") is accepted as fallback */
  private parseAmount(value: string): number {
    let cleaned = value.trim().replace(/[\s€]/g, '');
    if (!cleaned) {
      return NaN;
    }

    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }

    return /^[-+]?\d*\.?\d+$/.test(cleaned) ? parseFloat(cleaned) : NaN;
  }
}

interface N26Layout {
  bookingDate: string;
  valueDate?: string;
  payerReceiver: string;
  bookingText: string;
  purpose: string;
  amount: string;
  originalAmount: string;
  originalCurrency: string;
}

interface N26ColumnMap {
  bookingDate: number;
  valueDate: number;
  payerReceiver: number;
  bookingText: number;
  purpose: number;
  amount: number;
  originalAmount: number;
  originalCurrency: number;
}
