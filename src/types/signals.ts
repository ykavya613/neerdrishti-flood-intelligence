/**
 * Universal Signal & Data Source Models for NeerDrishti Flood Intelligence
 * Phase D1: Real-time Data Foundation
 */

export type SignalDataMode = 'LIVE' | 'HISTORICAL' | 'SIMULATED' | 'UNAVAILABLE';

export type SignalFreshness = 'FRESH' | 'AGING' | 'STALE' | 'EXPIRED';

export type SignalType =
  | 'rainfall'
  | 'weather'
  | 'river_level'
  | 'river_flow'
  | 'reservoir_level'
  | 'reservoir_storage'
  | 'reservoir_release'
  | 'dam_discharge'
  | 'hydrological_alert'
  | 'citizen_report';

export type HydrologicalTrend = 'RISING' | 'STABLE' | 'FALLING' | 'UNKNOWN';

export type HydrologicalStatus = 'NORMAL' | 'WATCH' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';

export type HydrologicalAnomalyType =
  | 'RAPID_LEVEL_RISE'
  | 'SUDDEN_DISCHARGE_SPIKE'
  | 'UNUSUAL_RESERVOIR_RELEASE'
  | 'MISSING_EXPECTED_UPDATE'
  | 'CONTRADICTORY_READINGS';

export interface HydrologicalStation {
  station_id: string;
  station_name: string;
  water_body_name: string;
  water_body_type: 'RIVER' | 'RESERVOIR' | 'BARRAGE' | 'LAKE_CASCADE' | 'DRAINAGE_CHANNEL';
  district_id: string;
  basin?: string;
  latitude?: number;
  longitude?: number;
  warning_threshold?: number;
  danger_threshold?: number;
  unit: string;
  active: boolean;
  metadata?: {
    reference_type?: 'HISTORICAL_REFERENCE' | 'SIMULATION_REFERENCE' | 'UNVERIFIED_REFERENCE' | 'OFFICIAL_TELEMETRY';
    gauge_zero_elevation_m?: number;
    full_reservoir_level?: number;
    gross_storage_tmc?: number;
    catchment_area_sqkm?: number;
    description?: string;
    source?: string;
    [key: string]: any;
  };
}

export interface HydrologicalAnomaly {
  anomaly_id?: string;
  station_id?: string;
  district_id: string;
  type: HydrologicalAnomalyType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  detected_at: string;
  confidence: number;
  supporting_observations?: any[];
}

export interface HydrologicalObservation {
  id?: number | string;
  station_id?: string;
  station_name?: string;
  water_body_name?: string;
  water_body_type?: string;
  district_id: string;
  district_name?: string;
  signal_type: SignalType;
  value: number;
  unit: string;
  data_mode: SignalDataMode;
  freshness: SignalFreshness;
  confidence: number;
  status: HydrologicalStatus;
  trend: HydrologicalTrend;
  warning_threshold?: number;
  danger_threshold?: number;
  rate_of_change?: number; // e.g. change in meters or cusecs per hour
  source_name: string;
  source_type: SourceType;
  recorded_at: string;
  ingested_at: string;
  is_valid: boolean;
  metadata?: Record<string, any>;
}

export interface HydrologicalDistrictSummary {
  district_id: string;
  district_name: string;
  active_stations_count: number;
  primary_water_body?: string;
  water_body_type?: string;
  latest_value?: number;
  unit?: string;
  dominant_status: HydrologicalStatus;
  dominant_trend: HydrologicalTrend;
  latest_observations: HydrologicalObservation[];
  anomalies: HydrologicalAnomaly[];
  data_mode: SignalDataMode;
  freshness: SignalFreshness;
  confidence?: number;
  overall_confidence: number;
  source_name?: string;
  source_attribution: string;
  hydrological_context_summary: string;
  has_active_warning: boolean;
  has_active_danger: boolean;
  has_anomaly?: boolean;
  anomaly_desc?: string;
  warning_threshold?: number;
  danger_threshold?: number;
  recorded_at?: string;
  last_updated: string;
}

export type SourceType =
  | 'official_api'
  | 'weather_service'
  | 'historical_archive'
  | 'simulation_engine'
  | 'crowdsourced';

export interface UniversalSignal {
  id?: string | number;
  districtId: string;
  sourceName: string;
  sourceType: SourceType;
  signalType: SignalType;
  value: number;
  unit: string;
  dataMode: SignalDataMode;
  freshness: SignalFreshness;
  confidence: number; // 0.0 to 1.0
  isValid: boolean;
  recordedAt: string; // ISO 8601
  ingestedAt: string; // ISO 8601
  metadata?: Record<string, any>;
}

export interface DataSourceRegistryEntry {
  sourceName: string;
  sourceType: SourceType;
  supportedSignals: SignalType[];
  enabled: boolean;
  priority: number; // 1 = highest, 4 = lowest
  refreshIntervalMinutes: number;
  baseConfidence: number; // 0.0 to 1.0
  currentMode: SignalDataMode;
  health: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNAVAILABLE';
  lastSuccessfulUpdate: string | null;
  description?: string;
}

export interface SignalValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedValue?: number;
}

export interface SignalFreshnessResult {
  status: SignalFreshness;
  factor: number; // 0.0 to 1.0 (multiplier for confidence/weight)
  ageHours: number;
}

export interface SignalSelectionResult {
  selectedSignal: UniversalSignal | null;
  selectedMode: SignalDataMode;
  selectionReason: string;
  fallbackReason?: string;
  sourceName: string;
  confidence: number;
  freshness: SignalFreshness;
}

export interface DistrictNormalizationResult {
  districtId: string;
  canonicalName: string;
  canonical_id?: string;
  district_name?: string;
  matchType: 'EXACT_ID' | 'EXACT_NAME' | 'NORMALIZED_NAME' | 'ALIAS' | 'UNRESOLVED';
  confidence: number;
  resolved: boolean;
}

export type OperationalSituationCategory =
  | 'NORMAL'
  | 'MONITORING'
  | 'ELEVATED_ATTENTION'
  | 'HIGH_CONCERN'
  | 'CRITICAL_INFORMATIONAL';

export type DataConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'LIMITED';

export interface SignalCoverage {
  available: number;
  total: number;
  ratio: number;
  signals: {
    rainfall: boolean;
    hydrology: boolean;
    citizen: boolean;
    flood_history: boolean;
    drainage_vulnerability: boolean;
  };
}

export interface RiskDriver {
  source: string;
  signal: string;
  importance: 'PRIMARY' | 'SUPPORTING';
  evidence: string;
  freshness?: string;
  confidence?: number;
}

export interface DistrictSituation {
  districtId: string;
  districtName: string;
  compositeRiskScore: number;
  compositeRiskLevel: string;
  operationalSituation: OperationalSituationCategory;
  dataConfidence: DataConfidenceLevel;
  dataConfidenceScore: number;
  signalCoverage: SignalCoverage;
  freshnessSummary: Record<string, string>;
  rainfallSummary: {
    condition: string;
    value_24h: number;
    value_3h: number;
    score: number;
    dataMode: string;
    freshness: string;
    source: string;
  };
  hydrologySummary?: {
    primaryWaterBody?: string;
    waterBodyType?: string;
    latestValue?: number;
    unit?: string;
    dominantStatus: string;
    dominantTrend: string;
    dataMode: string;
    freshness: string;
    source?: string;
    hasAnomaly?: boolean;
    anomalyDesc?: string;
  };
  citizenSummary: {
    totalReports: number;
    highSeverityReports: number;
    criticalReports: number;
    trend: string;
    score: number;
    explainability?: string;
  };
  primaryDrivers: RiskDriver[];
  supportingSignals: RiskDriver[];
  dataLimitations: string[];
  recentAnomalies: any[];
  recommendedActions: string[];
  generatedAt: string;
}

// -------------------------------------------------------------
// PHASE E: PREDICTIVE RISK & FORECAST CONTRACTS
// -------------------------------------------------------------

export type ForecastDataMode = 'LIVE_FORECAST' | 'HISTORICAL_BASELINE' | 'SIMULATED_FORECAST' | 'UNAVAILABLE';

export type ForecastHorizonHours = 0 | 3 | 6 | 12 | 24;

export type RiskTrend = 'RISING' | 'STABLE' | 'IMPROVING' | 'UNCERTAIN';

export type ForecastConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'LIMITED';

export type ForecastOutlookCategory =
  | 'STABLE'
  | 'WATCH_FOR_ESCALATION'
  | 'ELEVATING_RISK'
  | 'HIGH_PROJECTION'
  | 'CRITICAL_PROJECTION'
  | 'UNCERTAIN';

export interface BasinConnection {
  connection_id: string;
  basin_name: string;
  sub_basin?: string;
  upstream_district_id: string;
  downstream_district_id: string;
  water_body_name: string;
  connection_type: string;
  estimated_travel_window_hours: number;
  influence_strength: number;
  relationship_confidence: number;
  data_mode: SignalDataMode;
  source: string;
  notes: string;
}

export interface BasinInfluenceSummary {
  has_upstream_influence: boolean;
  upstream_connections_count: number;
  active_upstream_threats: Array<{
    upstream_district_id: string;
    upstream_district_name: string;
    water_body_name: string;
    travel_window_hours: number;
    estimated_arrival: string;
    upstream_risk_score: number;
    upstream_rainfall_24h?: number;
    upstream_river_status?: string;
    projected_downstream_impact_score: number;
    evidence: string;
  }>;
  total_projected_basin_surge: number;
  basin_summary_text: string;
}

export interface ForecastDriver {
  driverName: string;
  signalType: string;
  importance: 'PRIMARY' | 'SUPPORTING';
  scoreOrSeverity: string | number;
  evidence: string;
  source: string;
  dataMode: ForecastDataMode | SignalDataMode;
  freshness: SignalFreshness;
  confidence: number;
  timestamp: string;
}

export interface DistrictForecastPoint {
  districtId: string;
  districtName: string;
  forecastHorizonHours: ForecastHorizonHours;
  label: string; // e.g. "+3H", "+6H", "+12H", "+24H"
  projectedRiskScore: number;
  currentRiskScore: number;
  projectedRiskChange: number; // projected - current
  riskTrend: RiskTrend;
  outlookCategory: ForecastOutlookCategory;
  confidence: ForecastConfidenceLevel;
  confidenceScore: number;
  confidenceReason: string;
  forecastDataMode: ForecastDataMode;
  projectedRainfall_mm: number;
  projectedRainfallIntensity: 'LIGHT' | 'MODERATE' | 'HEAVY' | 'VERY_HEAVY' | 'EXTREME';
  basinInfluenceContribution: number;
  primaryProjectedDrivers: ForecastDriver[];
  supportingSignals: ForecastDriver[];
  evidence: string[];
  forecastSources: string[];
  limitations: string[];
  generatedAt: string;
  validUntil: string;
  metadata?: Record<string, any>;
}

export interface DistrictForecastTimeline {
  districtId: string;
  districtName: string;
  currentRiskScore: number;
  currentRiskLevel: string;
  currentOperationalCategory: OperationalSituationCategory;
  overallForecastOutlook: ForecastOutlookCategory;
  dominantTrend: RiskTrend;
  maxProjectedRisk: number;
  maxRiskHorizonHours: ForecastHorizonHours;
  timeline: {
    now: {
      riskScore: number;
      riskLevel: string;
      operationalCategory: OperationalSituationCategory;
      timestamp: string;
    };
    h3: DistrictForecastPoint;
    h6: DistrictForecastPoint;
    h12: DistrictForecastPoint;
    h24: DistrictForecastPoint;
  };
  basinInfluence: BasinInfluenceSummary;
  dataConfidence: ForecastConfidenceLevel;
  confidenceReason: string;
  dataMode: ForecastDataMode;
  sourcesAttribution: string[];
  disclaimer: string;
  generatedAt: string;
}

