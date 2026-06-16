export type ShelterCategory = 'kas' | 'priedanga' | 'evakuacija' | 'sirena';

export type ShelterType =
  | 'underground'
  | 'collective_protection'
  | 'assembly'
  | 'siren';

export const SHELTER_CATEGORIES: ShelterCategory[] = [
  'kas',
  'priedanga',
  'evakuacija',
  'sirena',
];

export const CATEGORY_TO_TYPE: Record<ShelterCategory, ShelterType> = {
  kas: 'collective_protection',
  priedanga: 'underground',
  evakuacija: 'assembly',
  sirena: 'siren',
};

export type Shelter = {
  id: string;
  category: ShelterCategory;
  type: ShelterType;
  name: string;
  manager: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string;
  county: string | null;
  municipality: string | null;
  eldership: string | null;
  capacity: number | null;
  area_m2: number | null;
  accessible: boolean | null;
  marked: boolean | null;
  always_open: boolean | null;
  has_lighting: boolean | null;
  has_sanitation: boolean | null;
  has_ventilation: boolean | null;
  hours: string | null;
  notes: string | null;
  updated_at: string | null;
  country: string;
  source: string;
  siren_radius_m: number | null;
  evac_type: string | null;
  distanceKm?: number;
};

export type ChecklistItem = {
  id: string;
  category: string;
  sort_order: number;
  label_key: string;
  checked: boolean;
};

export type GuideId = 'air' | 'nuclear' | 'natural' | 'missile';
