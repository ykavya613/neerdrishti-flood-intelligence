export type AlertLevel = 'NORMAL' | 'WATCH' | 'ELEVATED' | 'HIGH' | 'CRITICAL';

export type AlertType =
  | 'Current Risk Alert'
  | 'Forecast Escalation'
  | 'Rapid Risk Increase'
  | 'Citizen Report Surge'
  | 'Basin Propagation Watch'
  | 'Critical Projection'
  | 'Data Uncertainty Notice';

export type AlertStatus = 'Active' | 'Acknowledged' | 'Resolved' | 'Expired';

export interface TriggerSignal {
  signal_type: 'CURRENT_RISK' | 'FORECAST_PEAK' | 'RATE_OF_INCREASE' | 'CITIZEN_REPORTS' | 'BASIN_PROPAGATION' | 'DATA_QUALITY';
  severity: 'INFO' | 'MODERATE' | 'HIGH' | 'CRITICAL';
  description: string;
  evidence: string;
  threshold_matched: string;
}

export interface DistrictAdvisory {
  title: string;
  situation_summary: string;
  why_triggered: string;
  recommended_precautions: string[];
  uncertainty_notice: string;
  authority_disclaimer: string;
}

export type BilingualAdvisory = DistrictAdvisory;

export interface MultilingualAdvisory {
  english: DistrictAdvisory;
  telugu: DistrictAdvisory;
  hindi: DistrictAdvisory;
}

export interface DistrictAlert {
  alert_id: string;
  district_id: string;
  district_name: string;
  region_zone: string;
  alert_level: AlertLevel;
  alert_level_code: number; // 0: NORMAL, 1: WATCH, 2: ELEVATED, 3: HIGH, 4: CRITICAL
  primary_alert_type: AlertType;
  headline: string;
  trigger_reasons: string[];
  trigger_signals: TriggerSignal[];
  current_risk: number;
  projected_risk: number;
  peak_horizon: string; // "NOW", "+3H", "+6H", "+12H", "+24H"
  trend: 'RISING' | 'STABLE' | 'IMPROVING';
  rate_of_change: 'STABLE' | 'MODERATE_RISE' | 'RAPID_ESCALATION' | 'IMPROVING';
  risk_delta: number; // peak projected - current
  forecast_delta: number; // +6H projected - current
  citizen_signal: {
    total_24h: number;
    high_severity_count: number;
    critical_count: number;
    growth_trend: 'Increasing' | 'Stable' | 'Decreasing';
    is_surging: boolean;
    score_contribution: number;
    summary: string;
  };
  basin_signal: {
    has_upstream_threat: boolean;
    upstream_districts: string[];
    projected_surge_score: number;
    estimated_travel_window_hours?: number;
    summary: string;
  };
  confidence: 'High' | 'Medium' | 'Low' | 'Prototype';
  confidence_score: number;
  forecast_confidence: string;
  data_mode: string;
  model_limitations: string[];
  advisories: {
    english: DistrictAdvisory;
    telugu: DistrictAdvisory;
    hindi: DistrictAdvisory;
  };
  timeline_escalation: Array<{
    horizon: string;
    hours: number;
    projected_risk: number;
    outlook: string;
    escalation_flag: boolean;
  }>;
  secondary_alerts: Array<{
    alert_type: AlertType;
    level: AlertLevel;
    reason: string;
  }>;
  status: AlertStatus;
  created_at: string;
  updated_at: string;
}

export interface AlertSummaryMetrics {
  total_districts: number;
  total_active_alerts: number; // non-normal active count
  normal_count: number;
  watch_count: number;
  elevated_count: number;
  high_count: number;
  critical_count: number;
  rising_trend_count: number;
  rapid_escalation_count: number;
  basin_threat_count: number;
  citizen_surge_count: number;
  top_escalating_districts: Array<{
    district_id: string;
    district_name: string;
    current_risk: number;
    peak_risk: number;
    peak_horizon: string;
    risk_delta: number;
    alert_level: AlertLevel;
  }>;
  highest_severity_district?: {
    district_id: string;
    district_name: string;
    alert_level: AlertLevel;
    alert_type: AlertType;
    peak_risk: number;
    peak_horizon: string;
  };
  last_recalculated_at: string;
}
