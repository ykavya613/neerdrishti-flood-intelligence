"""
NeerDrishti - Live Flood Dashboard
"""

import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from src.data_processor import DataProcessor
from src.simulation import SIMULATION_SCENARIOS, get_scenario_data
from src.ai_engine import AIEngine

st.set_page_config(page_title="Live Flood Dashboard | NeerDrishti", page_icon="📊", layout="wide")

st.title("📊 Telangana Live Flood Risk Dashboard")
st.caption("Deterministic Rule-Based Risk Engine & Cross-Source Telemetry")

# Initialize Data Processor & AI
dp = DataProcessor()
ai = AIEngine()

# Sidebar: Simulation Controls
st.sidebar.header("🕹️ Simulation Controls")
st.sidebar.markdown("**PROTOTYPE SIMULATION MODE**")
scenario_choice = st.sidebar.selectbox(
    "Select Scenario:",
    list(SIMULATION_SCENARIOS.keys()),
    index=1
)
scenario_info = get_scenario_data(scenario_choice)
st.sidebar.info(scenario_info["description"])

# Apply Scenario Multipliers
custom_rf = scenario_info["rainfall_multipliers"]
districts_data = dp.get_district_status_list(custom_rainfall_override=custom_rf)

# Find Highest Risk District
highest_risk = max(districts_data, key=lambda x: x["flood_risk_score"])

# KPI Cards
kpi1, kpi2, kpi3, kpi4 = st.columns(4)
with kpi1:
    st.metric(label="🚨 Highest Risk District", value=highest_risk["district"], delta=f"{highest_risk['flood_risk_score']}/100 ({highest_risk['risk_category']})")
with kpi2:
    avg_score = round(sum(d["flood_risk_score"] for d in districts_data) / len(districts_data), 1)
    st.metric(label="📈 Avg State Risk Score", value=f"{avg_score} / 100")
with kpi3:
    total_rf = round(sum(d["rainfall_mm_24h"] for d in districts_data), 1)
    st.metric(label="🌧️ Total 24h Rainfall", value=f"{total_rf} mm")
with kpi4:
    total_reps = sum(d["citizen_reports_count"] for d in districts_data)
    st.metric(label="📢 Active Citizen Reports", value=total_reps)

st.markdown("---")

# District Cards Grid
st.subheader("📍 Monitored District Risk Profiles")
cols = st.columns(len(districts_data))

for i, d in enumerate(districts_data):
    with cols[i]:
        badge = {
            "LOW": "🟢 LOW",
            "MODERATE": "🟡 MODERATE",
            "HIGH": "🟠 HIGH",
            "CRITICAL": "🔴 CRITICAL",
        }.get(d["risk_category"], d["risk_category"])
        
        st.markdown(f"### {d['district']}")
        st.markdown(f"**Category:** {badge}")
        st.markdown(f"**Score:** `{d['flood_risk_score']} / 100`")
        st.markdown(f"**24h Rain:** `{d['rainfall_mm_24h']} mm`")
        st.markdown(f"**Drainage:** `{d['drainage_vulnerability_score']}/100`")
        st.markdown(f"**Reports:** `{d['citizen_reports_count']}`")

st.markdown("---")

# Visual Charts
col_chart1, col_chart2 = st.columns([1, 1])

with col_chart1:
    st.subheader("🌧️ Rainfall vs Flood Risk Score")
    df_plot = pd.DataFrame(districts_data)
    fig1 = px.bar(
        df_plot,
        x="district",
        y="rainfall_mm_24h",
        color="risk_category",
        color_discrete_map={"LOW": "#10b981", "MODERATE": "#f59e0b", "HIGH": "#f97316", "CRITICAL": "#ef4444"},
        title="24h Rainfall Distribution across Districts (mm)",
        labels={"rainfall_mm_24h": "Rainfall (mm)", "district": "District"}
    )
    st.plotly_chart(fig1, use_container_width=True)

with col_chart2:
    st.subheader("⚖️ Risk Score Component Breakdown (Weights)")
    fig2 = go.Figure()
    for d in districts_data:
        fig2.add_trace(go.Bar(
            name=d["district"],
            x=["Rainfall (35%)", "History (25%)", "Location (15%)", "Reports (15%)", "Drainage (10%)"],
            y=[
                d["contributions"]["rainfall"],
                d["contributions"]["flood_history"],
                d["contributions"]["location_risk"],
                d["contributions"]["citizen_reports"],
                d["contributions"]["drainage_vulnerability"],
            ]
        ))
    fig2.update_layout(barmode="stack", title="Transparent Mathematical Risk Formula Breakdown")
    st.plotly_chart(fig2, use_container_width=True)

st.markdown("---")

# LLM Reasoning Section
st.subheader("🧠 LLM Explainable Flood Advisory Engine")
selected_district = st.selectbox("Select District for AI Synthesis:", [d["district"] for d in districts_data])
dist_obj = next(d for d in districts_data if d["district"] == selected_district)

if st.button("Generate Explainable AI Advisory", type="primary"):
    with st.spinner(f"Synthesizing telemetry and knowledge base for {selected_district}..."):
        advisory = ai.generate_district_reasoning(dist_obj)
        
        st.success(f"Reasoning complete for {selected_district}")
        
        c_adv1, c_adv2 = st.columns(2)
        with c_adv1:
            st.markdown("#### 🇬🇧 English Public Safety Advisory")
            st.info(advisory.get("english_advisory", ""))
            
            st.markdown("##### 🔍 Situation Summary")
            st.write(advisory.get("situation_summary", ""))
            
            st.markdown("##### 📌 Key Contributing Factors")
            for factor in advisory.get("main_risk_factors", []):
                st.markdown(f"- {factor}")

        with c_adv2:
            st.markdown("#### 🇮🇳 తెలుగు ప్రజా రక్షణ సమాచారం (Telugu Advisory)")
            st.warning(advisory.get("telugu_advisory", ""))
            
            st.markdown("##### 🛡️ Recommended Actions")
            for action in advisory.get("recommended_actions", []):
                st.markdown(f"- {action}")
                
            st.markdown("##### 📋 Telemetry & Evidence Used")
            for ev in advisory.get("evidence_used", []):
                st.markdown(f"- `{ev}`")
                
        st.caption(f"ℹ️ {advisory.get('data_limitation_statement', '')}")
