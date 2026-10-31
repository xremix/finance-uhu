import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DailyIncomeExpenseChartComponent } from './daily-income-expense-chart.component';

describe('DailyIncomeExpenseChartComponent', () => {
  let component: DailyIncomeExpenseChartComponent;
  let fixture: ComponentFixture<DailyIncomeExpenseChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DailyIncomeExpenseChartComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DailyIncomeExpenseChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should process daily data correctly', () => {
    const mockTransactions = [
      {
        month: new Date('2023-01-01'),
        bookingDate: new Date('2023-01-01'),
        valueDate: new Date('2023-01-01'),
        payerReceiver: 'Test Income',
        bookingText: 'Test Income',
        purpose: 'Test Income',
        balance: 1000,
        balanceCurrency: 'EUR',
        amount: 100,
        amountCurrency: 'EUR',
        raw: 'raw data',
        category: { 
          name: 'Test Income', 
          type: 'income' as const, 
          keywords: [], 
          excludeKeywords: [], 
          subCategories: [], 
          total: 0, 
          transactions: [] 
        }
      },
      {
        month: new Date('2023-01-01'),
        bookingDate: new Date('2023-01-01'),
        valueDate: new Date('2023-01-01'),
        payerReceiver: 'Test Expense',
        bookingText: 'Test Expense',
        purpose: 'Test Expense',
        balance: 950,
        balanceCurrency: 'EUR',
        amount: -50,
        amountCurrency: 'EUR',
        raw: 'raw data',
        category: { 
          name: 'Test Expense', 
          type: 'expense' as const, 
          keywords: [], 
          excludeKeywords: [], 
          subCategories: [], 
          total: 0, 
          transactions: [] 
        }
      }
    ];
    
    component.transactions = mockTransactions;
    component.ngOnChanges({
      transactions: {
        currentValue: mockTransactions,
        previousValue: [],
        firstChange: false,
        isFirstChange: () => false
      }
    });

    expect(component.series[0].data).toEqual([100]); // Income
    expect(component.series[1].data).toEqual([50]);  // Expenses (absolute value)
  });
});
