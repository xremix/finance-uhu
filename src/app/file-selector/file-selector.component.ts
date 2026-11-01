import { Component, HostListener, Input } from '@angular/core';
import { DataState } from '../services/data-state';
import { ImportService } from '../services/import-services/import-service';
import type { UmsatzFile } from '../services/import-services/import-service';
import { UiFeedbackService } from '../services/ui-feedback.service';

interface FileTimelineEntry {
  fileName: string;
  hasRange: boolean;
  startEpoch: number;
  leftPct: number;
  widthPct: number;
  startLabel: string;
  endLabel: string;
}

@Component({
  selector: 'app-file-selector',
  templateUrl: './file-selector.component.html',
  styleUrls: ['./file-selector.component.scss'],
})
export class FileSelectorComponent {
  @Input() public big: boolean = false;
  readonly banks = ['Sparkasse', 'ING', 'N26', 'DKB'];
  selectedBank = 'Sparkasse';
  showExportHelp = false;
  isLoadingDemoData = false;
  saveNewFilesLocally = false;
  private readonly maxFileNameLength = 26;
  private timelineCacheKey: string = '';
  private timelineCache: FileTimelineEntry[] = [];

  constructor(
    private importService: ImportService,
    protected dataState: DataState,
    private feedback: UiFeedbackService
  ) {}

  get exportSteps(): string[] {
    switch (this.selectedBank) {
      case 'ING':
        return [
          'Melde dich an, wähle dein Konto und öffne die Umsätze des Kontos, welches du analysieren möchtest.',
          'Scrolle ganz nach unten und klicke so oft auf „Weiter in die Vergangenheit“, bis alle gewünschten Umsätze angezeigt werden.',
          'Klicke auf „Exportieren“, wähle „CSV (Excel)“ und dann „Jetzt exportieren“.'
        ];
      case 'N26':
        return [
          'Melde dich in der N26 Web-App an und wähle auf „Home“ dein Konto oder Space.',
          'Öffne „Downloads“ und trage unter „Kontoaktivität“ den gewünschten Zeitraum ein.',
          'Wähle CSV als Format und klicke auf „Herunterladen“.'
        ];
      case 'DKB':
        return [
          'Melde dich im DKB-Web-Banking an und öffne dein Girokonto.',
          'Rufe die Umsatzübersicht auf und wähle den gewünschten Zeitraum.',
          'Öffne „Export“ oder „Herunterladen“ und wähle CSV, falls das Format angeboten wird.'
        ];
      default:
        return [
          'Melde dich im Online-Banking deiner lokalen Sparkasse an und öffne „Umsätze“ für dein Konto.',
          'Wähle den gewünschten Zeitraum und aktualisiere die Umsatzanzeige.',
          'Öffne „Exportieren" und wähle das Excel (CSV-CAMT V2).'
        ];
    }
  }

  closeExportHelp(): void {
    this.showExportHelp = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeExportHelp();
  }

  get storedFiles(): UmsatzFile[] {
    return this.importService.getActiveFiles();
  }

  get inputId(): string {
    return this.big ? 'file-upload-big' : 'file-upload-small';
  }

  async fileChanged(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (!files || files.length === 0) {
      return;
    }

    const persistLocally = this.saveNewFilesLocally;
    try {
      await this.importService.addOrReplaceFiles(Array.from(files), persistLocally);
    } catch (error) {
      console.error('Error loading file:', error);
      this.feedback.notify(
        persistLocally
          ? 'Die Datei konnte nicht geladen oder im Browserspeicher abgelegt werden. Bitte prüfe das Dateiformat und den verfügbaren Speicherplatz.'
          : 'Die Datei konnte nicht geladen werden. Bitte prüfe das Dateiformat und versuche es erneut.',
        'error'
      );
    } finally {
      input.value = '';
      this.saveNewFilesLocally = false;
    }
  }

  async loadDemoData(): Promise<void> {
    if (this.isLoadingDemoData) return;
    this.isLoadingDemoData = true;
    const persistLocally = this.saveNewFilesLocally;

    try {
      const demoUrl = new URL('assets/demo.csv', document.baseURI);
      const response = await fetch(demoUrl);
      if (!response.ok) {
        throw new Error('Could not load demo CSV (' + response.status + ').');
      }

      const csv = await response.text();
      const demoFile = new File([csv], 'Finance-Uhu-Demo.csv', { type: 'text/csv' });
      await this.importService.addOrReplaceFile(demoFile, persistLocally);
    } catch (error) {
      console.error('Error loading demo data:', error);
      this.feedback.notify(
        persistLocally
          ? 'Die Beispieldaten konnten nicht geladen oder im Browserspeicher abgelegt werden. Bitte prüfe den verfügbaren Speicherplatz.'
          : 'Die Beispieldaten konnten nicht geladen werden. Bitte versuche es später erneut.',
        'error'
      );
    } finally {
      this.isLoadingDemoData = false;
      this.saveNewFilesLocally = false;
    }
  }

  async removeFile(fileName: string): Promise<void> {
    try {
      await this.importService.removeFile(fileName);
    } catch (error) {
      console.error('Error removing file:', error);
      this.feedback.notify('Die Datei konnte nicht entfernt werden. Bitte versuche es erneut.', 'error');
    }
  }

  toggleSaveNewFilesLocally(): void {
    this.saveNewFilesLocally = !this.saveNewFilesLocally;
  }

  async toggleFilePersistence(file: UmsatzFile): Promise<void> {
    try {
      this.importService.setFilePersisted(file.fileName, !file.persisted);
    } catch (error) {
      console.error('Error changing local file storage:', error);
      this.feedback.notify('Die Speicheroption konnte nicht geändert werden. Bitte prüfe den verfügbaren Browserspeicher.', 'error');
    }
  }

  get newFilesPersistenceDescription(): string {
    return this.saveNewFilesLocally
      ? 'Neue Umsatzdateien werden nach dem Import lokal in deinem Browser gespeichert. Klicke, um sie nur in dieser Sitzung zu verwenden.'
      : 'Deine Umsätze werden im Browser verarbeitet und nicht dauerhaft gespeichert. Klicke, um neue Dateien lokal in deinem Browser zu speichern.';
  }

  getFilePersistenceDescription(file: UmsatzFile): string {
    return file.persisted
      ? 'Diese Datei ist lokal in deinem Browser gespeichert. Klicke, um die gespeicherte Kopie zu entfernen; in dieser Sitzung bleibt sie verfügbar.'
      : 'Diese Datei wird im Browser verarbeitet und nicht dauerhaft gespeichert. Klicke, um sie lokal in deinem Browser zu speichern.';
  }

  async clearFiles(): Promise<void> {
    const confirmed = await this.feedback.requestConfirmation({
      title: 'Alle Umsatzdateien entfernen?',
      message: 'Alle geladenen Umsatzdateien werden aus dieser Sitzung entfernt. Gespeicherte Kopien werden zusätzlich aus dem Browser gelöscht. Du kannst die Dateien anschließend erneut importieren. Deine Kategorien bleiben erhalten.',
      acceptLabel: 'Alle Dateien entfernen',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      this.importService.clearFiles();
      this.saveNewFilesLocally = false;
    } catch (error) {
      console.error('Error clearing files:', error);
      this.feedback.notify('Die Dateien konnten nicht entfernt werden. Bitte versuche es erneut.', 'error');
    }
  }

  truncateFileName(fileName: string): string {
    if (fileName.length <= this.maxFileNameLength) {
      return fileName;
    }

    return `${fileName.substring(0, this.maxFileNameLength - 1)}...`;
  }

  getFileTimeline(fileName: string): FileTimelineEntry | undefined {
    return this.fileTimelines.find((timeline) => timeline.fileName === fileName);
  }

  get sortedStoredFilesForPopup(): UmsatzFile[] {
    const timelinesByFile = new Map(this.fileTimelines.map((timeline) => [timeline.fileName, timeline]));

    return [...this.storedFiles].sort((a, b) => {
      const aTimeline = timelinesByFile.get(a.fileName);
      const bTimeline = timelinesByFile.get(b.fileName);
      const aEpoch = aTimeline?.hasRange ? aTimeline.startEpoch : Number.POSITIVE_INFINITY;
      const bEpoch = bTimeline?.hasRange ? bTimeline.startEpoch : Number.POSITIVE_INFINITY;

      if (aEpoch !== bEpoch) {
        return aEpoch - bEpoch;
      }

      return a.fileName.localeCompare(b.fileName, 'de-DE');
    });
  }

  private get fileTimelines(): FileTimelineEntry[] {
    const files = this.storedFiles;
    const cacheKey = files.map((file) => `${file.fileName}|${file.uploadedAt}|${file.content.length}`).join('||');

    if (cacheKey === this.timelineCacheKey) {
      return this.timelineCache;
    }

    this.timelineCacheKey = cacheKey;
    this.timelineCache = this.buildFileTimelines(files);
    return this.timelineCache;
  }

  private buildFileTimelines(files: UmsatzFile[]): FileTimelineEntry[] {
    const fileRanges = files.map((file) => {
      const transactions = this.importService.parseCsvToTransactions(file.content);
      const dates = transactions
        .map((transaction) => transaction.bookingDate)
        .filter((date): date is Date => date instanceof Date && !Number.isNaN(date.getTime()));

      if (dates.length === 0) {
        return {
          fileName: file.fileName,
          hasRange: false,
          minDate: null as Date | null,
          maxDate: null as Date | null,
        };
      }

      let minDate = dates[0];
      let maxDate = dates[0];
      for (const date of dates) {
        if (date < minDate) {
          minDate = date;
        }
        if (date > maxDate) {
          maxDate = date;
        }
      }

      return {
        fileName: file.fileName,
        hasRange: true,
        minDate,
        maxDate,
      };
    });

    const validRanges = fileRanges.filter((range) => range.hasRange && range.minDate && range.maxDate);
    if (validRanges.length === 0) {
      return fileRanges.map((range) => ({
        fileName: range.fileName,
        hasRange: false,
        startEpoch: Number.POSITIVE_INFINITY,
        leftPct: 0,
        widthPct: 0,
        startLabel: '-',
        endLabel: '-',
      }));
    }

    const globalMin = validRanges.reduce((min, current) => (current.minDate! < min ? current.minDate! : min), validRanges[0].minDate!);
    const globalMax = validRanges.reduce((max, current) => (current.maxDate! > max ? current.maxDate! : max), validRanges[0].maxDate!);
    const globalSpanMs = Math.max(1, globalMax.getTime() - globalMin.getTime());

    return fileRanges.map((range) => {
      if (!range.hasRange || !range.minDate || !range.maxDate) {
        return {
          fileName: range.fileName,
          hasRange: false,
          startEpoch: Number.POSITIVE_INFINITY,
          leftPct: 0,
          widthPct: 0,
          startLabel: '-',
          endLabel: '-',
        };
      }

      const leftPct = ((range.minDate.getTime() - globalMin.getTime()) / globalSpanMs) * 100;
      const rawWidthPct = ((range.maxDate.getTime() - range.minDate.getTime()) / globalSpanMs) * 100;
      const widthPct = Math.min(100 - leftPct, Math.max(rawWidthPct, 1.5));

      return {
        fileName: range.fileName,
        hasRange: true,
        startEpoch: range.minDate.getTime(),
        leftPct,
        widthPct,
        startLabel: range.minDate.toLocaleDateString('de-DE'),
        endLabel: range.maxDate.toLocaleDateString('de-DE'),
      };
    });
  }

}
