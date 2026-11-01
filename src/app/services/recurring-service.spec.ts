import { describe, expect, it } from "vitest";
import { RecurringService } from './recurring-service';
import { Transaction } from '../models/transaction';

function tx(date: string, amount: number, payerReceiver: string, purpose = ''): Transaction {
    const bookingDate = new Date(date);
    return {
        month: bookingDate,
        bookingDate,
        valueDate: bookingDate,
        payerReceiver,
        bookingText: '',
        purpose,
        balance: 0,
        balanceCurrency: 'EUR',
        amount,
        amountCurrency: 'EUR',
        raw: '',
    };
}

function monthly(payee: string, amounts: number[], startMonth = 0, day = 3, purpose = ''): Transaction[] {
    return amounts.map((amount, i) => {
        const date = new Date(2024, startMonth + i, day);
        return tx(date.toISOString(), amount, payee, purpose);
    });
}

describe('RecurringService', () => {
    const service = new RecurringService();

    it('detects a fixed monthly subscription', () => {
        const result = service.detect(monthly('Netflix International B.V.', Array(6).fill(-12.99)));
        expect(result.length).toBe(1);
        expect(result[0].frequency).toBe('monthly');
        expect(result[0].amountType).toBe('fixed');
        expect(result[0].isActive).toBe(true);
        expect(result[0].monthlyAmount).toBeCloseTo(-12.99, 2);
    });

    it('detects variable monthly bills like electricity', () => {
        const result = service.detect(monthly('Stadtwerke Muenchen GmbH', [-71.2, -64.8, -58.1, -49.9, -55.3, -68.4]));
        expect(result.length).toBe(1);
        expect(result[0].amountType).toBe('variable');
    });

    it('reports price changes of fixed subscriptions', () => {
        const result = service.detect(monthly('Spotify AB', [-10.99, -10.99, -10.99, -11.99, -11.99, -11.99]));
        expect(result[0].amountType).toBe('fixed');
        expect(result[0].priceChange?.from).toBeCloseTo(-10.99, 2);
        expect(result[0].priceChange?.to).toBeCloseTo(-11.99, 2);
        expect(result[0].currentAmount).toBeCloseTo(-11.99, 2);
    });

    it('marks series as ended when bookings stop', () => {
        const gym = monthly('FitX Deutschland GmbH', Array(4).fill(-24.99));
        const later = monthly('Other Shop', [-5], 10);
        const result = service.detect([...gym, ...later]);
        const series = result.find((s) => s.name.startsWith('FitX'))!;
        expect(series.isActive).toBe(false);
    });

    it('ignores irregular shopping at the same store', () => {
        const shopping = [
            tx('2024-01-02', -23.1, 'REWE Markt GmbH'),
            tx('2024-01-05', -54.2, 'REWE Markt GmbH'),
            tx('2024-01-13', -8.99, 'REWE Markt GmbH'),
            tx('2024-01-14', -71.0, 'REWE Markt GmbH'),
            tx('2024-02-02', -12.5, 'REWE Markt GmbH'),
            tx('2024-02-20', -33.3, 'REWE Markt GmbH'),
        ];
        expect(service.detect(shopping).length).toBe(0);
    });

    it('ignores merchant numbers and dates in the payee', () => {
        const items = [
            tx('2024-01-15', -9.99, 'Apple Services 4711', ''),
            tx('2024-02-15', -9.99, 'Apple Services 4812', ''),
            tx('2024-03-15', -9.99, 'Apple Services 4913', ''),
        ];
        expect(service.detect(items).length).toBe(1);
    });

    it('separates merchants paid via PayPal', () => {
        const items = [
            ...monthly('PayPal Europe S.a.r.l.', Array(4).fill(-7.99), 0, 5, '1039485 PP.1234.PP Disney Plus, Ihr Einkauf bei Disney Plus'),
            ...monthly('PayPal Europe S.a.r.l.', Array(4).fill(-4.99), 0, 18, '2039485 PP.5678.PP Youtube Premium, Ihr Einkauf bei Youtube'),
        ];
        const result = service.detect(items);
        expect(result.length).toBe(2);
        expect(result.every((s) => s.via?.startsWith('PayPal'))).toBe(true);
    });

    it('splits two contracts with the same counterparty', () => {
        const items = [
            ...monthly('Allianz Versicherungs-AG', Array(5).fill(-12.5), 0, 1),
            ...monthly('Allianz Versicherungs-AG', Array(5).fill(-45.0), 0, 15),
        ];
        const result = service.detect(items);
        expect(result.length).toBe(2);
    });

    it('detects yearly payments with identical amounts', () => {
        const items = [tx('2023-03-01', -89, 'ADAC e.V.'), tx('2024-03-01', -89, 'ADAC e.V.')];
        const result = service.detect(items);
        expect(result.length).toBe(1);
        expect(result[0].frequency).toBe('yearly');
        expect(result[0].monthlyAmount).toBeCloseTo(-89 / 12, 0);
    });

    it('tolerates a single missing month', () => {
        const items = monthly('Telekom Deutschland GmbH', Array(6).fill(-39.95)).filter((_, i) => i !== 3);
        expect(service.detect(items).length).toBe(1);
    });

    it('detects regular income as income', () => {
        const result = service.detect(monthly('Arbeitgeber GmbH', [3100, 3100, 3240, 3100, 3100], 0, 28));
        expect(result[0].kind).toBe('income');
    });
});
