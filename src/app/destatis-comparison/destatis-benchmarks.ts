export interface DestatisBenchmark {
  id: string;
  label: string;
  amountByHouseholdSize: Record<HouseholdSize, number>;
  matches: (path: string[]) => boolean;
}

export type HouseholdSize = 'all' | '1' | '2' | '3' | '4' | '5+';

const rootIs = (path: string[], name: string): boolean => path[0] === name;
const leafIs = (path: string[], name: string): boolean => path.at(-1) === name;

/** 2023 average monthly household expenditure, EVS main survey, Germany. */
export const DESTATIS_BENCHMARKS_2023: DestatisBenchmark[] = [
  {
    id: 'food',
    label: 'Nahrungsmittel, Getränke und Tabakwaren',
    amountByHouseholdSize: { all: 436, '1': 254, '2': 480, '3': 612, '4': 703, '5+': 829 },
    matches: (path) => leafIs(path, 'Lebensmittel'),
  },
  {
    id: 'clothing',
    label: 'Bekleidung und Schuhe',
    amountByHouseholdSize: { all: 111, '1': 60, '2': 114, '3': 165, '4': 205, '5+': 239 },
    matches: (path) => leafIs(path, 'Kleidung'),
  },
  {
    id: 'housing',
    label: 'Wohnen, Energie und Wohnungsinstandhaltung',
    amountByHouseholdSize: { all: 1137, '1': 817, '2': 1240, '3': 1434, '4': 1582, '5+': 1699 },
    matches: (path) => rootIs(path, 'Miete') || (rootIs(path, 'Strom / Internet / Rundfunk') && leafIs(path, 'Strom')),
  },
  {
    id: 'household',
    label: 'Innenausstattung, Haushaltsgeräte und -gegenstände',
    amountByHouseholdSize: { all: 137, '1': 77, '2': 161, '3': 194, '4': 208, '5+': 240 },
    matches: (path) => rootIs(path, 'Haushalt'),
  },
  {
    id: 'health',
    label: 'Gesundheit',
    amountByHouseholdSize: { all: 98, '1': 61, '2': 142, '3': 98, '4': 102, '5+': 110 },
    matches: (path) => leafIs(path, 'Apotheke / Gesundheit'),
  },
  {
    id: 'transport',
    label: 'Verkehr',
    amountByHouseholdSize: { all: 361, '1': 195, '2': 405, '3': 538, '4': 608, '5+': 626 },
    matches: (path) => rootIs(path, 'Mobilität'),
  },
  {
    id: 'information',
    label: 'Information und Kommunikation',
    amountByHouseholdSize: { all: 142, '1': 108, '2': 147, '3': 184, '4': 192, '5+': 217 },
    matches: (path) => rootIs(path, 'Strom / Internet / Rundfunk') && ['Internet', 'Rundfunk'].includes(path.at(-1) ?? ''),
  },
  {
    id: 'leisure',
    label: 'Freizeit, Sport und Kultur',
    amountByHouseholdSize: { all: 260, '1': 149, '2': 301, '3': 355, '4': 412, '5+': 445 },
    matches: (path) => leafIs(path, 'Freizeitaktivitäten'),
  },
  {
    id: 'education',
    label: 'Bildungsdienstleistungen',
    amountByHouseholdSize: { all: 26, '1': 9, '2': 16, '3': 50, '4': 81, '5+': 84 },
    matches: (path) => rootIs(path, 'Berufliches'),
  },
  {
    id: 'restaurants',
    label: 'Gastronomie- und Beherbergungsdienstleistungen',
    amountByHouseholdSize: { all: 206, '1': 113, '2': 246, '3': 288, '4': 333, '5+': 317 },
    matches: (path) => leafIs(path, 'Restaurant'),
  },
];

export const DESTATIS_HOUSEHOLD_SPENDING_SOURCE_2023 =
  'https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Einkommen-Konsum-Lebensbedingungen/Konsumausgaben-Lebenshaltungskosten/Tabellen/liste-haushaltsgroesse.html';
