import React, { useState, useEffect, useRef } from 'react';
import { 
  Waves, 
  BarChart3, 
  MapPin, 
  AlertTriangle, 
  Bot, 
  Sliders, 
  ShieldAlert,
  Home,
  Activity,
  Radio,
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Sparkles
} from 'lucide-react';
import { SimulationScenarioName } from '../types';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  scenario: SimulationScenarioName;
  onScenarioChange: (scenario: SimulationScenarioName) => void;
  activeAlertsCount?: number;
}

const DEMO_SEQUENCE: Array<{ name: SimulationScenarioName; durationSec: number; label: string }> = [
  { name: 'Normal Conditions', durationSec: 15, label: 'Phase 1: Baseline Normal' },
  { name: 'Heavy Rainfall', durationSec: 20, label: 'Phase 2: Monsoon Onset & Heavy Rain' },
  { name: 'Flood Warning', durationSec: 20, label: 'Phase 3: River Basin Swell & Warning' },
  { name: 'Critical Flood Event', durationSec: 20, label: 'Phase 4: Inundation & Critical Crisis' },
];

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  setCurrentTab,
  scenario,
  onScenarioChange,
  activeAlertsCount = 0,
}) => {
  const [demoActive, setDemoActive] = useState<boolean>(false);
  const [demoStep, setDemoStep] = useState<number>(0);
  const [secondsInStep, setSecondsInStep] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'dashboard', label: 'Live Dashboard', icon: BarChart3 },
    { id: 'situation', label: 'Situation Fusion', icon: Activity },
    { id: 'alerts', label: 'Alert Center', icon: ShieldAlert, badge: activeAlertsCount },
    { id: 'map', label: 'Risk Map', icon: MapPin },
    { id: 'iot', label: 'Data & IoT', icon: Radio },
    { id: 'reports', label: 'Citizen Reports', icon: AlertTriangle },
    { id: 'assistant', label: 'AI Assistant', icon: Bot },
  ];

  // Demo mode timer ticker
  useEffect(() => {
    if (demoActive) {
      timerRef.current = setInterval(() => {
        setSecondsInStep(prev => {
          const currentDuration = DEMO_SEQUENCE[demoStep].durationSec;
          if (prev + 1 >= currentDuration) {
            // Advance to next step
            const nextStep = (demoStep + 1) % DEMO_SEQUENCE.length;
            setDemoStep(nextStep);
            onScenarioChange(DEMO_SEQUENCE[nextStep].name);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [demoActive, demoStep, onScenarioChange]);

  const handleToggleDemo = () => {
    if (!demoActive) {
      setDemoActive(true);
      setDemoStep(0);
      setSecondsInStep(0);
      onScenarioChange(DEMO_SEQUENCE[0].name);
    } else {
      setDemoActive(false);
    }
  };

  const handleStepForward = () => {
    const nextStep = (demoStep + 1) % DEMO_SEQUENCE.length;
    setDemoStep(nextStep);
    setSecondsInStep(0);
    onScenarioChange(DEMO_SEQUENCE[nextStep].name);
  };

  const handleResetDemo = () => {
    setDemoStep(0);
    setSecondsInStep(0);
    onScenarioChange(DEMO_SEQUENCE[0].name);
  };

  const currentDuration = DEMO_SEQUENCE[demoStep].durationSec;
  const progressPct = Math.min(100, Math.round((secondsInStep / currentDuration) * 100));

  return (
    <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-800 text-white shadow-md">
      {/* Simulation Alert / Demo Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-600 px-4 py-1.5 text-xs font-semibold text-center tracking-wide flex items-center justify-center gap-2">
        <ShieldAlert className="w-4 h-4 animate-pulse text-amber-300" />
        <span>PROTOTYPE SIMULATION & AI REASONING SYSTEM — TELANGANA MONITORED ZONE</span>
      </div>

      {/* Demo Mode Interactive Strip (if active) */}
      {demoActive && (
        <div className="bg-indigo-950/90 border-b border-indigo-700/60 px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-bold uppercase tracking-wider text-[10px] animate-pulse">
              DEMO MODE ACTIVE
            </span>
            <span className="font-semibold text-indigo-200">
              {DEMO_SEQUENCE[demoStep].label} ({secondsInStep}s / {currentDuration}s)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-24 sm:w-32 bg-indigo-900 rounded-full h-2 overflow-hidden border border-indigo-700">
              <div 
                className="bg-amber-400 h-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <button
              onClick={() => setDemoActive(!demoActive)}
              className="p-1 rounded bg-indigo-800 hover:bg-indigo-700 text-white"
              title={demoActive ? 'Pause Demo' : 'Play Demo'}
            >
              {demoActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleStepForward}
              className="p-1 rounded bg-indigo-800 hover:bg-indigo-700 text-white"
              title="Next Scenario Step"
            >
              <FastForward className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetDemo}
              className="p-1 rounded bg-indigo-800 hover:bg-indigo-700 text-white"
              title="Reset Demo to Beginning"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentTab('home')}>
            <div className="p-2 bg-blue-600 rounded-lg shadow-inner">
              <Waves className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xl tracking-tight text-white">NeerDrishti</span>
                <span className="text-xs px-2 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-700/50 font-medium">
                  నీర్ దృష్టి
                </span>
              </div>
              <p className="text-xs text-slate-400">AI Urban Flood Intelligence & Advisory</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`nav-tab-${tab.id}`}
                  onClick={() => setCurrentTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium transition-all relative ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-rose-500 text-white">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Scenario Selector & Demo Mode Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleDemo}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                demoActive
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md shadow-amber-400/20'
                  : 'bg-indigo-900/60 text-indigo-200 border-indigo-700/70 hover:bg-indigo-800 hover:text-white'
              }`}
              title="Automated 75s Demo Sequence: Normal -> Heavy Rain -> Flood Warning -> Critical Event"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{demoActive ? 'Demo Active' : 'Demo Mode'}</span>
            </button>

            <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700">
              <Sliders className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Scenario:</span>
              <select
                id="scenario-selector-nav"
                value={scenario}
                onChange={(e) => {
                  if (demoActive) setDemoActive(false);
                  onScenarioChange(e.target.value as SimulationScenarioName);
                }}
                className="bg-transparent text-xs text-blue-300 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="Normal Conditions" className="bg-slate-900 text-slate-200">Normal Conditions</option>
                <option value="Heavy Rainfall" className="bg-slate-900 text-slate-200">Heavy Rainfall</option>
                <option value="Flood Warning" className="bg-slate-900 text-slate-200">Flood Warning</option>
                <option value="Critical Flood Event" className="bg-slate-900 text-slate-200">Critical Flood Event</option>
              </select>
            </div>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="flex md:hidden border-t border-slate-800 py-2 overflow-x-auto gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setCurrentTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap ${
                  isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
