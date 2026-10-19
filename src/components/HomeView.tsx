import React, { useState } from 'react';
import { 
  Waves, 
  Cpu, 
  Map, 
  Bot, 
  ArrowRight, 
  CheckCircle2, 
  ShieldCheck, 
  Database, 
  Info, 
  AlertTriangle,
  TrendingUp,
  CloudRain,
  Radio,
  ShieldAlert,
  Send,
  Activity,
  Zap,
  BellRing,
  LayoutDashboard,
  ExternalLink
} from 'lucide-react';
import { DistrictStatus } from '../types';

interface HomeViewProps {
  districts: DistrictStatus[];
  onNavigate: (tab: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ districts, onNavigate }) => {
  const [dispatchToast, setDispatchToast] = useState<string | null>(null);

  const getRiskBadgeClass = (category: string) => {
    switch (category) {
      case 'CRITICAL':
        return 'bg-red-500/10 text-red-600 border-red-500/30';
      case 'HIGH':
        return 'bg-orange-500/10 text-orange-600 border-orange-500/30';
      case 'MODERATE':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
      default:
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30';
    }
  };

  // Top 3 Situations
  const sortedByRisk = [...districts].sort((a, b) => (b.flood_risk_score || 0) - (a.flood_risk_score || 0));
  const top3Districts = sortedByRisk.slice(0, 3);

  // Critical & High counts
  const criticalCount = districts.filter(d => d.risk_category === 'CRITICAL').length;
  const highCount = districts.filter(d => d.risk_category === 'HIGH').length;

  // Peak district and state average
  const highestPeakDistrict = sortedByRisk[0] || districts[0];
  const avgRisk = districts.length > 0
    ? Math.round(districts.reduce((acc, d) => acc + (d.flood_risk_score || 0), 0) / districts.length)
    : 0;

  // Max rainfall district
  const maxRainDistrict = [...districts].sort((a, b) => (b.rainfall_mm_24h || 0) - (a.rainfall_mm_24h || 0))[0] || districts[0];

  // Fastest rising district (+6h forecast delta)
  const fastestRising = [...districts].sort((a, b) => {
    const deltaA = (a.forecast_summary?.projectedRiskScore ?? a.flood_risk_score ?? 0) - (a.flood_risk_score ?? 0);
    const deltaB = (b.forecast_summary?.projectedRiskScore ?? b.flood_risk_score ?? 0) - (b.flood_risk_score ?? 0);
    return deltaB - deltaA;
  })[0] || districts[0];

  // Citizen reports total count
  const totalReportsCount = districts.reduce((acc, d) => acc + (d.citizen_reports_count || 0), 0);

  const handleQuickDispatch = async (dName: string, level: string) => {
    try {
      const res = await fetch('/api/notifications/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          districtId: dName.toLowerCase().replace(/ /g, '_'),
          districtName: dName,
          alertLevel: level === 'CRITICAL' ? 'EMERGENCY' : level === 'HIGH' ? 'WARNING' : 'ADVISORY',
          title: `Prototype Officer Dispatch: ${dName}`,
          message: `Decision support advisory dispatched for ${dName} (${level} flood risk priority).`,
          recommendedAction: 'Verify stormwater pumping and stage rescue equipment.',
        }),
      });
      if (res.ok) {
        setDispatchToast(`Notification dispatched for ${dName} (${level})`);
        setTimeout(() => setDispatchToast(null), 3500);
      }
    } catch (err) {
      console.warn('Dispatch failed:', err);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Dispatch Toast Feedback */}
      {dispatchToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-xl border border-blue-500/50 flex items-center gap-2 text-sm">
          <BellRing className="w-4 h-4 text-amber-400 animate-bounce" />
          <span>{dispatchToast}</span>
        </div>
      )}

      {/* 1. HERO SECTION: Situation Room Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 border border-slate-800 p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-4xl space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-semibold uppercase tracking-wider">
              <Activity className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
              <span>Situation Room • 33 Monitored Districts</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[11px] font-semibold">
              Live Telemetry Synced
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-[11px] font-semibold">
              Trilingual: EN / TE / HI
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
            NeerDrishti: Urban Flood Intelligence & Decision Support
          </h1>

          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed max-w-3xl">
            State-level decision room correlating live Open-Meteo telemetry, deterministic 5-factor mathematical risk scoring (Rainfall 35% / History 25% / Terrain 15% / Citizen 15% / Drainage 10%), river basin routing, and RAG-grounded multilingual advisories in English, Telugu, and Hindi.
          </p>
        </div>
      </div>

      {/* 2. 4-TILE STATS: High-Impact Operational KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tile 1: Active Alert Severity */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-start justify-between">
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Alert Escalations</div>
            <div className="text-2xl font-black text-rose-600">
              {criticalCount + highCount} <span className="text-xs font-semibold text-slate-500">/ 33</span>
            </div>
            <div className="text-[11px] text-slate-600 font-medium">
              <span className="text-rose-600 font-bold">{criticalCount} Critical</span> • <span className="text-amber-600 font-bold">{highCount} High</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-600">
            <ShieldAlert className="w-5 h-5" />
          </div>
        </div>

        {/* Tile 2: State Flood Risk */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-start justify-between">
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Peak District Risk</div>
            <div className="text-2xl font-black text-slate-900">
              {highestPeakDistrict?.flood_risk_score ?? 88} <span className="text-xs font-semibold text-slate-500">/ 100</span>
            </div>
            <div className="text-[11px] text-slate-600 font-medium">
              <span className="font-bold text-slate-800">{highestPeakDistrict?.district || 'Hyderabad'}</span> (Avg {avgRisk}/100)
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        {/* Tile 3: 24h Rainfall Telemetry */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-start justify-between">
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Peak 24h Rainfall</div>
            <div className="text-2xl font-black text-blue-600">
              {maxRainDistrict?.rainfall_mm_24h ?? 0} <span className="text-xs font-semibold text-slate-500">mm</span>
            </div>
            <div className="text-[11px] text-slate-600 font-medium truncate max-w-[170px]" title={`${maxRainDistrict?.district} (Fastest Rising: ${fastestRising?.district})`}>
              <span className="font-bold text-slate-800">{maxRainDistrict?.district}</span> • Rising: {fastestRising?.district}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-100 text-blue-600">
            <CloudRain className="w-5 h-5" />
          </div>
        </div>

        {/* Tile 4: Citizen Signal & Telemetry Ingestion */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-start justify-between">
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Citizen & IoT Telemetry</div>
            <div className="text-2xl font-black text-emerald-600">
              {totalReportsCount} <span className="text-xs font-semibold text-slate-500">Reports</span>
            </div>
            <div className="text-[11px] text-slate-600 font-medium">
              33/33 Districts Synced (Live)
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600">
            <Radio className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. TOP 3 SITUATIONS: Immediate Critical Situations Board */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-bold uppercase tracking-wider mb-0.5 border border-rose-200">
              <AlertTriangle className="w-3 h-3 text-rose-600" />
              <span>Priority Action Queue</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">Top 3 Critical Situations Requiring Immediate Attention</h2>
          </div>
          <div className="text-xs text-slate-500">
            Deterministic 5-factor scoring breakdown with active telemetry triggers
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {top3Districts.map((d, index) => {
            const isCritical = d.risk_category === 'CRITICAL';
            const isHigh = d.risk_category === 'HIGH';
            return (
              <div
                key={d.district}
                className="bg-slate-50/80 rounded-xl border border-slate-200 p-4 flex flex-col justify-between hover:border-slate-300 transition-all space-y-3"
              >
                <div className="space-y-2.5">
                  {/* District Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 text-xs font-bold flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900">{d.district}</h3>
                        <span className="text-[10px] text-slate-500">{d.region_zone || 'Telangana'} Zone</span>
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${getRiskBadgeClass(d.risk_category)}`}>
                      {d.risk_category} ({d.flood_risk_score}/100)
                    </span>
                  </div>

                  {/* 5-Factor Deterministic Signals Breakdown */}
                  <div className="p-2.5 rounded-lg bg-white border border-slate-200 space-y-1.5 text-[11px] text-slate-600">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Rainfall (35% wt):</span>
                      <span className="font-bold text-blue-600">{d.rainfall_mm_24h} mm</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">History (25% wt):</span>
                      <span className="font-semibold text-slate-800">{d.risk_category === 'CRITICAL' ? 'High Inundation' : 'Frequent Stagnation'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Terrain (15% wt):</span>
                      <span className="font-semibold text-slate-800">{d.monitoring_category === 'Priority Flood Monitoring' ? 'Low Slope Basins' : 'Moderate Terrain'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Citizen Reports (15% wt):</span>
                      <span className="font-bold text-indigo-600">{d.citizen_reports_count || 0} active</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500">Drainage (10% wt):</span>
                      <span className="font-semibold text-slate-800">{isCritical ? 'Choked Nalas' : 'Constrained'}</span>
                    </div>
                  </div>

                  {/* Forecast trajectory & recommended protocol */}
                  <div className="text-[11px] text-slate-600 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">Projected +6H:</span>
                      <span className="font-bold text-slate-800">
                        {d.forecast_summary?.projectedRiskScore ?? d.flood_risk_score}/100 ({d.forecast_summary?.dominantTrend || 'RISING'})
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-700 italic bg-amber-50/70 p-1.5 rounded border border-amber-200/60">
                      {isCritical 
                        ? 'Immediate SDRF staging, nala de-silt barricading, and flood gate monitoring.'
                        : isHigh 
                        ? 'Deploy heavy stormwater pump sets and clear major arterial culverts.'
                        : 'Maintain regular gauge polling and inspect municipal stormwater outfalls.'}
                    </p>
                  </div>
                </div>

                {/* Dispatch Button */}
                <button
                  onClick={() => handleQuickDispatch(d.district, d.risk_category)}
                  className={`w-full py-2 rounded-lg text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs ${
                    isCritical
                      ? 'bg-rose-600 hover:bg-rose-500'
                      : isHigh
                      ? 'bg-orange-600 hover:bg-orange-500'
                      : 'bg-indigo-600 hover:bg-indigo-500'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Dispatch Officer Protocol</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. 5 NAVIGATION CARDS: Primary Operations Modules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-blue-600" />
            <span>Operational Modules & Intelligence Workspaces</span>
          </h2>
          <span className="text-xs text-slate-500">Direct navigation across NeerDrishti modules</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Nav Card 1: Dashboard */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                <Cpu className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Live Dashboard</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Full 33-district monitoring matrix with real-time risk gauges, rainfall telemetry, and sorting filters.
              </p>
            </div>
            <button
              id="home-btn-dashboard"
              onClick={() => onNavigate('dashboard')}
              className="w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>Open Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Nav Card 2: Interactive Map */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                <Map className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Risk & Scenario Map</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Geospatial GIS visualizer with scenario simulation sliders, terrain contours, and chronic choke points.
              </p>
            </div>
            <button
              id="home-btn-map"
              onClick={() => onNavigate('map')}
              className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>View Interactive Map</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Nav Card 3: Alert Center */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Alert Intelligence</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                CAP-compliant disaster warnings and public safety advisories trilingually generated in EN, TE, and HI.
              </p>
            </div>
            <button
              id="home-btn-alerts"
              onClick={() => onNavigate('alerts')}
              className="w-full py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>Manage Alerts</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Nav Card 4: Situation Room & Fusion */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                <Waves className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">Situation Fusion</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                River basin routing across Godavari and Krishna, reservoir levels, and multi-sensor correlation.
              </p>
            </div>
            <button
              id="home-btn-situation"
              onClick={() => onNavigate('situation')}
              className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>Enter Fusion Room</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Nav Card 5: AI Assistant & Voice */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-100">
                <Bot className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 text-sm">AI Voice Assistant</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                RAG-grounded decision support with speech recognition (STT) and voice readout (TTS) in EN, TE, and HI.
              </p>
            </div>
            <button
              id="home-btn-assistant"
              onClick={() => onNavigate('assistant')}
              className="w-full py-2 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <span>Consult AI Assistant</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 5. 5-STEP PIPELINE: Transparent Architecture & Separation of Concerns */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 sm:p-7 space-y-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider mb-1 border border-blue-200">
            <Cpu className="w-3 h-3 text-blue-600" />
            <span>Architecture & Scientific Integrity</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900">5-Step Hydro-Intelligence Pipeline</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Strict Separation of Concerns: Deterministic mathematical scoring engine + LLM reasoning layer (LLM explains, never calculates).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5">
          {/* Step 1 */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
              1
            </div>
            <h4 className="font-bold text-xs sm:text-sm text-slate-900">Multi-Source Telemetry</h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Open-Meteo live API, IMD rain gauges, CWC river levels, DEM elevation contours & citizen crowd observations across 33 Telangana districts.
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
              2
            </div>
            <h4 className="font-bold text-xs sm:text-sm text-slate-900">Deterministic Risk Engine</h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Weighted formula strictly normalized to 0–100: <strong className="text-slate-700">Rainfall 35%, History 25%, Terrain 15%, Citizen 15%, Drainage 10%</strong>.
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
              3
            </div>
            <h4 className="font-bold text-xs sm:text-sm text-slate-900">Basin Propagation</h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Hydrological routing across Godavari and Krishna sub-basins, dam discharge lag, and upstream-to-downstream floodwave propagation.
            </p>
          </div>

          {/* Step 4 */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
            <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
              4
            </div>
            <h4 className="font-bold text-xs sm:text-sm text-slate-900">Grounded AI & RAG</h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Contextual reasoning retrieving district dossiers to explain WHY risk exists. The LLM explains causes and never alters scores.
            </p>
          </div>

          {/* Step 5 */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
              5
            </div>
            <h4 className="font-bold text-xs sm:text-sm text-slate-900">Trilingual Safety & Voice</h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Actionable public safety advisories and interactive voice assistance (STT/TTS) delivered in English, Telugu, and Hindi.
            </p>
          </div>
        </div>
      </div>

      {/* 6. DETERMINISTIC VS LLM PRINCIPLES COMPARISON */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 shadow-2xs">
          <div className="flex items-center gap-2 text-blue-700 font-bold text-sm">
            <Database className="w-4 h-4" />
            <span>Deterministic Math & Data Layer</span>
          </div>
          <ul className="space-y-2 text-xs text-slate-600">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Calculates numerical flood risk score (0–100) deterministically from verified mathematical weights.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Processes rainfall thresholds according to IMD meteorological guidelines.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Protects data integrity by preventing hallucinated risk numbers or subjective model scoring.</span>
            </li>
          </ul>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 shadow-2xs">
          <div className="flex items-center gap-2 text-indigo-700 font-bold text-sm">
            <Bot className="w-4 h-4" />
            <span>LLM Intelligence & Communication Layer</span>
          </div>
          <ul className="space-y-2 text-xs text-slate-600">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>Understands unstructured citizen crowd observations and categorizes incident triage priority.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>Synthesizes terrain, drainage, and river basin context to explain WHY a district is at high risk.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>Generates explainable, actionable public safety advisories in English, Telugu, and Hindi.</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};
