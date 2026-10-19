"""
NeerDrishti - Interactive Telangana Risk Map
"""

import streamlit as st
import folium
from streamlit_folium import st_folium

from src.data_processor import DataProcessor
from src.simulation import SIMULATION_SCENARIOS, get_scenario_data

st.set_page_config(page_title="Risk Map | NeerDrishti", page_icon="🗺️", layout="wide")

st.title("🗺️ Telangana Geospatial Flood Risk Map")
st.caption("Interactive District Risk Markers & Hydrography Monitoring")

# Initialize Data Processor
dp = DataProcessor()

# Simulation Scenario Selector
scenario_choice = st.sidebar.selectbox(
    "Simulation Scenario:",
    list(SIMULATION_SCENARIOS.keys()),
    index=1
)
scenario_info = get_scenario_data(scenario_choice)
districts_data = dp.get_district_status_list(custom_rainfall_override=scenario_info["rainfall_multipliers"])

# Setup Center of Telangana (approx Lat: 18.0, Lng: 79.5)
m = folium.Map(location=[18.1124, 79.0193], zoom_start=7, tiles="CartoDB positron")

# Color mapping for risk categories
color_map = {
    "LOW": "green",
    "MODERATE": "orange",
    "HIGH": "darkred",
    "CRITICAL": "red"
}

icon_map = {
    "LOW": "ok-sign",
    "MODERATE": "info-sign",
    "HIGH": "warning-sign",
    "CRITICAL": "remove-sign"
}

for d in districts_data:
    cat = d["risk_category"]
    popup_html = f"""
    <div style="font-family: sans-serif; min-width: 180px;">
        <h4 style="margin: 0 0 5px 0; color: #0f4c81;">{d['district']}</h4>
        <b>Risk Level:</b> <span style="color: {color_map[cat]}; font-weight: bold;">{cat}</span><br>
        <b>Score:</b> {d['flood_risk_score']} / 100<br>
        <b>24h Rainfall:</b> {d['rainfall_mm_24h']} mm<br>
        <b>Terrain:</b> {d['terrain_type']}<br>
        <b>River Basin:</b> {d['river_basin']}<br>
        <b>Citizen Reports:</b> {d['citizen_reports_count']}<br>
        <hr style="margin: 5px 0;">
        <small style="color: #64748b;">Hotspots: {d['vulnerable_hotspots']}</small>
    </div>
    """
    
    # Add Marker
    folium.Marker(
        location=[d["lat"], d["lng"]],
        popup=folium.Popup(popup_html, max_width=280),
        tooltip=f"{d['district']} - {cat} Risk ({d['flood_risk_score']}/100)",
        icon=folium.Icon(color=color_map[cat], icon=icon_map[cat]),
    ).add_to(m)
    
    # Add Radius Circle representing risk intensity
    radius_meters = 15000 + (d["flood_risk_score"] * 300)
    folium.Circle(
        location=[d["lat"], d["lng"]],
        radius=radius_meters,
        color=color_map[cat],
        fill=True,
        fill_color=color_map[cat],
        fill_opacity=0.25,
        weight=2,
    ).add_to(m)

# Render Map
st_folium(m, width="100%", height=550)

st.markdown("---")
st.subheader("📋 Map Legend & Protocol Summary")
leg1, leg2, leg3, leg4 = st.columns(4)
with leg1:
    st.success("🟢 **0–25: LOW RISK**\nNormal drainage flow. No disruption to traffic or settlements.")
with leg2:
    st.warning("🟡 **26–50: MODERATE RISK**\nLocalized waterlogging on secondary roads. Low-lying zones alert.")
with leg3:
    st.error("🟠 **51–75: HIGH RISK**\nSecondary nalas and canals overflowing. Restricted commute advised.")
with leg4:
    st.markdown("🔴 **76–100: CRITICAL RISK**\nSevere flash flood / river overtopping. Immediate evacuation protocols.")
