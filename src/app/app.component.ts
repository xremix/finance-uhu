import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CategoryService } from './services/category-service';
import { DataState } from './services/data-state';
import { DateService } from './services/date-service';
import { ImportService } from './services/import-services/import-service';
import { Router } from '@angular/router';
import { legalContact } from './legal-contact';
import { UiFeedbackService } from './services/ui-feedback.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AppComponent implements OnInit {
  title = 'Finanz Uhu';
  protected readonly legalContact = legalContact;
    constructor(protected dataState: DataState,
      private importService: ImportService,
      protected categoryService: CategoryService, 
      protected dateService: DateService,
      private router: Router,
      private feedback: UiFeedbackService) {
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.importService.loadFromIndexedDb();
    } catch (error) {
      console.error('Could not load stored browser data:', error);
      this.feedback.notify(
        'Gespeicherte Dateien konnten nicht geladen oder entschlüsselt werden. Die gespeicherten Kopien wurden nicht geändert.',
        'error'
      );
    }
  }

  get showToolbar(): boolean {
    return this.dataState.hasLoadedData || this.dataState.isLoading || this.router.url.split(/[?#]/)[0] !== '/';
  }

  skipToMain(event: Event) {
    event.preventDefault();
    document.getElementById('main-content')?.focus();
  }
}
