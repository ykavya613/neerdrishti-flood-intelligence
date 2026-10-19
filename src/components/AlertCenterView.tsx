import React, { useState } from 'react';
import { 
  ShieldAlert, 
  AlertTriangle, 
  Activity, 
  Eye, 
  CheckCircle2, 
  TrendingUp, 
  TrendingDown,
  RefreshCw, 
  Search, 
  Filter, 
  ChevronRight, 
  Bot, 
  Sparkles, 
  Droplets, 
  Users, 
  Layers, 
  Clock, 
  Sliders,
  Info,
  Languages,
  Check,
  ExternalLink
} from 'lucide-react';
import { DistrictStatus, SimulationScenarioName, DistrictAlert, AlertLevel, AlertType } from '../types';

interface AlertCenterViewProps {
  districts: DistrictStatus[];
  scenario: SimulationScenarioName;
  onScenarioChange: (scenario: SimulationScenarioName) => void;
  onRefresh?: () => void;
  onSelectDistrictForModal?: (district: DistrictStatus) => void;
}

export const AlertCenterView: React.FC<AlertCenterViewProps> = ({
  districts,
  scenario,
  onScenarioChange,
  onRefresh,
  onSelectDistrictForModal,
}) => {
  const [levelFilter, setLevelFilter] = useState<'All' | AlertLevel>('All');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [zoneFilter, setZoneFilter] = useState<string>('All');
  const [dataModeFilter, setDataModeFilter] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedAlert, setSelectedAlert] = useState<DistrictAlert | null>(null);
  const [advisoryLanguage, setAdvisoryLanguage] = useState<'en' | 'te' | 'hi'>('en');
  const [isRecalculating, setIsRecalculating] = useState<boolean>(false);
  const [aiExplanation, setAiExplanation] = useState<any | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState<boolean>(false);
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState<Record<string, boolean>>({});

  // Extract all alerts from districts
  const allAlerts: DistrictAlert[] = districts
    .map(d => d.alert_intelligence)
    .filter((a): a is DistrictAlert => a !== undefined);

  // Summary counts
  const totalAlerts = allAlerts.length;
  const criticalCount = allAlerts.filter(a => a.alert_level === 'CRITICAL').length;
  const highCount = allAlerts.filter(a => a.alert_level === 'HIGH').length;
  const elevatedCount = allAlerts.filter(a => a.alert_level === 'ELEVATED').length;
  const watchCount = allAlerts.filter(a => a.alert_level === 'WATCH').length;
  const normalCount = allAlerts.filter(a => a.alert_level === 'NORMAL').length;
  const activeAlertsCount = criticalCount + highCount + elevatedCount + watchCount;
  const risingCount = allAlerts.filter(a => a.trend === 'RISING').length;
  const rapidCount = allAlerts.filter(a => a.rate_of_change === 'RAPID_ESCALATION').length;
  const basinThreatCount = allAlerts.filter(a => a.basin_signal.has_upstream_threat).length;
  const citizenSurgeCount = allAlerts.filter(a => a.citizen_signal.is_surging).length;

  // Filtered alerts
  const filteredAlerts = allAlerts.filter(a => {
    if (levelFilter !== 'All' && a.alert_level !== levelFilter) return false;
    if (typeFilter !== 'All' && a.primary_alert_type !== typeFilter) return false;
    if (zoneFilter !== 'All' && !a.region_zone.toLowerCase().includes(zoneFilter.toLowerCase())) return false;
    if (dataModeFilter !== 'All' && !a.data_mode.toLowerCase().includes(dataModeFilter.toLowerCase())) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const match = a.district_name.toLowerCase().includes(q) ||
                    a.headline.toLowerCase().includes(q) ||
                    a.region_zone.toLowerCase().includes(q) ||
                    a.trigger_reasons.some(r => r.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  // Sort: Critical -> High -> Elevated -> Watch -> Normal, then peak risk
  const sortedAlerts = [...filteredAlerts].sort((a, b) => {
    if (b.alert_level_code !== a.alert_level_code) {
      return b.alert_level_code - a.alert_level_code;
    }
    return b.projected_risk - a.projected_risk;
  });

  // Handle recalculate
  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      await fetch('/api/alerts/recalculate', { method: 'POST' });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Error recalculating alerts:', err);
    } finally {
      setTimeout(() => setIsRecalculating(false), 500);
    }
  };

  // Fetch Meta Llama AI Explanation
  const fetchAiExplanation = async (alert: DistrictAlert) => {
    setIsLoadingAi(true);
    setAiExplanation(null);
    try {
      const res = await fetch(`/api/alerts/district/${alert.district_id}/ai-explain`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.llm_explanation) {
        setAiExplanation(data.llm_explanation);
      }
    } catch (err) {
      console.error('Error generating AI explanation:', err);
    } finally {
      setIsLoadingAi(false);
    }
  };

  const toggleAcknowledge = async (alertId: string) => {
    const nextState = !acknowledgedAlerts[alertId];
    setAcknowledgedAlerts(prev => ({ ...prev, [alertId]: nextState }));
    try {
      await fetch(`/api/alerts/${alertId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextState ? 'Acknowledged' : 'Active' }),
      });
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  // Helper for alert colors & badges
  const getLevelConfig = (level: AlertLevel) => {
    switch (level) {
      case 'CRITICAL':
        return {
          bg: 'bg-rose-50 border-rose-200 text-rose-800',
          badge: 'bg-rose-600 text-white',
          border: 'border-rose-300',
          pill: 'bg-rose-100 text-rose-900 border-rose-300',
          icon: ShieldAlert,
        };
      case 'HIGH':
        return {
          bg: 'bg-orange-50 border-orange-200 text-orange-800',
          badge: 'bg-orange-600 text-white',
          border: 'border-orange-300',
          pill: 'bg-orange-100 text-orange-900 border-orange-300',
          icon: AlertTriangle,
        };
      case 'ELEVATED':
        return {
          bg: 'bg-amber-50 border-amber-200 text-amber-800',
          badge: 'bg-amber-500 text-slate-900',
          border: 'border-amber-300',
          pill: 'bg-amber-100 text-amber-900 border-amber-300',
          icon: Activity,
        };
      case 'WATCH':
        return {
          bg: 'bg-blue-50 border-blue-200 text-blue-800',
          badge: 'bg-blue-600 text-white',
          border: 'border-blue-300',
          pill: 'bg-blue-100 text-blue-900 border-blue-300',
          icon: Eye,
        };
      default:
        return {
          bg: 'bg-emerald-50 border-emerald-200 text-emerald-800',
          badge: 'bg-emerald-600 text-white',
          border: 'border-emerald-300',
          pill: 'bg-emerald-100 text-emerald-900 border-emerald-300',
          icon: CheckCircle2,
        };
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-800/80 text-blue-200 border border-blue-700">
                PHASE F • ALERT INTELLIGENCE LAYER
              </span>
              <span className="text-xs text-slate-400">Deterministic Public Safety Decision Support</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <ShieldAlert className="w-7 h-7 text-amber-400" />
              Telangana Statewide Flood Alert Center
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Real-time deterministic alert classification synthesizing current risk, multi-horizon forecast escalation, river basin propagation, and citizen hazard reports.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="recalculate-alerts-btn"
              onClick={handleRecalculate}
              disabled={isRecalculating}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-semibold rounded-lg shadow transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRecalculating ? 'animate-spin' : ''}`} />
              <span>{isRecalculating ? 'Recalculating...' : 'Recalculate All Districts'}</span>
            </button>
          </div>
        </div>

        {/* Metric Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-5 border-t border-slate-800 text-xs">
          <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
            <p className="text-slate-400 font-medium">Active Alerts</p>
            <p className="text-2xl font-bold text-white mt-0.5">{activeAlertsCount} <span className="text-xs text-slate-400 font-normal">/ {totalAlerts}</span></p>
            <p className="text-[11px] text-blue-400 mt-1">{criticalCount} Critical • {highCount} High</p>
          </div>

          <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
            <p className="text-slate-400 font-medium">Critical Alerts</p>
            <p className="text-2xl font-bold text-rose-400 mt-0.5">{criticalCount}</p>
            <p className="text-[11px] text-slate-400 mt-1">Immediate focus zones</p>
          </div>

          <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
            <p className="text-slate-400 font-medium">High / Elevated</p>
            <p className="text-2xl font-bold text-orange-400 mt-0.5">{highCount + elevatedCount}</p>
            <p className="text-[11px] text-slate-400 mt-1">{highCount} High • {elevatedCount} Elevated</p>
          </div>

          <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
            <p className="text-slate-400 font-medium">Rising Trajectory</p>
            <p className="text-2xl font-bold text-amber-400 mt-0.5">{risingCount}</p>
            <p className="text-[11px] text-slate-400 mt-1">{rapidCount} Rapid Escalations</p>
          </div>

          <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
            <p className="text-slate-400 font-medium">Basin Propagation</p>
            <p className="text-2xl font-bold text-sky-400 mt-0.5">{basinThreatCount}</p>
            <p className="text-[11px] text-slate-400 mt-1">Active upstream surges</p>
          </div>

          <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
            <p className="text-slate-400 font-medium">Citizen Surges</p>
            <p className="text-2xl font-bold text-indigo-400 mt-0.5">{citizenSurgeCount}</p>
            <p className="text-[11px] text-slate-400 mt-1">Field crowd escalations</p>
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              id="alert-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by district name, region zone, or alert trigger..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Quick Level Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            {(['All', 'CRITICAL', 'HIGH', 'ELEVATED', 'WATCH', 'NORMAL'] as const).map((lvl) => {
              const isActive = levelFilter === lvl;
              const badgeCount = lvl === 'All' ? allAlerts.length :
                                 lvl === 'CRITICAL' ? criticalCount :
                                 lvl === 'HIGH' ? highCount :
                                 lvl === 'ELEVATED' ? elevatedCount :
                                 lvl === 'WATCH' ? watchCount : normalCount;
              return (
                <button
                  key={lvl}
                  id={`filter-level-${lvl.toLowerCase()}`}
                  onClick={() => setLevelFilter(lvl)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    isActive
                      ? lvl === 'CRITICAL'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : lvl === 'HIGH'
                        ? 'bg-orange-600 text-white shadow-sm'
                        : lvl === 'ELEVATED'
                        ? 'bg-amber-500 text-slate-900 shadow-sm'
                        : lvl === 'WATCH'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : lvl === 'NORMAL'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <span>{lvl}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-black/20 text-inherit' : 'bg-slate-200 text-slate-600'}`}>
                    {badgeCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Secondary Filter Dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Alert Type:</span>
            <select
              id="alert-type-select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="All">All Alert Types</option>
              <option value="Current Risk Alert">Current Risk Alert</option>
              <option value="Forecast Escalation">Forecast Escalation</option>
              <option value="Rapid Risk Increase">Rapid Risk Increase</option>
              <option value="Citizen Report Surge">Citizen Report Surge</option>
              <option value="Basin Propagation Watch">Basin Propagation Watch</option>
              <option value="Critical Projection">Critical Projection</option>
              <option value="Data Uncertainty Notice">Data Uncertainty Notice</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Region Zone:</span>
            <select
              id="alert-zone-select"
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="All">All Regions</option>
              <option value="North Telangana">North Telangana</option>
              <option value="Hyderabad Urban Region">Hyderabad Urban Region</option>
              <option value="Godavari Influence Region">Godavari Influence Region</option>
              <option value="Central Telangana">Central Telangana</option>
              <option value="South Telangana">South Telangana</option>
              <option value="Krishna Influence Region">Krishna Influence Region</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Data Mode:</span>
            <select
              id="alert-datamode-select"
              value={dataModeFilter}
              onChange={(e) => setDataModeFilter(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="All">All Data Modes</option>
              <option value="Live Data">Live Data Only</option>
              <option value="Simulated Data">Simulated Data</option>
              <option value="Prototype Baseline">Prototype Baseline</option>
              <option value="Limited Data">Limited Data</option>
            </select>
          </div>
        </div>
      </div>

      {/* Alert Cards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>Showing {sortedAlerts.length} of {allAlerts.length} Telangana District Alerts</span>
          <span>Sorted by Alert Severity and Peak Projected Risk</span>
        </div>

        {sortedAlerts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-base font-semibold text-slate-700">No alerts match the active filters</p>
            <p className="text-xs text-slate-400 mt-1">Try resetting the filters or selecting a different scenario.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sortedAlerts.map((alert) => {
              const cfg = getLevelConfig(alert.alert_level);
              const LevelIcon = cfg.icon;
              const isAcknowledged = acknowledgedAlerts[alert.alert_id];

              return (
                <div
                  key={alert.alert_id}
                  id={`alert-card-${alert.district_id}`}
                  className={`bg-white rounded-xl border ${cfg.border} p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden`}
                >
                  {/* Top Level Stripe */}
                  <div className={`absolute top-0 left-0 right-0 h-1.5 ${
                    alert.alert_level === 'CRITICAL' ? 'bg-rose-600' :
                    alert.alert_level === 'HIGH' ? 'bg-orange-600' :
                    alert.alert_level === 'ELEVATED' ? 'bg-amber-500' :
                    alert.alert_level === 'WATCH' ? 'bg-blue-600' : 'bg-emerald-600'
                  }`} />

                  <div>
                    {/* Header: District Name & Level Badge */}
                    <div className="flex items-start justify-between gap-2 mb-2 pt-1">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-base text-slate-900">{alert.district_name}</h3>
                          <span className="text-[11px] text-slate-500 font-medium">({alert.region_zone})</span>
                        </div>
                        <p className="text-xs font-semibold text-slate-600 mt-0.5">{alert.primary_alert_type}</p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`text-[11px] px-2.5 py-1 rounded-md font-bold uppercase tracking-wide flex items-center gap-1 shadow-sm ${cfg.badge}`}>
                          <LevelIcon className="w-3.5 h-3.5" />
                          <span>{alert.alert_level}</span>
                        </span>
                      </div>
                    </div>

                    {/* Headline Banner */}
                    <div className={`p-2 rounded-lg text-xs font-semibold mb-3 border ${cfg.bg}`}>
                      {alert.headline}
                    </div>

                    {/* Risk & Horizon Metric Badges */}
                    <div className="grid grid-cols-3 gap-2 py-2 bg-slate-50 rounded-lg p-2.5 border border-slate-100 text-xs mb-3">
                      <div>
                        <span className="text-slate-400 block text-[10px]">CURRENT RISK</span>
                        <span className="font-bold text-slate-900 text-sm">{alert.current_risk}/100</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">PEAK PROJECTED</span>
                        <span className="font-bold text-slate-900 text-sm">
                          {alert.projected_risk}/100 <span className="text-[10px] text-blue-600 font-normal">({alert.peak_horizon})</span>
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">TRAJECTORY</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          {alert.trend === 'RISING' ? (
                            <TrendingUp className="w-3.5 h-3.5 text-rose-600" />
                          ) : alert.trend === 'IMPROVING' ? (
                            <TrendingDown className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Activity className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          <span className={`font-semibold text-xs ${
                            alert.trend === 'RISING' ? 'text-rose-600' :
                            alert.trend === 'IMPROVING' ? 'text-emerald-600' : 'text-slate-700'
                          }`}>
                            {alert.risk_delta > 0 ? `+${alert.risk_delta} pts` : `${alert.risk_delta} pts`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Multi-Horizon Stepper Timeline */}
                    <div className="space-y-1 mb-3">
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                        <span>Multi-Horizon Trajectory:</span>
                        <span>Confidence: {alert.confidence} ({Math.round(alert.confidence_score * 100)}%)</span>
                      </div>
                      <div className="grid grid-cols-5 gap-1 text-center">
                        {alert.timeline_escalation.map((t) => (
                          <div
                            key={t.horizon}
                            className={`p-1.5 rounded text-[11px] border transition-all ${
                              t.horizon === alert.peak_horizon
                                ? 'bg-blue-600 text-white font-bold border-blue-700 shadow-sm'
                                : t.escalation_flag
                                ? 'bg-rose-50 text-rose-800 border-rose-200 font-semibold'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            <span className="block text-[9px] opacity-75">{t.horizon}</span>
                            <span>{t.projected_risk}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Signal Highlights (Citizen & Basin) */}
                    <div className="space-y-1.5 text-xs text-slate-600 mb-3 bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
                      {alert.basin_signal.has_upstream_threat && (
                        <div className="flex items-start gap-1.5 text-sky-800">
                          <Droplets className="w-3.5 h-3.5 mt-0.5 shrink-0 text-sky-600" />
                          <span className="text-[11px]">{alert.basin_signal.summary}</span>
                        </div>
                      )}
                      {alert.citizen_signal.total_24h > 0 && (
                        <div className="flex items-start gap-1.5 text-indigo-800">
                          <Users className="w-3.5 h-3.5 mt-0.5 shrink-0 text-indigo-600" />
                          <span className="text-[11px]">{alert.citizen_signal.summary}</span>
                        </div>
                      )}
                      <div className="flex items-start gap-1.5 text-slate-600">
                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
                        <span className="text-[11px] line-clamp-2">{alert.trigger_reasons[0]}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2 mt-2">
                    <button
                      id={`ack-btn-${alert.district_id}`}
                      onClick={() => toggleAcknowledge(alert.alert_id)}
                      className={`text-xs px-2.5 py-1.5 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                        isAcknowledged
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isAcknowledged ? 'Acknowledged' : 'Acknowledge'}</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {onSelectDistrictForModal && (
                        <button
                          id={`inspect-district-btn-${alert.district_id}`}
                          onClick={() => {
                            const d = districts.find(item => item.district_id === alert.district_id || item.district === alert.district_name);
                            if (d) onSelectDistrictForModal(d);
                          }}
                          className="text-xs px-2.5 py-1.5 rounded-md font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                        >
                          Telemetry
                        </button>
                      )}

                      <button
                        id={`view-advisory-btn-${alert.district_id}`}
                        onClick={() => {
                          setSelectedAlert(alert);
                          fetchAiExplanation(alert);
                        }}
                        className="text-xs px-3 py-1.5 rounded-md font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 shadow-sm transition-colors"
                      >
                        <span>Advisory (EN/TE/HI)</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detailed Multilingual Advisory Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className={`p-5 text-white flex items-start justify-between ${
              selectedAlert.alert_level === 'CRITICAL' ? 'bg-rose-700' :
              selectedAlert.alert_level === 'HIGH' ? 'bg-orange-600' :
              selectedAlert.alert_level === 'ELEVATED' ? 'bg-amber-600' :
              selectedAlert.alert_level === 'WATCH' ? 'bg-blue-700' : 'bg-slate-800'
            }`}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-black/25 text-white">
                    {selectedAlert.alert_level} • {selectedAlert.primary_alert_type}
                  </span>
                  <span className="text-xs text-white/80">{selectedAlert.region_zone}</span>
                </div>
                <h2 className="text-xl font-bold">{selectedAlert.district_name} Flood Alert Advisory</h2>
                <p className="text-xs text-white/90 mt-0.5">{selectedAlert.headline}</p>
              </div>

              {/* Language Switcher */}
              <div className="flex items-center bg-black/20 p-1 rounded-lg border border-white/20">
                <button
                  onClick={() => setAdvisoryLanguage('en')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                    advisoryLanguage === 'en' ? 'bg-white text-slate-900 shadow' : 'text-white/80 hover:text-white'
                  }`}
                >
                  English
                </button>
                <button
                  onClick={() => setAdvisoryLanguage('te')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                    advisoryLanguage === 'te' ? 'bg-white text-slate-900 shadow' : 'text-white/80 hover:text-white'
                  }`}
                >
                  తెలుగు (Telugu)
                </button>
                <button
                  onClick={() => setAdvisoryLanguage('hi')}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                    advisoryLanguage === 'hi' ? 'bg-white text-slate-900 shadow' : 'text-white/80 hover:text-white'
                  }`}
                >
                  हिन्दी (Hindi)
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-slate-800 text-sm">
              {/* Telemetry Summary Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">CURRENT RISK</span>
                  <span className="font-bold text-slate-900 text-sm">{selectedAlert.current_risk}/100</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">PROJECTED PEAK</span>
                  <span className="font-bold text-slate-900 text-sm">{selectedAlert.projected_risk}/100 ({selectedAlert.peak_horizon})</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">RATE OF CHANGE</span>
                  <span className="font-bold text-slate-900 text-sm">{selectedAlert.rate_of_change.replace(/_/g, ' ')}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">DATA CONFIDENCE</span>
                  <span className="font-bold text-slate-900 text-sm">{selectedAlert.confidence} ({Math.round(selectedAlert.confidence_score * 100)}%)</span>
                </div>
              </div>

              {/* Advisory Content based on selected language */}
              {advisoryLanguage === 'en' ? (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <h3 className="font-bold text-blue-950 text-base mb-1">{selectedAlert.advisories.english.title}</h3>
                    <p className="text-blue-900 text-sm leading-relaxed">{selectedAlert.advisories.english.situation_summary}</p>
                  </div>

                  {/* Why Triggered */}
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-blue-600" />
                      Deterministic Trigger Rationale
                    </h4>
                    <ul className="space-y-1.5 text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200 list-disc list-inside">
                      {selectedAlert.trigger_reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Recommended Precautions */}
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-amber-600" />
                      Public Safety Recommendations
                    </h4>
                    <div className="space-y-2">
                      {selectedAlert.advisories.english.recommended_precautions.map((p, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs bg-amber-50/60 border border-amber-200/80 p-2.5 rounded-lg text-amber-950">
                          <CheckCircle2 className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                          <span>{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : advisoryLanguage === 'te' ? (
                <div className="space-y-4 font-sans">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <h3 className="font-bold text-blue-950 text-base mb-1">{selectedAlert.advisories.telugu.title}</h3>
                    <p className="text-blue-900 text-sm leading-relaxed">{selectedAlert.advisories.telugu.situation_summary}</p>
                  </div>

                  {/* Why Triggered Telugu */}
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-blue-600" />
                      హెచ్చరిక కారణాలు (Trigger Reasons)
                    </h4>
                    <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      {selectedAlert.advisories.telugu.why_triggered}
                    </div>
                  </div>

                  {/* Recommended Precautions Telugu */}
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-amber-600" />
                      ప్రజల అప్రమత్తత సూచనలు (Safety Actions)
                    </h4>
                    <div className="space-y-2">
                      {selectedAlert.advisories.telugu.recommended_precautions.map((p, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs bg-amber-50/60 border border-amber-200/80 p-2.5 rounded-lg text-amber-950">
                          <CheckCircle2 className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                          <span>{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 font-sans">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <h3 className="font-bold text-blue-950 text-base mb-1">
                      {selectedAlert.advisories.hindi?.title || selectedAlert.advisories.english.title}
                    </h3>
                    <p className="text-blue-900 text-sm leading-relaxed">
                      {selectedAlert.advisories.hindi?.situation_summary || selectedAlert.advisories.english.situation_summary}
                    </p>
                  </div>

                  {/* Why Triggered Hindi */}
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-blue-600" />
                      चेतावनी कारण (Trigger Reasons)
                    </h4>
                    <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      {selectedAlert.advisories.hindi?.why_triggered || selectedAlert.trigger_reasons.join('. ')}
                    </div>
                  </div>

                  {/* Recommended Precautions Hindi */}
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-amber-600" />
                      नागरिक सुरक्षा एवं बचाव निर्देश (Safety Actions)
                    </h4>
                    <div className="space-y-2">
                      {(selectedAlert.advisories.hindi?.recommended_precautions || selectedAlert.advisories.english.recommended_precautions).map((p, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs bg-amber-50/60 border border-amber-200/80 p-2.5 rounded-lg text-amber-950">
                          <CheckCircle2 className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                          <span>{p}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Meta Llama AI Reasoning Expansion */}
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-purple-600" />
                    <span className="font-bold text-xs text-slate-800">AI Deep-Dive Grounded Advisory</span>
                  </div>
                  {isLoadingAi && (
                    <span className="text-[11px] text-purple-600 animate-pulse flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 animate-spin" /> Synthesizing Meta Llama Reasoning...
                    </span>
                  )}
                </div>

                {aiExplanation ? (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-3.5 text-xs text-purple-950 space-y-2">
                    <p className="font-semibold text-purple-900">{aiExplanation.situation_analysis}</p>
                    {aiExplanation.primary_driver_breakdown && (
                      <ul className="list-disc list-inside space-y-1 text-[11px] text-purple-800">
                        {aiExplanation.primary_driver_breakdown.map((d: string, idx: number) => (
                          <li key={idx}>{d}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : !isLoadingAi && (
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-500 flex items-center justify-between">
                    <span>Deterministic rule-based advisory active.</span>
                    <button
                      onClick={() => fetchAiExplanation(selectedAlert)}
                      className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium text-[11px] flex items-center gap-1 shadow-sm transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Generate AI Advisory</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Data Provenance & SDMA Authority Notice */}
              <div className="bg-slate-100 rounded-xl p-3.5 text-[11px] text-slate-600 space-y-1.5 border border-slate-200">
                <p className="font-semibold text-slate-700 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-blue-600" />
                  Data Provenance & Governance Notice:
                </p>
                <p>{selectedAlert.advisories.english.uncertainty_notice}</p>
                <p className="text-slate-500 font-medium">{selectedAlert.advisories.english.authority_disclaimer}</p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                id="close-advisory-modal-btn"
                onClick={() => setSelectedAlert(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow transition-colors"
              >
                Close Advisory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
