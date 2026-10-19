import { DistrictStatus } from '../types';
import { DistrictForecastTimeline, DistrictForecastPoint } from './signals';
import { DistrictAlert } from './alerts';

export type UserQuestionIntent =
  | 'DISTRICT_RISK'
  | 'FORECAST'
  | 'ALERT_EXPLANATION'
  | 'DISTRICT_COMPARISON'
  | 'BASIN_INFORMATION'
  | 'CITIZEN_REPORT_SUMMARY'
  | 'SAFETY_GUIDANCE'
  | 'DATA_LIMITATION'
  | 'GENERAL_PROJECT_INFORMATION';

export interface IntentDetectionResult {
  intent: UserQuestionIntent;
  confidence: number;
  detectedDistricts: string[];
  primaryDistrict?: string;
  secondaryDistrict?: string;
  horizon?: string;
  language: 'en' | 'te' | 'hi';
  isComparison: boolean;
  rawQuery: string;
}

export interface KnowledgeSnippet {
  documentId: string;
  title: string;
  category: 'district' | 'flood_safety' | 'basins' | 'project' | 'general';
  content: string;
  relevanceScore: number;
}

export interface DistrictComparisonSummary {
  districtA: string;
  districtIdA: string;
  scoreA: number;
  categoryA: string;
  rainfall24hA: number;
  alertLevelA: string;
  forecastTrendA: string;
  projectedPeakA: number;
  citizenReportsA: number;
  dataConfidenceA: string;
  dataModeA: string;
  basinA: string;

  districtB: string;
  districtIdB: string;
  scoreB: number;
  categoryB: string;
  rainfall24hB: number;
  alertLevelB: string;
  forecastTrendB: string;
  projectedPeakB: number;
  citizenReportsB: number;
  dataConfidenceB: string;
  dataModeB: string;
  basinB: string;

  scoreDifference: number; // scoreA - scoreB
  higherRiskDistrict: string;
  rainfallDifference: number; // rainfall24hA - rainfall24hB
  higherRainfallDistrict: string;
  alertComparison: string;
  comparisonTakeaway: string;
}

export interface ForecastMatrixSummary {
  highestProjectedDistrict: string;
  highestProjectedScore: number;
  highestProjectedHorizon: string;
  risingTrendDistricts: string[];
  criticalProjectionDistricts: string[];
  highProjectionDistricts: string[];
  totalRisingCount: number;
  horizonSummary: string;
}

export interface AlertSummaryEvidence {
  activeCriticalDistricts: string[];
  activeHighDistricts: string[];
  activeWatchDistricts: string[];
  totalActiveAlerts: number;
  targetDistrictAlert?: {
    districtName: string;
    alertLevel: string;
    alertType: string;
    triggerReasons: string[];
    confidence: string;
    isBasinThreat: boolean;
    isCitizenSurge: boolean;
    isRapidEscalation: boolean;
  };
}

export interface BasinEvidence {
  districtName?: string;
  riverBasin?: string;
  upstreamDistricts: string[];
  downstreamDistricts: string[];
  propagationSurgePoints: number;
  travelTimeHours?: string;
  basinSummary: string;
}

export interface CitizenSummaryEvidence {
  districtName: string;
  totalReports: number;
  reports24h: number;
  highSeverityReports: number;
  criticalReports: number;
  citizenReportScore: number;
  contributionPoints: number;
  recentTrend: string;
  explainability?: string;
}

export interface IoTEvidence {
  activeMode: string;
  totalDevices: number;
  districtDevicesCount: number;
  devices: Array<{
    deviceId: string;
    sensorType: string;
    value: number;
    unit: string;
    status: string;
    isVirtual: boolean;
  }>;
}

export interface DataProvenanceSummary {
  dataMode: 'Live Data' | 'Historical Data' | 'Simulated Data' | 'Prototype Baseline' | 'Limited Data' | string;
  dataConfidence: 'High' | 'Medium' | 'Low' | 'Prototype' | string;
  riskCompletenessPercentage: number;
  sourcesAttribution: string[];
  limitations: string[];
  isSimulated: boolean;
  isPrototype: boolean;
}

export interface EvidencePackage {
  query: string;
  intent: UserQuestionIntent;
  language: 'en' | 'te' | 'hi';
  primaryDistrict?: DistrictStatus;
  secondaryDistrict?: DistrictStatus;
  comparisonSummary?: DistrictComparisonSummary;
  forecastMatrixSummary?: ForecastMatrixSummary;
  alertSummary?: AlertSummaryEvidence;
  basinEvidence?: BasinEvidence;
  citizenSummary?: CitizenSummaryEvidence;
  iotEvidence?: IoTEvidence;
  knowledgeSnippets: KnowledgeSnippet[];
  dataProvenance: DataProvenanceSummary;
  transparencyBadges: string[];
}

export interface GroundedAIResponse {
  answer: string;
  directAnswer: string;
  currentSituation?: string;
  forecastSection?: string;
  mainFactors: string[];
  alertSection?: string;
  recommendedPrecautions: string[];
  dataMode: string;
  confidence: string;
  limitations: string;
  teluguSummary?: string;
  hindiSummary?: string;
  evidenceUsed: string[];
  transparencyBadges: string[];
  intent: UserQuestionIntent;
  districtsInvolved: string[];
  isSimulated: boolean;
  isPrototype: boolean;
  source: 'Meta Llama' | 'Deterministic Fallback' | 'Rule-Based Fallback';
  timestamp: string;
}
