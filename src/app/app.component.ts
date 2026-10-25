import { Component, OnInit } from '@angular/core';
import { CategoryService } from './services/category-service';
import { DataState } from './services/data-state';
import { DateService } from './services/date-service';
import { ImportService } from './services/import-services/import-service';
import { Router } from '@angular/router';
import { legalContact } from './legal-contact';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],

})
export class AppComponent implements OnInit {
  title = 'Finanz Uhu';
  protected readonly legalContact = legalContact;
    constructor(protected dataState: DataState,
      private importService: ImportService,
      protected categoryService: CategoryService, 
      protected dateService: DateService,
      private router: Router) {
  }

  async ngOnInit(): Promise<void> {
    await this.importService.loadFromLocalStorage();
  }

  get showToolbar(): boolean {
    return this.dataState.hasLoadedData || this.dataState.isLoading || this.router.url.split(/[?#]/)[0] !== '/';
  }

  openSettings() {
    this.router.navigate(['settings']);
  }

  skipToMain(event: Event) {
    event.preventDefault();
    document.getElementById('main-content')?.focus();
  }
}
