import { 
  DistrictSituation, 
  OperationalSituationCategory, 
  SignalCoverage, 
  RiskDriver,
  HydrologicalDistrictSummary,
  ForecastDataMode,
  ForecastHorizonHours,
  RiskTrend,
  ForecastConfidenceLevel,
  ForecastOutlookCategory,
  BasinConnection,
  BasinInfluenceSummary,
  ForecastDriver,
  DistrictForecastPoint,
  DistrictForecastTimeline
} from './types/signals';

export type { 
  DistrictSituation, 
  OperationalSituationCategory, 
  SignalCoverage, 
  RiskDriver,
  HydrologicalDistrictSummary,
  ForecastDataMode,
  ForecastHorizonHours,
  RiskTrend,
  ForecastConfidenceLevel,
  ForecastOutlookCategory,
  BasinConnection,
  BasinInfluenceSummary,
  ForecastDriver,
  DistrictForecastPoint,
  DistrictForecastTimeline
};

export type RiskCategory = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export type MonitoringCategory =
  | 'Priority Flood Monitoring'
  | 'Standard Monitoring'
  | 'Limited Data';

export type DataSourceMode =
  | 'Live Data'
  | 'Historical Data'
  | 'Simulated Data'
  | 'Prototype Baseline'
  | 'Limited Data';

export type DataConfidence =
  | 'High'
  | 'Medium'
  | 'Low'
  | 'Prototype';

export interface DistrictMetadata {
  district_id: string;
  district_name: string;
  latitude: number | null;
  longitude: number | null;
  monitoring_category: MonitoringCategory;
  data_source_mode: DataSourceMode;
  data_confidence: DataConfidence;
  data_provenance: string;
  last_verified?: string;
  region_zone: string;
  simulation_zone: string;
  river_basin_context?: string;
  terrain_context?: string;
  historical_flood_context?: string;
  prototype_vulnerability_score?: number;
  data_limitation_notes?: string;
  category_basis?: string;
}

export interface DistrictStatus {
  district: string;
  district_id?: string;
  lat: number;
  lng: number;
  terrain_type: string;
  river_basin: string;
  monitoring_category: MonitoringCategory;
  data_source_mode: DataSourceMode;
  data_confidence: DataConfidence;
  data_provenance: string;
  data_limitation_notes?: string;
  category_basis?: string;
  region_zone?: string;
  simulation_zone?: string;
  last_updated?: string;
  is_simulated?: boolean;
  risk_confidence?: DataConfidence;
  risk_data_completeness?: number; // 0 - 100 percentage
  rainfall_mm_24h: number;
  rainfall_mm_3h: number;
  rainfall_score: number;
  rainfall_source?: string;
  rainfall_data_mode?: 'LIVE' | 'HISTORICAL' | 'SIMULATED' | 'UNAVAILABLE';
  rainfall_freshness?: 'FRESH' | 'AGING' | 'STALE' | 'EXPIRED';
  rainfall_confidence?: number;
  rainfall_recorded_at?: string;
  rainfall_selection_reason?: string;
  hydrological_summary?: HydrologicalDistrictSummary;
  situation_summary?: DistrictSituation;
  forecast_timeline?: DistrictForecastTimeline;
  forecast_summary?: DistrictForecastPoint;
  alert_intelligence?: DistrictAlert;
  flood_history_score: number;
  location_risk_score: number;
  drainage_vulnerability_score: number;
  citizen_reports_count: number;
  citizen_reports_24h?: number;
  citizen_reports_high_severity: number;
  citizen_reports_critical?: number;
  citizen_report_score: number;
  citizen_reports_trend?: 'Increasing' | 'Stable' | 'Decreasing';
  citizen_explainability?: string;
  flood_risk_score: number;
  risk_category: RiskCategory;
  contributions: {
    rainfall: number;
    flood_history: number;
    location_risk: number;
    citizen_reports: number;
    drainage_vulnerability: number;
  };
  components: {
    rainfall_score: number;
    flood_history_score: number;
    location_risk_score: number;
    citizen_report_score: number;
    drainage_vulnerability_score: number;
  };
  major_past_events?: string;
  vulnerable_hotspots?: string;
  primary_nala_network?: string;
  encroachment_level?: string;
}

export type IncidentType =
  | 'Urban Flooding'
  | 'Road Flooding'
  | 'Water Entering Buildings'
  | 'Drainage Overflow'
  | 'River Overflow'
  | 'Other';

export type ReportSeverity = 'Low' | 'Moderate' | 'High' | 'Critical';

export type ReportPriority =
  | 'Monitor'
  | 'Review'
  | 'High Priority'
  | 'Immediate Review';

export type ReportStatus =
  | 'New'
  | 'Reviewed'
  | 'Validated'
  | 'Resolved'
  | 'Rejected';

export type ClassificationSource =
  | 'Meta Llama'
  | 'Rule-Based Fallback'
  | 'Manual Input';

export interface CitizenReport {
  id: number;
  district_id?: string;
  district?: string;
  location_description?: string | null;
  location?: string;
  incident_type: IncidentType | string;
  severity: ReportSeverity;
  description: string;
  image_reference?: string | null;
  image_url?: string | null;
  reported_at: string;
  created_at?: string;
  classification_source: ClassificationSource;
  classification_confidence?: number;
  ai_processed?: number;
  status: ReportStatus;
  // Joined classification fields
  impact?: string;
  priority?: ReportPriority | string;
  summary?: string;
  ai_summary?: string;
  recommended_action?: string;
  model_provider?: string;
  model_name?: string;
  processing_timestamp?: string;
  ai_category?: string;
  ai_severity?: string;
}

export interface ReportClassification {
  id?: number;
  report_id: number;
  incident_type: IncidentType;
  severity: ReportSeverity;
  impact: string;
  priority: ReportPriority;
  summary: string;
  recommended_action: string;
  model_provider: string;
  model_name: string;
  processing_timestamp: string;
}

export interface AIReasoningResponse {
  situation_summary: string;
  main_risk_factors: string[];
  explanation_of_risk: string;
  recommended_actions: string[];
  english_advisory: string;
  telugu_advisory: string;
  evidence_used: string[];
  data_limitation_statement: string;
}

export type SimulationScenarioName = 
  | 'Normal Conditions' 
  | 'Heavy Rainfall' 
  | 'Flood Warning' 
  | 'Critical Flood Event';

export interface DashboardOverview {
  total_districts: number;
  priority_count: number;
  standard_count: number;
  limited_count: number;
  high_risk_count: number;
  critical_risk_count: number;
  highest_risk_district?: string;
  highest_risk_score?: number;
  highest_risk_category?: RiskCategory;
}

export type RegionZoneOption =
  | 'All'
  | 'North Telangana'
  | 'Central Telangana'
  | 'Hyderabad Urban Region'
  | 'Godavari Influence Region'
  | 'South Telangana'
  | 'Krishna Influence Region';

import { DistrictAlert } from './types/alerts';

// Export Universal Signal Types for Phase D1
export * from './types/signals';

// Export Alert Intelligence Types for Phase F
export * from './types/alerts';

// Export Grounded AI Assistant & RAG Types for Phase G
export * from './types/ai';
