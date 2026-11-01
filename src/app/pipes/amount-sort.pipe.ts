import { Pipe, PipeTransform } from '@angular/core';
import { Transaction } from '../models/transaction';

@Pipe({
  name: 'amountSort',
})
export class AmountSortPipe implements PipeTransform {
  transform(transactions: Transaction[]): Transaction[] {
    if (!transactions || transactions.length === 0) {
      return transactions;
    }

    return [...transactions].sort((a, b) => {
      const amountA = a.amount;
      const amountB = b.amount;

      // Beide positiv: höhere Beträge zuerst (absteigend)
      if (amountA > 0 && amountB > 0) {
        return amountB - amountA;
      }

      // Beide negativ: negativste Beträge zuerst (aufsteigend, da negativ)
      if (amountA < 0 && amountB < 0) {
        return amountA - amountB;
      }

      // Ein positiv, ein negativ: positive Werte kommen immer zuerst
      if (amountA > 0 && amountB < 0) {
        return -1;
      }
      if (amountA < 0 && amountB > 0) {
        return 1;
      }

      // Null-Werte (sollten normalerweise nicht vorkommen)
      return 0;
    });
  }
}
