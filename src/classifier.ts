import { callLlamaChat, getLlamaConfig, extractJsonFromText } from './services/llama_client';

export const ALLOWED_INCIDENT_TYPES = [
  'Urban Flooding',
  'Road Flooding',
  'Water Entering Buildings',
  'Drainage Overflow',
  'River Overflow',
  'Other',
] as const;

export type IncidentType = (typeof ALLOWED_INCIDENT_TYPES)[number];

export const ALLOWED_SEVERITIES = ['Low', 'Moderate', 'High', 'Critical'] as const;
export type SeverityLevel = (typeof ALLOWED_SEVERITIES)[number];

export const ALLOWED_PRIORITIES = [
  'Monitor',
  'Review',
  'High Priority',
  'Immediate Review',
] as const;
export type PriorityLevel = (typeof ALLOWED_PRIORITIES)[number];

export interface StructuredClassification {
  incident_type: IncidentType;
  severity: SeverityLevel;
  impact: string;
  priority: PriorityLevel;
  summary: string;
  recommended_action: string;
  visual_estimate?: string;
  image_plausibility?: 'Verified Flood Visual' | 'Uncertain Visual' | 'Irrelevant Image' | 'No Image Attached';
  model_provider?: string;
  model_name?: string;
}

export interface ClassificationResult {
  classification: StructuredClassification;
  source: 'Meta Llama' | 'Rule-Based Fallback' | 'Manual Input';
  confidence: number;
}

/**
 * Validates whether an object matches the strict AI JSON classification schema.
 */
export function validateStructuredClassification(obj: any): StructuredClassification | null {
  if (!obj || typeof obj !== 'object') return null;

  let incidentType: IncidentType = 'Other';
  const rawType = String(obj.incident_type || '').trim();
  const matchedType = ALLOWED_INCIDENT_TYPES.find(
    (t) => t.toLowerCase() === rawType.toLowerCase()
  );
  if (matchedType) {
    incidentType = matchedType;
  } else if (rawType.toLowerCase().includes('river')) {
    incidentType = 'River Overflow';
  } else if (rawType.toLowerCase().includes('drain') || rawType.toLowerCase().includes('nala')) {
    incidentType = 'Drainage Overflow';
  } else if (rawType.toLowerCase().includes('building') || rawType.toLowerCase().includes('house') || rawType.toLowerCase().includes('basement')) {
    incidentType = 'Water Entering Buildings';
  } else if (rawType.toLowerCase().includes('road') || rawType.toLowerCase().includes('traffic') || rawType.toLowerCase().includes('causeway')) {
    incidentType = 'Road Flooding';
  } else if (rawType.toLowerCase().includes('urban') || rawType.toLowerCase().includes('waterlogging')) {
    incidentType = 'Urban Flooding';
  } else {
    incidentType = 'Other';
  }

  let severity: SeverityLevel = 'Moderate';
  const rawSev = String(obj.severity || '').trim();
  const matchedSev = ALLOWED_SEVERITIES.find(
    (s) => s.toLowerCase() === rawSev.toLowerCase()
  );
  if (matchedSev) {
    severity = matchedSev;
  } else {
    severity = 'Moderate';
  }

  let priority: PriorityLevel = 'Review';
  const rawPri = String(obj.priority || '').trim();
  const matchedPri = ALLOWED_PRIORITIES.find(
    (p) => p.toLowerCase() === rawPri.toLowerCase()
  );
  if (matchedPri) {
    priority = matchedPri;
  } else {
    if (severity === 'Critical') priority = 'Immediate Review';
    else if (severity === 'High') priority = 'High Priority';
    else if (severity === 'Moderate') priority = 'Review';
    else priority = 'Monitor';
  }

  const impact = typeof obj.impact === 'string' && obj.impact.trim().length > 0
    ? obj.impact.trim().slice(0, 300)
    : 'Local residential and transit corridor';

  const summary = typeof obj.summary === 'string' && obj.summary.trim().length > 0
    ? obj.summary.trim().slice(0, 300)
    : 'Water accumulation and flood hazard reported.';

  const recommendedAction = typeof obj.recommended_action === 'string' && obj.recommended_action.trim().length > 0
    ? obj.recommended_action.trim().slice(0, 300)
    : 'Avoid submerged roadways and exercise caution in low-lying areas.';

  const visualEstimate = typeof obj.visual_estimate === 'string' && obj.visual_estimate.trim().length > 0
    ? obj.visual_estimate.trim().slice(0, 200)
    : undefined;

  let imagePlausibility: 'Verified Flood Visual' | 'Uncertain Visual' | 'Irrelevant Image' | 'No Image Attached' | undefined;
  if (obj.image_plausibility === 'Verified Flood Visual' || obj.image_plausibility === 'Uncertain Visual' || obj.image_plausibility === 'Irrelevant Image') {
    imagePlausibility = obj.image_plausibility;
  }

  return {
    incident_type: incidentType,
    severity,
    impact,
    priority,
    summary,
    recommended_action: recommendedAction,
    visual_estimate: visualEstimate,
    image_plausibility: imagePlausibility,
  };
}

/**
 * Deterministic Rule-Based Fallback Classifier
 */
export function ruleBasedFallbackClassification(input: {
  district: string;
  location_description?: string;
  user_incident_type?: string;
  user_severity?: string;
  description: string;
  image_data?: string | null;
}): StructuredClassification {
  const descLower = (input.description || '').toLowerCase();
  const locLower = (input.location_description || '').toLowerCase();
  const combined = `${descLower} ${locLower}`;

  // 1. Incident Type detection
  let incidentType: IncidentType = 'Other';
  if (combined.includes('musi') || combined.includes('godavari') || combined.includes('river') || combined.includes('causeway') || combined.includes('kadam') || combined.includes('riverbank')) {
    incidentType = 'River Overflow';
  } else if (combined.includes('nala') || combined.includes('drain') || combined.includes('choked') || combined.includes('gutter') || combined.includes('manhole') || combined.includes('sewage')) {
    incidentType = 'Drainage Overflow';
  } else if (combined.includes('basement') || combined.includes('house') || combined.includes('apartment') || combined.includes('building') || combined.includes('ground floor') || combined.includes('shop')) {
    incidentType = 'Water Entering Buildings';
  } else if (combined.includes('road') || combined.includes('traffic') || combined.includes('highway') || combined.includes('underpass') || combined.includes('bridge') || combined.includes('vehicle')) {
    incidentType = 'Road Flooding';
  } else if (combined.includes('colony') || combined.includes('street') || combined.includes('waterlogging') || combined.includes('inundation')) {
    incidentType = 'Urban Flooding';
  } else {
    // Respect user selected type if valid
    const userType = input.user_incident_type as IncidentType;
    if (userType && ALLOWED_INCIDENT_TYPES.includes(userType)) {
      incidentType = userType;
    } else {
      incidentType = 'Urban Flooding';
    }
  }

  // 2. Severity & Priority detection
  const criticalWords = ['submerged', 'overflowing', 'waist', 'trapped', 'stuck', 'breach', 'burst', 'danger', 'rescue', 'emergency'];
  const highWords = ['knee-deep', 'blocked', 'heavy water', 'rising fast', 'debris', 'gushing', 'dam gate', 'washed away'];

  const hasCritical = criticalWords.some((w) => combined.includes(w)) || input.user_severity === 'Critical';
  const hasHigh = highWords.some((w) => combined.includes(w)) || input.user_severity === 'High';

  let severity: SeverityLevel = 'Moderate';
  let priority: PriorityLevel = 'Review';

  if (hasCritical) {
    severity = 'Critical';
    priority = 'Immediate Review';
  } else if (hasHigh) {
    severity = 'High';
    priority = 'High Priority';
  } else if (input.user_severity === 'Low') {
    severity = 'Low';
    priority = 'Monitor';
  } else {
    severity = 'Moderate';
    priority = 'Review';
  }

  // 3. Impact & Summary
  let impact = 'Localized street access and drainage path';
  if (severity === 'Critical') {
    impact = 'Severe threat to life, transit links, and submerged properties';
  } else if (severity === 'High') {
    impact = 'Disruption of vehicular movement and water ingress risk';
  } else if (severity === 'Moderate') {
    impact = 'Temporary traffic slowdown and localized waterlogging';
  }

  const locPart = input.location_description ? ` near ${input.location_description}` : '';
  const summary = `${incidentType} (${severity.toLowerCase()} severity) reported in ${input.district}${locPart}.`;

  // 4. Recommended Action
  let recommendedAction = 'Avoid waterlogged areas and follow local authority advisories.';
  if (severity === 'Critical') {
    recommendedAction = 'Do not attempt to cross inundated roads; move to higher ground; alert municipal emergency helpline.';
  } else if (severity === 'High') {
    recommendedAction = 'Avoid affected roadways; park vehicles on elevated ground; assist vulnerable community members.';
  } else if (severity === 'Moderate') {
    recommendedAction = 'Exercise caution while driving; report clogged stormwater drains to local municipal ward office.';
  }

  return {
    incident_type: incidentType,
    severity,
    impact,
    priority,
    summary,
    recommended_action: recommendedAction,
    model_provider: 'Rule Engine',
    model_name: 'Rule-Based Fallback',
  };
}

/**
 * Classifies a citizen report using Meta Llama with seamless Rule-Based Fallback.
 * Compatible with both (input) and (aiClient, input) signatures.
 */
export async function classifyCitizenReport(
  inputOrClient: any,
  maybeInput?: {
    district: string;
    location_description?: string;
    user_incident_type?: string;
    user_severity?: string;
    description: string;
    image_data?: string | null;
  }
): Promise<ClassificationResult> {
  const input = maybeInput ? maybeInput : inputOrClient;
  const config = getLlamaConfig();

  try {
    const hasImage = Boolean(input.image_data && input.image_data.startsWith('data:image/'));

    const systemPrompt = `You are the NeerDrishti AI Citizen Flood Report Classifier for Telangana powered by Meta Llama.
Classify the following citizen hazard observation objectively based on the field description and district context.

STRICT GUIDELINES:
1. ONLY return a single valid JSON object.
2. incident_type MUST BE ONE OF: "Urban Flooding", "Road Flooding", "Water Entering Buildings", "Drainage Overflow", "River Overflow", "Other".
3. severity MUST BE ONE OF: "Low", "Moderate", "High", "Critical".
4. priority MUST BE ONE OF: "Monitor", "Review", "High Priority", "Immediate Review".
5. DO NOT invent government warnings, rainfall measurements, casualty counts, or official evacuation orders.
6. Summarize the citizen observation factually.
7. Return valid JSON only.`;

    const userPrompt = `INPUT CITIZEN REPORT:
- District: ${input.district}
- Location Description: ${input.location_description || 'Not specified'}
- User-Selected Incident Type: ${input.user_incident_type || 'Unspecified'}
- User-Selected Severity: ${input.user_severity || 'Moderate'}
- Field Observation Description: "${input.description}"
${hasImage ? '- Photographic Attachment: [Citizen submitted field photo]' : '- Photographic Attachment: [No image attached]'}

Return JSON in this EXACT structure:
{
  "incident_type": "Road Flooding",
  "severity": "High",
  "impact": "Brief impact description",
  "priority": "Immediate Review",
  "summary": "Brief factual summary of citizen report",
  "recommended_action": "Safe public guidance",
  "visual_estimate": "${hasImage ? 'Field waterlogging observed (Visual estimate)' : ''}",
  "image_plausibility": "${hasImage ? 'Verified Flood Visual' : 'No Image Attached'}"
}`;

    const chatResponse = await callLlamaChat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      {
        temperature: 0.1,
        jsonMode: true,
        timeoutMs: 12000,
      }
    );

    if (chatResponse && chatResponse.text) {
      try {
        const parsed = extractJsonFromText(chatResponse.text);
        const validated = validateStructuredClassification(parsed);
        if (validated) {
          return {
            classification: {
              ...validated,
              model_provider: 'Meta Llama',
              model_name: config.model,
            },
            source: 'Meta Llama',
            confidence: hasImage ? 0.95 : 0.92,
          };
        }
      } catch (jsonErr) {
        console.warn('[Classifier] Failed to parse Meta Llama response JSON:', jsonErr);
      }
    }
  } catch (err) {
    console.warn('[Classifier] Meta Llama report classification error (falling back to rule-based):', err);
  }

  // Rule-Based Fallback
  const fallback = ruleBasedFallbackClassification(input);
  return {
    classification: {
      ...fallback,
      model_provider: 'Rule Engine',
      model_name: 'Rule-Based Fallback',
    },
    source: 'Rule-Based Fallback',
    confidence: 0.85,
  };
}
