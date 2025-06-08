export enum ChangeType {
  MAJOR = 'major',
  MINOR = 'minor',
  PATCH = 'patch',
  OTHER_CHANGE = 'other',
  PRERELEASE = 'prerelease',
  STABLE = 'stable',
  GENERAL_OTHER = 'general_other',
}

export interface CsvRelease {
  id: number;
  repo_name: string;
  package: string;
  version: string;
  author: string;
  published_at_kst: string;
  is_prerelease: boolean;
  is_draft: boolean;
  major_changes: string[];
  minor_changes: string[];
  patch_changes: string[];
  other_changes: string[];
  working_days: number;
  year: number;
  month: number;
}

export interface ProcessedCsvRelease extends CsvRelease {
  publishedDate: Date | null;
  derivedChangeTypes: ChangeType[];
  numMajorChanges: number;
  numMinorChanges: number;
  numPatchChanges: number;
  numOtherChanges: number;
}

export interface TimeSeriesData {
  date: string;
  count: number;
}

export interface ChangeTypeDistribution {
  name: ChangeType;
  value: number;
}

export interface PackageActivityData {
  name: string;
  releases: number;
  avgWorkingDays: number;
}

export interface KpiData {
  title: string;
  value: number | string;
} 