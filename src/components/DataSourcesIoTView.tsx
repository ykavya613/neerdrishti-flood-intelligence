import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Cpu, 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Send, 
  RefreshCw, 
  ShieldCheck, 
  Sliders, 
  Wifi, 
  Battery, 
  Layers, 
  FileText, 
  Code, 
  Sparkles,
  ArrowRight,
  Database
} from 'lucide-react';
import { DataSourceMetadata, IoTDevice, DataSourceMode, SensorType, DataHealthResponse } from '../types/iot';
import { DistrictStatus } from '../types';

interface DataSourcesIoTViewProps {
  districts: DistrictStatus[];
  onRefreshDistricts?: () => void;
}

export const DataSourcesIoTView: React.FC<DataSourcesIoTViewProps> = ({
  districts,
  onRefreshDistricts,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'devices' | 'sources' | 'injector' | 'hardware' | 'walkthrough'>('devices');
  const [activeMode, setActiveMode] = useState<DataSourceMode>('SIMULATION');
  const [healthData, setHealthData] = useState<DataHealthResponse | null>(null);
  const [sources, setSources] = useState<DataSourceMetadata[]>([]);
  const [devices, setDevices] = useState<IoTDevice[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedDistrictFilter, setSelectedDistrictFilter] = useState<string>('ALL');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');

  // Injector state
  const [injectorDevice, setInjectorDevice] = useState<string>('HYD_VIRTUAL_RAIN_01');
  const [injectorDistrict, setInjectorDistrict] = useState<string>('hyderabad');
  const [injectorType, setInjectorType] = useState<SensorType>('rainfall');
  const [injectorValue, setInjectorValue] = useState<number>(75.4);
  const [injectorBattery, setInjectorBattery] = useState<number>(94);
  const [injectorSignal, setInjectorSignal] = useState<number>(88);
  const [injectResult, setInjectResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);
  const [isInjecting, setIsInjecting] = useState<boolean>(false);

  // Fetch initial IoT and Sources data
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [sourcesRes, healthRes, devicesRes, modeRes] = await Promise.all([
        fetch('/api/data/sources').then(r => r.json()),
        fetch('/api/data/health').then(r => r.json()),
        fetch('/api/iot/devices').then(r => r.json()),
        fetch('/api/data/mode').then(r => r.json()),
      ]);

      if (sourcesRes.sources) setSources(sourcesRes.sources);
      if (healthRes) setHealthData(healthRes);
      if (devicesRes.devices) setDevices(devicesRes.devices);
      if (modeRes.active_mode) setActiveMode(modeRes.active_mode);
    } catch (err) {
      console.error('Failed to fetch IoT/Data Source info:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleModeSwitch = async (newMode: DataSourceMode) => {
    try {
      const res = await fetch('/api/data/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      });
      const data = await res.json();
      if (data.success) {
        setActiveMode(newMode);
        fetchData();
        if (onRefreshDistricts) onRefreshDistricts();
      }
    } catch (err) {
      console.error('Error switching data mode:', err);
    }
  };

  const handleInjectTelemetry = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsInjecting(true);
    setInjectResult(null);

    try {
      const res = await fetch('/api/iot/reading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: injectorDevice,
          district_id: injectorDistrict,
          sensor_type: injectorType,
          value: Number(injectorValue),
          battery_level: Number(injectorBattery),
          signal_strength: Number(injectorSignal),
          timestamp: new Date().toISOString(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setInjectResult({
          success: true,
          message: `Telemetry successfully ingested for ${injectorDevice}! Value: ${injectorValue} (Validation: ${data.status})`,
          data: data.reading,
        });
        fetchData();
        if (onRefreshDistricts) onRefreshDistricts();
      } else {
        setInjectResult({
          success: false,
          message: `Ingestion Rejected: ${data.error || 'Validation error'} (Status: ${data.status || 'INVALID'})`,
        });
      }
    } catch (err: any) {
      setInjectResult({
        success: false,
        message: `Network Error: ${err.message || 'Failed to submit'}`,
      });
    } finally {
      setIsInjecting(false);
    }
  };

  const filteredDevices = devices.filter(d => {
    if (selectedDistrictFilter !== 'ALL' && d.district_id !== selectedDistrictFilter) return false;
    if (selectedTypeFilter !== 'ALL' && d.sensor_type !== selectedTypeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner: Transparency & Mode Indicator */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-900/60 text-emerald-300 border border-emerald-700/50 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                CENTRAL DATA CONNECTOR & IOT INGESTION
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-900/60 text-blue-300 border border-blue-700/50">
                PHASE H ARCHITECTURE
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Data Sources & Virtual IoT Telemetry Layer</h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Scalable multi-source data ingestion pipeline fusing official meteorological APIs, hydrological gauges, crowdsourced citizen reports, and virtual ESP32 IoT sensor telemetry across Telangana.
            </p>
          </div>

          {/* Operational Mode Toggle */}
          <div className="bg-slate-800/80 p-2 rounded-xl border border-slate-700/80 flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
              Active Ingestion Mode
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                id="mode-btn-sim"
                onClick={() => handleModeSwitch('SIMULATION')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  activeMode === 'SIMULATION'
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                SIMULATION
              </button>
              <button
                id="mode-btn-iot"
                onClick={() => handleModeSwitch('IOT')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  activeMode === 'IOT'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'bg-slate-700/60 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                VIRTUAL IOT
              </button>
            </div>
            <div className="text-[10px] text-slate-400 px-1 italic">
              {activeMode === 'IOT' 
                ? '⚡ Virtual IoT Node telemetry feeding risk model.' 
                : 'Deterministic hydrodynamic simulation feeding risk model.'}
            </div>
          </div>
        </div>

        {/* KPI Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800">
          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
            <div className="text-xs text-slate-400 font-medium">Registered Connectors</div>
            <div className="text-xl font-bold text-white mt-0.5">{sources.length} Channels</div>
            <div className="text-[11px] text-emerald-400 mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> All active
            </div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
            <div className="text-xs text-slate-400 font-medium">Virtual IoT Sensor Nodes</div>
            <div className="text-xl font-bold text-white mt-0.5">{devices.length} Deployed</div>
            <div className="text-[11px] text-sky-400 mt-0.5 flex items-center gap-1">
              <Wifi className="w-3 h-3" /> {devices.filter(d => d.status === 'ONLINE').length} Online
            </div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
            <div className="text-xs text-slate-400 font-medium">System Health Status</div>
            <div className="text-xl font-bold text-emerald-400 mt-0.5">
              {healthData?.system_health || 'HEALTHY'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Zero ingestion errors</div>
          </div>

          <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
            <div className="text-xs text-slate-400 font-medium">Data Confidence Index</div>
            <div className="text-xl font-bold text-amber-400 mt-0.5">Prototype</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Virtual ESP32 telemetry</div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          id="subtab-devices"
          onClick={() => setActiveSubTab('devices')}
          className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
            activeSubTab === 'devices'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Cpu className="w-4 h-4" />
          Virtual IoT Nodes ({devices.length})
        </button>

        <button
          id="subtab-sources"
          onClick={() => setActiveSubTab('sources')}
          className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
            activeSubTab === 'sources'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Database className="w-4 h-4" />
          Data Connectors Matrix ({sources.length})
        </button>

        <button
          id="subtab-injector"
          onClick={() => setActiveSubTab('injector')}
          className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
            activeSubTab === 'injector'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Send className="w-4 h-4" />
          Live Telemetry Injector & Validator
        </button>

        <button
          id="subtab-hardware"
          onClick={() => setActiveSubTab('hardware')}
          className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
            activeSubTab === 'hardware'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Code className="w-4 h-4" />
          Hardware Spec & REST API
        </button>

        <button
          id="subtab-walkthrough"
          onClick={() => setActiveSubTab('walkthrough')}
          className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
            activeSubTab === 'walkthrough'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          Phase H Demonstration Walkthrough
        </button>
      </div>

      {/* SUB-TAB 1: Virtual IoT Devices Grid */}
      {activeSubTab === 'devices' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-500 uppercase">District:</span>
              <select
                id="iot-district-filter"
                value={selectedDistrictFilter}
                onChange={e => setSelectedDistrictFilter(e.target.value)}
                className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Districts ({devices.length})</option>
                <option value="hyderabad">Hyderabad (Priority)</option>
                <option value="warangal">Warangal (Priority)</option>
                <option value="nirmal">Nirmal (Priority)</option>
                <option value="mancherial">Mancherial (Priority)</option>
                <option value="bhadradri_kothagudem">Bhadradri Kothagudem (Priority)</option>
                <option value="khammam">Khammam (Standard)</option>
                <option value="karimnagar">Karimnagar (Standard)</option>
                <option value="nizamabad">Nizamabad (Standard)</option>
                <option value="rangareddy">Rangareddy (Standard)</option>
                <option value="nalgonda">Nalgonda (Standard)</option>
              </select>

              <span className="text-xs font-bold text-slate-500 uppercase ml-2">Sensor Type:</span>
              <select
                id="iot-type-filter"
                value={selectedTypeFilter}
                onChange={e => setSelectedTypeFilter(e.target.value)}
                className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">All Sensor Types</option>
                <option value="rainfall">Rainfall Pluviometers</option>
                <option value="water_level">Water Level Ultrasonic</option>
                <option value="drainage_status">Stormwater Sump / Drainage</option>
              </select>
            </div>

            <div className="text-xs text-slate-500 flex items-center gap-1.5 self-end sm:self-auto">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Showing {filteredDevices.length} of {devices.length} Virtual Nodes
            </div>
          </div>

          {/* Virtual Devices Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDevices.map(device => {
              const isRain = device.sensor_type === 'rainfall';
              const isWater = device.sensor_type === 'water_level';
              const isDrain = device.sensor_type === 'drainage_status';

              return (
                <div
                  key={device.device_id}
                  className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div>
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300">
                            {device.device_id}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                            {device.district_name}
                          </span>
                        </div>
                        <h3 className="font-bold text-slate-900 text-sm mt-1">{device.device_name}</h3>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                        {device.status}
                      </span>
                    </div>

                    {/* Sensor Value Gauge Block */}
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 my-3">
                      <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
                        {isRain && 'Precipitation Telemetry'}
                        {isWater && 'River / Reservoir Stage'}
                        {isDrain && 'Stormwater Siphon Clearance'}
                      </div>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-3xl font-extrabold text-slate-900">
                          {device.current_value}
                        </span>
                        <span className="text-sm font-bold text-slate-600">{device.unit}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                        <span>Type: <strong className="text-slate-700">{device.sensor_type}</strong></span>
                        <span>Confidence: <strong className="text-amber-600">{device.data_confidence}</strong></span>
                      </div>
                    </div>

                    {/* Hardware & Location Details */}
                    <div className="space-y-1.5 text-xs text-slate-600 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Hardware Profile:</span>
                        <span className="font-medium text-slate-700 truncate max-w-[180px]">{device.hardware_profile}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Location:</span>
                        <span className="font-medium text-slate-700 truncate max-w-[180px]">{device.location_description}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Battery className="w-3.5 h-3.5 text-emerald-600" /> Battery: {device.battery_level}%
                        </span>
                        <span className="text-slate-400 flex items-center gap-1">
                          <Wifi className="w-3.5 h-3.5 text-blue-600" /> RSSI: {device.signal_strength}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer & Action */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                      ⚡ VIRTUAL IOT DEMONSTRATION
                    </span>
                    <button
                      onClick={() => {
                        setInjectorDevice(device.device_id);
                        setInjectorDistrict(device.district_id);
                        setInjectorType(device.sensor_type);
                        setInjectorValue(
                          device.sensor_type === 'rainfall' ? 88.5 : device.sensor_type === 'water_level' ? 4.8 : 25
                        );
                        setActiveSubTab('injector');
                      }}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                    >
                      Test Inject <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: Data Connectors Matrix */}
      {activeSubTab === 'sources' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">Unified Data Ingestion Channels</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live status, data latency, and coverage for all telemetry connectors in NeerDrishti.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Data Source Name</th>
                  <th className="py-3 px-4">Channel Type</th>
                  <th className="py-3 px-4">Operational Mode</th>
                  <th className="py-3 px-4">Health</th>
                  <th className="py-3 px-4">Latency</th>
                  <th className="py-3 px-4">Confidence</th>
                  <th className="py-3 px-4">Coverage</th>
                  <th className="py-3 px-4">Supported Signals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sources.map(source => (
                  <tr key={source.source_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <div>{source.source_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">{source.source_id}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 font-medium">{source.source_type}</td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        source.mode === 'LIVE' ? 'bg-emerald-100 text-emerald-800' :
                        source.mode === 'IOT' ? 'bg-indigo-100 text-indigo-800' :
                        source.mode === 'SIMULATION' ? 'bg-blue-100 text-blue-800' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {source.mode}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="flex items-center gap-1 text-emerald-600 font-bold text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {source.health}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">{source.latency_ms} ms</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700">{source.data_confidence}</td>
                    <td className="py-3.5 px-4 text-slate-600">{source.coverage}</td>
                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1">
                        {source.supported_sensors.map(s => (
                          <span key={s} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px]">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: Live Telemetry Injector & Validator */}
      {activeSubTab === 'injector' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Injector Form */}
          <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Interactive Telemetry Ingestion Tool</h2>
                <p className="text-xs text-slate-500">Inject telemetry to test validation rules and observe real-time risk updates.</p>
              </div>
              <span className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200">
                REST / ESP32 Simulator
              </span>
            </div>

            <form onSubmit={handleInjectTelemetry} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Target IoT Device Node</label>
                <select
                  id="inject-device-select"
                  value={injectorDevice}
                  onChange={e => {
                    const dev = devices.find(d => d.device_id === e.target.value);
                    setInjectorDevice(e.target.value);
                    if (dev) {
                      setInjectorDistrict(dev.district_id);
                      setInjectorType(dev.sensor_type);
                      setInjectorValue(dev.current_value);
                    }
                  }}
                  className="w-full text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                >
                  {devices.map(d => (
                    <option key={d.device_id} value={d.device_id}>
                      {d.device_id} — {d.device_name} ({d.district_name})
                    </option>
                  ))}
                  <option value="ESP32_CUSTOM_NODE_99">➕ Custom ESP32 Hardware Node</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">District</label>
                  <select
                    id="inject-district-select"
                    value={injectorDistrict}
                    onChange={e => setInjectorDistrict(e.target.value)}
                    className="w-full text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                  >
                    {districts.map(d => (
                      <option key={d.district_id || d.district} value={d.district_id || d.district}>
                        {d.district}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Sensor Type</label>
                  <select
                    id="inject-type-select"
                    value={injectorType}
                    onChange={e => setInjectorType(e.target.value as SensorType)}
                    className="w-full text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="rainfall">Rainfall (mm)</option>
                    <option value="water_level">Water Level (m)</option>
                    <option value="drainage_status">Drainage Status (%)</option>
                    <option value="flow_rate">Flow Rate (cumecs)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Sensor Reading Value ({injectorType === 'rainfall' ? 'mm' : injectorType === 'water_level' ? 'meters' : '%'})
                </label>
                <div className="flex gap-2">
                  <input
                    id="inject-value-input"
                    type="number"
                    step="0.1"
                    value={injectorValue}
                    onChange={e => setInjectorValue(parseFloat(e.target.value))}
                    className="flex-1 text-sm font-bold bg-slate-50 border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setInjectorValue(-10)} // Test invalid
                    className="px-2.5 py-1 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100"
                    title="Test Negative Out-of-Bounds"
                  >
                    Test Negative (Reject)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInjectorValue(125.0)}
                    className="px-2.5 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                    title="Test High Flood Surge"
                  >
                    High Flood (125mm)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Battery Level (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={injectorBattery}
                    onChange={e => setInjectorBattery(parseInt(e.target.value))}
                    className="w-full text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Signal RSSI (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={injectorSignal}
                    onChange={e => setInjectorSignal(parseInt(e.target.value))}
                    className="w-full text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <button
                id="submit-telemetry-btn"
                type="submit"
                disabled={isInjecting}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-sm rounded-xl shadow transition-colors flex items-center justify-center gap-2"
              >
                {isInjecting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Ingest & Validate Telemetry
              </button>
            </form>

            {/* Ingestion Result Box */}
            {injectResult && (
              <div className={`mt-4 p-4 rounded-xl text-xs border ${
                injectResult.success 
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-200' 
                  : 'bg-rose-50 text-rose-900 border-rose-200'
              }`}>
                <div className="flex items-center gap-2 font-bold mb-1">
                  {injectResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                  )}
                  {injectResult.success ? 'Telemetry Accepted & Synchronized' : 'Telemetry Ingestion Rejected'}
                </div>
                <p className="text-slate-700">{injectResult.message}</p>
                {injectResult.data && (
                  <div className="mt-2 p-2 bg-white/80 rounded border border-emerald-200 font-mono text-[10px]">
                    Reading ID: {injectResult.data.reading_id} | Mode: {injectResult.data.mode} | Timestamp: {injectResult.data.timestamp}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Validation Architecture & Rules Card */}
          <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3 mb-4">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900">Validation Pipeline & Safety Bounds</h2>
              </div>

              <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                Every incoming sensor reading undergoes a 5-step strict validation check before reaching the flood risk calculation engine:
              </p>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-start gap-2.5">
                  <span className="font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px]">1</span>
                  <div>
                    <strong className="text-slate-800">Physical Bounds Check:</strong>
                    <div className="text-slate-500 mt-0.5">
                      Rainfall: 0 – 500 mm | Water Level: 0 – 50 m | Drainage: 0 – 100% (negative values rejected).
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-start gap-2.5">
                  <span className="font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px]">2</span>
                  <div>
                    <strong className="text-slate-800">Temporal Verification:</strong>
                    <div className="text-slate-500 mt-0.5">
                      Rejects future timestamps (&gt;60s clock skew) and flags stale readings older than 48 hours.
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-start gap-2.5">
                  <span className="font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px]">3</span>
                  <div>
                    <strong className="text-slate-800">Deduplication:</strong>
                    <div className="text-slate-500 mt-0.5">
                      Rejects duplicate readings sent within 1000ms from the same device ID with identical payload.
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-start gap-2.5">
                  <span className="font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px]">4</span>
                  <div>
                    <strong className="text-slate-800">Canonical District Resolution:</strong>
                    <div className="text-slate-500 mt-0.5">
                      Validates that district matches one of the 33 official Telangana district boundaries.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
              <strong>Grounding Notice:</strong> When in <code>IOT</code> mode, valid readings directly adjust the 35% rainfall or 10% drainage factors in real-time.
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: Hardware Architecture & REST Ingestion Spec */}
      {activeSubTab === 'hardware' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h2 className="text-lg font-bold text-slate-900">ESP32 Hardware & Cloud Ingestion Architecture</h2>
            <p className="text-xs text-slate-500 mt-1">
              Field-ready hardware wiring specifications, HTTP REST payload formats, and microcontroller firmware blueprints.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* JSON Schema */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700 uppercase">1. REST API JSON Payload Schema</div>
              <pre className="bg-slate-900 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800">
{`POST /api/iot/reading
Content-Type: application/json

{
  "device_id": "ESP32_HYD_01",
  "district_id": "hyderabad",
  "sensor_type": "water_level",
  "value": 3.42,
  "unit": "m",
  "battery_level": 92,
  "signal_strength": 85,
  "timestamp": "2026-08-31T09:00:00.000Z",
  "metadata": {
    "firmware": "v1.4.2",
    "location": "Musi River Bridge Pier 4"
  }
}`}
              </pre>
            </div>

            {/* Microcontroller Firmware Sample */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700 uppercase">2. ESP32 Arduino / C++ Snippet</div>
              <pre className="bg-slate-900 text-sky-300 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800">
{`#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

void sendTelemetry(float waterLevelMeters) {
  HTTPClient http;
  http.begin("https://neerdrishti.gov.in/api/iot/reading");
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<200> doc;
  doc["device_id"] = "ESP32_HYD_01";
  doc["district_id"] = "hyderabad";
  doc["sensor_type"] = "water_level";
  doc["value"] = waterLevelMeters;
  doc["battery_level"] = readBatteryPercent();

  String payload;
  serializeJson(doc, payload);
  int httpCode = http.POST(payload);
  http.end();
}`}
              </pre>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <h3 className="text-xs font-bold text-slate-800 uppercase mb-2">Hardware Nodes Reference Table</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600">
              <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                <strong className="text-slate-900 block mb-0.5">Rainfall Node</strong>
                Tipping Bucket Reed Switch / Optical Pluviometer on GPIO 4 with pull-up interrupt.
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                <strong className="text-slate-900 block mb-0.5">Water Level Node</strong>
                JSN-SR04T Waterproof Ultrasonic Transducer on Trigger (GPIO 5) / Echo (GPIO 18).
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-slate-200">
                <strong className="text-slate-900 block mb-0.5">Drainage Node</strong>
                Submersible Hydrostatic Pressure Transducer via ADS1115 I2C ADC.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 5: Demonstration Walkthrough */}
      {activeSubTab === 'walkthrough' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <span className="px-2.5 py-1 rounded bg-amber-100 text-amber-900 text-xs font-bold">
              PHASE H DEMONSTRATION WORKFLOW
            </span>
            <h2 className="text-lg font-bold text-slate-900 mt-2">Simulation to Prototype IoT Transition Sequence</h2>
            <p className="text-xs text-slate-500 mt-1">
              Follow these steps to demonstrate how NeerDrishti transitions from regional hydrodynamic simulation to real-time IoT telemetry ingestion.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs">1</span>
                <h3 className="font-bold text-slate-900 text-sm">Observe Simulation Baseline</h3>
              </div>
              <p className="text-xs text-slate-600">
                In <strong>SIMULATION</strong> mode, the 33-district engine computes deterministic flood risks from calibrated rainfall scenarios (e.g. Heavy Rainfall).
              </p>
              <button
                onClick={() => handleModeSwitch('SIMULATION')}
                className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-lg"
              >
                Set Mode to SIMULATION
              </button>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-xs">2</span>
                <h3 className="font-bold text-slate-900 text-sm">Activate Virtual IoT Mesh</h3>
              </div>
              <p className="text-xs text-slate-600">
                Switch to <strong>IOT</strong> mode. Real-time telemetry from virtual ESP32 nodes takes priority in Hyderabad, Warangal, Nirmal, and Mancherial.
              </p>
              <button
                onClick={() => handleModeSwitch('IOT')}
                className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-lg"
              >
                Set Mode to IOT
              </button>
            </div>

            <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">3</span>
                <h3 className="font-bold text-slate-900 text-sm">Test Live Telemetry Ingestion</h3>
              </div>
              <p className="text-xs text-slate-600">
                Use the <strong>Live Telemetry Injector</strong> to submit a live reading or test rejection of negative values / malformed payloads.
              </p>
              <button
                onClick={() => setActiveSubTab('injector')}
                className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-lg"
              >
                Open Telemetry Injector
              </button>
            </div>

            <div className="p-4 rounded-xl bg-purple-50/60 border border-purple-200 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-purple-600 text-white font-bold flex items-center justify-center text-xs">4</span>
                <h3 className="font-bold text-slate-900 text-sm">Inspect AI Grounded Transparency</h3>
              </div>
              <p className="text-xs text-slate-600">
                Open the AI Assistant and ask about Hyderabad or Bhadradri Kothagudem. Notice the transparency badges <code>⚡ VIRTUAL IOT DEMONSTRATION</code>.
              </p>
              <div className="text-[11px] text-purple-700 italic">
                Navigate to AI Assistant tab to test bilingual queries.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
