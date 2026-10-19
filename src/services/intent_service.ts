import { UserQuestionIntent, IntentDetectionResult } from '../types/ai';
import { districtNormalizer, normalizeDistrict } from './district_normalizer';

// Telugu transliteration mapping for Telangana districts
const TELUGU_DISTRICT_MAP: Record<string, string> = {
  'హైదరాబాద్': 'hyderabad',
  'వరంగల్': 'warangal',
  'హనుమకొండ': 'hanumakonda',
  'నిర్మల్': 'nirmal',
  'మంచిర్యాల': 'mancherial',
  'భద్రాద్రి': 'bhadradri_kothagudem',
  'భద్రాచలం': 'bhadradri_kothagudem',
  'కొత్తగూడెం': 'bhadradri_kothagudem',
  'ఖమ్మం': 'khammam',
  'కరీంనగర్': 'karimnagar',
  'నిజామాబాద్': 'nizamabad',
  'ఆదిలాబాద్': 'adilabad',
  'జగిత్యాల': 'jagtial',
  'జనగామ': 'jangaon',
  'జయశంకర్': 'jayashankar_bhupalpally',
  'భూపాలపల్లి': 'jayashankar_bhupalpally',
  'జోగులాంబ': 'jogulamba_gadwal',
  'గద్వాల': 'jogulamba_gadwal',
  'కామారెడ్డి': 'kamareddy',
  'కుమురం భీం': 'kumuram_bheem_asifabad',
  'ఆసిఫాబాద్': 'kumuram_bheem_asifabad',
  'మహబూబాబాద్': 'mahabubabad',
  'మహబూబ్‌నగర్': 'mahabubnagar',
  'మహబూబ్ నగర్': 'mahabubnagar',
  'మెదక్': 'medak',
  'మేడ్చల్': 'medchal_malkajgiri',
  'మల్కాజ్\u200Cగిరి': 'medchal_malkajgiri',
  'ములుగు': 'mulugu',
  'నాగర్ కర్నూల్': 'nagar_kurnool',
  'నల్గొండ': 'nalgonda',
  'నారాయణపేట': 'narayanpet',
  'పెద్దపల్లి': 'peddapalli',
  'రాజన్న సిరిసిల్ల': 'rajanna_sircilla',
  'సిరిసిల్ల': 'rajanna_sircilla',
  'రంగారెడ్డి': 'rangareddy',
  'సంగారెడ్డి': 'sangareddy',
  'సిద్దిపేట': 'siddipet',
  'సూర్యాపేట': 'suryapet',
  'వికారాబాద్': 'vikarabad',
  'వనపర్తి': 'wanaparthy',
  'యాదాద్రి': 'yadadri_bhuvanagiri',
  'భువనగిరి': 'yadadri_bhuvanagiri',
};

// Hindi transliteration mapping for Telangana districts
const HINDI_DISTRICT_MAP: Record<string, string> = {
  'हैदराबाद': 'hyderabad',
  'वारंगल': 'warangal',
  'हनुमकोंडा': 'hanumakonda',
  'निर्मल': 'nirmal',
  'मंचेरियल': 'mancherial',
  'भद्राद्री': 'bhadradri_kothagudem',
  'कोत्तागूडेम': 'bhadradri_kothagudem',
  'खम्मम': 'khammam',
  'करीमनगर': 'karimnagar',
  'निज़ामाबाद': 'nizamabad',
  'निजामाबाद': 'nizamabad',
  'आदिलाबाद': 'adilabad',
  'जगित्याल': 'jagtial',
  'जनगांव': 'jangaon',
  'जयशंकर': 'jayashankar_bhupalpally',
  'भूपालपल्ली': 'jayashankar_bhupalpally',
  'जोगुलम्बा': 'jogulamba_gadwal',
  'गडवाल': 'jogulamba_gadwal',
  'कामारेड्डी': 'kamareddy',
  'आसिफ़ाबाद': 'kumuram_bheem_asifabad',
  'आसिफाबाद': 'kumuram_bheem_asifabad',
  'महबूबाबाद': 'mahabubabad',
  'महबूबनगर': 'mahabubnagar',
  'मेदक': 'medak',
  'मेडचल': 'medchal_malkajgiri',
  'मलकाजगिरी': 'medchal_malkajgiri',
  'मुलुगु': 'mulugu',
  'नागरकुरनूल': 'nagar_kurnool',
  'नालगोंडा': 'nalgonda',
  'नारायणपेट': 'narayanpet',
  'पेद्दापल्ली': 'peddapalli',
  'राजन्ना': 'rajanna_sircilla',
  'सिरसिल्ला': 'rajanna_sircilla',
  'रंगारेड्डी': 'rangareddy',
  'संगारेड्डी': 'sangareddy',
  'सिद्दीपेट': 'siddipet',
  'सूर्यापेट': 'suryapet',
  'विकाराबाद': 'vikarabad',
  'वनपर्थी': 'wanaparthy',
  'यादाद्री': 'yadadri_bhuvanagiri',
  'भुवनागिरि': 'yadadri_bhuvanagiri',
};

export class IntentService {
  /**
   * Detects user language: 'te' if query contains Telugu Unicode glyphs,
   * 'hi' if query contains Devanagari Unicode glyphs, else 'en'.
   */
  public detectLanguage(query: string): 'en' | 'te' | 'hi' {
    if (!query) return 'en';
    if (/[\u0C00-\u0C7F]/.test(query)) return 'te';
    if (/[\u0900-\u097F]/.test(query)) return 'hi';
    return 'en';
  }

  /**
   * Extracts all referenced Telangana districts from query (English, Telugu & Hindi).
   */
  public extractDistricts(query: string): string[] {
    if (!query) return [];
    const foundDistrictIds: string[] = [];
    const qLower = query.toLowerCase();

    // 1. Check Telugu transliterations
    for (const [teluguWord, districtId] of Object.entries(TELUGU_DISTRICT_MAP)) {
      if (query.includes(teluguWord)) {
        if (!foundDistrictIds.includes(districtId)) {
          foundDistrictIds.push(districtId);
        }
      }
    }

    // 1b. Check Hindi transliterations
    for (const [hindiWord, districtId] of Object.entries(HINDI_DISTRICT_MAP)) {
      if (query.includes(hindiWord)) {
        if (!foundDistrictIds.includes(districtId)) {
          foundDistrictIds.push(districtId);
        }
      }
    }

    // 2. Check all 33 canonical districts & aliases
    const allDistricts = districtNormalizer.getAllDistricts();
    for (const d of allDistricts) {
      const dName = d.district_name.toLowerCase();
      const dId = d.district_id.toLowerCase();
      
      // Word boundary regex or simple check for multi-word
      const nameRegex = new RegExp(`\\b${dName.replace(/\s+/g, '\\s+')}\\b`, 'i');
      const idRegex = new RegExp(`\\b${dId.replace(/_/g, '[\\s_-]?')}\\b`, 'i');

      if (nameRegex.test(qLower) || idRegex.test(qLower)) {
        if (!foundDistrictIds.includes(d.district_id)) {
          foundDistrictIds.push(d.district_id);
        }
      }
    }

    // 3. Fallback check for common single word substrings like "Hyderabad", "Warangal", "Nirmal", "Khammam"
    if (foundDistrictIds.length === 0) {
      const words = qLower.split(/[\s,?.!/]+/).filter(w => w.length >= 4);
      for (const w of words) {
        const norm = normalizeDistrict(w);
        if (norm.resolved && !foundDistrictIds.includes(norm.districtId)) {
          foundDistrictIds.push(norm.districtId);
        }
      }
    }

    return foundDistrictIds;
  }

  /**
   * Extract forecast horizon if mentioned (e.g. +3H, +6H, +12H, +24H, 6 hours).
   */
  public extractHorizon(query: string): string | undefined {
    const q = query.toLowerCase();
    if (/\+?24\s*h(our)?s?/i.test(q)) return '+24H';
    if (/\+?12\s*h(our)?s?/i.test(q)) return '+12H';
    if (/\+?6\s*h(our)?s?/i.test(q)) return '+6H';
    if (/\+?3\s*h(our)?s?/i.test(q)) return '+3H';
    if (/\b(now|baseline|current)\b/i.test(q)) return 'NOW';
    if (/\b(peak|highest|crest)\b/i.test(q)) return 'PEAK';
    return undefined;
  }

  /**
   * Full Intent Parsing Engine.
   */
  public detectIntent(rawQuery: string, overrideDistrictContext?: string): IntentDetectionResult {
    const query = (rawQuery || '').trim();
    const language = this.detectLanguage(query);
    const qLower = query.toLowerCase();
    const horizon = this.extractHorizon(query);

    let detectedDistricts = this.extractDistricts(query);
    if (detectedDistricts.length === 0 && overrideDistrictContext) {
      const norm = normalizeDistrict(overrideDistrictContext);
      if (norm.resolved) {
        detectedDistricts = [norm.districtId];
      }
    }

    const isComparisonQuery = (
      detectedDistricts.length >= 2 ||
      /\b(compare|vs\.?|versus|difference between|difference|higher risk between|greater risk)\b/i.test(qLower) ||
      query.includes('మరియు') || query.includes('పోల్చండి') || query.includes('పోలిక') ||
      query.includes('तुलना') || query.includes('और') || query.includes('बनाम')
    );

    let intent: UserQuestionIntent = 'GENERAL_PROJECT_INFORMATION';
    let confidence = 0.85;

    // 1. Comparison Intent
    if (isComparisonQuery && detectedDistricts.length >= 2) {
      intent = 'DISTRICT_COMPARISON';
      confidence = 0.98;
    }
    // 2. Alert Explanation Intent
    else if (
      /\b(alert|alerts|warning|level|triggered|why alert|why warning|escalation|watch|critical alert|high alert)\b/i.test(qLower) ||
      query.includes('హెచ్చరిక') || query.includes('అలర్ట్') ||
      query.includes('चेतावनी') || query.includes('अलर्ट')
    ) {
      intent = 'ALERT_EXPLANATION';
      confidence = 0.95;
    }
    // 3. Forecast / Prediction Intent
    else if (
      /\b(forecast|prediction|predict|trend|trajectory|rising|dropping|improving|projected|peak|in 3 hours|in 6 hours|in 12 hours|in 24 hours|\+3h|\+6h|\+12h|\+24h|outlook|highest projected)\b/i.test(qLower) ||
      query.includes('అంచనా') || query.includes('భవిష్యత్తు') || query.includes('పెరుగుతోందా') ||
      query.includes('पूर्वानुमान') || query.includes('अनुमान') || query.includes('वृद्धि')
    ) {
      intent = 'FORECAST';
      confidence = 0.95;
    }
    // 4. Safety / Precautions Guidance Intent
    else if (
      /\b(safety|precaution|precautions|what to do|evacuate|shelter|guidelines|protective|protect|avoid|actionable|measures|advisory)\b/i.test(qLower) ||
      query.includes('రక్షణ') || query.includes('జాగ్రత్తలు') || query.includes('సూచనలు') ||
      query.includes('सुरक्षा') || query.includes('सावधानी') || query.includes('सलाह')
    ) {
      intent = 'SAFETY_GUIDANCE';
      confidence = 0.94;
    }
    // 5. Basin / Upstream / Downstream Hydrology Intent
    else if (
      /\b(basin|river|godavari|krishna|musi|manair|munneru|pranhita|kadam|upstream|downstream|propagation|dam|reservoir|inflow|discharge)\b/i.test(qLower) ||
      query.includes('నది') || query.includes('బేసిన్') || query.includes('ప్రవాహం') ||
      query.includes('नदी') || query.includes('बेसिन') || query.includes('बांध')
    ) {
      intent = 'BASIN_INFORMATION';
      confidence = 0.92;
    }
    // 6. Citizen Report Intent
    else if (
      /\b(citizen|reports|crowdsourced|community|ground report|complaints|field report|reports count)\b/i.test(qLower) ||
      query.includes('ప్రజా ఫిర్యాదు') || query.includes('నివేదికలు') ||
      query.includes('नागरिक') || query.includes('रिपोर्ट')
    ) {
      intent = 'CITIZEN_REPORT_SUMMARY';
      confidence = 0.92;
    }
    // 7. Data Limitation / Methodology Intent
    else if (
      /\b(limitation|limitations|data mode|prototype baseline|confidence level|simulated|accuracy|provenance|data availability)\b/i.test(qLower) ||
      query.includes('పరిమితులు') || query.includes('డేటా విశ్వసనీయత') ||
      query.includes('सीमाएं') || query.includes('प्रोटोटाइप')
    ) {
      intent = 'DATA_LIMITATION';
      confidence = 0.90;
    }
    // 8. General Project / Formula / Methodology Intent
    else if (
      /\b(formula|weight|weights|calculate|model|neerdrishti|5 factors|algorithm|methodology|how it works)\b/i.test(qLower) ||
      query.includes('సూత్రం') || query.includes('మోడల్') ||
      query.includes('फॉर्मूला') || query.includes('मॉडल') || query.includes('सूत्र')
    ) {
      intent = 'GENERAL_PROJECT_INFORMATION';
      confidence = 0.90;
    }
    // 9. District Risk Inquiries (Default when district is present or explicitly asked)
    else if (detectedDistricts.length > 0 || /\b(risk|flood|status|situation|rainfall|score|situation)\b/i.test(qLower) || query.includes('बाढ़') || query.includes('जोखिम') || query.includes('बारिश')) {
      intent = 'DISTRICT_RISK';
      confidence = 0.88;
    }

    return {
      intent,
      confidence,
      detectedDistricts,
      primaryDistrict: detectedDistricts[0],
      secondaryDistrict: detectedDistricts[1],
      horizon,
      language,
      isComparison: isComparisonQuery,
      rawQuery: query,
    };
  }
}

export const intentService = new IntentService();
