import { beforeEach, describe, expect, it } from "vitest";
import { DkbImporter } from './dkb-importer';
import { SpkImporter } from './spk-importer';
import { IngImporter } from './ing-importer';
import { N26Importer } from './n26-importer';

// Synthetic data modelled on the public DKB web banking export (since 2023).
const header = '"Buchungsdatum";"Wertstellung";"Status";"Zahlungspflichtige*r";"Zahlungsempfänger*in";"Verwendungszweck";"Umsatztyp";"IBAN";"Betrag (€)";"Gläubiger-ID";"Mandatsreferenz";"Kundenreferenz"';

const girokontoExport = [
    '\uFEFF"Girokonto";"DE12345678901234567890"',
    '""',
    '"Kontostand vom 30.12.2024:";"3.600,00\u00A0€"',
    '""',
    header,
    '"10.12.24";"11.12.24";"Gebucht";"Example Employer GmbH";"Max Mustermann";"Gehalt Dezember";"Eingang";"DE00123456780000000000";"2.500,00\u00A0€";"";"";""',
    '"05.12.24";"05.12.24";"Gebucht";"Max Mustermann";"Supermarkt GmbH";"Einkauf    Filiale 42";"Ausgang";"DE00987654320000000000";"-42,37\u00A0€";"";"";""',
    '"01.12.24";"01.12.24";"Gebucht";"Max Mustermann";"Vermieter";"Miete";"Ausgang";"DE00111111110000000000";"-1.000";"DE98ZZZ09999999999";"MANDAT-1";""',
    '',
].join('\r\n');

describe('DkbImporter', () => {
    let importer: DkbImporter;

    beforeEach(() => {
        importer = new DkbImporter();
    });

    it('recognizes Girokonto and Tagesgeld exports', () => {
        expect(importer.canParseCSV(girokontoExport)).toBe(true);
        expect(importer.canParseCSV(girokontoExport.replace('"Girokonto"', '"Tagesgeld"'))).toBe(true);
    });

    it('does not claim Sparkasse, ING or N26 exports', () => {
        const spk = '"Auftragskonto";"Buchungstag";"Valutadatum";"Buchungstext";"Verwendungszweck";"Beguenstigter/Zahlungspflichtiger";"Betrag";"Waehrung"';
        const ing = 'Umsatzanzeige;Datei erstellt am: 01.01.2026\nBuchung;Valuta;Auftraggeber/Empfänger;Buchungstext;Verwendungszweck;Betrag;Währung';
        const n26 = 'Booking Date,Value Date,Partner Name,Partner Iban,Type,Payment Reference,Account Name,Amount (EUR),Original Amount,Original Currency,Exchange Rate';
        expect(importer.canParseCSV(spk)).toBe(false);
        expect(importer.canParseCSV(ing)).toBe(false);
        expect(importer.canParseCSV(n26)).toBe(false);
    });

    it('is not claimed by the other importers', () => {
        expect(new SpkImporter().canParseCSV(girokontoExport)).toBe(false);
        expect(new IngImporter().canParseCSV(girokontoExport)).toBe(false);
        expect(new N26Importer().canParseCSV(girokontoExport)).toBe(false);
    });

    it('parses transactions after the metadata lines', () => {
        const transactions = importer.parseCsvToTransactions(girokontoExport);
        expect(transactions.length).toBe(3);

        const [salary, groceries, rent] = transactions;
        expect(salary.bookingDate).toEqual(new Date(2024, 11, 10));
        expect(salary.valueDate).toEqual(new Date(2024, 11, 11));
        expect(salary.month).toEqual(new Date(2024, 11, 1));
        expect(salary.payerReceiver).toBe('Example Employer GmbH');
        expect(salary.bookingText).toBe('Eingang');
        expect(salary.amount).toBe(2500);
        expect(salary.amountCurrency).toBe('EUR');

        expect(groceries.payerReceiver).toBe('Supermarkt GmbH');
        expect(groceries.purpose).toBe('Einkauf Filiale 42');
        expect(groceries.amount).toBe(-42.37);
        expect(groceries.raw).toContain('Supermarkt GmbH');

        expect(rent.payerReceiver).toBe('Vermieter');
        expect(rent.amount).toBe(-1000);
    });

    it('reads the balance from the Kontostand line', () => {
        expect(importer.parseBalance(girokontoExport)).toEqual({
            date: new Date(2024, 11, 30),
            amount: 3600,
            source: 'file',
        });
    });

    it('handles line breaks, semicolons and quotes inside fields', () => {
        const csv = [
            header,
            '"15.01.25";"15.01.25";"Gebucht";"DKB AG";"Max Mustermann";"Abrechnung 31.12.2024',
            'Zinsen; Entgelte ""Konto""";"Eingang";"";"0,12 €";"";"";""',
            '"16.01.25";"16.01.25";"Gebucht";"Max Mustermann";"Bäckerei";"Brötchen";"Ausgang";"";"-3,50 €";"";"";""',
        ].join('\n');

        const transactions = importer.parseCsvToTransactions(csv);
        expect(transactions.length).toBe(2);
        expect(transactions[0].payerReceiver).toBe('DKB AG');
        expect(transactions[0].purpose).toBe('Abrechnung 31.12.2024 Zinsen; Entgelte "Konto"');
        expect(transactions[0].amount).toBe(0.12);
        expect(transactions[1].payerReceiver).toBe('Bäckerei');
    });

    it('skips pending, invalid and empty rows', () => {
        const csv = [
            header,
            '"20.01.25";"20.01.25";"Vorgemerkt";"Max Mustermann";"Pending Shop";"";"Ausgang";"";"-9,99 €";"";"";""',
            '"kein Datum";"";"Gebucht";"Max Mustermann";"Broken date";"";"Ausgang";"";"-1,00 €";"";"";""',
            '"21.01.25";"21.01.25";"Gebucht";"Max Mustermann";"Broken amount";"";"Ausgang";"";"abc";"";"";""',
            '""',
            '"22.01.25";"22.01.25";"Gebucht";"Max Mustermann";"Valid";"";"Ausgang";"";"-5,00 €";"";"";""',
        ].join('\n');

        const transactions = importer.parseCsvToTransactions(csv);
        expect(transactions.map((t) => t.payerReceiver)).toEqual(['Valid']);
    });

    it('ignores a header beyond the search window', () => {
        const preamble = Array.from({ length: 25 }, (_, i) => `"Info ${i}";""`);
        const csv = [...preamble, header].join('\n');

        expect(importer.canParseCSV(csv)).toBe(false);
        expect(importer.parseCsvToTransactions(csv)).toEqual([]);
    });
});
