# Finanz Uhu - Copilot Instructions

## Architecture Overview

Finanz Uhu ist eine datenschutzfreundliche Angular-Anwendung (v18) zur lokalen Analyse von CSV-Finanzdaten. Die App verarbeitet Daten vollständig im Browser ohne Server-Backend.

### Core Data Flow
1. **CSV Import**: `ImportService` erkennt automatisch Bankformate (SpkImporter, IngImporter, N26Importer, DkbImporter)
2. **Transaction Processing**: Kategorisierung via `CategoryService` mit keyword-basiertem Matching
3. **State Management**: `DataState` hält alle Transaktionen, Filter und berechnete Daten
4. **Visualization**: ApexCharts für verschiedene Finanz-Dashboards

### Key Components Structure
- **Home**: Haupt-Dashboard mit Charts und Übersichten
- **Settings**: Kategorie-Management und Datenexport
- **Chart Components**: Spezialisierte Visualisierungen (CategoryChart, HistoryIncomeChart)
- **Filter Components**: DateRangePicker, CategorySelect für Datenfilterung

## Development Patterns

### Data Models
```typescript
// Zentrale Datenstrukturen in src/app/models/
Transaction: { amount, bookingDate, payerReceiver, category, ... }
Category: { name, type: 'income'|'expense'|'savings', keywords, subCategories }
```

### Service Layer Conventions
- **DataState**: Singleton für globalen App-Zustand, alle Komponenten injizieren diesen Service
- **CategoryService**: Automatische Kategorisierung basierend auf `defaultCategories.ts` keyword-matching
- **ImportService**: Factory-Pattern für verschiedene Bank-CSV-Formate

### Component Naming
Folgt dem Angular-Standard: `{feature}-component.component.{ts,html,scss}` (z.B. `category-overview-component`)

## Build & Development

```bash
npm install          # Initial setup
ng serve            # Development server (http://localhost:4200)
ng build            # Production build
ng test             # Run unit tests
```

### Key Files to Understand
- `src/app/default-categories.ts`: Umfangreiche Kategorie-Definitionen mit deutschen Keywords
- `src/app/services/data-state.ts`: Zentrale Zustandsverwaltung und Filterlogik
- `src/app/services/import-services/`: Bank-spezifische CSV-Parser (erweiterbar)
- `demo.csv`: Beispieldaten für Testing/Demo

## Integration Points

### External Dependencies
- **Angular Material + Bootstrap**: UI Components (beides parallel verwendet)
- **ng-apexcharts**: Alle Chart-Visualisierungen
- **ng-bootstrap**: DatePicker und UI-Utilities
- **localStorage**: Persistierung von Kategorien und Einstellungen

### CSV Format Support
Neue Banken via Importer-Interface in `services/import-services/`:
```typescript
interface Importer {
  canImport(csvData: string): boolean;
  import(csvData: string): Transaction[];
}
```

## Privacy & Local-First Architecture
- Keine Server-Kommunikation - alle Daten bleiben lokal
- localStorage für Persistierung von Kategorien und Einstellungen
- CSV-Verarbeitung komplett client-side
- Demo-Modus verfügbar unter http://finanz-uhu.xremix.de/