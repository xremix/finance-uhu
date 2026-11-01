import { describe, expect, it } from "vitest";
import { Transaction } from '../models/transaction';
import { AmountSortPipe } from './amount-sort.pipe';

describe('AmountSortPipe', () => {
    it('keeps shared transaction totals stable when displaying a sorted list', () => {
        const transactions = [0.1, 0.2, 0.3].map((amount) => ({ amount } as Transaction));
        const totalBefore = transactions.reduce((total, transaction) => total + transaction.amount, 0);

        const displayed = new AmountSortPipe().transform(transactions);

        expect(displayed.map((transaction) => transaction.amount)).toEqual([0.3, 0.2, 0.1]);
        expect(transactions.reduce((total, transaction) => total + transaction.amount, 0)).toBe(totalBefore);
    });
});
