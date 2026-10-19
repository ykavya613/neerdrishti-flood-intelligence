import { IoTDevice, SensorType, UnifiedSensorReading, DataSourceMode } from '../../types/iot';
import { dataValidator } from './data_validator';

export class IoTDeviceRegistry {
  private devices: Map<string, IoTDevice> = new Map();
  private readingHistory: Map<string, UnifiedSensorReading[]> = new Map();
  private maxHistoryPerDevice: number = 30;

  constructor() {
    this.seedVirtualDevices();
  }

  /**
   * Initializes virtual IoT device mesh covering priority & standard districts.
   */
  private seedVirtualDevices() {
    const now = new Date().toISOString();

    const initialDevices: Omit<IoTDevice, 'history'>[] = [
      // 1. HYDERABAD (Priority)
      {
        device_id: 'HYD_VIRTUAL_RAIN_01',
        device_name: 'Hussain Sagar North Rain Gauge',
        district_id: 'hyderabad',
        district_name: 'Hyderabad',
        sensor_type: 'rainfall',
        status: 'ONLINE',
        mode: 'IOT',
        current_value: 6.2,
        unit: 'mm',
        last_seen: now,
        battery_level: 96,
        signal_strength: 92,
        data_confidence: 'Prototype',
        health: 'HEALTHY',
        hardware_profile: 'Virtual ESP32 Node (Tipping Bucket Gauge)',
        location_description: 'Hussain Sagar Inflow Catchment, Begumpet',
        coordinates: { lat: 17.4375, lng: 78.4820 },
        is_virtual: true,
      },
      {
        device_id: 'HYD_VIRTUAL_WATER_01',
        device_name: 'Musi River Ultrasonic Stage Gauge',
        district_id: 'hyderabad',
        district_name: 'Hyderabad',
        sensor_type: 'water_level',
        status: 'ONLINE',
        mode: 'IOT',
        current_value: 1.45,
        unit: 'm',
        last_seen: now,
        battery_level: 91,
        signal_strength: 88,
        data_confidence: 'Prototype',
        health: 'HEALTHY',
        hardware_profile: 'Virtual ESP32 Node (Ultrasonic Rangefinder JSN-SR04T)',
        location_description: 'Musi River Bridge, Moosarambagh Causeway',
        coordinates: { lat: 17.3753, lng: 78.5085 },
        is_virtual: true,
      },
      {
        device_id: 'HYD_VIRTUAL_DRAIN_01',
        device_name: 'Begumpet Major Nala Flow & Sump Monitor',
        district_id: 'hyderabad',
        district_name: 'Hyderabad',
        sensor_type: 'drainage_status',
        status: 'ONLINE',
        mode: 'IOT',
        current_value: 88.0, // 88% clearance (optimal)
        unit: '%',
        last_seen: now,
        battery_level: 89,
        signal_strength: 85,
        data_confidence: 'Prototype',
        health: 'HEALTHY',
        hardware_profile: 'Virtual ESP32 Node (Submersible Pressure Transducer)',
        location_description: 'Brahmanwadi Stormwater Siphon, Begumpet',
        coordinates: { lat: 17.4440, lng: 78.4680 },
        is_virtual: true,
      },

      // 2. WARANGAL (Priority)
      {
        device_id: 'WAR_VIRTUAL_RAIN_01',
        device_name: 'Bhadrakali Catchment AWS Station',
        district_id: 'warangal',
        district_name: 'Warangal',
        sensor_type: 'rainfall',
        status: 'ONLINE',
        mode: 'IOT',
        current_value: 4.8,
        unit: 'mm',
        last_seen: now,
        battery_level: 94,
        signal_strength: 90,
        data_confidence: 'Prototype',
        health: 'HEALTHY',
        hardware_profile: 'Virtual ESP32 Node (Optical Rain Sensor)',
        location_description: 'Bhadrakali Lake Bund, Warangal Urban',
        coordinates: { lat: 17.9830, lng: 79.5850 },
        is_virtual: true,
      },
      {
        device_id: 'WAR_VIRTUAL_WATER_01',
        device_name: 'Bondavagu Stream Channel Stage Gauge',
        district_id: 'warangal',
        district_name: 'Warangal',
        sensor_type: 'water_level',
        status: 'ONLINE',
        mode: 'IOT',
        current_value: 1.20,
        unit: 'm',
        last_seen: now,
        battery_level: 93,
        signal_strength: 86,
        data_confidence: 'Prototype',
        health: 'HEALTHY',
        hardware_profile: 'Virtual ESP32 Node (Ultrasonic Rangefinder)',
        location_description: 'Bondavagu Culvert, Hunter Road Outflow',
        coordinates: { lat: 17.9710, lng: 79.6020 },
        is_virtual: true,
      },
      {
        device_id: 'WAR_VIRTUAL_DRAIN_01',
        device_name: 'Underbridge Railway Sump & Nala Node',
        district_id: 'warangal',
        district_name: 'Warangal',
        sensor_type: 'drainage_status',
        status: 'ONLINE',
        mode: 'IOT',
        current_value: 82.0,
        unit: '%',
        last_seen: now,
        battery_level: 87,
        signal_strength: 84,
        data_confidence: 'Prototype',
        health: 'HEALTHY',
        hardware_profile: 'Virtual ESP32 Sump Siphon Monitor',
        location_description: 'Shiva Nagar Railway Underbridge Sump',
        coordinates: { lat: 17.9620, lng: 79.5930 },
        is_virtual: true,
      },

      // 3. NIRMAL (Priority)
      {
        device_id: 'NIR_VIRTUAL_RAIN_01',
        device_name: 'Kadam Upper Catchment Pluviometer',
        district_id: 'nirmal',
        district_name: 'Nirmal',
        sensor_type: 'rainfall',
        status: 'ONLINE',
        mode: 'IOT',
        current_value: 8.5,
        unit: 'mm',
        last_seen: now,
        battery_level: 98,
        signal_strength: 91,
        data_confidence: 'Prototype',
        health: 'HEALTHY',
        hardware_profile: 'Virtual ESP32 Solar Hydro Node',
        location_description: 'Kadam Dam Left Flank Meteorological Station',
        coordinates: { lat: 19.1250, lng: 78.7880 },
        is_virtual: true,
      },
      {
        device_id: 'NIR_VIRTUAL_WATER_01',
        device_name: 'Kadam Reservoir Headwater Level Sensor',
        district_id: 'nirmal',
        district_name: 'Nirmal',
        sensor_type: 'water_level',
        status: 'ONLINE',
        mode: 'IOT',
        current_value: 3.10,
        unit: 'm',
        last_seen: now,
        battery_level: 95,
        signal_strength: 89,
        data_confidence: 'Prototype',
        health: 'HEALTHY',
        hardware_profile: 'Virtual ESP32 High-Precision Hydrostatic Pressure Node',
        location_description: 'Kadam Narayanreddy Project Spillway Pier 4',
        coordinates: { lat: 19.1120, lng: 78.8020 },
        is_virtual: true,
      },

      // 4. MANCHERIAL (Priority)
      {
        device_id: 'MNC_VIRTUAL_RAIN_01',
        device_name: 'Godavari Basin Riparian Rain Post',
        district_id: 'mancherial',
        district_name: 'Mancherial',
        sensor_type: 'rainfall',
        status: 'ONLINE',
        mode: 'IOT',
        current_value: 7.1,
        unit: 'mm',
        last_seen: now,
        battery_level: 92,
        signal_strength: 87,
        data_confidence: 'Prototype',
        health: 'HEALTHY',
        hardware_profile: 'Virtual ESP32 Node',
        location_description: 'Mancherial Town Godavari Bund Station',
        coordinates: { lat: 18.8680, lng: 79.4620 },
        is_virtual: true,
      },
      {
        device_id: 'MNC_VIRTUAL_WATER_01',
        device_name: 'Rallavagu Floodplain River Stage Sensor',
        district_id: 'mancherial',
        district_name: 'Mancherial',
        sensor_type: 'water_level',
        status: 'ONLINE',
        mode: 'IOT',
        current_value: 2.15,
        unit: 'm',
        last_seen: now,
        battery_level: 90,
        signal_strength: 85,
        data_confidence: 'Prototype',
        health: 'HEALTHY',
        hardware_profile: 'Virtual ESP32 Ultrasonic Stage Node',
        location_description: 'Rallavagu Confluence with Godavari River',
        coordinates: { lat: 18.8550, lng: 79.4480 },
        is_virtual: true,
      },

      // 5. BHADRADRI KOTHAGUDEM (Priority)
      {
        device_id: 'BDK_VIRTUAL_RAIN_01',
        device_name: 'Bhadrachalam Temple Town Rain Gauge',
        district_id: 'bhadradri_kothagudem',
        district_name: 'Bhadradri Kothagudem',
        sensor_type: 'rainfall',
        status: 'ONLINE',
        mode: 'IOT',
        current_value: 9.4,
        unit: 'mm',
        last_seen: now,
        battery_level: 97,
        signal_strength: 93,
        data_confidence: 'Prototype',
        health: 'HEALTHY',
        hardware_profile: 'Virtual ESP32 Solar Tipping Bucket',
        location_description: 'Bhadrachalam Vista Complex Meteorological Mast',
        coordinates: { lat: 17.6690, lng: 80.8840 },
        is_virtual: true,
      },
      {
        device_id: 'BDK_VIRTUAL_WATER_01',
        device_name: 'Bhadrachalam Godavari River Gauge (43ft Warning / 53ft Danger)',
        district_id: 'bhadradri_kothagudem',
        district_name: 'Bhadradri Kothagudem',
        sensor_type: 'water_level',
        status: 'ONLINE',
        mode: 'IOT',
        current_value: 4.80, // normal river stage (~15.7 ft)
        unit: 'm',
        last_seen: now,
        battery_level: 96,
        signal_strength: 94,
        data_confidence: 'Prototype',
        health: 'HEALTHY',
        hardware_profile: 'Virtual ESP32 Riverine Telemetry Pier Gauge',
        location_description: 'Godavari Bridge Pier 7, Bhadrachalam',
        coordinates: { lat: 17.6650, lng: 80.8910 },
        is_virtual: true,
      },

      // 6. KHAMMAM (Standard)
      {
        device_id: 'KMM_VIRTUAL_WATER_01',
        device_name: 'Munneru River Urban Causeway Gauge',
        district_id: 'khammam',
        district_name: 'Khammam',
        sensor_type: 'water_level',
        status: 'ONLINE',
        mode: 'IOT',
        current_value: 1.85,
        unit: 'm',
        last_seen: now,
        battery_level: 92,
        signal_strength: 88,
        data_confidence: 'Prototype',
        health: 'HEALTHY',
        hardware_profile: 'Virtual ESP32 Ultrasonic Node',
        location_description: 'Munneru River Check Dam, Khammam City',
        coordinates: { lat: 17.2470, lng: 80.1510 },
        is_virtual: true,
      },

      // 7. KARIMNAGAR (Standard)
      {
        device_id: 'KRM_VIRTUAL_RAIN_01',
        device_name: 'Lower Manair Dam AWS Post',
        district_id: 'karimnagar',
        district_name: 'Karimnagar',
        sensor_type: 'rainfall',
        status: 'ONLINE',
        mode: 'IOT',
        current_value: 5.2,
        unit: 'mm',
        last_seen: now,
        battery_level: 95,
        signal_strength: 90,
        data_confidence: 'Prototype',
        health: 'HEALTHY',
        hardware_profile: 'Virtual ESP32 Node',
        location_description: 'LMD Reservoir Left Bank Spillway',
        coordinates: { lat: 18.4380, lng: 79.1280 },
        is_virtual: true,
      },

      // 8. NIZAMABAD (Standard)
      {
        device_id: 'NZB_VIRTUAL_WATER_01',
        device_name: 'Sri Ram Sagar Reservoir Inflow Gauge',
        district_id: 'nizamabad',
        district_name: 'Nizamabad',
        sensor_type: 'water_level',
        status: 'ONLINE',
        mode: 'IOT',
        current_value: 3.40,
        unit: 'm',
        last_seen: now,
        battery_level: 94,
        signal_strength: 89,
        data_confidence: 'Prototype',
        health: 'HEALTHY',
        hardware_profile: 'Virtual ESP32 Node',
        location_description: 'SRSP Pochampad Head Regulator',
        coordinates: { lat: 18.9620, lng: 78.3410 },
        is_virtual: true,
      },

      // 9. RANGAREDDY (Standard)
      {
        device_id: 'RGR_VIRTUAL_RAIN_01',
        device_name: 'Himayat Sagar Catchment Pluviometer',
        district_id: 'rangareddy',
        district_name: 'Rangareddy',
        sensor_type: 'rainfall',
        status: 'ONLINE',
        mode: 'IOT',
        current_value: 6.0,
        unit: 'mm',
        last_seen: now,
        battery_level: 93,
        signal_strength: 87,
        data_confidence: 'Prototype',
        health: 'HEALTHY',
        hardware_profile: 'Virtual ESP32 Node',
        location_description: 'Himayat Sagar Inflow Channel, Rajendranagar',
        coordinates: { lat: 17.3190, lng: 78.3610 },
        is_virtual: true,
      },

      // 10. NALGONDA (Standard)
      {
        device_id: 'NLG_VIRTUAL_WATER_01',
        device_name: 'Musi-Krishna Confluence Stage Sensor',
        district_id: 'nalgonda',
        district_name: 'Nalgonda',
        sensor_type: 'water_level',
        status: 'ONLINE',
        mode: 'IOT',
        current_value: 2.05,
        unit: 'm',
        last_seen: now,
        battery_level: 91,
        signal_strength: 86,
        data_confidence: 'Prototype',
        health: 'HEALTHY',
        hardware_profile: 'Virtual ESP32 Node',
        location_description: 'Wadapally Musi River Outfall into Krishna',
        coordinates: { lat: 16.7120, lng: 79.6230 },
        is_virtual: true,
      },
    ];

    for (const dev of initialDevices) {
      const fullDev: IoTDevice = {
        ...dev,
        lat: dev.coordinates.lat,
        lng: dev.coordinates.lng,
        history: [
          { timestamp: new Date(Date.now() - 3600000).toISOString(), value: dev.current_value * 0.95 },
          { timestamp: new Date(Date.now() - 1800000).toISOString(), value: dev.current_value * 0.98 },
          { timestamp: now, value: dev.current_value },
        ],
      };
      this.devices.set(dev.device_id, fullDev);
      this.readingHistory.set(dev.device_id, [
        {
          reading_id: `seed_${dev.device_id}_1`,
          source_id: 'neerdrishti-virtual-iot',
          device_id: dev.device_id,
          district_id: dev.district_id,
          district_name: dev.district_name,
          sensor_type: dev.sensor_type,
          value: dev.current_value,
          unit: dev.unit,
          timestamp: now,
          mode: 'IOT',
          confidence: 'Prototype',
          validation_status: 'VALID',
        }
      ]);
    }
  }

  /**
   * Adjusts all virtual IoT sensor telemetry to align with the active simulation scenario.
   */
  public syncWithScenario(scenarioName: string) {
    const sLower = scenarioName.toLowerCase();
    const now = new Date().toISOString();

    for (const [id, dev] of this.devices.entries()) {
      let nextVal = dev.current_value;

      if (sLower.includes('normal')) {
        if (dev.sensor_type === 'rainfall') nextVal = Math.round((3 + Math.random() * 7) * 10) / 10;
        else if (dev.sensor_type === 'water_level') nextVal = Math.round((1.2 + Math.random() * 0.8) * 100) / 100;
        else if (dev.sensor_type === 'drainage_status') nextVal = Math.round(85 + Math.random() * 10);
      } else if (sLower.includes('heavy rainfall') || sLower.includes('heavy_rainfall')) {
        if (dev.sensor_type === 'rainfall') nextVal = Math.round((55 + Math.random() * 35) * 10) / 10;
        else if (dev.sensor_type === 'water_level') nextVal = Math.round((3.2 + Math.random() * 1.2) * 100) / 100;
        else if (dev.sensor_type === 'drainage_status') nextVal = Math.round(45 + Math.random() * 15);
      } else if (sLower.includes('flood warning') || sLower.includes('flood_warning')) {
        if (dev.sensor_type === 'rainfall') nextVal = Math.round((105 + Math.random() * 40) * 10) / 10;
        else if (dev.sensor_type === 'water_level') nextVal = Math.round((5.1 + Math.random() * 1.5) * 100) / 100;
        else if (dev.sensor_type === 'drainage_status') nextVal = Math.round(25 + Math.random() * 15);
      } else if (sLower.includes('critical') || sLower.includes('critical_flood')) {
        if (dev.sensor_type === 'rainfall') nextVal = Math.round((165 + Math.random() * 55) * 10) / 10;
        else if (dev.sensor_type === 'water_level') nextVal = Math.round((7.8 + Math.random() * 2.0) * 100) / 100;
        else if (dev.sensor_type === 'drainage_status') nextVal = Math.round(5 + Math.random() * 10);
      }

      dev.current_value = nextVal;
      dev.last_seen = now;
      dev.history = dev.history || [];
      dev.history.push({ timestamp: now, value: nextVal });
      if (dev.history.length > this.maxHistoryPerDevice) {
        dev.history.shift();
      }

      // Record reading in history
      const readings = this.readingHistory.get(id) || [];
      readings.unshift({
        reading_id: `sync_${id}_${Date.now()}`,
        source_id: 'neerdrishti-virtual-iot',
        device_id: id,
        district_id: dev.district_id,
        district_name: dev.district_name,
        sensor_type: dev.sensor_type,
        value: nextVal,
        unit: dev.unit,
        timestamp: now,
        mode: 'IOT',
        confidence: 'Prototype',
        validation_status: 'VALID',
      });
      if (readings.length > this.maxHistoryPerDevice) readings.pop();
      this.readingHistory.set(id, readings);
    }
  }

  /**
   * Ingests a verified reading and updates device state.
   */
  public ingestReading(reading: UnifiedSensorReading): { success: boolean; device?: IoTDevice } {
    let dev = this.devices.get(reading.device_id);

    if (!dev) {
      // Auto-register external physical node or new virtual device
      dev = {
        device_id: reading.device_id,
        device_name: `${reading.district_name || reading.district_id} External Sensor Node`,
        district_id: reading.district_id,
        district_name: reading.district_name || reading.district_id,
        sensor_type: reading.sensor_type,
        status: 'ONLINE',
        mode: reading.mode,
        current_value: reading.value,
        unit: reading.unit,
        last_seen: reading.timestamp,
        battery_level: reading.raw_payload?.battery_level || 90,
        signal_strength: reading.raw_payload?.signal_strength || 85,
        data_confidence: reading.confidence,
        health: 'HEALTHY',
        hardware_profile: reading.raw_payload?.hardware_profile || 'ESP32 Wi-Fi Telemetry Node',
        location_description: reading.raw_payload?.location_description || `${reading.district_id} Field Station`,
        coordinates: reading.raw_payload?.coordinates || { lat: 17.5, lng: 78.5 },
        is_virtual: reading.device_id.includes('VIRTUAL'),
        history: [],
      };
      this.devices.set(reading.device_id, dev);
    } else {
      dev.current_value = reading.value;
      dev.unit = reading.unit;
      dev.last_seen = reading.timestamp;
      dev.status = 'ONLINE';
      dev.health = 'HEALTHY';
      dev.mode = reading.mode;
      dev.data_confidence = reading.confidence;
      if (reading.raw_payload?.battery_level !== undefined) dev.battery_level = reading.raw_payload.battery_level;
      if (reading.raw_payload?.signal_strength !== undefined) dev.signal_strength = reading.raw_payload.signal_strength;
    }

    dev.history = dev.history || [];
    dev.history.push({ timestamp: reading.timestamp, value: reading.value });
    if (dev.history.length > this.maxHistoryPerDevice) {
      dev.history.shift();
    }

    const readings = this.readingHistory.get(reading.device_id) || [];
    readings.unshift(reading);
    if (readings.length > this.maxHistoryPerDevice) readings.pop();
    this.readingHistory.set(reading.device_id, readings);

    return { success: true, device: dev };
  }

  public getAllDevices(): IoTDevice[] {
    return Array.from(this.devices.values());
  }

  public getDeviceById(deviceId: string): IoTDevice | undefined {
    return this.devices.get(deviceId.trim());
  }

  public getDevicesByDistrict(districtId: string): IoTDevice[] {
    const dLower = districtId.toLowerCase().trim();
    return Array.from(this.devices.values()).filter(
      d => d.district_id.toLowerCase() === dLower || d.district_name.toLowerCase() === dLower
    );
  }

  public getDeviceReadings(deviceId: string): UnifiedSensorReading[] {
    return this.readingHistory.get(deviceId.trim()) || [];
  }

  public getLatestReadingsForDistrict(districtId: string): Record<SensorType, UnifiedSensorReading | undefined> {
    const devices = this.getDevicesByDistrict(districtId);
    const result: Record<string, UnifiedSensorReading | undefined> = {};

    for (const dev of devices) {
      const readings = this.readingHistory.get(dev.device_id);
      if (readings && readings.length > 0) {
        result[dev.sensor_type] = readings[0];
      }
    }

    return result as Record<SensorType, UnifiedSensorReading | undefined>;
  }
}

export const iotDeviceRegistry = new IoTDeviceRegistry();
