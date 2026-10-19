import fs from 'fs';
import path from 'path';
import { DistrictNormalizationResult } from '../types/signals';

export interface CanonicalDistrict {
  district_id: string;
  district_name: string;
  latitude?: number;
  longitude?: number;
  region_zone?: string;
  monitoring_category?: string;
}

// Known verified aliases and common alternate spellings for Telangana districts
const KNOWN_ALIASES: Record<string, string> = {
  // TEL code abbreviations
  'tel-hyd': 'hyderabad',
  'tel-wgl': 'warangal',
  'tel-nir': 'nirmal',
  'tel-mnc': 'mancherial',
  'tel-bdk': 'bhadradri_kothagudem',
  'tel-ped': 'peddapalli',
  'tel-jys': 'jayashankar_bhupalpally',
  'tel-rgr': 'rangareddy',
  'tel-ydb': 'yadadri_bhuvanagiri',
  'tel-nlk': 'nalgonda',
  'tel-sury': 'suryapet',
  'tel-kmm': 'khammam',
  'tel-krm': 'karimnagar',
  'tel-rjs': 'rajanna_sircilla',
  'tel-jgb': 'jogulamba_gadwal',
  'tel-wnp': 'wanaparthy',
  'tel-ngk': 'nagar_kurnool',
  'tel-mhb': 'mahabubnagar',
  'tel-mdb': 'medak',
  'tel-sdd': 'siddipet',
  'tel-nzb': 'nizamabad',
  'tel-kmb': 'kumuram_bheem_asifabad',
  'tel-adb': 'adilabad',
  'tel-jtl': 'jagtial',
  'tel-kmr': 'kamareddy',
  'tel-mdm': 'medchal_malkajgiri',
  'tel-vkr': 'vikarabad',
  'tel-sgr': 'sangareddy',
  'tel-nrp': 'narayanpet',
  'tel-mlg': 'mulugu',
  'tel-jng': 'jangaon',
  'tel-mhb-2': 'mahabubabad',
  'tel-hnk': 'hanumakonda',
  'tel-bhd': 'bhadradri_kothagudem',

  // Warangal variants
  'warangal urban': 'warangal',
  'warangal rural': 'warangal',
  'hanumakonda': 'hanumakonda',
  'hanamkonda': 'hanumakonda',
  
  // Hyderabad variants
  'hyderabad district': 'hyderabad',
  'ghmc': 'hyderabad',
  'hyderabad urban': 'hyderabad',
  
  // Bhadradri / Kothagudem variants
  'kothagudem': 'bhadradri_kothagudem',
  'bhadradri': 'bhadradri_kothagudem',
  'bhadrachalam': 'bhadradri_kothagudem',
  'bhadradri-kothagudem': 'bhadradri_kothagudem',

  // Jayashankar Bhupalpally variants
  'bhupalpally': 'jayashankar_bhupalpally',
  'jayashankar': 'jayashankar_bhupalpally',
  'jayashankar-bhupalpally': 'jayashankar_bhupalpally',

  // Medchal variants
  'medchal': 'medchal_malkajgiri',
  'malkajgiri': 'medchal_malkajgiri',
  'medchal-malkajgiri': 'medchal_malkajgiri',

  // Komaram Bheem Asifabad variants
  'asifabad': 'kumuram_bheem_asifabad',
  'komaram bheem': 'kumuram_bheem_asifabad',
  'komaram bheem asifabad': 'kumuram_bheem_asifabad',
  'kumuram bheem': 'kumuram_bheem_asifabad',
  'kumuram bheem asifabad': 'kumuram_bheem_asifabad',

  // Jogulamba Gadwal variants
  'gadwal': 'jogulamba_gadwal',
  'jogulamba': 'jogulamba_gadwal',

  // Yadadri Bhuvanagiri variants
  'yadadri': 'yadadri_bhuvanagiri',
  'bhongir': 'yadadri_bhuvanagiri',
  'bhuvanagiri': 'yadadri_bhuvanagiri',

  // Jangaon / Janagaon variants
  'janagaon': 'jangaon',

  // Rajanna Sircilla variants
  'sircilla': 'rajanna_sircilla',
  'rajanna': 'rajanna_sircilla',

  // Mahabubnagar / Mahbubnagar
  'mahaboobnagar': 'mahabubnagar',
  'mahbubnagar': 'mahabubnagar',

  // Mahabubabad / Mahbubabad
  'mahaboobabad': 'mahabubabad',
  'mahbubabad': 'mahabubabad',

  // Rangareddy / Ranga Reddy
  'ranga reddy': 'rangareddy',
  'r.r. district': 'rangareddy',
  'cyberabad': 'rangareddy',
};

class DistrictNormalizer {
  private districts: Map<string, CanonicalDistrict> = new Map();
  private nameToIdMap: Map<string, string> = new Map();

  constructor() {
    this.loadDistricts();
  }

  private loadDistricts() {
    try {
      const jsonPath = path.join(process.cwd(), 'data', 'telangana_districts.json');
      if (fs.existsSync(jsonPath)) {
        const raw = fs.readFileSync(jsonPath, 'utf-8');
        const list: CanonicalDistrict[] = JSON.parse(raw);
        for (const d of list) {
          const id = (d.district_id || '').toLowerCase().trim();
          const name = (d.district_name || '').trim();
          if (id && name) {
            this.districts.set(id, d);
            this.nameToIdMap.set(name.toLowerCase(), id);
            // also index clean underscored/hyphenated variations
            this.nameToIdMap.set(name.toLowerCase().replace(/[^a-z0-9]/g, '_'), id);
            this.nameToIdMap.set(name.toLowerCase().replace(/[^a-z0-9]/g, ''), id);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load Telangana districts in normalizer:', err);
    }
  }

  /**
   * Normalizes raw district string into canonical Telangana district reference.
   * Never silently guesses; returns UNRESOLVED if ambiguous or not matched.
   */
  public normalize(rawInput: string | null | undefined): DistrictNormalizationResult {
    if (!rawInput || typeof rawInput !== 'string') {
      return {
        districtId: '',
        canonicalName: '',
        matchType: 'UNRESOLVED',
        confidence: 0.0,
        resolved: false,
      };
    }

    const trimmed = rawInput.trim();
    const lower = trimmed.toLowerCase();
    const cleaned = lower.replace(/[^a-z0-9]/g, '');

    // 1. Exact Canonical District ID Match
    if (this.districts.has(lower)) {
      const d = this.districts.get(lower)!;
      return {
        districtId: d.district_id,
        canonicalName: d.district_name,
        canonical_id: d.district_id,
        district_name: d.district_name,
        matchType: 'EXACT_ID',
        confidence: 1.0,
        resolved: true,
      };
    }

    // 2. Exact Canonical District Name Match
    if (this.nameToIdMap.has(lower)) {
      const id = this.nameToIdMap.get(lower)!;
      const d = this.districts.get(id)!;
      return {
        districtId: d.district_id,
        canonicalName: d.district_name,
        canonical_id: d.district_id,
        district_name: d.district_name,
        matchType: 'EXACT_NAME',
        confidence: 1.0,
        resolved: true,
      };
    }

    // 3. Normalized Cleaned Alphanumeric Name Match
    if (this.nameToIdMap.has(cleaned)) {
      const id = this.nameToIdMap.get(cleaned)!;
      const d = this.districts.get(id)!;
      return {
        districtId: d.district_id,
        canonicalName: d.district_name,
        canonical_id: d.district_id,
        district_name: d.district_name,
        matchType: 'NORMALIZED_NAME',
        confidence: 0.95,
        resolved: true,
      };
    }

    // 4. Verified Alias Dictionary Match
    if (KNOWN_ALIASES[lower] && this.districts.has(KNOWN_ALIASES[lower])) {
      const id = KNOWN_ALIASES[lower];
      const d = this.districts.get(id)!;
      return {
        districtId: d.district_id,
        canonicalName: d.district_name,
        canonical_id: d.district_id,
        district_name: d.district_name,
        matchType: 'ALIAS',
        confidence: 0.90,
        resolved: true,
      };
    }

    // 5. Unresolved (Never silently guess unknown districts)
    return {
      districtId: '',
      canonicalName: trimmed,
      canonical_id: '',
      district_name: trimmed,
      matchType: 'UNRESOLVED',
      confidence: 0.0,
      resolved: false,
    };
  }

  public getAllDistricts(): CanonicalDistrict[] {
    return Array.from(this.districts.values());
  }

  public getDistrict(districtId: string): CanonicalDistrict | undefined {
    return this.districts.get(districtId.toLowerCase().trim());
  }
}

export const districtNormalizer = new DistrictNormalizer();
export function normalizeDistrict(rawName: string | null | undefined): DistrictNormalizationResult {
  return districtNormalizer.normalize(rawName);
}
