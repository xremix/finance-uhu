---
name: excel-import-type
version: 1.0.0
description: Add support for a new Excel file import type in Finanz Uhu by creating a dedicated importer and wiring it into the existing ImportService pipeline.
---

# Excel Import Type Skill

Use this skill when the user asks to add support for a new Excel import type (for example a new bank export in .xlsx or Excel-generated .csv).

## Trigger Phrases

- "add excel import"
- "new xlsx importer"
- "support bank excel export"
- "add new import type"
- "excel file import type"

## Repo Context

This project uses importer classes under src/app/services/import-services and selects the correct parser via src/app/services/import-services/import-service.ts.

Existing contracts and examples:
- Interface: src/app/services/import-services/importer.ts
- Existing importers: src/app/services/import-services/spk-importer.ts, src/app/services/import-services/ing-importer.ts

## Goals

1. Detect the new format safely.
2. Parse rows into Transaction objects.
3. Keep existing importers untouched unless required.
4. Integrate with category assignment and duplicate handling through ImportService.

## Implementation Playbook

1. Clarify format details
- Ask for a sample file header and 2-3 sample rows.
- Confirm delimiter/date/amount conventions.
- Confirm whether input is real .xlsx or Excel-exported .csv.

2. Add or extend reader path if true .xlsx is required
- If file is .csv, reuse current readAsText flow.
- If file is .xlsx, add a binary read path (ArrayBuffer) and convert rows before mapping.
- Prefer a well-known parser library such as xlsx when .xlsx support is needed.

3. Create a dedicated importer
- Add a new file in src/app/services/import-services/<bank-or-format>-importer.ts.
- Implement Importer with:
  - canParseCSV(csvData: string): boolean
  - parseCsvToTransactions(csvData: string): Transaction[]
- Keep parsing logic defensive:
  - validate required columns
  - skip malformed rows
  - handle decimal comma and decimal point
  - guard against invalid dates

4. Register importer in ImportService
- Wire the importer in src/app/services/import-services/import-service.ts in importServices array.
- Place importer ordering from most specific detector to most generic detector.

5. Add tests
- Add or extend *.spec.ts around importer logic.
- Cover:
  - format detection
  - valid row parsing
  - malformed row handling
  - number/date normalization

6. Validate app behavior
- Run npm run build.
- Optionally run npm test when importer tests are added.
- Confirm imported transactions show up in existing dashboards without extra state changes.

## Quality Rules

- Do not change Transaction model shape without explicit user request.
- Do not bypass CategoryService or DataState flow.
- Preserve backward compatibility for existing CSV importers.
- Prefer small, isolated changes in importer-specific files.

## Minimal Done Criteria

- New importer file exists and compiles.
- ImportService selects it for matching files.
- At least one success and one failure-path test exists.
- Build succeeds.
