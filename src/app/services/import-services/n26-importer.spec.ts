import { beforeEach, describe, expect, it } from "vitest";
import { N26Importer } from './n26-importer';
import { SpkImporter } from './spk-importer';
import { IngImporter } from './ing-importer';

// Synthetic data modelled on the public N26 export layouts.
const currentExport = [
    'Booking Date,Value Date,Partner Name,Partner Iban,Type,Payment Reference,Account Name,Amount (EUR),Original Amount,Original Currency,Exchange Rate',
    ',,,,,,,,,,',
    ',,,,,,,,,,',
    '2026-01-02,2026-01-01,Coffee Corner,,Presentment,,Main Account,-2.68,20,DKK,0.134',
    '2026-01-05,2026-01-05,Example Employer GmbH,DE00123456780000000000,Credit Transfer,"Gehalt Januar, 2026",Main Account,2500.00,,,',
    '2026-01-07,2026-01-07,"Shop ""Mitte""",,Debit Transfer,Rechnung 42,Main Account,-1234.56,,,',
    '',
].join('\r\n');

const legacyGermanExport = [
    '\uFEFF"Datum","Empfänger","Kontonummer","Transaktionstyp","Verwendungszweck","Kategorie","Betrag (EUR)","Betrag (Fremdwährung)","Fremdwährung","Wechselkurs"',
    '"2020-03-15","Supermarkt","","MasterCard Zahlung","","Lebensmittel","-12.5","","",""',
].join('\n');

const legacyEnglishExport = [
    '"Date","Payee","Account number","Transaction type","Payment reference","Amount (EUR)","Amount (Foreign Currency)","Type Foreign Currency","Exchange Rate"',
    '"2019-07-01","Landlord","DE00999","Outgoing Transfer","Miete Juli","-800.0","","",""',
].join('\n');

describe('N26Importer', () => {
    let importer: N26Importer;

    beforeEach(() => {
        importer = new N26Importer();
    });

    it('recognizes current and legacy N26 headers', () => {
        expect(importer.canParseCSV(currentExport)).toBe(true);
        expect(importer.canParseCSV(legacyGermanExport)).toBe(true);
        expect(importer.canParseCSV(legacyEnglishExport)).toBe(true);
    });

    it('does not claim Sparkasse or ING exports', () => {
        const spk = '"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Beguenstigter/Zahlungspflichtiger";"Betrag";"Waehrung"';
        const ing = 'Umsatzanzeige;Datei erstellt am: 01.01.2026\nBuchung;Valuta;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Betrag;Währung';
        expect(importer.canParseCSV(spk)).toBe(false);
        expect(importer.canParseCSV(ing)).toBe(false);
    });

    it('is not claimed by the other importers', () => {
        expect(new SpkImporter().canParseCSV(currentExport)).toBe(false);
        expect(new IngImporter().canParseCSV(currentExport)).toBe(false);
    });

    it('skips empty rows and parses the current layout', () => {
        const transactions = importer.parseCsvToTransactions(currentExport);
        expect(transactions.length).toBe(3);

        const [coffee, salary, shop] = transactions;
        expect(coffee.bookingDate).toEqual(new Date(2026, 0, 2));
        expect(coffee.valueDate).toEqual(new Date(2026, 0, 1));
        expect(coffee.month).toEqual(new Date(2026, 0, 1));
        expect(coffee.payerReceiver).toBe('Coffee Corner');
        expect(coffee.bookingText).toBe('Presentment');
        expect(coffee.amount).toBe(-2.68);
        expect(coffee.amountCurrency).toBe('EUR');
        expect(coffee.purpose).toBe('(20 DKK)');

        expect(salary.amount).toBe(2500);
        expect(salary.purpose).toBe('Gehalt Januar, 2026');
        expect(salary.raw).toContain('Example Employer GmbH');

        expect(shop.payerReceiver).toBe('Shop "Mitte"');
        expect(shop.amount).toBe(-1234.56);
    });

    it('parses legacy layouts without value date', () => {
        const [german] = importer.parseCsvToTransactions(legacyGermanExport);
        expect(german.payerReceiver).toBe('Supermarkt');
        expect(german.bookingText).toBe('MasterCard Zahlung');
        expect(german.amount).toBe(-12.5);
        expect(german.valueDate).toEqual(german.bookingDate);

        const [english] = importer.parseCsvToTransactions(legacyEnglishExport);
        expect(english.payerReceiver).toBe('Landlord');
        expect(english.purpose).toBe('Miete Juli');
        expect(english.amount).toBe(-800);
    });

    it('finds the header after metadata lines', () => {
        const csv = [
            'N26 Kontoauszug',
            'IBAN,DE00100110012345678900',
            'Zeitraum,2026-01-01 - 2026-01-31',
            '',
            currentExport,
        ].join('\n');

        expect(importer.canParseCSV(csv)).toBe(true);
        const transactions = importer.parseCsvToTransactions(csv);
        expect(transactions.length).toBe(3);
        expect(transactions[0].payerReceiver).toBe('Coffee Corner');
    });

    it('ignores a header beyond the search window', () => {
        const preamble = Array.from({ length: 25 }, (_, i) => `Info ${i}`);
        const csv = [...preamble, currentExport].join('\n');

        expect(importer.canParseCSV(csv)).toBe(false);
        expect(importer.parseCsvToTransactions(csv)).toEqual([]);
    });

    it('skips rows with invalid dates or amounts', () => {
        const csv = [
            'Booking Date,Value Date,Partner Name,Partner Iban,Type,Payment Reference,Account Name,Amount (EUR),Original Amount,Original Currency,Exchange Rate',
            'not-a-date,,Broken,,Presentment,,Main Account,-1.00,,,',
            '2026-02-01,2026-02-01,Broken amount,,Presentment,,Main Account,abc,,,',
            '2026-02-02,2026-02-02,Valid,,Presentment,,Main Account,-3.00,,,',
        ].join('\n');

        const transactions = importer.parseCsvToTransactions(csv);
        expect(transactions.map((t) => t.payerReceiver)).toEqual(['Valid']);
    });
});
