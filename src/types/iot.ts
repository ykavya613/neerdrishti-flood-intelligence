export type DataSourceMode =
  | 'SIMULATION'
  | 'PROTOTYPE'
  | 'LIVE'
  | 'IOT'
  | 'HISTORICAL'
  | 'OFFLINE';

export type SensorType =
  | 'rainfall'
  | 'water_level'
  | 'flow_rate'
  | 'reservoir_level'
  | 'drainage_status'
  | 'temperature'
  | 'humidity';

export type SourceHealthState =
  | 'HEALTHY'
  | 'STALE'
  | 'DEGRADED'
  | 'OFFLINE'
  | 'UNKNOWN';

export type SensorValidationStatus =
  | 'VALID'
  | 'INVALID'
  | 'OUT_OF_BOUNDS'
  | 'FUTURE_TIMESTAMP'
  | 'DUPLICATE'
  | 'STALE'
  | 'MALFORMED';

export type DataConfidence = 'High' | 'Medium' | 'Low' | 'Prototype';

export interface UnifiedSensorReading {
  reading_id?: string;
  source_id: string;
  district_id: string;
  district_name?: string;
  device_id: string;
  sensor_type: SensorType;
  value: number;
  unit: string;
  timestamp: string;
  mode: DataSourceMode;
  confidence: DataConfidence;
  validation_status: SensorValidationStatus;
  raw_payload?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface DataSourceMetadata {
  source_id: string;
  source_name: string;
  source_type: string;
  mode: DataSourceMode;
  status: 'ACTIVE' | 'STANDBY' | 'DEGRADED' | 'OFFLINE';
  health: SourceHealthState;
  coverage: string;
  last_updated: string;
  data_confidence: DataConfidence;
  latency_ms: number;
  device_count: number;
  error_message?: string;
  is_virtual: boolean;
  supported_sensors: SensorType[];
  description: string;
}

export interface IoTDevice {
  device_id: string;
  device_name: string;
  district_id: string;
  district_name: string;
  sensor_type: SensorType;
  status: 'ONLINE' | 'STANDBY' | 'DEGRADED' | 'OFFLINE';
  mode: DataSourceMode;
  current_value: number;
  unit: string;
  last_seen: string;
  battery_level: number; // percentage (0-100)
  signal_strength: number; // percentage (0-100)
  data_confidence: DataConfidence;
  health: SourceHealthState;
  hardware_profile: string; // e.g. 'Virtual ESP32 Simulator' or 'ESP32 Hardware Node'
  location_description: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  lat?: number;
  lng?: number;
  is_virtual: boolean;
  history?: Array<{
    timestamp: string;
    value: number;
  }>;
}

export interface DataIngestPayload {
  source_id?: string;
  device_id: string;
  district_id: string;
  sensor_type: SensorType;
  value: number;
  unit?: string;
  timestamp?: string;
  mode?: DataSourceMode;
  battery_level?: number;
  signal_strength?: number;
  metadata?: Record<string, any>;
}

export interface DataHealthResponse {
  system_health: SourceHealthState;
  active_mode: DataSourceMode;
  total_sources: number;
  healthy_sources: number;
  stale_sources: number;
  degraded_sources: number;
  offline_sources: number;
  total_devices: number;
  online_devices: number;
  sources: DataSourceMetadata[];
  last_evaluated: string;
}
