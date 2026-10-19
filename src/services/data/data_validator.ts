import { 
  UnifiedSensorReading, 
  SensorValidationStatus, 
  SensorType, 
  DataConfidence, 
  SourceHealthState,
  DataSourceMode,
  DataIngestPayload
} from '../../types/iot';
import { normalizeDistrict } from '../district_normalizer';

export interface ValidationResult {
  valid: boolean;
  status: SensorValidationStatus;
  error?: string;
  normalized?: UnifiedSensorReading;
}

class DataValidator {
  private recentReadingsCache: Map<string, { timestamp: number; value: number }> = new Map();
  private maxCacheSize: number = 2000;

  /**
   * Comprehensive validation pipeline for incoming sensor telemetry.
   */
  public validateSensorReading(
    rawPayload: DataIngestPayload | Record<string, any>,
    forcedMode?: DataSourceMode
  ): ValidationResult {
    if (!rawPayload || typeof rawPayload !== 'object') {
      return {
        valid: false,
        status: 'MALFORMED',
        error: 'Payload is null, undefined, or not a valid JSON object.',
      };
    }

    const payloadAny = rawPayload as Record<string, any>;
    const device_id = (payloadAny.device_id || payloadAny.source_id || '').trim();
    if (!device_id) {
      return {
        valid: false,
        status: 'MALFORMED',
        error: 'Missing required field: device_id or source_id.',
      };
    }

    const rawDistrict = payloadAny.district_id || payloadAny.district;
    if (!rawDistrict) {
      return {
        valid: false,
        status: 'MALFORMED',
        error: 'Missing required field: district_id.',
      };
    }

    const normDistrict = normalizeDistrict(rawDistrict);
    if (!normDistrict.resolved) {
      return {
        valid: false,
        status: 'INVALID',
        error: `Unrecognized or non-Telangana district: '${rawDistrict}'. Must match one of 33 canonical Telangana districts.`,
      };
    }

    const sensor_type = (rawPayload.sensor_type || '').toLowerCase().trim() as SensorType;
    const validSensorTypes: SensorType[] = [
      'rainfall',
      'water_level',
      'flow_rate',
      'reservoir_level',
      'drainage_status',
      'temperature',
      'humidity',
    ];
    if (!validSensorTypes.includes(sensor_type)) {
      return {
        valid: false,
        status: 'INVALID',
        error: `Invalid sensor_type: '${sensor_type}'. Must be one of: ${validSensorTypes.join(', ')}.`,
      };
    }

    const rawVal = rawPayload.value;
    if (typeof rawVal !== 'number' || isNaN(rawVal) || !isFinite(rawVal)) {
      return {
        valid: false,
        status: 'INVALID',
        error: `Invalid numeric value: ${rawVal}. Value must be a finite number.`,
      };
    }

    // Range / bounds validation
    const boundsCheck = this.validateBounds(sensor_type, rawVal);
    if (!boundsCheck.valid) {
      return {
        valid: false,
        status: 'OUT_OF_BOUNDS',
        error: boundsCheck.error,
      };
    }

    // Timestamp validation
    const now = Date.now();
    let readingTime = now;
    if (rawPayload.timestamp) {
      const parsedTime = new Date(rawPayload.timestamp).getTime();
      if (isNaN(parsedTime)) {
        return {
          valid: false,
          status: 'MALFORMED',
          error: `Malformed ISO timestamp string: '${rawPayload.timestamp}'.`,
        };
      }
      readingTime = parsedTime;
    }

    // Prevent future timestamps (> 1 minute clock skew allowance)
    if (readingTime > now + 60_000) {
      return {
        valid: false,
        status: 'FUTURE_TIMESTAMP',
        error: `Future timestamp detected: ${new Date(readingTime).toISOString()} is ahead of server time ${new Date(now).toISOString()}.`,
      };
    }

    // Check for excessive staleness (> 48 hours without historical mode)
    const mode: DataSourceMode = forcedMode || rawPayload.mode || (device_id.includes('VIRTUAL') ? 'IOT' : 'PROTOTYPE');
    const isStale = readingTime < now - (48 * 3600 * 1000);
    if (isStale && mode !== 'HISTORICAL') {
      return {
        valid: false,
        status: 'STALE',
        error: `Stale telemetry rejected: reading is older than 48 hours (${new Date(readingTime).toISOString()}).`,
      };
    }

    // Duplicate detection (same device within 1000ms with identical value)
    const cacheKey = `${device_id}_${sensor_type}`;
    const cached = this.recentReadingsCache.get(cacheKey);
    if (cached && Math.abs(cached.timestamp - readingTime) < 1000 && Math.abs(cached.value - rawVal) < 0.0001) {
      return {
        valid: false,
        status: 'DUPLICATE',
        error: `Duplicate telemetry reading rejected for device ${device_id} at timestamp ${new Date(readingTime).toISOString()}.`,
      };
    }

    // Update cache
    this.updateCache(cacheKey, readingTime, rawVal);

    // Compute standard default unit
    const unit = rawPayload.unit || this.getDefaultUnit(sensor_type);

    // Calculate sensor data confidence
    const confidence = this.calculateConfidence(mode, readingTime, 'ONLINE', true);

    const normalized: UnifiedSensorReading = {
      reading_id: `read_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      source_id: rawPayload.source_id || (device_id.includes('VIRTUAL') ? 'neerdrishti-virtual-iot' : 'external-iot-gateway'),
      device_id,
      district_id: normDistrict.districtId,
      district_name: normDistrict.canonicalName,
      sensor_type,
      value: Math.round(rawVal * 100) / 100,
      unit,
      timestamp: new Date(readingTime).toISOString(),
      mode,
      confidence,
      validation_status: 'VALID',
      raw_payload: rawPayload as Record<string, any>,
      metadata: rawPayload.metadata || {},
    };

    return {
      valid: true,
      status: 'VALID',
      normalized,
    };
  }

  private validateBounds(sensorType: SensorType, val: number): { valid: boolean; error?: string } {
    switch (sensorType) {
      case 'rainfall':
        if (val < 0) return { valid: false, error: `Rainfall value cannot be negative: ${val} mm.` };
        if (val > 500) return { valid: false, error: `Rainfall value exceeds maximum plausible threshold (500 mm): ${val} mm.` };
        return { valid: true };
      case 'water_level':
        if (val < 0) return { valid: false, error: `Water level cannot be negative: ${val} m.` };
        if (val > 50) return { valid: false, error: `Water gauge height exceeds maximum plausible river depth (50 m): ${val} m.` };
        return { valid: true };
      case 'flow_rate':
        if (val < 0) return { valid: false, error: `River flow rate cannot be negative: ${val} cumecs.` };
        if (val > 100000) return { valid: false, error: `Flow rate exceeds physical channel bounds (100,000 cumecs): ${val}.` };
        return { valid: true };
      case 'reservoir_level':
        if (val < 0) return { valid: false, error: `Reservoir level cannot be negative: ${val} m.` };
        if (val > 1000) return { valid: false, error: `Reservoir gauge height exceeds maximum dam crest MSL datum: ${val} m.` };
        return { valid: true };
      case 'drainage_status':
        if (val < 0 || val > 100) return { valid: false, error: `Drainage clearance index must be between 0 (blocked) and 100 (optimal): ${val}.` };
        return { valid: true };
      case 'temperature':
        if (val < -10 || val > 65) return { valid: false, error: `Ambient temperature outside realistic meteorological bounds (-10°C to 65°C): ${val}°C.` };
        return { valid: true };
      case 'humidity':
        if (val < 0 || val > 100) return { valid: false, error: `Relative humidity percentage must be between 0% and 100%: ${val}%.` };
        return { valid: true };
      default:
        return { valid: true };
    }
  }

  private getDefaultUnit(sensorType: SensorType): string {
    switch (sensorType) {
      case 'rainfall': return 'mm';
      case 'water_level': return 'm';
      case 'flow_rate': return 'cumecs';
      case 'reservoir_level': return 'm';
      case 'drainage_status': return '%';
      case 'temperature': return '°C';
      case 'humidity': return '%';
      default: return '';
    }
  }

  /**
   * Calculates isolated Sensor Data Confidence.
   */
  public calculateConfidence(
    mode: DataSourceMode,
    timestampMs: number,
    deviceStatus: 'ONLINE' | 'STANDBY' | 'DEGRADED' | 'OFFLINE',
    isValid: boolean
  ): DataConfidence {
    if (!isValid || deviceStatus === 'OFFLINE') return 'Low';

    const ageMinutes = (Date.now() - timestampMs) / (60 * 1000);

    if (mode === 'LIVE') {
      if (ageMinutes <= 30 && deviceStatus === 'ONLINE') return 'High';
      if (ageMinutes <= 120) return 'Medium';
      return 'Low';
    }

    if (mode === 'IOT') {
      if (ageMinutes <= 15 && deviceStatus === 'ONLINE') return 'Prototype';
      return 'Low';
    }

    if (mode === 'SIMULATION') {
      return 'Prototype';
    }

    if (mode === 'PROTOTYPE') {
      return 'Prototype';
    }

    if (mode === 'HISTORICAL') {
      return 'Medium';
    }

    return 'Low';
  }

  /**
   * Evaluates operational health of a data source.
   */
  public evaluateHealth(
    lastSeenMs: number,
    status: 'ACTIVE' | 'STANDBY' | 'DEGRADED' | 'OFFLINE',
    errorRate: number = 0
  ): SourceHealthState {
    if (status === 'OFFLINE') return 'OFFLINE';
    if (errorRate > 0.4) return 'DEGRADED';

    const ageHours = (Date.now() - lastSeenMs) / (3600 * 1000);
    if (ageHours <= 2) return 'HEALTHY';
    if (ageHours <= 12) return 'STALE';
    if (ageHours <= 24) return 'DEGRADED';
    return 'OFFLINE';
  }

  private updateCache(key: string, timestamp: number, value: number) {
    if (this.recentReadingsCache.size > this.maxCacheSize) {
      const oldestKeys = Array.from(this.recentReadingsCache.keys()).slice(0, 500);
      for (const k of oldestKeys) {
        this.recentReadingsCache.delete(k);
      }
    }
    this.recentReadingsCache.set(key, { timestamp, value });
  }

  public clearCache() {
    this.recentReadingsCache.clear();
  }
}

export const dataValidator = new DataValidator();
