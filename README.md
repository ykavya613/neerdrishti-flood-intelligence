# NeerDrishti: AI-Powered Urban Flood Intelligence and Advisory System for Telangana

NeerDrishti (నీర్ దృష్టి) is an AI-powered urban flood intelligence platform for Telangana that combines deterministic mathematical flood-risk scoring (0–100) with LLM reasoning layers, crowdsourced citizen reports, and explainable bilingual advisories (English & Telugu).

---

## 🏛️ System Architecture

```text
Data Sources (Rainfall, Flood History, Location Risk, Drainage, Citizen Reports)
       │
       ▼
Data Processing & Validation (Dynamic 33-District Schema & Data Completeness Engine)
       │
       ▼
Deterministic Flood Risk Engine (Normalized 0–100 Weighted Score)
       │
       ▼
LLM Reasoning & RAG Layer (Hydrological Profiles + Ground Evidence)
       │
       ▼
Bilingual Advisory Engine (English Safety Protocols + Localized Telugu Warnings)
       │
       ▼
Interactive Web Dashboard & Geospatial Map (React + Leaflet + Express)
```

---

## 🗺️ Telangana-Wide Architecture & Monitoring Categories

NeerDrishti scales across all **33 districts of Telangana** with strict data honesty and provenance tracking. It classifies districts into three monitoring tiers:

### 1. Priority Flood Monitoring Districts (5 Districts)
* **Hyderabad, Warangal, Nirmal, Mancherial, Bhadradri Kothagudem**
* **Characteristics:** High urban density / river confluence risk, comprehensive historical context, curated hydrological knowledge bases (`knowledge_base/*.md`), and live telemetry simulation.

### 2. Standard Monitoring Districts (15 Districts)
* **Khammam, Nizamabad, Karimnagar, Nalgonda, Jagtial, Rajanna Sircilla, Peddapalli, Mulugu, Jayashankar Bhupalpally, Komaram Bheem Asifabad, Mahabubnagar, Wanaparthy, Jogulamba Gadwal, Rangareddy, Medchal Malkajgiri**
* **Characteristics:** Seasonal flood risk zones, major river basin drainage points, and verified geography.

### 3. Limited Data Districts (13 Districts)
* **Adilabad, Sangareddy, Siddipet, Medak, Kamareddy, Vikarabad, Jangaon, Mahabubabad, Hanamkonda, Suryapet, Yadadri Bhuvanagiri, Nagarkurnool, Narayanpet**
* **Characteristics:** Prototype baseline scores with explicit data limitation notes and transparent confidence intervals.

---

## 📐 Deterministic Risk Scoring Formula

The risk score is calculated deterministically on a 0–100 scale:

$$\text{Flood Risk Score} = (R \times 0.35) + (H \times 0.25) + (L \times 0.15) + (C \times 0.15) + (D \times 0.10)$$

* **Rainfall Score ($R$, 35%):** 24-hour rainfall input normalized (0–150+ mm).
* **Flood History Score ($H$, 25%):** Historical flood recurrence and basin vulnerability.
* **Location Risk Score ($L$, 15%):** Elevation, terrain, and low-lying depression factor.
* **Citizen Report Score ($C$, 15%):** Crowdsourced verified incident density.
* **Drainage Vulnerability ($D$, 10%):** Nala bottlenecks, urban run-off impedance, and lake overflow susceptibility.

**Risk Classification Tiers:**
* **0–25:** 🟢 **LOW**
* **26–50:** 🟡 **MODERATE**
* **51–75:** 🟠 **HIGH**
* **76–100:** 🔴 **CRITICAL**

---

## 🔒 Data Accuracy & Provenance Rules

1. **No Fabricated Telemetry:** All non-sensor inputs are explicitly marked with `data_provenance` (e.g. `Curated Hydrological Profile`, `Prototype Baseline`).
2. **Data Completeness Metric:** Every district exposes a transparent completeness percentage (0–100%) indicating the availability of real-time vs. baseline parameters.
3. **Transparent Limitations:** Advisories for districts with limited data explicitly acknowledge gaps to prevent false certainty.

---

## 📁 Project Structure

```text
.
├── data/
│   ├── telangana_districts.json  # Central source of truth for all 33 districts
│   └── *.csv                     # Telemetry, sensor, and report data
├── knowledge_base/               # In-depth Markdown profiles for priority districts
├── src/                          # Backend & data processing modules
│   ├── config.py                 # Dynamic district loader & constants
│   ├── data_processor.py         # 33-district data processor & scoring engine
│   ├── risk_engine.py            # Mathematical formula implementation
│   ├── llm_reasoning.py          # LLM prompt orchestration & fallback reasoning
│   └── types.ts                  # Shared TypeScript interfaces
├── src/components/               # React UI Views
│   ├── HomeView.tsx              # Telangana 33-district overview & category filter
│   ├── LiveDashboardView.tsx     # Telemetry dashboard, formula inspector, LLM reasoning
│   ├── RiskMapView.tsx           # Leaflet geospatial risk envelope map
│   ├── CitizenReportView.tsx     # Crowdsourced reporting & AI NLP triage
│   └── AIAssistantView.tsx       # Grounded bilingual chat assistant
├── server.ts                     # Express API server with Gemini AI integration
└── tests/                        # Automated unit and regression tests
```

---

## 🚀 Execution & Development

### Frontend & Node Server
```bash
npm run dev
```

### Run Python Tests
```bash
python3 -m unittest discover tests/
```

