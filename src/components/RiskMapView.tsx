import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DistrictStatus, SimulationScenarioName } from '../types';
import { IoTDevice } from '../types/iot';
import { MapPin, Layers, Info, Sparkles, AlertCircle, Droplets, Search, Filter, ShieldAlert, Cpu, Radio, Wifi, Battery } from 'lucide-react';
import { DistrictDetailModal } from './DistrictDetailModal';

interface RiskMapViewProps {
  districts: DistrictStatus[];
  scenario: SimulationScenarioName;
  onScenarioChange: (scenario: SimulationScenarioName) => void;
}

export const RiskMapView: React.FC<RiskMapViewProps> = ({
  districts,
  scenario,
  onScenarioChange,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [activeDistrict, setActiveDistrict] = useState<DistrictStatus | null>(districts[0] || null);
  const [modalDistrict, setModalDistrict] = useState<DistrictStatus | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<'All' | 'Priority' | 'Standard' | 'Limited'>('All');
  const [zoneFilter, setZoneFilter] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeLayer, setActiveLayer] = useState<'both' | 'risk' | 'iot'>('both');
  const [iotDevices, setIotDevices] = useState<IoTDevice[]>([]);

  useEffect(() => {
    fetch('/api/iot/devices')
      .then(res => res.json())
      .then(data => {
        if (data && data.devices) {
          setIotDevices(data.devices);
        }
      })
      .catch(err => console.error('Failed to fetch IoT devices for map:', err));
  }, []);

  const getRiskColor = (category: string) => {
    switch (category) {
      case 'CRITICAL': return '#ef4444';
      case 'HIGH': return '#f97316';
      case 'MODERATE': return '#f59e0b';
      default: return '#10b981';
    }
  };

  const getCategoryBadge = (cat?: string) => {
    if (cat === 'Priority Flood Monitoring') {
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold border border-blue-200">Priority</span>;
    }
    if (cat === 'Standard Monitoring') {
      return <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-300">Standard</span>;
    }
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-medium border border-amber-200">Limited</span>;
  };

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Center of Telangana State
      const map = L.map(mapContainerRef.current, {
        center: [17.95, 79.1],
        zoom: 7.2,
        minZoom: 6,
        maxZoom: 14,
        zoomControl: true,
      });

      // OpenStreetMap standard tiles: no API key. Usage: interactive local/demo maps with attribution.
      // Policy: https://operations.osmfoundation.org/policies/tiles/
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      layerGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Filtered districts for map display
  const filteredDistricts = districts.filter(d => {
    const matchesCategory = 
      categoryFilter === 'All' ? true :
      categoryFilter === 'Priority' ? d.monitoring_category === 'Priority Flood Monitoring' :
      categoryFilter === 'Standard' ? d.monitoring_category === 'Standard Monitoring' :
      d.monitoring_category === 'Limited Data';

    const matchesZone = 
      zoneFilter === 'All' ? true :
      (d.region_zone && d.region_zone.toLowerCase().includes(zoneFilter.toLowerCase())) ||
      (d.simulation_zone && d.simulation_zone.toLowerCase().includes(zoneFilter.toLowerCase()));

    const matchesSearch = 
      !searchTerm ? true :
      d.district.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.region_zone && d.region_zone.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (d.river_basin && d.river_basin.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesCategory && matchesZone && matchesSearch;
  });

  // Update Markers & Circles whenever filteredDistricts, layer, or iotDevices change
  useEffect(() => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;

    layerGroupRef.current.clearLayers();

    // 1. Render District Flood Risk Layers
    if (activeLayer === 'both' || activeLayer === 'risk') {
      filteredDistricts.forEach((d) => {
        const lat = typeof d.lat === 'number' ? d.lat : (d as any).latitude;
        const lng = typeof d.lng === 'number' ? d.lng : (d as any).longitude;
        if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
          return;
        }

        const color = getRiskColor(d.risk_category);
        const isPriority = d.monitoring_category === 'Priority Flood Monitoring';
        const radiusMeters = isPriority 
          ? 12000 + (d.flood_risk_score * 250) 
          : 8000 + (d.flood_risk_score * 180);

        // Semi-transparent risk envelope circle
        const circle = L.circle([lat, lng], {
          color: color,
          fillColor: color,
          fillOpacity: isPriority ? 0.22 : 0.14,
          radius: radiusMeters,
          weight: isPriority ? 2 : 1,
        });

        // Custom HTML marker pin with pulsating circle
        const markerIcon = L.divIcon({
          className: 'custom-flood-pin',
          html: `
            <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; cursor: pointer;">
              ${isPriority ? `<div style="position: absolute; width: 100%; height: 100%; border-radius: 50%; background: ${color}; opacity: 0.4; animation: ping 1.5s cubic-bezier(0, 0, 0, 0.2, 1) infinite;"></div>` : ''}
              <div style="position: relative; width: 26px; height: 26px; border-radius: 50%; background: ${color}; border: 2px solid #ffffff; box-shadow: 0 3px 5px -1px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 10px; font-family: sans-serif;">
                ${Math.round(d.flood_risk_score)}
              </div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker([lat, lng], { icon: markerIcon });

        // Interactive Popup
        const popupHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 230px; padding: 4px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
              <h3 style="margin: 0; font-size: 14px; font-weight: 700; color: #0f172a;">${d.district}</h3>
              <span style="background: ${color}20; color: ${color}; border: 1px solid ${color}60; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 9999px;">
                ${d.risk_category} (${Math.round(d.flood_risk_score)}/100)
              </span>
            </div>
            
            <div style="font-size: 11px; color: #475569; line-height: 1.5;">
              <div><b>Category:</b> ${d.monitoring_category || 'District'}</div>
              <div><b>Data Mode:</b> <span style="font-weight: 600; color: #4338ca;">${d.data_source_mode}</span></div>
              <div><b>Simulation Rain:</b> <span style="font-weight: 600; color: #2563eb;">${d.rainfall_mm_24h} mm</span></div>
              <div><b>Confidence:</b> ${d.risk_confidence || 'Medium'}</div>
              <div><b>Completeness:</b> ${d.risk_data_completeness ?? 80}%</div>
              <div style="margin-top: 4px; border-top: 1px solid #e2e8f0; padding-top: 4px; font-size: 10px; color: #64748b;">
                <b>Basin:</b> ${d.river_basin || 'Godavari/Krishna'}
              </div>
              ${d.alert_intelligence && d.alert_intelligence.alert_level !== 'NORMAL' ? `
                <div style="margin-top: 4px; padding: 3px 6px; border-radius: 4px; background: #fff1f2; border: 1px solid #fecdd3; font-size: 10px; font-weight: 700; color: #be123c;">
                  🚨 ${d.alert_intelligence.alert_level} ALERT: ${d.alert_intelligence.primary_alert_type}
                </div>
              ` : ''}
            </div>
          </div>
        `;

        marker.bindPopup(popupHtml);
        marker.on('click', () => {
          setActiveDistrict(d);
        });

        circle.addTo(layerGroupRef.current!);
        marker.addTo(layerGroupRef.current!);
      });
    }

    // 2. Render Virtual IoT Sensor Nodes Layer
    if (activeLayer === 'both' || activeLayer === 'iot') {
      iotDevices.forEach((dev) => {
        const lat = dev.coordinates?.lat ?? (dev as any).lat;
        const lng = dev.coordinates?.lng ?? (dev as any).lng;
        if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
          return;
        }

        const isRain = dev.sensor_type === 'rainfall';
        const isWater = dev.sensor_type === 'water_level';
        const isDrain = dev.sensor_type === 'drainage_status';

        const nodeColor = isRain ? '#2563eb' : isWater ? '#0284c7' : isDrain ? '#d97706' : '#7c3aed';
        const nodeIconLabel = isRain ? '🌧️' : isWater ? '🌊' : isDrain ? '🚰' : '📡';

        const iotIcon = L.divIcon({
          className: 'custom-iot-pin',
          html: `
            <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; cursor: pointer;">
              <div style="width: 24px; height: 24px; border-radius: 6px; background: #0f172a; border: 2px solid ${nodeColor}; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; font-size: 11px;">
                ${nodeIconLabel}
              </div>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const iotMarker = L.marker([lat, lng], { icon: iotIcon });

        const iotPopupHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; min-width: 220px; padding: 4px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
              <span style="background: #eef2ff; color: #4338ca; border: 1px solid #c7d2fe; font-size: 9px; font-weight: 800; padding: 2px 5px; border-radius: 4px;">
                ${dev.device_id}
              </span>
              <span style="background: #ecfdf5; color: #047857; font-size: 9px; font-weight: 700; padding: 2px 5px; border-radius: 4px;">
                ${dev.status}
              </span>
            </div>

            <h4 style="margin: 2px 0 6px 0; font-size: 13px; font-weight: 700; color: #0f172a;">${dev.device_name}</h4>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 8px; margin-bottom: 6px;">
              <div style="font-size: 10px; color: #64748b; font-weight: 600; text-transform: uppercase;">Live Telemetry Reading</div>
              <div style="font-size: 18px; font-weight: 800; color: ${nodeColor}; margin-top: 2px;">
                ${dev.current_value} <span style="font-size: 11px; color: #475569;">${dev.unit}</span>
              </div>
            </div>

            <div style="font-size: 10px; color: #475569; line-height: 1.4;">
              <div><b>District:</b> ${dev.district_name}</div>
              <div><b>Location:</b> ${dev.location_description}</div>
              <div><b>Battery:</b> ${dev.battery_level}% | <b>Signal:</b> ${dev.signal_strength}%</div>
              <div><b>Hardware:</b> ${dev.hardware_profile}</div>
              <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #f1f5f9; color: #4f46e5; font-weight: 700; font-size: 9px;">
                ⚡ VIRTUAL IOT DEMONSTRATION
              </div>
            </div>
          </div>
        `;

        iotMarker.bindPopup(iotPopupHtml);
        iotMarker.addTo(layerGroupRef.current!);
      });
    }
  }, [filteredDistricts, activeLayer, iotDevices]);

  // Center map on district click
  const focusDistrict = (d: DistrictStatus) => {
    setActiveDistrict(d);
    if (mapInstanceRef.current) {
      const lat = typeof d.lat === 'number' ? d.lat : (d as any).latitude;
      const lng = typeof d.lng === 'number' ? d.lng : (d as any).longitude;
      if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
        mapInstanceRef.current.flyTo([lat, lng], 9.5, { duration: 1.0 });
      }
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Simulation Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-700 text-white rounded-xl p-3 px-4 text-xs font-semibold flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-300 shrink-0" />
          <span>PROTOTYPE SIMULATION MODE: District-Level Prototype Visualization (Centroid Centered)</span>
        </div>
        <span className="bg-white/20 px-2 py-0.5 rounded text-[11px] font-normal">
          Active Scenario: {scenario}
        </span>
      </div>

      {/* Map Header & Filter Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <MapPin className="w-6 h-6 text-blue-600" />
              <span>Telangana Geospatial Flood Risk Map</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Interactive risk envelopes and hydrological telemetry across 33 Telangana districts
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">
              Showing {filteredDistricts.length} of {districts.length || 33} districts
            </span>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search map districts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            {(['All', 'Priority', 'Standard', 'Limited'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`flex-1 py-1 text-center rounded text-[11px] font-semibold transition-colors ${
                  categoryFilter === cat ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat === 'All' ? 'All (33)' : cat === 'Priority' ? 'Priority (5)' : cat === 'Standard' ? 'Standard (15)' : 'Limited (13)'}
              </button>
            ))}
          </div>

          <div>
            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="w-full p-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="All">All Region Zones</option>
              <option value="North Telangana">North Telangana</option>
              <option value="Central Telangana">Central Telangana</option>
              <option value="Hyderabad Urban Region">Hyderabad Urban Region</option>
              <option value="Godavari Influence Region">Godavari Influence Region</option>
              <option value="South Telangana">South Telangana</option>
              <option value="Krishna Influence Region">Krishna Influence Region</option>
            </select>
          </div>
        </div>
      </div>

      {/* Map & Inspector Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map Viewport Container */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-600">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>Telangana State Geospatial Layer (Centroid Visualization)</span>
            </div>

            {/* Layer Filter Toggle */}
            <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg text-[11px]">
              <button
                id="layer-both-btn"
                onClick={() => setActiveLayer('both')}
                className={`px-2 py-0.5 rounded font-bold transition-all ${
                  activeLayer === 'both' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Layers
              </button>
              <button
                id="layer-risk-btn"
                onClick={() => setActiveLayer('risk')}
                className={`px-2 py-0.5 rounded font-bold transition-all ${
                  activeLayer === 'risk' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Flood Risk
              </button>
              <button
                id="layer-iot-btn"
                onClick={() => setActiveLayer('iot')}
                className={`px-2 py-0.5 rounded font-bold transition-all ${
                  activeLayer === 'iot' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ⚡ Virtual IoT ({iotDevices.length})
              </button>
            </div>
          </div>

          <div
            id="telangana-flood-map"
            ref={mapContainerRef}
            className="w-full h-[540px] bg-slate-100 z-10"
          />

          {/* Part 10: Map Legend Bar */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Flood Risk Index Legend</span>
                <div className="flex flex-wrap items-center gap-3 text-xs mt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-slate-600">0–25: LOW</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-slate-600">26–50: MODERATE</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-orange-500" />
                    <span className="text-slate-600">51–75: HIGH</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-slate-600">76–100: CRITICAL</span>
                  </div>
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Data Mode Legend</span>
                <div className="flex flex-wrap items-center gap-2 text-[10px] mt-1">
                  <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-semibold border border-indigo-200">Simulation</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">Prototype</span>
                  <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-semibold">Historical</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">Live</span>
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">Limited Data</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* District Inspector Sidebar */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 className="font-bold text-slate-900 text-base">District Inspector</h2>
              <span className="text-xs text-slate-400">Select to center</span>
            </div>

            {/* Quick Switch Buttons */}
            <div className="grid grid-cols-2 gap-1.5 mt-3 max-h-[160px] overflow-y-auto pr-1">
              {filteredDistricts.map((d) => (
                <button
                  key={d.district}
                  id={`map-select-btn-${d.district.toLowerCase().replace(/\s+/g, '-')}`}
                  onClick={() => focusDistrict(d)}
                  className={`text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    activeDistrict?.district === d.district
                      ? 'border-blue-600 bg-blue-50 text-blue-900 shadow-xs'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate max-w-[80px]">{d.district}</span>
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: getRiskColor(d.risk_category) }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                    Score: {d.flood_risk_score}
                  </div>
                </button>
              ))}
            </div>

            {/* Active District Card */}
            {activeDistrict && (
              <div className="mt-4 bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base">{activeDistrict.district}</h3>
                    <p className="text-xs text-slate-500">{activeDistrict.river_basin}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full font-bold text-white shadow-xs"
                      style={{ backgroundColor: getRiskColor(activeDistrict.risk_category) }}
                    >
                      {activeDistrict.risk_category}
                    </span>
                    {getCategoryBadge(activeDistrict.monitoring_category)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Simulation Rain</span>
                    <span className="font-bold text-blue-600 text-xs">{activeDistrict.rainfall_mm_24h} mm</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Flood Risk Score</span>
                    <span className="font-bold text-slate-900 text-xs">{activeDistrict.flood_risk_score}/100</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Data Completeness</span>
                    <span className="font-bold text-slate-800 text-xs">{activeDistrict.risk_data_completeness ?? 80}%</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Risk Confidence</span>
                    <span className="font-bold text-slate-800 text-xs">{activeDistrict.risk_confidence || 'Medium'}</span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-600 space-y-1 pt-1">
                  <div><b>Data Mode:</b> {activeDistrict.data_source_mode}</div>
                  <div><b>Provenance:</b> {activeDistrict.data_provenance || 'Prototype Baseline'}</div>
                  <div><b>Topography:</b> {activeDistrict.terrain_type}</div>
                </div>

                {activeDistrict.alert_intelligence && activeDistrict.alert_intelligence.alert_level !== 'NORMAL' && (
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-xs text-rose-900 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                        {activeDistrict.alert_intelligence.alert_level} ALERT
                      </span>
                      <span className="text-[10px] font-bold text-rose-700">
                        Peak: {activeDistrict.alert_intelligence.projected_risk} ({activeDistrict.alert_intelligence.peak_horizon})
                      </span>
                    </div>
                    <p className="text-[11px] text-rose-800 line-clamp-2">{activeDistrict.alert_intelligence.headline}</p>
                  </div>
                )}

                <button
                  onClick={() => setModalDistrict(activeDistrict)}
                  className="w-full mt-2 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-lg transition-colors shadow-xs"
                >
                  Open Full Detail Inspector
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* District Detail Modal */}
      {modalDistrict && (
        <DistrictDetailModal
          district={modalDistrict}
          onClose={() => setModalDistrict(null)}
        />
      )}
    </div>
  );
};
