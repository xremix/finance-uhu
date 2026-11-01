import { Component, inject, Input, OnChanges, OnInit, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { NgbCalendar, NgbDateParserFormatter, NgbDate } from '@ng-bootstrap/ng-bootstrap';
import { DataState } from '../services/data-state';

// Custom formatter for "Oct 25" format
class CustomDateFormatter extends NgbDateParserFormatter {
  readonly DELIMITER = ' ';

  parse(value: string): NgbDate | null {
    if (value) {
      // Handle format like "Oct 25, 25" or "Oct 25"
      const parts = value.split(',');
      const monthDay = parts[0].trim().split(this.DELIMITER);
      
      if (monthDay.length === 2) {
        const monthMap: { [key: string]: number } = {
          'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'Jun': 6,
          'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
        };
        const month = monthMap[monthDay[0]];
        const day = parseInt(monthDay[1], 10);
        
        let year = new Date().getFullYear();
        if (parts.length === 2) {
          const yearShort = parseInt(parts[1].trim(), 10);
          // Convert 2-digit year to 4-digit year
          year = yearShort < 50 ? 2000 + yearShort : 1900 + yearShort;
        }
        
        if (month && day) {
          return new NgbDate(year, month, day);
        }
      }
    }
    return null;
  }

  format(date: NgbDate | null): string {
    if (date) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const yearShort = date.year.toString().slice(-2);
      return `${monthNames[date.month - 1]} ${yearShort}`;
    }
    return '';
  }
}

@Component({
    selector: 'app-date-range-picker',
    templateUrl: './date-range-picker.component.html',
    styleUrl: './date-range-picker.component.scss',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class DateRangePickerComponent implements OnInit, OnChanges {
	calendar = inject(NgbCalendar);
	formatter = new CustomDateFormatter();

	hoveredDate: NgbDate | null = null;
	fromDate: NgbDate | null = this.calendar.getToday();
	toDate: NgbDate | null = this.calendar.getNext(this.calendar.getToday(), 'd', 10);

  @Input() public from: Date = new Date();
  @Input() public to: Date = new Date();

  constructor(private dataState: DataState) {}

  ngOnInit(): void {
    this.fromDate = this.dateToNgbDate(this.from);
    this.toDate = this.dateToNgbDate(this.to);
  }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes["from"]) {
      const date = this.dateToNgbDate(this.from);
      if(!this.fromDate || !this.fromDate.equals(date)){
        this.fromDate = date;
      }
    }
    if (changes["to"]) {
      const date = this.dateToNgbDate(this.to);
      if(!this.toDate || !this.toDate.equals(date)){
        this.toDate = date;
      }
    }
  
  }

	onDateSelection(date: NgbDate) {
    if (!this.fromDate && !this.toDate) {
      this.fromDate = date;
		} else if (this.fromDate && !this.toDate && date && date.after(this.fromDate)) {
      this.toDate = date;
      this.dataState.filterByRange(this.ngbDateToDate(this.fromDate),  this.ngbDateToDate(this.toDate));
		} else {
			this.toDate = null;
			this.fromDate = date;
		}
	}

  private ngbDateToDate(date: NgbDate): Date {
    return new Date(date.year, date.month - 1, date.day);
  }

  private dateToNgbDate(date: Date): NgbDate {
    return new NgbDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }
	isHovered(date: NgbDate) {
		return (
			this.fromDate && !this.toDate && this.hoveredDate && date.after(this.fromDate) && date.before(this.hoveredDate)
		);
	}

	isInside(date: NgbDate) {
		return this.toDate && date.after(this.fromDate) && date.before(this.toDate);
	}

	isRange(date: NgbDate) {
		return (
			date.equals(this.fromDate) ||
			(this.toDate && date.equals(this.toDate)) ||
			this.isInside(date) ||
			this.isHovered(date)
		);
	}

	validateInput(currentValue: NgbDate | null, input: string): NgbDate | null {
		const parsed = this.formatter.parse(input);
		return parsed && this.calendar.isValid(NgbDate.from(parsed)) ? NgbDate.from(parsed) : currentValue;
	}
}
