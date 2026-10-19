import { DistrictMetadata } from '../types';
import { rainfallService } from './rainfall_service';
import { DATA_SOURCES } from '../config/data_sources';

export interface OpenMeteoHourlyResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  hourly_units: {
    time: string;
    precipitation: string;
  };
  hourly: {
    time: string[];
    precipitation: number[];
  };
}

export interface LiveRainfallResult {
  success: boolean;
  district_id: string;
  district_name: string;
  rainfall_mm_24h?: number;
  rainfall_mm_3h?: number;
  recorded_at?: string;
  source_name?: string;
  data_mode?: 'LIVE' | 'HISTORICAL' | 'SIMULATED';
  error?: string;
}

export class OpenMeteoService {
  private refreshTimer: NodeJS.Timeout | null = null;
  private isRefreshing: boolean = false;
  private lastRefreshTime: string | null = null;
  private lastSuccessCount: number = 0;
  private lastFailCount: number = 0;
  private lastErrors: Record<string, string> = {};

  /**
   * Fetches real-time precipitation forecast/observation from Open-Meteo keyless API.
   * Computes 24-hour total and 3-hour precipitation burst for the district coordinates.
   */
  public async fetchLiveRainfallForDistrict(
    district: { district_id: string; district_name: string; latitude: number; longitude: number }
  ): Promise<LiveRainfallResult> {
    const { district_id, district_name, latitude, longitude } = district;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=precipitation&timezone=Asia%2FKolkata`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second network timeout

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'NeerDrishti-Flood-Intelligence/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Open-Meteo HTTP ${response.status}: ${response.statusText}`);
      }

      const data: OpenMeteoHourlyResponse = await response.json();
      if (!data.hourly || !Array.isArray(data.hourly.time) || !Array.isArray(data.hourly.precipitation)) {
        throw new Error('Invalid Open-Meteo payload: hourly precipitation series missing');
      }

      const times = data.hourly.time;
      const precips = data.hourly.precipitation;

      if (times.length === 0 || precips.length === 0) {
        throw new Error('Empty precipitation series received from Open-Meteo');
      }

      // Determine current index based on IST current hour or latest available before/at now
      const now = new Date();
      // Format current hour in IST for matching "YYYY-MM-DDTHH:00"
      const istFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hour12: false,
      });

      const parts = istFormatter.formatToParts(now);
      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      let hour = parts.find(p => p.type === 'hour')?.value || '00';
      if (hour === '24') hour = '00';

      const currentHourStr = `${year}-${month}-${day}T${hour}:00`;

      let currentIndex = times.findIndex(t => t.startsWith(currentHourStr));
      if (currentIndex === -1) {
        // Find closest timestamp before or equal to now
        const nowMs = now.getTime();
        let closestDiff = Infinity;
        currentIndex = 0;
        for (let i = 0; i < times.length; i++) {
          const tMs = new Date(times[i] + '+05:30').getTime();
          const diff = Math.abs(nowMs - tMs);
          if (diff < closestDiff) {
            closestDiff = diff;
            currentIndex = i;
          }
        }
      }

      // Calculate 24-hour rainfall (sum of last 24 available hours up to current index)
      const start24hIdx = Math.max(0, currentIndex - 23);
      let sum24h = 0;
      for (let i = start24hIdx; i <= currentIndex; i++) {
        const val = precips[i];
        if (typeof val === 'number' && !isNaN(val) && val >= 0) {
          sum24h += val;
        }
      }

      // Calculate 3-hour burst (sum of last 3 available hours up to current index)
      const start3hIdx = Math.max(0, currentIndex - 2);
      let sum3h = 0;
      for (let i = start3hIdx; i <= currentIndex; i++) {
        const val = precips[i];
        if (typeof val === 'number' && !isNaN(val) && val >= 0) {
          sum3h += val;
        }
      }

      const rainfall_mm_24h = Math.round(sum24h * 10) / 10;
      const rainfall_mm_3h = Math.round(sum3h * 10) / 10;
      const recorded_at = new Date().toISOString();
      const source_name = DATA_SOURCES.OPEN_METEO_TELEMETRY.sourceName;

      // Ingest into central deterministic signal pipeline (LIVE signal)
      const ingestRes = rainfallService.ingestObservation({
        rawDistrict: district_name,
        rainfall_mm: rainfall_mm_24h,
        burst_3h_mm: rainfall_mm_3h,
        unit: 'mm',
        sourceName: source_name,
        sourceType: 'weather_service',
        dataMode: 'LIVE',
        timestamp: recorded_at,
        metadata: {
          latitude,
          longitude,
          elevation: data.elevation,
          provider: 'open-meteo',
          matched_time: times[currentIndex],
          precipitation_units: data.hourly_units.precipitation,
        },
      });

      if (!ingestRes.success) {
        throw new Error(ingestRes.error || 'Signal ingestion pipeline failed');
      }

      return {
        success: true,
        district_id,
        district_name,
        rainfall_mm_24h,
        rainfall_mm_3h,
        recorded_at,
        source_name,
        data_mode: 'LIVE',
      };
    } catch (err: any) {
      return {
        success: false,
        district_id,
        district_name,
        error: err?.message || 'Failed to fetch Open-Meteo live rainfall',
      };
    }
  }

  /**
   * Fetches historical rainfall baseline from Open-Meteo Archive API.
   */
  public async fetchHistoricalBaselineForDistrict(
    district: { district_id: string; district_name: string; latitude: number; longitude: number },
    startDate: string,
    endDate: string
  ): Promise<{ success: boolean; total_mm?: number; average_daily_mm?: number; peak_daily_mm?: number; error?: string }> {
    const { district_name, latitude, longitude } = district;
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude}&longitude=${longitude}&start_date=${startDate}&end_date=${endDate}&hourly=precipitation&timezone=Asia%2FKolkata`;

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'NeerDrishti-Flood-Intelligence/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`Open-Meteo Archive HTTP ${response.status}: ${response.statusText}`);
      }

      const data: OpenMeteoHourlyResponse = await response.json();
      if (!data.hourly || !Array.isArray(data.hourly.precipitation)) {
        throw new Error('Invalid archive payload: precipitation missing');
      }

      let total = 0;
      let peakHour = 0;
      for (const val of data.hourly.precipitation) {
        if (typeof val === 'number' && !isNaN(val) && val >= 0) {
          total += val;
          if (val > peakHour) peakHour = val;
        }
      }

      const daysCount = Math.max(1, data.hourly.precipitation.length / 24);
      const averageDaily = total / daysCount;

      // Ingest as HISTORICAL signal baseline
      rainfallService.ingestObservation({
        rawDistrict: district_name,
        rainfall_mm: Math.round(averageDaily * 10) / 10,
        burst_3h_mm: Math.round(peakHour * 10) / 10,
        unit: 'mm',
        sourceName: DATA_SOURCES.TELANGANA_HISTORICAL_BASELINE.sourceName,
        sourceType: 'historical_archive',
        dataMode: 'HISTORICAL',
        timestamp: new Date().toISOString(),
        metadata: {
          startDate,
          endDate,
          archive_provider: 'open-meteo-archive',
        },
      });

      return {
        success: true,
        total_mm: Math.round(total * 10) / 10,
        average_daily_mm: Math.round(averageDaily * 10) / 10,
        peak_daily_mm: Math.round(peakHour * 10) / 10,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to fetch Open-Meteo archive data',
      };
    }
  }

  /**
   * Refreshes all 33 Telangana districts in controlled batches (e.g. 5 concurrent requests).
   * Feeds results directly into the deterministic signal ingestion pipeline.
   */
  public async refreshAllDistricts(
    districts: DistrictMetadata[]
  ): Promise<{ total: number; success_count: number; fail_count: number; errors: Record<string, string> }> {
    if (this.isRefreshing) {
      return {
        total: districts.length,
        success_count: this.lastSuccessCount,
        fail_count: this.lastFailCount,
        errors: { system: 'Refresh operation already in progress' },
      };
    }

    this.isRefreshing = true;
    let successCount = 0;
    let failCount = 0;
    const errors: Record<string, string> = {};

    try {
      // Process in batches of 5 to remain polite to the Open-Meteo free tier
      const batchSize = 5;
      for (let i = 0; i < districts.length; i += batchSize) {
        const batch = districts.slice(i, i + batchSize);
        const promises = batch.map(d => this.fetchLiveRainfallForDistrict(d));
        const results = await Promise.all(promises);

        for (const res of results) {
          if (res.success) {
            successCount++;
          } else {
            failCount++;
            errors[res.district_name] = res.error || 'Unknown error';
          }
        }

        // Brief delay between batches (100ms)
        if (i + batchSize < districts.length) {
          await new Promise(r => setTimeout(r, 100));
        }
      }

      this.lastRefreshTime = new Date().toISOString();
      this.lastSuccessCount = successCount;
      this.lastFailCount = failCount;
      this.lastErrors = errors;

      // Update DATA_SOURCES config state
      if (successCount > 0) {
        DATA_SOURCES.OPEN_METEO_TELEMETRY.health = failCount > 0 ? 'DEGRADED' : 'HEALTHY';
        DATA_SOURCES.OPEN_METEO_TELEMETRY.lastSuccessfulUpdate = this.lastRefreshTime;
        DATA_SOURCES.OPEN_METEO_TELEMETRY.currentMode = 'LIVE';
      } else {
        DATA_SOURCES.OPEN_METEO_TELEMETRY.health = 'DOWN';
      }

      if (failCount > 0) {
        console.warn(`[OpenMeteoService] Ingested live rainfall telemetry: ${successCount} succeeded, ${failCount} incomplete.`);
      } else {
        console.log(`[OpenMeteoService] Ingested live rainfall telemetry: all ${successCount} districts updated successfully.`);
      }
    } catch (err: any) {
      console.error('[OpenMeteoService] Fatal error during district refresh:', err);
      DATA_SOURCES.OPEN_METEO_TELEMETRY.health = 'DEGRADED';
    } finally {
      this.isRefreshing = false;
    }

    return {
      total: districts.length,
      success_count: successCount,
      fail_count: failCount,
      errors,
    };
  }

  /**
   * Starts periodic background refresh loop according to DATA_SOURCES.refreshIntervalMinutes.
   */
  public startScheduledRefresh(districts: DistrictMetadata[]) {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    const intervalMinutes = DATA_SOURCES.OPEN_METEO_TELEMETRY.refreshIntervalMinutes || 30;
    const intervalMs = intervalMinutes * 60 * 1000;

    console.log(`[OpenMeteoService] Scheduling live Open-Meteo telemetry refresh every ${intervalMinutes} minutes.`);

    // Run initial live ingest immediately in background
    setTimeout(() => {
      this.refreshAllDistricts(districts).catch(e => console.error('[OpenMeteoService] Initial refresh error:', e));
    }, 1000);

    // Set recurring timer
    this.refreshTimer = setInterval(() => {
      this.refreshAllDistricts(districts).catch(e => console.error('[OpenMeteoService] Scheduled refresh error:', e));
    }, intervalMs);
  }

  public stopScheduledRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  public getStatus() {
    return {
      is_refreshing: this.isRefreshing,
      last_refresh_time: this.lastRefreshTime,
      last_success_count: this.lastSuccessCount,
      last_fail_count: this.lastFailCount,
      last_errors: this.lastErrors,
      refresh_interval_minutes: DATA_SOURCES.OPEN_METEO_TELEMETRY.refreshIntervalMinutes,
      source_metadata: DATA_SOURCES.OPEN_METEO_TELEMETRY,
    };
  }
}

export const openMeteoService = new OpenMeteoService();
