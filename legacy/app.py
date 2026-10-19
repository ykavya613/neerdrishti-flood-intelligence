"""
NeerDrishti: AI-Powered Urban Flood Intelligence and Advisory System for Telangana
Main Streamlit Entrypoint
"""

import streamlit as st
from src.data_processor import DataProcessor
from src.config import MONITORED_DISTRICTS

st.set_page_config(
    page_title="NeerDrishti | Telangana Flood Intelligence",
    page_icon="🌊",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Custom Styling
st.markdown("""
<style>
    .main-title {
        font-size: 2.3rem;
        font-weight: 700;
        color: #0f4c81;
        margin-bottom: 0.2rem;
    }
    .sub-title {
        font-size: 1.1rem;
        color: #4a5568;
        margin-bottom: 1.5rem;
    }
    .metric-card {
        background-color: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 1rem;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .sim-banner {
        background: linear-gradient(90deg, #1e3a8a, #0284c7);
        color: white;
        padding: 0.75rem 1.25rem;
        border-radius: 8px;
        font-weight: 600;
        margin-bottom: 1.5rem;
        text-align: center;
        letter-spacing: 0.05em;
    }
</style>
""", unsafe_allow_html=True)

# Simulation Banner
st.markdown('<div class="sim-banner">⚡ PROTOTYPE SIMULATION & REASONING MODE ⚡</div>', unsafe_allow_html=True)

st.markdown('<div class="main-title">🌊 NeerDrishti (నీర్ దృష్టి)</div>', unsafe_allow_html=True)
st.markdown('<div class="sub-title">AI-Powered Urban Flood Intelligence and Advisory System for Telangana</div>', unsafe_allow_html=True)

st.markdown("""
### 🏛️ Executive Summary
NeerDrishti combines **deterministic rule-based hydro-meteorological scoring** with a **modular LLM reasoning and multilingual advisory layer** to deliver transparent, actionable flood intelligence across five high-risk Telangana districts.

---
""")

# Architecture diagram
col_arch1, col_arch2 = st.columns([1, 1])

with col_arch1:
    st.markdown("#### 🔄 System Pipeline")
    st.info("""
    1. **Data Sources**: Real-time rainfall telemetry, historical inundation data, terrain/drainage indices, and verified citizen crowdsourced reports.
    2. **Rule-Based Risk Engine**: Deterministic Python formula normalizing factors into a 0–100 composite score.
    3. **LLM Reasoning Layer**: Synthesizes structured data with domain knowledge base markdown docs (Qwen2.5 / Gemini / Llama).
    4. **Multilingual Advisory**: Produces explainable public safety advisories in English & Telugu.
    5. **Interactive Geo-Dashboard**: Streamlit dashboard with Folium map layers and simulation controls.
    """)

with col_arch2:
    st.markdown("#### 📍 Monitored Telangana Districts")
    dp = DataProcessor()
    districts_data = dp.get_district_status_list()
    
    for d in districts_data:
        cat = d["risk_category"]
        badge_style = {
            "LOW": "🟢 Low Risk",
            "MODERATE": "🟡 Moderate Risk",
            "HIGH": "🟠 High Risk",
            "CRITICAL": "🔴 Critical Risk"
        }.get(cat, cat)
        
        st.markdown(f"**{d['district']}**: {badge_style} — Risk Score: `{d['flood_risk_score']}/100` (Rainfall: `{d['rainfall_mm_24h']} mm`)")

st.markdown("---")
st.markdown("""
#### 🧭 Navigation Guide
Use the sidebar menu to explore:
* **1_Live_Dashboard**: Telangana-wide risk telemetry, district cards, charts, and simulation scenario controls.
* **2_Risk_Map**: Interactive geospatial Folium map with colored risk markers and popup telemetry.
* **3_Citizen_Report**: Citizen crowd-reporting form with automated NLP/AI triage and SQLite logging.
* **4_AI_Assistant**: Context-grounded conversational flood intelligence assistant supporting English & Telugu queries.
""")
